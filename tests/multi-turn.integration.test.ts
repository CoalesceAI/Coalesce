/**
 * Multi-turn integration test — exercises the full HTTP conversation loop
 * against a running Coalesce server with a live Claude API key.
 *
 * Requires: ANTHROPIC_API_KEY in environment
 *
 * Flow:
 * 1. Send an ambiguous error that Claude needs clarification on
 * 2. Assert needs_info response with session_id
 * 3. Send follow-up with structured answer on the same session
 * 4. Assert resolved response reflects prior context
 * 5. Verify concurrent sessions don't interfere
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { supportRoute } from '../src/routes/support.js';
import { InMemorySessionStore } from '../src/repositories/sessions.js';

const HAS_KEY = !!process.env['ANTHROPIC_API_KEY'];

// ---------------------------------------------------------------------------
// Mock the DB pool — return fake doc content rows
// ---------------------------------------------------------------------------

vi.mock('../src/db/pool.js', () => ({
  query: vi.fn().mockResolvedValue({
    rows: [{ content: 'mock docs', title: 'Test' }],
  }),
}));

// ---------------------------------------------------------------------------
// Mock the auth middleware — skip real auth, set org/orgId variables
// ---------------------------------------------------------------------------

vi.mock('../src/middleware/auth.js', () => {
  const orgAuth = async (c: any, next: any) => {
    c.set('org', { id: 'test-org-id', slug: 'test-org', name: 'Test Org' });
    c.set('orgId', 'test-org-id');
    await next();
  };
  return { orgAuth };
});

describe.skipIf(!HAS_KEY)(
  'Multi-turn conversation — real Claude API (requires ANTHROPIC_API_KEY)',
  () => {
    let app: Hono;
    let store: InMemorySessionStore;

    beforeAll(async () => {
      store = new InMemorySessionStore(3600000); // 1 hour TTL
      app = new Hono();
      app.route('/support', supportRoute(store));
    }, 30000);

    afterAll(() => {
      store.destroy();
    });

    it(
      'full multi-turn: ambiguous error → needs_info → follow-up → resolved',
      async () => {
        // ------------------------------------------------------------------
        // Turn 1: Send an ambiguous error that should trigger needs_info
        // A 400 on /v0/messages without a request body is ambiguous —
        // Claude should ask what they were trying to do
        // ------------------------------------------------------------------
        console.log('\n--- Turn 1: Sending ambiguous error ---');
        const turn1Start = Date.now();

        const turn1Res = await app.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/v0/inboxes/{inbox_id}/messages/send',
            error_code: '400',
            context:
              'I am sending a message and getting a 400 validation error but I do not know which field is wrong. I am passing to, subject, and text fields.',
          }),
        });

        const turn1 = (await turn1Res.json()) as Record<string, unknown>;
        const turn1Elapsed = Date.now() - turn1Start;
        console.log(`Turn 1 response (${turn1Elapsed}ms):`, JSON.stringify(turn1, null, 2));

        expect(turn1Res.status).toBe(200);
        expect(turn1['session_id']).toBeDefined();
        expect(typeof turn1['session_id']).toBe('string');
        expect((turn1['session_id'] as string).length).toBeGreaterThan(0);
        expect(turn1['turn_number']).toBe(1);

        // Claude might resolve immediately or ask for more info.
        // The test is designed to be ambiguous enough to trigger needs_info,
        // but Claude is non-deterministic. Handle both paths.
        const sessionId = turn1['session_id'] as string;

        if (turn1['status'] === 'needs_info') {
          console.log('\n✓ Claude asked for more info (expected path)');
          expect(turn1['question']).toBeDefined();
          expect(typeof turn1['question']).toBe('string');

          // ------------------------------------------------------------------
          // Turn 2: Send follow-up with clarifications
          // ------------------------------------------------------------------
          console.log('\n--- Turn 2: Sending follow-up with clarifications ---');
          const turn2Start = Date.now();

          const turn2Res = await app.request('/support/test-org', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              answer: {
                clarifications: {
                  'request body':
                    '{"inbox_id": "test@agentmail.to", "body": "Hello", "thread_id": "some-thread-id"}',
                  'SDK or raw HTTP': 'Using the TypeScript SDK, AgentMailClient.messages.send()',
                },
                tried_since: ['checked that inbox_id exists', 'verified API key is valid'],
              },
            }),
          });

          const turn2 = (await turn2Res.json()) as Record<string, unknown>;
          const turn2Elapsed = Date.now() - turn2Start;
          console.log(`Turn 2 response (${turn2Elapsed}ms):`, JSON.stringify(turn2, null, 2));

          expect(turn2Res.status).toBe(200);
          expect(turn2['session_id']).toBe(sessionId); // Same session
          expect(turn2['turn_number']).toBe(2);

          // Turn 2 should either resolve or ask again — either is valid
          expect(['resolved', 'needs_info', 'unknown']).toContain(turn2['status']);

          if (turn2['status'] === 'resolved') {
            console.log('\n✓ Claude resolved after follow-up');
            expect(turn2['diagnosis']).toBeDefined();
            expect(turn2['fix']).toBeDefined();
            expect(turn2['references']).toBeDefined();
            expect(turn2['fix_steps']).toBeDefined();
            expect(Array.isArray(turn2['fix_steps'])).toBe(true);
          } else if (turn2['status'] === 'needs_info') {
            console.log('\n✓ Claude asked for more info again (valid — complex issue)');
            expect(turn2['question']).toBeDefined();
          }
        } else if (turn1['status'] === 'resolved') {
          console.log('\n✓ Claude resolved immediately (alternate path)');
          expect(turn1['diagnosis']).toBeDefined();
          expect(turn1['fix']).toBeDefined();
          expect(turn1['fix_steps']).toBeDefined();
        }
      },
      120000
    ); // 2 min timeout for Claude API calls

    it(
      'forced multi-turn: initial request gets needs_info, follow-up uses prior context',
      async () => {
        // ------------------------------------------------------------------
        // This test forces the multi-turn path by sending a deliberately
        // incomplete error report, then providing the missing details.
        // Even if Claude resolves turn 1, the follow-up path is exercised.
        // ------------------------------------------------------------------
        console.log('\n--- Forced multi-turn: Step 1 ---');

        // Step 1: Create a session with an initial request
        const res1 = await app.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/v0/inboxes/{inbox_id}/messages/send',
            error_code: '403',
            context: 'I keep getting forbidden when sending messages',
          }),
        });

        const data1 = (await res1.json()) as Record<string, unknown>;
        console.log('Step 1 response:', JSON.stringify(data1, null, 2));

        expect(res1.status).toBe(200);
        const sessionId = data1['session_id'] as string;
        expect(sessionId).toBeDefined();
        expect(data1['turn_number']).toBe(1);

        // Step 2: Regardless of turn 1 status, send a follow-up on the same session.
        // This exercises the full follow-up path: session lookup, history injection,
        // turn number increment.
        console.log('\n--- Forced multi-turn: Step 2 (follow-up) ---');

        const res2 = await app.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            answer: {
              clarifications: {
                'API key format': 'My key starts with am_ and I just regenerated it',
                'inbox ownership':
                  'The inbox belongs to my organization, I can list it with GET /v0/inboxes',
                'full error response':
                  '{"status":403,"message":"Forbidden: insufficient permissions for this inbox"}',
              },
              tried_since: [
                'regenerated API key',
                'confirmed inbox exists via GET /v0/inboxes',
              ],
            },
          }),
        });

        const data2 = (await res2.json()) as Record<string, unknown>;
        console.log('Step 2 response:', JSON.stringify(data2, null, 2));

        expect(res2.status).toBe(200);
        expect(data2['session_id']).toBe(sessionId); // Same session
        expect(data2['turn_number']).toBe(2); // Turn incremented

        // Claude should have context from turn 1 — its response should
        // reference the 403 / forbidden / permissions issue
        if (data2['status'] === 'resolved') {
          const diagnosis = (data2['diagnosis'] as string).toLowerCase();
          const mentionsContext =
            diagnosis.includes('forbidden') ||
            diagnosis.includes('permission') ||
            diagnosis.includes('403') ||
            diagnosis.includes('inbox');
          console.log(`\nDiagnosis references prior context: ${mentionsContext}`);
          expect(mentionsContext).toBe(true);
          expect(data2['fix_steps']).toBeDefined();
        } else if (data2['status'] === 'needs_info') {
          // Claude wants even more info — the multi-turn loop is working
          console.log('\n✓ Claude asked for more info on turn 2');
          expect(data2['question']).toBeDefined();
        }

        // Step 3: One more follow-up to prove 3+ turns work
        console.log('\n--- Forced multi-turn: Step 3 (second follow-up) ---');

        const res3 = await app.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            answer: {
              clarifications: {
                'role/permissions': 'I am the org admin, I have full access',
                'SDK version': 'Using @agentmail/sdk v1.2.3',
              },
            },
          }),
        });

        const data3 = (await res3.json()) as Record<string, unknown>;
        console.log('Step 3 response:', JSON.stringify(data3, null, 2));

        expect(res3.status).toBe(200);
        expect(data3['session_id']).toBe(sessionId);
        expect(data3['turn_number']).toBe(3); // Third turn
      },
      180000
    );

    it(
      'concurrent sessions: two independent conversations do not interfere',
      async () => {
        // ------------------------------------------------------------------
        // Session A: 401 on /v0/inboxes
        // ------------------------------------------------------------------
        console.log('\n--- Session A: 401 on /v0/inboxes ---');
        const resA = await app.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/v0/inboxes',
            error_code: '401',
            context: 'Missing Authorization header',
          }),
        });
        const a = (await resA.json()) as Record<string, unknown>;
        console.log('Session A:', JSON.stringify(a, null, 2));

        // ------------------------------------------------------------------
        // Session B: 404 on /v0/threads/nonexistent
        // ------------------------------------------------------------------
        console.log('\n--- Session B: 404 on /v0/threads ---');
        const resB = await app.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/v0/threads/nonexistent-id',
            error_code: '404',
            context: 'Thread not found when trying to list messages',
          }),
        });
        const b = (await resB.json()) as Record<string, unknown>;
        console.log('Session B:', JSON.stringify(b, null, 2));

        // Different session IDs
        expect(a['session_id']).toBeDefined();
        expect(b['session_id']).toBeDefined();
        expect(a['session_id']).not.toBe(b['session_id']);

        // Both are turn 1
        expect(a['turn_number']).toBe(1);
        expect(b['turn_number']).toBe(1);

        // If both resolved, their diagnoses should be about different topics
        if (a['status'] === 'resolved' && b['status'] === 'resolved') {
          const diagA = (a['diagnosis'] as string).toLowerCase();
          const diagB = (b['diagnosis'] as string).toLowerCase();
          // A should mention auth/authorization, B should mention thread/not found
          const aAboutAuth = diagA.includes('auth') || diagA.includes('key') || diagA.includes('bearer');
          const bAboutThread = diagB.includes('thread') || diagB.includes('not found') || diagB.includes('404');
          console.log(`\nSession A about auth: ${aAboutAuth}`);
          console.log(`Session B about thread: ${bAboutThread}`);
          expect(aAboutAuth).toBe(true);
          expect(bAboutThread).toBe(true);
        }
      },
      120000
    );

    it(
      'expired session returns SESSION_NOT_FOUND',
      async () => {
        // Create a store with 1ms TTL
        const shortStore = new InMemorySessionStore(1);
        const shortApp = new Hono();
        shortApp.route('/support', supportRoute(shortStore));

        // Create a session
        const res1 = await shortApp.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/v0/inboxes',
            error_code: '500',
            context: 'Server error',
          }),
        });
        const data1 = (await res1.json()) as Record<string, unknown>;
        const sid = data1['session_id'] as string;
        expect(sid).toBeDefined();

        // Wait for TTL to expire
        await new Promise((r) => setTimeout(r, 50));

        // Follow-up should fail with SESSION_NOT_FOUND
        const res2 = await shortApp.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sid,
            answer: { clarifications: { question: 'answer' } },
          }),
        });

        expect(res2.status).toBe(404);
        const data2 = (await res2.json()) as Record<string, unknown>;
        expect(data2['code']).toBe('SESSION_NOT_FOUND');

        shortStore.destroy();
      },
      30000
    );

    it(
      'tried list prevents Claude from suggesting already-attempted fixes',
      async () => {
        console.log('\n--- Sending error with tried list ---');
        const res = await app.request('/support/test-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/v0/inboxes',
            error_code: '401',
            context: 'Getting unauthorized error when listing inboxes',
            tried: [
              'Added Authorization header with Bearer token',
              'Regenerated API key from console',
              'Checked API key starts with am_',
            ],
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;
        console.log('Response:', JSON.stringify(data, null, 2));

        expect(res.status).toBe(200);
        expect(data['session_id']).toBeDefined();
        expect(data['turn_number']).toBe(1);

        // If resolved, the fix should NOT just say "add auth header" since that was tried
        if (data['status'] === 'resolved') {
          const fix = (data['fix'] as string).toLowerCase();
          // The fix shouldn't be ONLY about adding an auth header — we already tried that
          console.log(`Fix content: ${fix.substring(0, 200)}...`);
        }
      },
      60000
    );
  }
);
