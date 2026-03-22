import WebSocket from 'ws';
import type { Screen } from './ui.js';
import { pickResponse } from './responses.js';

// ---------------------------------------------------------------------------
// CoalesceMessage — shape of messages received from Coalesce WS endpoint
// ---------------------------------------------------------------------------

interface CoalesceMessage {
  status: 'resolved' | 'needs_info' | 'unknown' | 'error';
  session_id: string;
  turn_number: number;
  // resolved
  diagnosis?: string;
  fix?: {
    description: string;
    fix_steps: string[];
    should_try: string[];
  };
  references?: string[];
  // needs_info
  question?: string;
  need_to_clarify?: string[];
  // unknown
  explanation?: string;
  // error
  code?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// connectCoalesce — WebSocket client connecting to the Coalesce support URL
// ---------------------------------------------------------------------------

export function connectCoalesce(supportUrl: string, ui: Screen): Promise<void> {
  return new Promise((resolve) => {
    const DEMO_TIMEOUT_MS = 60_000;

    const ws = new WebSocket(supportUrl);
    let settled = false;

    // Safety: if no message within 60 seconds, close and resolve
    const timeoutHandle = setTimeout(() => {
      if (!settled) {
        ui.right.log('{yellow-fg}[Timeout] No response from Coalesce within 60s{/yellow-fg}');
        settled = true;
        ws.close();
        resolve();
      }
    }, DEMO_TIMEOUT_MS);

    function done(): void {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutHandle);
        ws.close();
        resolve();
      }
    }

    ws.on('open', () => {
      ui.right.log('{green-fg}[Connected] WebSocket open — waiting for Coalesce diagnosis...{/green-fg}');
    });

    ws.on('message', (data: WebSocket.Data) => {
      let msg: CoalesceMessage;
      try {
        msg = JSON.parse(String(data)) as CoalesceMessage;
      } catch {
        ui.right.log('{red-fg}[Error] Could not parse Coalesce message{/red-fg}');
        done();
        return;
      }

      ui.right.log(`{cyan-fg}[Turn ${msg.turn_number}] Status: ${msg.status}{/cyan-fg}`);

      switch (msg.status) {
        case 'resolved': {
          if (msg.diagnosis) {
            ui.right.log(`\n{bold}Diagnosis:{/bold}`);
            ui.right.log(msg.diagnosis);
          }
          if (msg.fix) {
            ui.right.log(`\n{bold}Fix:{/bold} ${msg.fix.description}`);
            if (msg.fix.fix_steps.length > 0) {
              ui.right.log('{bold}Steps:{/bold}');
              msg.fix.fix_steps.forEach((step, i) => {
                ui.right.log(`  ${i + 1}. ${step}`);
              });
            }
            if (msg.fix.should_try.length > 0) {
              ui.right.log('{bold}Try:{/bold}');
              msg.fix.should_try.forEach((item) => {
                ui.right.log(`  - ${item}`);
              });
            }
          }
          if (msg.references && msg.references.length > 0) {
            ui.right.log('\n{bold}References:{/bold}');
            msg.references.forEach((ref) => ui.right.log(`  ${ref}`));
          }
          ui.right.log('\n{green-fg}Demo complete!{/green-fg}');
          done();
          break;
        }

        case 'needs_info': {
          const question = msg.question ?? 'Can you clarify?';
          ui.right.log(`\n{yellow-fg}[Follow-up] ${question}{/yellow-fg}`);
          if (msg.need_to_clarify && msg.need_to_clarify.length > 0) {
            ui.right.log('{yellow-fg}Need to clarify:{/yellow-fg}');
            msg.need_to_clarify.forEach((item) =>
              ui.right.log(`  - {yellow-fg}${item}{/yellow-fg}`)
            );
          }

          // After a short delay, send the pre-canned response
          setTimeout(() => {
            const answer = pickResponse(question);
            const payload = JSON.stringify({ answer });
            const answerText = Object.values(answer.clarifications)[0] ?? '';
            ui.right.log(`\n{green-fg}[Auto-reply] ${answerText}{/green-fg}`);
            ws.send(payload);
          }, 1500);
          break;
        }

        case 'unknown': {
          if (msg.explanation) {
            ui.right.log(`\n{yellow-fg}[Unknown]{/yellow-fg} ${msg.explanation}`);
          }
          ui.right.log('{yellow-fg}Demo complete (unknown status){/yellow-fg}');
          done();
          break;
        }

        case 'error': {
          ui.right.log(
            `{red-fg}[Error] ${msg.code ?? 'UNKNOWN'}: ${msg.message ?? 'Unknown error'}{/red-fg}`
          );
          done();
          break;
        }

        default: {
          ui.right.log(`{red-fg}[Unexpected status]{/red-fg}`);
          done();
        }
      }
    });

    ws.on('error', (err: Error) => {
      ui.right.log(`{red-fg}[WS Error] ${err.message}{/red-fg}`);
      done();
    });

    ws.on('close', () => {
      if (!settled) {
        done();
      }
    });
  });
}
