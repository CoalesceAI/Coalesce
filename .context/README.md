# Apoyo — project context

Short onboarding reference. Authoritative commands and conventions: root **`CLAUDE.md`**.

## What it is

Multi-tenant **API support backend**: clients send error context to **`POST /support/:org`** (or **`GET /ws/:org`**) and get a **structured diagnosis** from Claude, grounded in **per-org docs** in Postgres.

## Stack

Node ≥ 22, ESM, Hono, Zod, Anthropic SDK, Postgres (`pg`), Vitest, `tsup` build. Imports use **`.js`** extensions.

## Main surface area

| Piece | Purpose |
|--------|--------|
| `POST /support/:org` | Multi-turn diagnosis; query + body merge; `session_id` for follow-ups |
| `GET /ws/:org` | Same flow over WebSocket |
| `GET /health` | Health check |
| `POST /email/:org` | AgentMail webhook → diagnosis → reply |
| Auth | `Authorization: Bearer <api_key>` or signed URL `?token=&expires=` |

## Layout

`src/domain` (pure types) → `src/repositories` (SQL) → `src/routes` + `src/services` (diagnosis). `migrations/` for schema. `demo/` for Claude Code demos. **`seed-data/agentmail-docs/`** — minimal bundled docs so **`npm run seed`** works without a sibling AgentMail docs checkout; override with **`DOCS_DIR`** / **`OPENAPI_PATH`**.

## Env

`DATABASE_URL`, `ANTHROPIC_API_KEY` required. See **`CLAUDE.md`** for optional vars (`PORT`, `SESSION_TTL_MS`, WebSocket tuning, AgentMail email).

## Commands

```bash
npm run dev | build | start | typecheck | test | migrate | seed | generate-url
```

## For deeper context

Product thinking, architecture rationale, agent behavior findings, and demo strategy live in **[`docs/internal/`](../docs/internal/INDEX.md)**. Start with `INDEX.md`.
