import dotenv from 'dotenv';
dotenv.config(); // Load root .env
dotenv.config({ path: 'demo/claude/.env' }); // Load demo env (has AGENTMAIL keys)

const AGENTMAIL_BASE_URL = process.env['AGENTMAIL_BASE_URL'] ?? 'https://api.tanishq.amail.dev/v0';
const AGENTMAIL_API_KEY = process.env['AGENTMAIL_API_KEY']!;
const APOYO_URL = 'https://coalesce-production.up.railway.app';
const APOYO_API_KEY = process.env['APOYO_API_KEY']!;

const CONCURRENCY = 10; // agents running at once
const TOTAL_AGENTS = Number(process.argv[2] ?? 50);

// Different error scenarios agents will trigger
// Only use routes that go through Lambda (not API Gateway $default)
// These all return a support URL in the error response
const SCENARIOS = [
  { desc: 'Send to nonexistent inbox', method: 'POST', path: '/inboxes/fake-inbox-123/messages/send', body: { to: 'test@test.com', subject: 'Test', text: 'Hello' } },
  { desc: 'Send to another fake inbox', method: 'POST', path: '/inboxes/agent-test-001/messages/send', body: { to: 'user@example.com', subject: 'Load test', text: 'Testing' } },
  { desc: 'Send to random inbox', method: 'POST', path: '/inboxes/does-not-exist@agentmail.to/messages/send', body: { to: 'nobody@test.com', subject: 'Nope', text: 'This inbox is fake' } },
  { desc: 'Send missing to field', method: 'POST', path: '/inboxes/fake/messages/send', body: { subject: 'Missing to', text: 'test' } },
  { desc: 'Send missing subject', method: 'POST', path: '/inboxes/fake/messages/send', body: { to: 'x@x.com', text: 'no subject' } },
  { desc: 'Send empty body', method: 'POST', path: '/inboxes/fake/messages/send', body: {} },
  { desc: 'Send to inbox with special chars', method: 'POST', path: '/inboxes/test+special@agentmail.to/messages/send', body: { to: 'x@x.com', subject: 't', text: 't' } },
  { desc: 'Send with very long subject', method: 'POST', path: '/inboxes/fake/messages/send', body: { to: 'x@x.com', subject: 'A'.repeat(500), text: 'test' } },
];

// Simulated agent answers for follow-up questions
const AGENT_ANSWERS: Record<string, string> = {
  'inbox': "I used a placeholder inbox ID. I didn't create it first.",
  'domain': "I'm trying to set up a custom domain but haven't configured DNS yet.",
  'email': "I'm using a test email address that might not be valid.",
  'create': "No, I assumed the resource already existed.",
  'api key': "I'm using a development API key from the dashboard.",
  'thread': "I guessed the thread ID. I don't have a real one.",
  'exist': "I didn't verify the resource exists before calling this endpoint.",
  'default': "I'm an automated agent testing the API. I used placeholder values.",
};

function pickAnswer(question: string): Record<string, string> {
  const q = question.toLowerCase();
  for (const [keyword, answer] of Object.entries(AGENT_ANSWERS)) {
    if (keyword !== 'default' && q.includes(keyword)) {
      return { [question.slice(0, 100)]: answer };
    }
  }
  return { [question.slice(0, 100)]: AGENT_ANSWERS['default'] };
}

interface Stats {
  started: number;
  completed: number;
  errors: number;
  resolved: number;
  needsInfo: number;
  unknown: number;
  apoyoErrors: number;
  agentmailErrors: number;
  totalTurns: number;
  totalLatencyMs: number;
  noSupportUrl: number;
}

const stats: Stats = {
  started: 0, completed: 0, errors: 0, resolved: 0,
  needsInfo: 0, unknown: 0, apoyoErrors: 0,
  agentmailErrors: 0, totalTurns: 0, totalLatencyMs: 0, noSupportUrl: 0,
};

