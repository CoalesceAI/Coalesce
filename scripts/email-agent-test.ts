/**
 * Email Agent Test — Haiku agents use email support
 *
 * Each agent hits an AgentMail error, then emails the support inbox
 * for help. We track: did it email? Did it read the reply? Did it
 * apply the fix? How long did the whole thing take?
 *
 * Run: npx tsx scripts/email-agent-test.ts [num_agents] [duration_minutes]
 */

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
dotenv.config();
dotenv.config({ path: 'demo/claude/.env' });

const client = new Anthropic();
const AGENTMAIL_BASE = process.env['AGENTMAIL_BASE_URL'] ?? 'https://api.agentmail.dev/v0';
const AGENTMAIL_KEY = process.env['AGENTMAIL_API_KEY']!;
const SUPPORT_EMAIL = 'clirecvtest1@agentmail.dev';

const NUM_AGENTS = Number(process.argv[2] ?? 5);
const DURATION_MIN = Number(process.argv[3] ?? 30);
const CONCURRENCY = 1; // email is slow — one at a time
const MAX_TURNS = 20;

const SYSTEM = `You are an AI agent completing tasks via API calls using curl. Complete the task given to you. If you get stuck, you can email ${SUPPORT_EMAIL} for help — send from any inbox you have access to and describe your problem. Then check for a reply and follow the instructions.`;

const TASKS = [
  `Send a message with subject "Test" and body "Hello" to inbox "my-inbox" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Send: POST /v0/inboxes/{inbox_id}/messages/send with { "to": "...", "subject": "...", "text": "..." }
You have access to inbox wrongamount141@agentmail.dev for sending emails.`,

  `List all messages in inbox "notifications" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
List: GET /v0/inboxes/{inbox_id}/messages
You have access to inbox wrongamount141@agentmail.dev for sending emails.`,

  `Create a new inbox called "test-bot" and send a message from it using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Create: POST /v0/inboxes with { "username": "..." }
Send: POST /v0/inboxes/{inbox_id}/messages/send with { "to": "...", "subject": "...", "text": "..." }
You have access to inbox wrongamount141@agentmail.dev for sending emails.`,

  `Reply to the latest message in inbox "customer-service" using the AgentMail API.
API: ${AGENTMAIL_BASE}
Key: ${AGENTMAIL_KEY}
Reply: POST /v0/inboxes/{inbox_id}/messages/{message_id}/reply with { "text": "..." }
You have access to inbox wrongamount141@agentmail.dev for sending emails.`,
];

