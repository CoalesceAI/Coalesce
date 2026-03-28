# CLAUDE.md

This file provides guidance to Claude Code when working with the **Coalesce** API server.

## What Coalesce Is

Self-healing support infrastructure for B2A companies. API errors include a support URL. Agents call it, get a structured diagnosis, apply the fix, continue working. Deployed on Railway at `coalesce-production.up.railway.app`.

## Commands

```bash
npm run dev          # Start dev server with tsx (localhost:3000)
npm run build        # Compile to dist/ with tsup
npm run start        # Run compiled dist/index.js
npm run typecheck    # tsc --noEmit (no build artifacts)
npm run test         # vitest run --reporter=verbose
npm run migrate      # Run database migrations against Neon Postgres
npm run seed         # Seed AgentMail org, docs, API key (see Environment)
npm run seed-web     # Alternate seed path (tsx src/db/seed-from-web.ts)
npm run generate-url # Signed URL helper (tsx src/db/generate-signed-url.ts)
```

Admin UI (in `admin/`):

```bash
cd admin && npm run dev   # Next.js dev server (localhost:3001)
cd admin && npm run build # Production build
```

## Architecture

**Backend:** Hono HTTP framework, TypeScript (strict), ESM modules, Zod validation, Anthropic SDK, Postgres (Neon), vitest.

**Admin UI:** Next.js 14 (App Router), React Server Components, shadcn/ui, Tailwind CSS, Clerk auth, Recharts.

**Module format:** ESM (`"type": "module"`). All imports must use `.js` extension.

**Multi-tenancy:** Each organization (API company) gets their own docs, API keys, and sessions. Organizations are identified by slug in the URL: `/support/{org}`.

**Design:** Resource-oriented — domain types separated from data access from HTTP handling.

## Project Structure

```
src/
  index.ts              # Server entrypoint — migrations, services, routes
  domain/               # Pure types (organization, session, api-key, document)
  repositories/       # Data access — organizations, api-keys, sessions, documents
  db/                   # pool, migrate, seed scripts
  routes/
    health.ts           # GET /health
    support.ts          # POST /support/:org — multi-turn diagnosis (API key)
    ws.ts               # GET /ws/:org — WebSocket diagnosis (API key)
    admin.ts            # Admin API — analytics, sessions, orgs, keys, activity
    knowledge.ts        # Knowledge base — doc CRUD, upload, search
    integrations.ts     # Notion, etc.
  services/
    docs-loader.ts      # MDX + OpenAPI from disk (seed / tooling)
    diagnosis.ts        # Claude structured diagnosis
    storage.ts          # S3-compatible presigned URLs
    notion.ts, firecrawl.ts, activity.ts, …
  channels/
    email/              # POST /email/:org — AgentMail webhooks
  middleware/
    auth.ts             # Org API key → organization
    admin-auth.ts       # Clerk JWT for /admin
  schemas/
    request.ts, response.ts
admin/                  # Next.js admin app — dashboard, sessions, settings, knowledge
migrations/             # Numbered SQL (see below)
tests/
demo/
  claude/               # Claude Code demo (CLAUDE.md + env)
  blind-test/           # Blind test (no Coalesce hints in prompt)
  run-demo.sh           # tmux: Coalesce server | Claude Code
scripts/                # load-test, stress-test, blind-test, check-data, …
```

## Migrations

SQL files in `migrations/` apply in filename order. Notable themes:

- **001–005** — Core schema: organizations, api_keys, doc_sources, doc_content, sessions; org model cleanup
- **006** — Signing secret
- **007** — `007_admin_ui.sql`, `007_email_thread_id.sql` (sessions.email_thread_id for email channel)
- **008** — Knowledge enhancements (title, crawl_config, storage_key, FTS)
- **009** — Organization integrations (Notion, GitHub, Linear, Fern, Slack)
- **010** — Activity log

## Database

Postgres on Neon. Core tables include: `organizations`, `api_keys`, `doc_sources`, `doc_content`, `sessions` (includes `email_thread_id`, `resolved_at`, conversation `turns` / `original_request` JSON), `organization_integrations`, `activity_log`.

## Environment Variables

**Required**

- `ANTHROPIC_API_KEY` — Anthropic API key for Claude
- `DATABASE_URL` — Postgres connection string (Neon)

**Admin UI**

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_API_URL` — Backend API URL (default: `http://localhost:3000`)

**Storage (Railway Buckets / S3-compatible)**

