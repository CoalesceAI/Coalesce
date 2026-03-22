import 'dotenv/config';
import { createScreen } from './ui.js';
import { makeFailingRequest } from './agentmail.js';
import { connectCoalesce } from './coalesce.js';

// ---------------------------------------------------------------------------
// main — orchestrates the full demo flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const ui = createScreen();

  try {
    // Step 1: Make the bad API call to AgentMail
    ui.left.log('{bold}Making bad API call to AgentMail...{/bold}');
    ui.left.log('{grey-fg}POST /v0/inboxes/nonexistent-inbox-id/messages{/grey-fg}');
    ui.left.log('{grey-fg}Body: { "subject": "Test", "text": "Hello" }{/grey-fg}');
    ui.left.log('');

    const result = await makeFailingRequest();

    // Step 2: Display error details on the left pane
    ui.left.log(`{red-fg}HTTP ${result.statusCode} Error{/red-fg}`);
    ui.left.log(`{red-fg}Name: ${result.error.name}{/red-fg}`);
    if (result.error.message) {
      ui.left.log(`{red-fg}Message: ${result.error.message}{/red-fg}`);
    }
    ui.left.log('');

    if (result.supportUrl) {
      ui.left.log(`{cyan-fg}Support URL:{/cyan-fg}`);
      ui.left.log(`{cyan-fg}${result.supportUrl}{/cyan-fg}`);
    } else {
      ui.left.log('{yellow-fg}(No support URL in error response){/yellow-fg}');
    }
    ui.left.log('');

    // Step 3: Check we have a support URL
    if (!result.supportUrl) {
      ui.left.log('{red-fg}[Error] No support URL available.{/red-fg}');
      ui.left.log('{yellow-fg}Set COALESCE_WS_URL in .env as fallback.{/yellow-fg}');
      await sleep(3000);
      ui.destroy();
      process.exit(1);
    }

    // Step 4: Connect to Coalesce via WebSocket
    ui.right.log('{bold}Connecting to Coalesce...{/bold}');
    ui.right.log(`{grey-fg}URL: ${result.supportUrl}{/grey-fg}`);
    ui.right.log('');

    await connectCoalesce(result.supportUrl, ui);

    // Step 5: Let the user see the final state for 3 seconds
    await sleep(3000);

    ui.destroy();
    process.exit(0);
  } catch (err) {
    ui.destroy();
    console.error('[Demo Error]', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