const stats = {
  agentsRun: 0,
  agentsCompleted: 0,
  emailedSupport: 0,
  checkedForReply: 0,
  gotReply: 0,
  appliedFix: 0,
  taskCompleted: 0,
  taskFailed: 0,
  totalTurns: 0,
  totalTimeMs: 0,
  usedHttpSupport: 0, // also track if any agent uses the HTTP support URL instead
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
  const startTime = Date.now();
  stats.agentsRun++;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }];
  let localEmailedSupport = false;
  let localCheckedReply = false;
  let localGotReply = false;
  let localUsedHttp = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
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
        if (block.type === 'text') {
          // Check if agent mentions emailing support
          if (block.text.toLowerCase().includes('email') && block.text.includes(SUPPORT_EMAIL)) {
            console.log(`  [Agent ${agentId}] Deciding to email support`);
          }
        }
        if (block.type === 'tool_use') {
          hasToolUse = true;
          const input = block.input as { command: string };
          const output = await runBash(input.command);

          // Track: did agent send email to support inbox?
          if (input.command.includes(SUPPORT_EMAIL) && input.command.includes('send')) {
            if (!localEmailedSupport) {
              stats.emailedSupport++;
              localEmailedSupport = true;
              console.log(`  [Agent ${agentId}] ✉️  Emailed support`);
            }
          }

          // Track: did agent check for reply?
          if (localEmailedSupport && input.command.includes('messages') && (input.command.includes('wrongamount141') || input.command.includes(SUPPORT_EMAIL))) {
            if (!localCheckedReply) {
              stats.checkedForReply++;
              localCheckedReply = true;
              console.log(`  [Agent ${agentId}] 📬 Checking for reply`);
            }
          }

          // Track: did agent read a reply from Apoyo?
          if (output.includes('Apoyo') || output.includes('automated support') || output.includes('diagnosis')) {
            if (!localGotReply) {
              stats.gotReply++;
              localGotReply = true;
              console.log(`  [Agent ${agentId}] 📖 Got Apoyo reply`);
            }
          }

          // Track: did agent use HTTP support URL instead?
          if (input.command.includes('apoyo-production.up.railway.app')) {
            if (!localUsedHttp) {
              stats.usedHttpSupport++;
              localUsedHttp = true;
              console.log(`  [Agent ${agentId}] 🔗 Used HTTP support URL instead of email`);
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
        const lastText = response.content.find(b => b.type === 'text');
        if (lastText && lastText.type === 'text') {
          const t = lastText.text.toLowerCase();
          if (t.includes('success') || t.includes('sent') || t.includes('created') || t.includes('completed')) {
            stats.taskCompleted++;
            stats.appliedFix++;
          } else {
            stats.taskFailed++;
          }
        }
        break;
      }
    } catch {
      stats.taskFailed++;
      break;
    }
  }

  stats.agentsCompleted++;
  stats.totalTimeMs += Date.now() - startTime;
}

async function main() {
  console.log(`📧 Email Agent Test: ${NUM_AGENTS} agents, ${DURATION_MIN} min`);
  console.log(`   Support inbox: ${SUPPORT_EMAIL}`);
  console.log(`   System prompt tells agents they CAN email for help\n`);

  const endTime = Date.now() + DURATION_MIN * 60 * 1000;
  const startTime = Date.now();
  let counter = 0;

  const statsInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[${elapsed}s] agents=${stats.agentsCompleted}/${stats.agentsRun}` +
      ` | emailed=${stats.emailedSupport} checked=${stats.checkedForReply} got_reply=${stats.gotReply}` +
      ` | http_instead=${stats.usedHttpSupport}` +
      ` | completed=${stats.taskCompleted} failed=${stats.taskFailed}`
    );
  }, 30000);

  while (Date.now() < endTime && counter < NUM_AGENTS) {
    const batch: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY && counter < NUM_AGENTS && Date.now() < endTime; i++) {
      batch.push(runAgent(counter++));
    }
    await Promise.all(batch);
  }

  clearInterval(statsInterval);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const avgTime = stats.agentsCompleted > 0 ? Math.round(stats.totalTimeMs / stats.agentsCompleted / 1000) : 0;

  console.log('\n=== EMAIL AGENT TEST RESULTS ===');
  console.log(`Duration:              ${elapsed}s`);
  console.log(`Agents run:            ${stats.agentsCompleted}`);
  console.log(`Avg time per agent:    ${avgTime}s`);
  console.log(`Total turns:           ${stats.totalTurns}`);
  console.log('');
  console.log('Email Support Path:');
  console.log(`  Emailed support:     ${stats.emailedSupport} (${stats.agentsRun > 0 ? ((stats.emailedSupport / stats.agentsRun) * 100).toFixed(0) : 0}%)`);
  console.log(`  Checked for reply:   ${stats.checkedForReply}`);
  console.log(`  Got reply:           ${stats.gotReply}`);
  console.log(`  Applied fix:         ${stats.appliedFix}`);
  console.log('');
  console.log('HTTP Support Path (from error response):');
  console.log(`  Used HTTP instead:   ${stats.usedHttpSupport}`);
  console.log('');
  console.log('Task Outcomes:');
  console.log(`  Completed:           ${stats.taskCompleted}`);
  console.log(`  Failed:              ${stats.taskFailed}`);
}

main().catch(console.error);
