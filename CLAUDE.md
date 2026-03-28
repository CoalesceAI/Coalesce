# CLAUDE.md

This file provides guidance to Claude Code when working with the Apoyo API server.

## What Apoyo Is

Self-healing support infrastructure for B2A companies. API errors include a support URL. Agents call it, get a structured diagnosis, apply the fix, continue working. Deployed on Railway at `coalesce-production.up.railway.app`.

## Commands

```bash
npm run dev          # Start dev server with tsx (localhost:3000)
npm run build        # Compile to dist/ with tsup
npm run start        # Run compiled dist/index.js
npm run typecheck    # tsc --noEmit (no build artifacts)
npm run test         # vitest run --reporter=verbose
npm run migrate      # Run database migrations against Neon Postgres
npm run seed         # Seed AgentMail as first organization (prints API key)
```

## Architecture

**Stack:** Hono HTTP framework, TypeScript (strict), ESM modules, Zod validation, Anthropic SDK, Postgres (Neon), vitest.

**Module format:** ESM (`"type": "module"`). All imports must use `.js` extension.

**Multi-tenancy:** Each organization (API company) gets their own docs, API keys, and sessions. Organizations identified by slug in URL: `/support/{org}`.

**Design:** Resource-oriented — domain types separated from data access from HTTP handling.

## Project Structure

```
src/
  index.ts              # Server entrypoint — runs migrations, creates services, wires routes
  domain/               # Pure types, no DB or HTTP imports
    organization.ts     # Organization interface
    session.ts          # Session, ConversationTurn interfaces
    api-key.ts          # ApiKey interface, key generation/hashing (crypto only, no DB)
    document.ts         # DocSource, DocContent interfaces
    index.ts            # Re-exports everything
  repositories/         # Data access layer (imports pool, knows Postgres, not HTTP)
    organizations.ts    # getOrgBySlug, createOrg
    api-keys.ts         # createApiKey, validateApiKey
    sessions.ts         # SessionStore interface, InMemorySessionStore, PostgresSessionStore
    documents.ts        # loadOrgDocs(orgId) — SELECT + concatenate doc_content
  db/
    pool.ts             # Postgres connection pool (DATABASE_URL)
    migrate.ts          # SQL migration runner with _migrations tracking
    seed-agentmail.ts   # Seeds AgentMail as first organization
  routes/
    health.ts           # GET /health — status + DB connectivity
    support.ts          # POST /support/:org — multi-turn diagnosis (auth required)
    ws.ts               # GET /ws/:org — WebSocket diagnosis (auth required)
  services/
    docs-loader.ts      # Load + strip MDX + OpenAPI from disk (seed script only)
    diagnosis.ts        # Claude API call with Zod structured output
  middleware/
    auth.ts             # Org auth middleware — validates API key, resolves organization
  schemas/
    request.ts          # SupportRequestSchema (Zod)
    response.ts         # DiagnosisResponseSchema (Zod)
migrations/
  001-005              # Schema migrations (organizations, api_keys, doc_sources, doc_content, sessions)
scripts/
  load-test.ts         # Quick parallel agent error test
  stress-test.ts       # Realistic multi-agent simulation
  stress-test-v2.ts    # Diverse error scenarios from real support data
  blind-test.ts        # Test: does agent naturally use support URL?
  blind-test-ask-why.ts # Test + ask agent why it ignored/used the URL
  check-data.ts        # Check session data in Postgres
  check-distribution.ts # Check error distribution across sessions
tests/
demo/
  claude/              # Claude Code demo (CLAUDE.md + .env)
  blind-test/          # Blind test (no Apoyo hints)
  run-demo.sh          # tmux split-pane demo launcher
```

## Database

Postgres on Neon. Tables: `organizations`, `api_keys`, `doc_sources`, `doc_content`, `sessions`.

No usage tracking table (removed — add back when billing matters).

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude calls
- `DATABASE_URL` — Postgres connection string (Neon)

Optional:
- `PORT` — Server port (default: 3000)
- `SESSION_TTL_MS` — Session TTL in ms (default: 1 hour)

## Authentication

All `/support/:org` and `/ws/:org` routes require `Authorization: Bearer <api_key>`.

API keys use `clsc_live_` prefix, stored as SHA-256 hashes. Middleware validates key and ensures it belongs to the org in the URL.

**Upcoming:** Signed URLs — support URL will contain a token so agents don't need a separate API key.

## Key Conventions

- Use `.js` extension in all imports (ESM TypeScript standard)
- Zod schemas in `src/schemas/` — never inline in routes
- Domain types in `src/domain/` — never import DB or HTTP
- Repositories in `src/repositories/` — only data access, no HTTP
- Routes are thin — validate, call repo/service, respond
- Tests use InMemorySessionStore (no Postgres required)
- All API errors return `{ error: string, code: string }` JSON

## Response Format

All `/support/:org` responses use a discriminated union on `status`:
- `resolved` — includes `diagnosis`, `fix`, `references[]`, `fix_steps[]`
- `needs_info` — includes `question`, `need_to_clarify[]`
- `unknown` — includes `explanation`
- `error` — includes `message`, `code`

## Context Docs

Full product and strategy context lives in `docs/internal/`. See [`docs/internal/INDEX.md`](docs/internal/INDEX.md) for the full list. Key things to know:

**Product direction** (`product-direction.md`): The support endpoint is the data funnel, not the product. Real value = observing how agents fail at APIs (Act 1: support endpoint, Act 2: behavioral intelligence, Act 3: Agent-Led Growth platform). Assignment: 3-5 customers by end of April, apply YC May deadline.

**Architecture decisions** (`coalesce-v2-architecture.md`, `coalesce-clarity.md`): No caching (data <200KB, query fast), no S3 (Postgres for everything), no pods (one org = one set of docs), no usage tracking (add when billing matters). Keep it simple — adoption friction kills infra companies.

**Agent behavior** (`agent-behavior-findings.md`): Agents ignore bare `support` URL — treat it as metadata for humans. `support_hint` field gets them to try it. Auth is the remaining blocker — agents use whatever key they have. Signed URLs solve this (token embedded in URL, zero friction).

**Competition** (`product-direction.md`): Plain/Pylon serve humans who manage agents. Kapa/Inkeep are human-facing widgets. Nobody does inline, structured, real-time agent error resolution.

**Demo context** (`coalesce-demo-strategy.md`): Two key audiences — Afore VCs (prove B2A support is a category, not a feature) and AgentMail cofounder (7-second API resolution vs email path, 3-line integration).

## Deployment

- **Apoyo:** Railway at `coalesce-production.up.railway.app`
- **AgentMail integration:** tanishq stacks (east + west). Error responses include `support` URL + `support_hint`. Always deploy to BOTH stacks. Always `rm -rf dist/ temp/` before deploy to force full rebuild.

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`.
