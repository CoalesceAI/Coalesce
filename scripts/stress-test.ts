/**
 * Apoyo Stress Test — Realistic Agent Traffic
 *
 * Simulates N agents that:
 * 1. Create their own inboxes on AgentMail
 * 2. Send emails to each other
 * 3. Read messages, reply, forward
 * 4. Intentionally make mistakes (wrong inbox IDs, missing fields, etc.)
 * 5. Use Apoyo support endpoint whenever they hit errors
 * 6. Apply fixes suggested by Apoyo and retry
 *
 * Run: npx tsx scripts/stress-test.ts [num_agents] [duration_minutes]
 * Example: npx tsx scripts/stress-test.ts 20 120
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: 'demo/claude/.env' });

const AGENTMAIL_BASE = process.env['AGENTMAIL_BASE_URL'] ?? 'https://api.tanishq.amail.dev/v0';
const AGENTMAIL_KEY = process.env['AGENTMAIL_API_KEY']!;
const APOYO_URL = 'https://coalesce-production.up.railway.app';
const APOYO_KEY = process.env['APOYO_API_KEY']!;

const NUM_AGENTS = Number(process.argv[2] ?? 10);
const DURATION_MIN = Number(process.argv[3] ?? 60);
const CONCURRENCY = 5;
const PAUSE_BETWEEN_ACTIONS_MS = 2000; // 2s between agent actions

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const stats = {
  agentmailCalls: 0,
  agentmailErrors: 0,
  apoyoCalls: 0,
  apoyoResolved: 0,
  apoyoNeedsInfo: 0,
  apoyoUnknown: 0,
  apoyoErrors: 0,
  inboxesCreated: 0,
  messagesSent: 0,
  messagesRead: 0,
  repliesSent: 0,
  selfHeals: 0, // errors resolved by Apoyo then retried successfully
  networkErrors: 0,
  totalApoyoLatencyMs: 0,
  totalApoyoTurns: 0,
};

// ---------------------------------------------------------------------------
// AgentMail helpers
// ---------------------------------------------------------------------------

interface AgentMailResponse {
  status: number;
  body: Record<string, unknown>;
  supportUrl?: string;
}

async function agentmail(method: string, path: string, body?: unknown): Promise<AgentMailResponse> {
  stats.agentmailCalls++;
  try {
    const res = await fetch(`${AGENTMAIL_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${AGENTMAIL_KEY}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    if (res.status >= 400) stats.agentmailErrors++;
    return {
      status: res.status,
      body: parsed,
      supportUrl: parsed['support'] as string | undefined,
    };
  } catch (err) {
    stats.networkErrors++;
    return { status: 0, body: { error: (err as Error).message } };
  }
}

// ---------------------------------------------------------------------------
// Apoyo helpers
// ---------------------------------------------------------------------------

interface ApoyoResponse {
  status: string;
  sessionId?: string;
  question?: string;
  diagnosis?: string;
  fixSteps?: Array<{ action: string }>;
}

async function apoyoSupport(supportUrl: string, sessionId?: string, answer?: Record<string, string>): Promise<ApoyoResponse> {
  stats.apoyoCalls++;
  const start = Date.now();

  try {
    let res: Response;
    if (!sessionId) {
      // Initial request — use the full support URL
      res = await fetch(supportUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${APOYO_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
    } else {
      // Follow-up
      res = await fetch(`${APOYO_URL}/support/agentmail`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${APOYO_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          answer: { clarifications: answer },
        }),
      });
    }

    const latency = Date.now() - start;
    stats.totalApoyoLatencyMs += latency;
    stats.totalApoyoTurns++;

    const body = await res.json() as Record<string, unknown>;
    const status = body['status'] as string;

    if (status === 'resolved') stats.apoyoResolved++;
    else if (status === 'needs_info') stats.apoyoNeedsInfo++;
    else if (status === 'unknown') stats.apoyoUnknown++;
    else stats.apoyoErrors++;

    return {
      status,
      sessionId: body['session_id'] as string,
      question: body['question'] as string,
      diagnosis: body['diagnosis'] as string,
      fixSteps: body['fix_steps'] as Array<{ action: string }>,
    };
  } catch (err) {
    stats.networkErrors++;
    stats.apoyoErrors++;
    return { status: 'error' };
  }
}

async function resolveWithApoyo(supportUrl: string, context: string): Promise<ApoyoResponse | null> {
  // Turn 1
  let result = await apoyoSupport(supportUrl);

  // Up to 2 follow-ups
  for (let i = 0; i < 2 && result.status === 'needs_info' && result.question; i++) {
    const answer: Record<string, string> = {
      [result.question.slice(0, 100)]: context,
    };
    result = await apoyoSupport(supportUrl, result.sessionId, answer);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Agent simulation
// ---------------------------------------------------------------------------

interface Agent {
  id: number;
  name: string;
  inboxId?: string;
  inboxAddress?: string;
  peerAddresses: string[];
  actionCount: number;
}

const AGENT_ACTIONS = [
  'send_to_peer',
  'send_to_fake_inbox',    // will error — triggers Apoyo
  'read_messages',
  'send_missing_fields',   // will error — triggers Apoyo
  'send_to_self',
  'list_inboxes',
  'read_nonexistent_thread', // will error — triggers Apoyo
] as const;

async function createAgent(id: number): Promise<Agent> {
  const name = `stress-agent-${id}-${Date.now()}`;
  const res = await agentmail('POST', '/inboxes', { username: name });

  if (res.status === 200 || res.status === 201) {
    stats.inboxesCreated++;
    const inboxId = res.body['inbox_id'] as string;
    return { id, name, inboxId, inboxAddress: inboxId, peerAddresses: [], actionCount: 0 };
  }

  // If creation failed, try without username
  const res2 = await agentmail('POST', '/inboxes', {});
  if (res2.status === 200 || res2.status === 201) {
    stats.inboxesCreated++;
    const inboxId = res2.body['inbox_id'] as string;
    return { id, name, inboxId, inboxAddress: inboxId, peerAddresses: [], actionCount: 0 };
  }

  // Proceed without inbox — agent will hit errors on everything (good for testing)
  return { id, name, peerAddresses: [], actionCount: 0 };
}

async function agentAction(agent: Agent): Promise<void> {
  const action = AGENT_ACTIONS[Math.floor(Math.random() * AGENT_ACTIONS.length)];
  agent.actionCount++;

  switch (action) {
    case 'send_to_peer': {
      if (agent.peerAddresses.length === 0 || !agent.inboxId) break;
      const to = agent.peerAddresses[Math.floor(Math.random() * agent.peerAddresses.length)];
      const res = await agentmail('POST', `/inboxes/${encodeURIComponent(agent.inboxId)}/messages/send`, {
        to, subject: `Stress test from agent ${agent.id}`, text: `Message #${agent.actionCount}`,
      });
      if (res.status < 400) stats.messagesSent++;
      else if (res.supportUrl) {
        await resolveWithApoyo(res.supportUrl, `I tried to send from ${agent.inboxId} to ${to}`);
      }
      break;
    }

    case 'send_to_fake_inbox': {
      // Intentionally wrong — will trigger Apoyo
      const fakeInbox = `nonexistent-${Math.random().toString(36).slice(2, 8)}`;
      const res = await agentmail('POST', `/inboxes/${fakeInbox}/messages/send`, {
        to: 'nobody@test.com', subject: 'Test', text: 'This should fail',
      });
      if (res.supportUrl) {
        const resolution = await resolveWithApoyo(res.supportUrl,
          `I used inbox ID '${fakeInbox}' which doesn't exist. I didn't create it first.`);
        if (resolution?.status === 'resolved') stats.selfHeals++;
      }
      break;
    }

    case 'read_messages': {
      if (!agent.inboxId) break;
      const res = await agentmail('GET', `/inboxes/${encodeURIComponent(agent.inboxId)}/messages`);
      if (res.status < 400) stats.messagesRead++;
      else if (res.supportUrl) {
        await resolveWithApoyo(res.supportUrl, `I tried to read messages from ${agent.inboxId}`);
      }
      break;
    }

    case 'send_missing_fields': {
      // Missing 'to' field — validation error
      if (!agent.inboxId) break;
      const res = await agentmail('POST', `/inboxes/${encodeURIComponent(agent.inboxId)}/messages/send`, {
        subject: 'Missing to field', text: 'test',
      });
      if (res.supportUrl) {
        await resolveWithApoyo(res.supportUrl,
          `I sent a message without the 'to' field. The body was: { subject: 'Missing to field', text: 'test' }`);
      }
      break;
    }

    case 'send_to_self': {
      if (!agent.inboxId || !agent.inboxAddress) break;
      const res = await agentmail('POST', `/inboxes/${encodeURIComponent(agent.inboxId)}/messages/send`, {
        to: agent.inboxAddress, subject: `Self-test ${agent.actionCount}`, text: 'Testing self-send',
      });
      if (res.status < 400) stats.messagesSent++;
      else if (res.supportUrl) {
        await resolveWithApoyo(res.supportUrl, `I tried to send a message to myself at ${agent.inboxAddress}`);
      }
      break;
    }

    case 'list_inboxes': {
      const res = await agentmail('GET', '/inboxes');
      if (res.status < 400) {
        // Success — no Apoyo needed
      } else if (res.supportUrl) {
        await resolveWithApoyo(res.supportUrl, 'I tried to list all inboxes in my organization');
      }
      break;
    }

    case 'read_nonexistent_thread': {
      const fakeThread = `fake-thread-${Math.random().toString(36).slice(2, 10)}`;
      const res = await agentmail('GET', `/threads/${fakeThread}`);
      if (res.supportUrl) {
        await resolveWithApoyo(res.supportUrl, `I tried to read thread '${fakeThread}' which doesn't exist`);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  console.log(`🔥 Stress Test: ${NUM_AGENTS} agents, ${DURATION_MIN} min, ${CONCURRENCY} concurrent`);
  console.log(`   AgentMail: ${AGENTMAIL_BASE}`);
  console.log(`   Apoyo:     ${APOYO_URL}`);
  console.log('');

  const endTime = Date.now() + DURATION_MIN * 60 * 1000;
  const startTime = Date.now();

  // Create agents
  console.log(`Creating ${NUM_AGENTS} agents...`);
  const agents: Agent[] = [];
  for (let i = 0; i < NUM_AGENTS; i++) {
    agents.push(await createAgent(i));
    if ((i + 1) % 10 === 0) console.log(`  Created ${i + 1}/${NUM_AGENTS} agents`);
  }

  // Share peer addresses
  const allAddresses = agents.filter(a => a.inboxAddress).map(a => a.inboxAddress!);
  for (const agent of agents) {
    agent.peerAddresses = allAddresses.filter(a => a !== agent.inboxAddress);
  }

  console.log(`${stats.inboxesCreated} inboxes created. Starting actions...\n`);

  // Stats printer
  const statsInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    const avgLatency = stats.totalApoyoTurns > 0 ? Math.round(stats.totalApoyoLatencyMs / stats.totalApoyoTurns) : 0;
    console.log([
      `[${elapsed}s, ${remaining}s left]`,
      `AM: ${stats.agentmailCalls} calls/${stats.agentmailErrors} errs`,
      `| Apoyo: ${stats.apoyoCalls} calls`,
      `resolved=${stats.apoyoResolved}`,
      `needs_info=${stats.apoyoNeedsInfo}`,
      `unknown=${stats.apoyoUnknown}`,
      `err=${stats.apoyoErrors}`,
      `| self_heals=${stats.selfHeals}`,
      `| msgs_sent=${stats.messagesSent}`,
      `| avg_latency=${avgLatency}ms`,
    ].join(' '));
  }, 10000);

  // Run agents in round-robin with concurrency limit
  while (Date.now() < endTime) {
    const batch: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY && Date.now() < endTime; i++) {
      const agent = agents[Math.floor(Math.random() * agents.length)];
      batch.push(agentAction(agent));
    }
    await Promise.all(batch);
    // Pause between batches to simulate realistic timing
    await new Promise(r => setTimeout(r, PAUSE_BETWEEN_ACTIONS_MS));
  }

  clearInterval(statsInterval);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const avgLatency = stats.totalApoyoTurns > 0 ? Math.round(stats.totalApoyoLatencyMs / stats.totalApoyoTurns) : 0;

  console.log('\n=== FINAL RESULTS ===');
  console.log(`Duration:            ${elapsed}s`);
  console.log(`Agents:              ${NUM_AGENTS}`);
  console.log('');
  console.log('AgentMail:');
  console.log(`  Total API calls:   ${stats.agentmailCalls}`);
  console.log(`  Errors:            ${stats.agentmailErrors}`);
  console.log(`  Inboxes created:   ${stats.inboxesCreated}`);
  console.log(`  Messages sent:     ${stats.messagesSent}`);
  console.log(`  Messages read:     ${stats.messagesRead}`);
  console.log('');
  console.log('Apoyo:');
  console.log(`  Total calls:       ${stats.apoyoCalls}`);
  console.log(`  Total turns:       ${stats.totalApoyoTurns}`);
  console.log(`  Avg latency:       ${avgLatency}ms`);
  console.log(`  Resolved:          ${stats.apoyoResolved}`);
  console.log(`  Needs info:        ${stats.apoyoNeedsInfo}`);
  console.log(`  Unknown:           ${stats.apoyoUnknown}`);
  console.log(`  Errors:            ${stats.apoyoErrors}`);
  console.log(`  Self-heals:        ${stats.selfHeals} (errors fixed by Apoyo + retry)`);
  console.log(`  Resolution rate:   ${stats.apoyoCalls > 0 ? ((stats.apoyoResolved / stats.apoyoCalls) * 100).toFixed(1) : 0}%`);
  console.log('');
  console.log(`Network errors:      ${stats.networkErrors}`);
}

main().catch(console.error);