async function runAgent(agentId: number): Promise<void> {
  const scenario = SCENARIOS[agentId % SCENARIOS.length];
  stats.started++;

  try {
    // Step 1: Hit AgentMail API (trigger error)
    const url = `${AGENTMAIL_BASE_URL}${scenario.path}`;
    const agentmailRes = await fetch(url, {
      method: scenario.method,
      headers: {
        'Authorization': `Bearer ${AGENTMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      ...(scenario.body ? { body: JSON.stringify(scenario.body) } : {}),
    });

    const rawText = await agentmailRes.text();
    let errorBody: Record<string, unknown>;
    try {
      errorBody = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      console.error(`  Agent ${agentId} bad JSON:`, rawText.slice(0, 100));
      stats.errors++;
      stats.completed++;
      return;
    }
    stats.agentmailErrors++;

    const supportUrl = errorBody['support'] as string | undefined;
    if (!supportUrl) {
      if (stats.noSupportUrl < 3) {
        console.error(`  Agent ${agentId} no support URL. Status: ${agentmailRes.status} Body: ${JSON.stringify(errorBody).slice(0, 200)}`);
      }
      stats.noSupportUrl++;
      stats.completed++;
      return;
    }

    // Step 2: Call Apoyo support URL
    let sessionId: string | null = null;
    let turns = 0;
    const maxTurns = 3;

    while (turns < maxTurns) {
      turns++;
      const start = Date.now();

      let apoyoRes: Response;
      if (turns === 1) {
        apoyoRes = await fetch(supportUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${APOYO_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
      } else {
        apoyoRes = await fetch(`${APOYO_URL}/support/agentmail`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${APOYO_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: sessionId,
            answer: { clarifications: pickAnswer(lastQuestion) },
          }),
        });
      }

      const latency = Date.now() - start;
      stats.totalLatencyMs += latency;
      stats.totalTurns++;

      const diagnosis = await apoyoRes.json() as Record<string, unknown>;
      sessionId = diagnosis['session_id'] as string;

      const status = diagnosis['status'] as string;

      if (status === 'resolved') {
        stats.resolved++;
        break;
      } else if (status === 'needs_info') {
        stats.needsInfo++;
        var lastQuestion = (diagnosis['question'] as string) ?? 'unknown';
        // Continue loop to answer
      } else if (status === 'unknown') {
        stats.unknown++;
        break;
      } else if (status === 'error') {
        stats.apoyoErrors++;
        break;
      } else {
        break;
      }
    }

    stats.completed++;
  } catch (err) {
    stats.errors++;
    stats.completed++;
    console.error(`  Agent ${agentId} error:`, (err as Error).message);
  }
}

async function main() {
  console.log(`🚀 Load test: ${TOTAL_AGENTS} agents, ${CONCURRENCY} concurrent`);
  console.log(`   AgentMail: ${AGENTMAIL_BASE_URL}`);
  console.log(`   Apoyo:     ${APOYO_URL}`);
  console.log('');

  const startTime = Date.now();
  const queue: Promise<void>[] = [];
  let nextAgent = 0;

  // Print stats every 5 seconds
  const statsInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const avgLatency = stats.totalTurns > 0 ? Math.round(stats.totalLatencyMs / stats.totalTurns) : 0;
    console.log(`  [${elapsed}s] ${stats.completed}/${TOTAL_AGENTS} done | resolved=${stats.resolved} needs_info=${stats.needsInfo} unknown=${stats.unknown} errors=${stats.apoyoErrors} no_url=${stats.noSupportUrl} | avg_latency=${avgLatency}ms`);
  }, 5000);

  // Run agents with concurrency limit
  while (nextAgent < TOTAL_AGENTS) {
    while (queue.length < CONCURRENCY && nextAgent < TOTAL_AGENTS) {
      const id = nextAgent++;
      const p = runAgent(id).then(() => {
        queue.splice(queue.indexOf(p), 1);
      });
      queue.push(p);
    }
    if (queue.length >= CONCURRENCY) {
      await Promise.race(queue);
    }
  }
  await Promise.all(queue);

  clearInterval(statsInterval);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgLatency = stats.totalTurns > 0 ? Math.round(stats.totalLatencyMs / stats.totalTurns) : 0;

  console.log('\n=== RESULTS ===');
  console.log(`Total agents:     ${TOTAL_AGENTS}`);
  console.log(`Duration:         ${elapsed}s`);
  console.log(`Total turns:      ${stats.totalTurns}`);
  console.log(`Avg latency:      ${avgLatency}ms per turn`);
  console.log(`Resolved:         ${stats.resolved}`);
  console.log(`Needs info:       ${stats.needsInfo} (intermediate)`);
  console.log(`Unknown:          ${stats.unknown}`);
  console.log(`Apoyo errors:     ${stats.apoyoErrors}`);
  console.log(`No support URL:   ${stats.noSupportUrl} (gateway-level errors)`);
  console.log(`Network errors:   ${stats.errors}`);
  console.log(`Resolution rate:  ${((stats.resolved / Math.max(stats.completed - stats.noSupportUrl, 1)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
