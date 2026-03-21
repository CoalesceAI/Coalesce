/**
 * Integration tests for the diagnosis service.
 *
 * These tests make REAL Claude API calls and require ANTHROPIC_API_KEY to be set.
 * They are skipped automatically in CI environments without the key.
 *
 * Run manually with:
 *   ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/diagnosis.integration.test.ts
 *
 * NOTE: Record wall-clock times in STATE.md for Phase 3 async design.
 */

import { describe, it, expect } from 'vitest';
import { diagnose } from '../src/services/diagnosis.js';
import { loadDocs } from '../src/services/docs-loader.js';

const DOCS_DIR = process.env['DOCS_DIR'] ?? '../agentmail/agentmail-docs/fern/pages';
const OPENAPI_PATH =
  process.env['OPENAPI_PATH'] ?? '../agentmail/agentmail-docs/current-openapi.json';

describe.skipIf(!process.env['ANTHROPIC_API_KEY'])(
  'diagnose() — real Claude API (requires ANTHROPIC_API_KEY)',
  () => {
    // Shared docs context loaded lazily
    let docsContext: string;

    async function getDocsContext(): Promise<string> {
      if (!docsContext) {
        console.log('Loading AgentMail docs for integration tests...');
        const start = Date.now();
        docsContext = await loadDocs(DOCS_DIR, OPENAPI_PATH);
        console.log(`Docs loaded: ${docsContext.length} chars in ${Date.now() - start}ms`);
      }
      return docsContext;
    }

    it(
      'returns a valid response for a realistic 401 error on /threads',
      async () => {
        const docs = await getDocsContext();
        const start = Date.now();

        const { response: result } = await diagnose(
          {
            endpoint: '/threads',
            error_code: '401',
            context: 'Missing Authorization header in request',
          },
          docs
        );

        const wallClockMs = Date.now() - start;
        console.log(`[integration] Wall-clock time for /threads 401: ${wallClockMs}ms`);
        // Record this value in STATE.md for Phase 3 async design

        expect(result.status).toMatch(/^(resolved|needs_info|unknown)$/);
        console.log('[integration] Response status:', result.status);
        console.log('[integration] Response:', JSON.stringify(result, null, 2));
      },
      60_000 // 60s timeout — Claude with full docs may take 30s+
    );

    it(
      'returns unknown for a nonsense endpoint not covered by docs',
      async () => {
        const docs = await getDocsContext();
        const start = Date.now();

        const { response: result } = await diagnose(
          {
            endpoint: '/quantum-flux',
            error_code: 'FLUX_CAPACITOR',
            context: 'Time travel module failed to initialize',
          },
          docs
        );

        const wallClockMs = Date.now() - start;
        console.log(`[integration] Wall-clock time for /quantum-flux nonsense: ${wallClockMs}ms`);
        // Record this value in STATE.md for Phase 3 async design

        expect(result.status).toBe('unknown');
        console.log('[integration] Response:', JSON.stringify(result, null, 2));
      },
      60_000 // 60s timeout — Claude with full docs may take 30s+
    );
  }
);
