# CLAUDE.md

This file provides guidance to Claude Code when working with the Coalesce API server.

## Commands

```bash
npm run dev          # Start dev server with tsx (localhost:3000)
npm run build        # Compile to dist/ with tsup
npm run start        # Run compiled dist/index.js
npm run typecheck    # tsc --noEmit (no build artifacts)
npm run test         # vitest run --reporter=verbose
npm run migrate      # Run database migrations against Neon Postgres
npm run seed         # Seed AgentMail as first tenant (prints API key)
```

## Architecture

**Stack:** Hono HTTP framework, TypeScript (strict), ESM modules, Zod validation, Anthropic SDK, Postgres (Neon), vitest.

**Module format:** ESM (`"type": "module"`). All imports must use `.js` extension.

**Multi-tenancy:** Each tenant (API company) gets their own docs, API keys, sessions, and usage tracking. Tenants are identified by slug in the URL path (`/support/{tenant}`).

## Project Structure

```
src/
  index.ts              # Server entrypoint — runs migrations, creates services, wires routes
  db/
    pool.ts             # Postgres connection pool (DATABASE_URL)
    migrate.ts          # SQL migration runner with _migrations tracking
    seed-agentmail.ts   # Seeds AgentMail as first tenant
  routes/
    health.ts           # GET /health — status + DB connectivity check
    support.ts          # POST /support/:tenant — multi-turn diagnosis (auth required)
    ws.ts               # GET /ws/:tenant — WebSocket diagnosis (auth required)
  services/
    tenant.ts           # Tenant CRUD + API key management (clsc_live_* format)
    docs-cache.ts       # Per-tenant docs loaded from DB with in-memory TTL cache
    docs-loader.ts      # Load + strip MDX + OpenAPI from disk (used by seed script)
    diagnosis.ts        # Claude API call with Zod structured output
    session-store.ts    # SessionStore interface + InMemorySessionStore + PostgresSessionStore
    usage.ts            # Fire-and-forget usage event logging
  middleware/
    auth.ts             # Tenant auth middleware — validates API key, resolves tenant
  schemas/
    request.ts          # SupportRequestSchema (Zod)
    response.ts         # DiagnosisResponseSchema (Zod)
migrations/
  001_multi_tenancy.sql # Schema: tenants, api_keys, doc_sources, doc_content, sessions, usage
tests/
  health.test.ts        # Health endpoint tests
  support.test.ts       # Support endpoint tests
  schemas.test.ts       # Schema unit tests
  session-store.test.ts # SessionStore tests
demo/
  claude/               # Claude Code demo (CLAUDE.md + .env)
```

## Database

Postgres on Neon. Tables: `tenants`, `api_keys`, `doc_sources`, `doc_content`, `sessions`, `usage`.

Sessions use JSONB for turns and original_request. Usage tracks per-resolution latency and token counts.

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude calls
- `DATABASE_URL` — Postgres connection string (Neon)

Optional:
- `PORT` — Server port (default: 3000)
- `SESSION_TTL_MS` — Session TTL in ms (default: 1 hour)
- `DOCS_CACHE_TTL_MS` — Docs cache TTL in ms (default: 5 min)

## Authentication

All `/support/:tenant` and `/ws/:tenant` routes require `Authorization: Bearer <api_key>`.

API keys use `clsc_live_` prefix, stored as SHA-256 hashes. Middleware validates key and ensures it belongs to the tenant in the URL.

## Key Conventions

- Use `.js` extension in all imports (ESM TypeScript standard)
- Zod schemas live in `src/schemas/` — never inline in route handlers
- All API errors return `{ error: string, code: string }` JSON (never HTML)
- Tests use InMemorySessionStore (no Postgres required for tests)
- Usage logging is fire-and-forget (never blocks responses)

## Response Format

All `/support/:tenant` responses use a discriminated union on `status`:
- `resolved` — includes `diagnosis`, `fix`, `references[]`, `fix_steps[]`
- `needs_info` — includes `question`, `need_to_clarify[]`
- `unknown` — includes `explanation`
- `error` — includes `message`, `code`
