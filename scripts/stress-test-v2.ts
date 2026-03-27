/**
 * Apoyo Stress Test v2 — Based on Real Support Patterns
 *
 * Scenarios derived from 141 real AgentMail support cases.
 * Agents call Apoyo directly with realistic error contexts
 * instead of relying on AgentMail's support URL injection.
 *
 * Run: npx tsx scripts/stress-test-v2.ts [num_agents] [duration_minutes]
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: 'demo/claude/.env' });

const APOYO_URL = 'https://coalesce-production.up.railway.app';
const APOYO_KEY = process.env['APOYO_API_KEY']!;

const NUM_AGENTS = Number(process.argv[2] ?? 10);
const DURATION_MIN = Number(process.argv[3] ?? 60);
const CONCURRENCY = 5;
const PAUSE_MS = 2000;

if (!APOYO_KEY) {
  console.error('APOYO_API_KEY required in demo/claude/.env');
  process.exit(1);
}

// Derived from real support cases — the top issues agents face
const SCENARIOS = [
  // Message sending failures (21 cases — #1 issue)
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages/send',
    error_code: '404',
    context: 'NotFoundError',
    agentContext: 'I tried to send a message to an inbox but got a 404. I used the inbox username, not the full email address.',
  },
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages/send',
    error_code: '403',
    context: 'MessageRejectedError',
    agentContext: 'My message was rejected. I am trying to send an email from my agentmail inbox to an external email address.',
  },
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages/send',
    error_code: '400',
    context: 'ValidationError',
    agentContext: 'I got a validation error when sending. I included to, subject, and text fields. Maybe the to field format is wrong?',
  },
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages/send',
    error_code: '403',
    context: 'ForbiddenError',
    agentContext: 'I am trying to send from an inbox but getting forbidden. AWS might be blocking email sending from my account.',
  },
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages/send',
    error_code: '500',
    context: 'ServerError',
    agentContext: 'Getting a 500 error when trying to send. It was working yesterday. Is there an outage?',
  },

  // Domain/DNS setup (7 cases)
  {
    endpoint: '/v0/domains',
    error_code: '400',
    context: 'DomainNotVerifiedError',
    agentContext: 'I added my custom domain but verification is failing. I added the CNAME and TXT records to my DNS.',
  },
  {
    endpoint: '/v0/domains/{domain}/verify',
    error_code: '400',
    context: 'DomainNotVerifiedError',
    agentContext: 'Domain verification is stuck. I set up DKIM records but the status still shows pending after 24 hours.',
  },
  {
    endpoint: '/v0/domains',
    error_code: '400',
    context: 'ValidationError',
    agentContext: 'I am trying to set up SPF and MX records for my custom domain but getting errors. What DNS records do I need exactly?',
  },

  // API/SDK integration (8 cases)
  {
    endpoint: '/v0/inboxes',
    error_code: '401',
    context: 'UnauthorizedError',
    agentContext: 'I am getting 401 unauthorized. I am using the API key from the dashboard. Is there a specific format for the Authorization header?',
  },
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages',
    error_code: '404',
    context: 'NotFoundError',
    agentContext: 'I am trying to list messages from an inbox but get 404. The inbox exists, I can see it in the dashboard.',
  },
  {
    endpoint: '/v0/threads/{thread_id}',
    error_code: '404',
    context: 'NotFoundError',
    agentContext: 'I am trying to read a thread by its ID but getting 404. I got the thread_id from a previous message response.',
  },
  {
    endpoint: '/v0/inboxes',
    error_code: '400',
    context: 'ValidationError',
    agentContext: 'I am trying to create an inbox with a custom username but getting a validation error. What are the username requirements?',
  },

  // Message receiving/IMAP (3 cases)
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages',
    error_code: '200',
    context: 'EmptyResponse',
    agentContext: 'I sent an email to my agentmail inbox but when I list messages, it returns empty. The email was sent 5 minutes ago.',
  },
  {
    endpoint: '/v0/inboxes/{inbox_id}',
    error_code: '404',
    context: 'NotFoundError',
    agentContext: 'I created an inbox and received emails to it, but now I cannot find it via the API. IMAP shows 0 messages too.',
  },

  // Threads/Drafts/Reply (2 cases)
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages/send',
    error_code: '400',
    context: 'ValidationError',
    agentContext: 'I am trying to reply to a message but I do not know how to set the in_reply_to or thread_id fields. How do I reply to a specific message?',
  },
  {
    endpoint: '/v0/drafts',
    error_code: '404',
    context: 'NotFoundError',
    agentContext: 'I am trying to use the drafts API but getting 404. How do I create and manage drafts?',
  },

  // Delete/Cleanup
  {
    endpoint: '/v0/inboxes/{inbox_id}/messages/{message_id}',
    error_code: '404',
    context: 'NotFoundError',
    agentContext: 'I am trying to delete a message but cannot find the delete endpoint. How do I delete or trash messages?',
  },

  // Webhooks
  {
    endpoint: '/v0/webhooks',
    error_code: '400',
    context: 'ValidationError',
    agentContext: 'I am trying to set up a webhook to get notified of new messages but getting a validation error. What fields are required?',
  },
];

// Agent answers for follow-ups
function answerQuestion(question: string, scenario: typeof SCENARIOS[0]): Record<string, string> {
  return { [question.slice(0, 100)]: scenario.agentContext };
}

// Stats
const stats = {
  totalCalls: 0,
  resolved: 0,
  needsInfo: 0,
  unknown: 0,
  errors: 0,
  networkErrors: 0,
  totalTurns: 0,
  totalLatencyMs: 0,
  byScenario: new Map<string, { calls: number; resolved: number }>(),
};

async function callApoyo(
  scenario: typeof SCENARIOS[0],
  sessionId?: string,
  answer?: Record<string, string>,
): Promise<{ status: string; sessionId?: string; question?: string }> {
  stats.totalCalls++;
  stats.totalTurns++;
  const start = Date.now();

  try {
    const url = sessionId
      ? `${APOYO_URL}/support/agentmail`
      : `${APOYO_URL}/support/agentmail?endpoint=${encodeURIComponent(scenario.endpoint)}&error_code=${scenario.error_code}&context=${encodeURIComponent(scenario.context)}`;

    const body = sessionId
      ? { session_id: sessionId, answer: { clarifications: answer } }
      : { tried: ['checked the documentation'] };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APOYO_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    stats.totalLatencyMs += Date.now() - start;
    const data = await res.json() as Record<string, unknown>;
    const status = data['status'] as string;

    if (status === 'resolved') stats.resolved++;
    else if (status === 'needs_info') stats.needsInfo++;
    else if (status === 'unknown') stats.unknown++;
    else stats.errors++;

    return {
      status,
      sessionId: data['session_id'] as string,
      question: data['question'] as string,
    };
  } catch {
    stats.networkErrors++;
    return { status: 'error' };
  }
}

async function runAgent(agentId: number): Promise<void> {
  const scenario = SCENARIOS[agentId % SCENARIOS.length];
  const key = `${scenario.error_code} ${scenario.context} ${scenario.endpoint}`;

  if (!stats.byScenario.has(key)) stats.byScenario.set(key, { calls: 0, resolved: 0 });
  stats.byScenario.get(key)!.calls++;

  // Turn 1
  let result = await callApoyo(scenario);

  // Follow-ups (max 2)
  for (let i = 0; i < 2 && result.status === 'needs_info' && result.question; i++) {
    const answer = answerQuestion(result.question, scenario);
    result = await callApoyo(scenario, result.sessionId, answer);
  }

  if (result.status === 'resolved') {
    stats.byScenario.get(key)!.resolved++;
  }
}

async function main() {
  console.log(`🔥 Stress Test v2: ${NUM_AGENTS} agents, ${DURATION_MIN} min, ${CONCURRENCY} concurrent`);
  console.log(`   Apoyo:    ${APOYO_URL}`);
  console.log(`   Scenarios: ${SCENARIOS.length} unique error types\n`);

  const endTime = Date.now() + DURATION_MIN * 60 * 1000;
  const startTime = Date.now();
  let agentCounter = 0;

  const statsInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    const avgLatency = stats.totalTurns > 0 ? Math.round(stats.totalLatencyMs / stats.totalTurns) : 0;
    console.log(
      `[${elapsed}s, ${remaining}s left]` +
      ` calls=${stats.totalCalls}` +
      ` resolved=${stats.resolved}` +
      ` needs_info=${stats.needsInfo}` +
      ` unknown=${stats.unknown}` +
      ` err=${stats.errors}` +
      ` net_err=${stats.networkErrors}` +
      ` avg=${avgLatency}ms`
    );
  }, 10000);

  while (Date.now() < endTime) {
    const batch: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY && Date.now() < endTime; i++) {
      batch.push(runAgent(agentCounter++));
    }
    await Promise.all(batch);
    await new Promise(r => setTimeout(r, PAUSE_MS));
  }

  clearInterval(statsInterval);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const avgLatency = stats.totalTurns > 0 ? Math.round(stats.totalLatencyMs / stats.totalTurns) : 0;

  console.log('\n=== FINAL RESULTS ===');
  console.log(`Duration:         ${elapsed}s`);
  console.log(`Total calls:      ${stats.totalCalls}`);
  console.log(`Total turns:      ${stats.totalTurns}`);
  console.log(`Avg latency:      ${avgLatency}ms`);
  console.log(`Resolved:         ${stats.resolved}`);
  console.log(`Needs info:       ${stats.needsInfo} (intermediate)`);
  console.log(`Unknown:          ${stats.unknown}`);
  console.log(`Errors:           ${stats.errors}`);
  console.log(`Network errors:   ${stats.networkErrors}`);
  console.log(`Resolution rate:  ${stats.totalCalls > 0 ? ((stats.resolved / (stats.resolved + stats.unknown + stats.errors)) * 100).toFixed(1) : 0}%`);

  console.log('\n=== PER-SCENARIO BREAKDOWN ===');
  for (const [key, data] of [...stats.byScenario.entries()].sort((a, b) => b[1].calls - a[1].calls)) {
    const rate = data.calls > 0 ? ((data.resolved / data.calls) * 100).toFixed(0) : '0';
    console.log(`  ${data.calls.toString().padStart(3)}x | ${rate.padStart(3)}% resolved | ${key}`);
  }
}

main().catch(console.error);
