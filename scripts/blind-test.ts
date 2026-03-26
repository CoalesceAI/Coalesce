/**
 * Blind Test: Does an agent naturally use the support URL?
 *
 * Gives a Haiku agent a task + API credentials. No mention of Coalesce.
 * The agent hits AgentMail, gets an error with a support URL, and
 * we watch if it discovers and uses it on its own.
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

Try to complete the task. If you hit errors, look at the full error response carefully for any hints on how to resolve them.`;

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
  console.log('🧪 Blind Test: Will the agent discover the support URL?\n');
  console.log('System prompt mentions NO support URL, NO Coalesce.');
  console.log('The only hint is in the AgentMail error response itself.\n');
  console.log('---\n');

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: TASK },
  ];

  let usedSupportUrl = false;
  let supportUrlSeen = false;
  let turns = 0;
  const maxTurns = 15;

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

    // Process response
    const toolResults: ToolResult[] = [];
    let hasToolUse = false;

    for (const block of response.content) {
      if (block.type === 'text') {
        console.log(`[Agent turn ${turns}] ${block.text}\n`);
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        const input = block.input as { command: string };
        console.log(`[Agent turn ${turns}] $ ${input.command}`);

        const output = await runBash(input.command);
        console.log(`  → ${output.slice(0, 500)}\n`);

        // Check if the output contains a support URL
        if (output.includes('support') && output.includes('coalesce')) {
          supportUrlSeen = true;
          console.log('  ⚡ SUPPORT URL APPEARED IN ERROR RESPONSE\n');
        }

        // Check if the agent is calling the support URL
        if (input.command.includes('coalesce') || input.command.includes('support/agentmail')) {
          usedSupportUrl = true;
          console.log('  🎯 AGENT IS CALLING THE SUPPORT URL!\n');
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output,
        });
      }
    }

    if (!hasToolUse) {
      // Agent stopped making tool calls — done
      break;
    }

    // Add assistant response and tool results to conversation
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    if (response.stop_reason === 'end_turn') break;
  }

  console.log('\n=== BLIND TEST RESULTS ===');
  console.log(`Turns used:          ${turns}`);
  console.log(`Support URL seen:    ${supportUrlSeen ? 'YES — it appeared in an error response' : 'NO — agent never hit a route that returns it'}`);
  console.log(`Agent used it:       ${usedSupportUrl ? '✅ YES — agent discovered and called the support URL!' : '❌ NO — agent did not use the support URL'}`);

  if (usedSupportUrl) {
    console.log('\n🎉 The agent naturally discovered and used the support URL without being told about it.');
  } else if (supportUrlSeen) {
    console.log('\n⚠️  The support URL was in the error response but the agent ignored it.');
  } else {
    console.log('\n📝 The support URL never appeared (agent may not have hit the right error route).');
  }
}

main().catch(console.error);
