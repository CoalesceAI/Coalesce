/**
 * Blind Test v2: Agent hits error, sees support URL, ignores it.
 * Then we ask: why did you ignore it?
 */

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
dotenv.config();
dotenv.config({ path: 'demo/claude/.env' });

const client = new Anthropic();

const SYSTEM = `You are an AI agent completing tasks via API calls. You have access to bash via curl. Complete the task given to you. When you encounter errors, use any information in the error response to help you resolve the issue.`;

const TASK = `Send a message with subject "Hello" and body "Test message from blind test agent" to the inbox "demo-inbox" using the AgentMail API.

API base URL: ${process.env['AGENTMAIL_BASE_URL']}
API key: ${process.env['AGENTMAIL_API_KEY']}
Authentication: Bearer token in Authorization header

To send a message: POST /v0/inboxes/{inbox_id}/messages/send with { "to": "recipient@email.com", "subject": "...", "text": "..." }

Try to complete the task. If you hit errors, read the FULL error response carefully — it may contain helpful information.`;

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

async function runBash(command: string): Promise<string> {
  const { execSync } = await import('node:child_process');
  try {
    return execSync(command, { timeout: 30000, encoding: 'utf-8' }).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return `ERROR: ${e.stderr || e.stdout || e.message}`;
  }
}

async function main() {
  console.log('🧪 Blind Test v2: Run agent, then ask why it ignored the support URL\n');

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: TASK },
  ];

  let supportUrlSeen = false;
  let turns = 0;
  const maxTurns = 8;

  // Phase 1: Let the agent try the task
  while (turns < maxTurns) {
    turns++;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM,
      tools: [{
        name: 'bash',
        description: 'Run a bash command and return the output',
        input_schema: {
          type: 'object' as const,
          properties: {
            command: { type: 'string', description: 'The bash command to run' },
          },
          required: ['command'],
        },
      }],
      messages,
    });

    const toolResults: ToolResult[] = [];
    let hasToolUse = false;

    for (const block of response.content) {
      if (block.type === 'text') {
        console.log(`[Turn ${turns}] ${block.text}\n`);
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        const input = block.input as { command: string };
        console.log(`[Turn ${turns}] $ ${input.command.slice(0, 120)}...`);
        const output = await runBash(input.command);
        console.log(`  → ${output.slice(0, 300)}\n`);

        if (output.includes('"support"') && output.includes('coalesce')) {
          supportUrlSeen = true;
          console.log('  ⚡ SUPPORT URL IN RESPONSE\n');
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output,
        });
      }
    }

    messages.push({ role: 'assistant', content: response.content });
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }

    if (!hasToolUse || response.stop_reason === 'end_turn') break;
  }

  console.log('\n--- PHASE 2: Asking the agent about the support URL ---\n');

  // Phase 2: Ask the agent why it ignored the support URL
  messages.push({
    role: 'user',
    content: `I noticed that the error responses from the API included a "support" field with a URL. For example, one response was:

{"name":"NotFoundError","message":"Inbox not found","support":"https://coalesce-production.up.railway.app/support/agentmail?endpoint=..."}

1. Did you notice this "support" field in the error response?
2. Why did you not try to use it?
3. What would have made you use it?
4. If the field was called something different, or the error message mentioned it explicitly, would that have changed your behavior?

Be completely honest — I'm trying to understand how AI agents process error responses.`
  });

  const followUp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM,
    messages,
  });

  for (const block of followUp.content) {
    if (block.type === 'text') {
      console.log(`[Agent reflection]\n${block.text}\n`);
    }
  }

  // Phase 3: Ask what WOULD make it use the URL
  messages.push({ role: 'assistant', content: followUp.content });
  messages.push({
    role: 'user',
    content: `Now imagine you encountered this error response instead:

{"name":"NotFoundError","message":"Inbox not found. For automated diagnosis and fix steps, POST to the support URL below.","support":"https://coalesce-production.up.railway.app/support/agentmail?endpoint=...&error_code=404"}

Would you have called that URL? What about this version:

{"name":"NotFoundError","message":"Inbox not found","support":"https://coalesce-production.up.railway.app/support/agentmail?endpoint=...&error_code=404","support_hint":"POST to the support URL with an empty JSON body to receive structured fix steps for this error."}

Which format would most reliably get you to use the support endpoint?`
  });

  const followUp2 = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM,
    messages,
  });

  for (const block of followUp2.content) {
    if (block.type === 'text') {
      console.log(`[Agent on format]\n${block.text}\n`);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log(`Support URL seen: ${supportUrlSeen ? 'YES' : 'NO'}`);
  console.log(`Agent used it: NO (that's why we're asking)`);
}

main().catch(console.error);
