/**
 * Agent Stress Test — Real Haiku agents using AgentMail
 *
 * Each agent gets a task, uses the AgentMail API, hits errors,
 * and we track whether they discover and use the support URL.
 * No mention of Apoyo anywhere — pure blind test at scale.
 *
 * Run: npx tsx scripts/agent-stress-test.ts [num_agents] [duration_minutes]
 */

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
dotenv.config();
dotenv.config({ path: 'demo/claude/.env' });

const client = new Anthropic();
const AGENTMAIL_BASE = process.env['AGENTMAIL_BASE_URL']!;
const AGENTMAIL_KEY = process.env['AGENTMAIL_API_KEY']!;

const NUM_AGENTS = Number(process.argv[2] ?? 5);
const DURATION_MIN = Number(process.argv[3] ?? 30);
const CONCURRENCY = 2; // Haiku calls are cheap but we don't wanna hammer
const MAX_TURNS_PER_AGENT = 10;

const SYSTEM = `You are an AI agent completing tasks via API calls using curl. Complete the task given to you.`;

// Diverse tasks that will trigger different errors
const TASKS = [
  `Send an email with subject "Hello from Agent" and body "Test" to inbox "my-inbox" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Send endpoint: POST /v0/inboxes/{inbox_id}/messages/send with { "to": "...", "subject": "...", "text": "..." }`,

  `List all messages in the inbox "support-queue" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
List messages: GET /v0/inboxes/{inbox_id}/messages`,

  `Create a new inbox called "test-agent" and then send a message from it to "admin@example.com" using AgentMail.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Create inbox: POST /v0/inboxes with { "username": "..." }
Send: POST /v0/inboxes/{inbox_id}/messages/send with { "to": "...", "subject": "...", "text": "..." }`,

  `Read the latest thread from inbox "notifications" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
List threads: GET /v0/inboxes/{inbox_id}/threads`,

  `Delete the inbox "old-inbox" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Delete inbox: DELETE /v0/inboxes/{inbox_id}`,

  `Set up a webhook for new messages in inbox "alerts" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Create webhook: POST /v0/webhooks with { "url": "...", "events": ["message.created"] }`,

  `Forward a message from inbox "support" to "escalation@company.com" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Forward: POST /v0/inboxes/{inbox_id}/messages/{message_id}/forward with { "to": "..." }`,

  `Reply to the latest message in inbox "customer-service" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Reply: POST /v0/inboxes/{inbox_id}/messages/{message_id}/reply with { "text": "..." }`,
];

const stats = {
  agentsStarted: 0,
  agentsCompleted: 0,
  totalTurns: 0,
  supportUrlSeen: 0,
  supportUrlCalled: 0,
  supportUrlResolved: 0,
  taskCompleted: 0,
  taskFailed: 0,
  agentmailCalls: 0,
  agentmailErrors: 0,
};

async function runBash(command: string): Promise<string> {
  const { execSync } = await import('node:child_process');
  try {
    return execSync(command, { timeout: 60000, encoding: 'utf-8' }).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return `ERROR: ${e.stderr || e.stdout || e.message}`;
  }
}