- `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, `REGION` (optional, default `auto`)

**Optional**

- `PORT` — Server port (default: 3000)
- `SESSION_TTL_MS` — Session TTL in ms (default: 1 hour)
- `FIRECRAWL_API_KEY` — URL scraping for knowledge base
- `DOCS_DIR`, `OPENAPI_PATH` — Override paths for `npm run seed` (default: `seed-data/agentmail-docs`)

**Email channel (`/email/:org`)**

- `AGENTMAIL_BASE_URL`, `AGENTMAIL_API_KEY` — Defaults exist for base URL; set API key for outbound AgentMail calls if used

## Authentication

**Agent API:** `/support/:org` and `/ws/:org` require `Authorization: Bearer <api_key>`. API keys use the `clsc_live_` prefix, stored as SHA-256 hashes. Middleware validates the key and org slug.

**Admin UI:** `/admin/*` requires a Clerk JWT. The Next.js app uses `@clerk/nextjs`.

**Upcoming:** Signed URLs — support URL embeds a token so agents do not need a separate API key.

## Admin API Routes

**Analytics**

- `GET /admin/stats` — aggregate session stats
- `GET /admin/stats/timeline?days=30` — daily counts
- `GET /admin/stats/by-org` — per-org breakdown
- `GET /admin/stats/resolution-funnel` — funnel metrics

**Sessions**

- `GET /admin/sessions?status=&org=&q=&limit=&offset=` — filtered list
- `GET /admin/sessions/:id` — detail with `turns`
- `PATCH /admin/sessions/:id` — manual status override
- `GET /admin/sessions/export` — CSV export

**Organizations**

- `GET /admin/orgs` — list orgs
- `POST /admin/orgs` — create org
- `GET /admin/orgs/:slug` — detail
- `PATCH /admin/orgs/:slug` — update name/settings
- `GET /admin/orgs/:slug/stats` — org-scoped session stats
- `POST /admin/orgs/:slug/signing-secret/rotate` — rotate signing secret
- `DELETE /admin/orgs/:slug` — soft delete
- `GET /admin/orgs/:slug/keys` — list API keys
- `POST /admin/orgs/:slug/keys` — create key (plaintext shown once)
- `DELETE /admin/orgs/:slug/keys/:id` — revoke key

**Knowledge base & integrations** — mounted under `/admin` from `knowledge.ts` and `integrations.ts` (org-scoped docs, Notion, etc.).

**Activity**

- `GET /admin/activity?limit=&org_id=` — recent activity feed

## Key Conventions

- Use `.js` extension in all imports (ESM)
- Zod schemas in `src/schemas/` — avoid inline validation in routes
- Domain types in `src/domain/` — no DB or HTTP imports
- Repositories in `src/repositories/` — data access only
- Routes stay thin — validate, call repo/service, respond
- Tests often use `InMemorySessionStore` (no Postgres required for core tests)
- API errors return `{ error: string, code: string }` JSON

## Response Format

`/support/:org` responses are a discriminated union on `status`:

- `resolved` — `diagnosis`, `fix`, `references[]`, `fix_steps[]`
- `needs_info` — `question`, `need_to_clarify[]`, etc.
- `unknown` — `explanation`
- `error` — Coalesce-side failure: `message`, `code` (HTTP 500)

Responses include `session_id` and `turn_number` for multi-turn correlation. Follow-up requests must send `session_id` and `answer` (see `SupportRequestSchema`) so conversation continues on the same session.

## Context Docs

Product and strategy live in `docs/internal/`. See [`docs/internal/INDEX.md`](docs/internal/INDEX.md).

**Product direction** (`product-direction.md`): Support endpoint as data funnel; roadmap through behavioral intelligence and Agent-Led Growth.

**Architecture** (`coalesce-v2-architecture.md`, `coalesce-clarity.md`): Prefer simplicity; avoid unnecessary caching/complexity for early scale.

**Agent behavior** (`agent-behavior-findings.md`): Bare support URLs are easy to ignore; `support_hint` and signed URLs reduce friction.

**Demo** (`coalesce-demo-strategy.md`): Positioning for investors and design partners (e.g. AgentMail).

## Deployment

- **Coalesce API:** Railway at `coalesce-production.up.railway.app`
- **Storage:** Railway Buckets (S3-compatible) for document uploads
- **Admin UI:** TBD (Railway or Vercel)
- **AgentMail integration:** Multiple stacks. Error responses include `support` URL + `support_hint`. Deploy consistently; force clean builds when needed (`rm -rf dist/ temp/` before deploy if your pipeline requires it).

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`.