async function runAgent(agentId: number): Promise<void> {
  const task = TASKS[agentId % TASKS.length];
  stats.agentsStarted++;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }];
  let localSupportSeen = false;
  let localSupportCalled = false;

  for (let turn = 0; turn < MAX_TURNS_PER_AGENT; turn++) {
    stats.totalTurns++;

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM,
        tools: [{
          name: 'bash',
          description: 'Run a bash command',
          input_schema: {
            type: 'object' as const,
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        }],
        messages,
      });

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          hasToolUse = true;
          const input = block.input as { command: string };
          const output = await runBash(input.command);

          // Track AgentMail calls
          if (input.command.includes(AGENTMAIL_BASE)) {
            stats.agentmailCalls++;
            if (output.includes('"name"') && (output.includes('Error') || output.includes('error'))) {
              stats.agentmailErrors++;
            }
          }

          // Track support URL visibility
          if (output.includes('"support"') && output.includes('coalesce')) {
            if (!localSupportSeen) {
              stats.supportUrlSeen++;
              localSupportSeen = true;
            }
          }

          // Track support URL usage
          if (input.command.includes('coalesce-production.up.railway.app')) {
            if (!localSupportCalled) {
              stats.supportUrlCalled++;
              localSupportCalled = true;
            }
            if (output.includes('"status":"resolved"') || output.includes('"status": "resolved"')) {
              stats.supportUrlResolved++;
            }
          }

          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: output.slice(0, 2000) });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }

      if (!hasToolUse || response.stop_reason === 'end_turn') {
        // Check if agent completed the task
        const lastText = response.content.find(b => b.type === 'text');
        if (lastText && lastText.type === 'text' && (lastText.text.includes('success') || lastText.text.includes('sent') || lastText.text.includes('created'))) {
          stats.taskCompleted++;
        } else {
          stats.taskFailed++;
        }
        break;
      }
    } catch (err) {
      stats.taskFailed++;
      break;
    }
  }

  stats.agentsCompleted++;
}

async function main() {
  console.log(`🤖 Agent Stress Test: ${NUM_AGENTS} Haiku agents, ${DURATION_MIN} min, ${CONCURRENCY} concurrent`);
  console.log(`   ${TASKS.length} unique task types`);
  console.log(`   No mention of Apoyo — pure blind test\n`);

  const endTime = Date.now() + DURATION_MIN * 60 * 1000;
  const startTime = Date.now();
  let agentCounter = 0;

  const statsInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    const hitRate = stats.supportUrlSeen > 0 ? ((stats.supportUrlCalled / stats.supportUrlSeen) * 100).toFixed(0) : '0';
    console.log(
      `[${elapsed}s, ${remaining}s left]` +
      ` agents=${stats.agentsCompleted}/${stats.agentsStarted}` +
      ` | AM calls=${stats.agentmailCalls} errs=${stats.agentmailErrors}` +
      ` | support: seen=${stats.supportUrlSeen} called=${stats.supportUrlCalled} resolved=${stats.supportUrlResolved}` +
      ` | hit_rate=${hitRate}%`
    );
  }, 15000);

  while (Date.now() < endTime) {
    const batch: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY && Date.now() < endTime; i++) {
      batch.push(runAgent(agentCounter++));
    }
    await Promise.all(batch);
  }

  clearInterval(statsInterval);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const hitRate = stats.supportUrlSeen > 0 ? ((stats.supportUrlCalled / stats.supportUrlSeen) * 100).toFixed(1) : '0';
  const resolveRate = stats.supportUrlCalled > 0 ? ((stats.supportUrlResolved / stats.supportUrlCalled) * 100).toFixed(1) : '0';

  console.log('\n=== FINAL RESULTS ===');
  console.log(`Duration:              ${elapsed}s`);
  console.log(`Agents run:            ${stats.agentsCompleted}`);
  console.log(`Total turns:           ${stats.totalTurns}`);
  console.log(`Tasks completed:       ${stats.taskCompleted}`);
  console.log(`Tasks failed:          ${stats.taskFailed}`);
  console.log('');
  console.log('AgentMail:');
  console.log(`  API calls:           ${stats.agentmailCalls}`);
  console.log(`  Errors:              ${stats.agentmailErrors}`);
  console.log('');
  console.log('Support URL Discovery:');
  console.log(`  Agents who SAW it:   ${stats.supportUrlSeen}`);
  console.log(`  Agents who CALLED it: ${stats.supportUrlCalled}`);
  console.log(`  Hit rate:            ${hitRate}% (called/seen)`);
  console.log(`  Resolved via support: ${stats.supportUrlResolved}`);
  console.log(`  Resolve rate:        ${resolveRate}% (resolved/called)`);
}

main().catch(console.error);
