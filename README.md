# Coalesce

Self-healing support infrastructure for B2A companies: agents call a support URL, get structured diagnosis, and continue. This repo is a **small monorepo**: a **Hono** HTTP API server and a **Next.js** admin dashboard.

## Repo layout

| Area | Location | Role |
|------|----------|------|
| **Hono API** | `src/` | HTTP server, routes, Postgres, services. Entry: `src/index.ts` (loaded by `npm run dev`). |
| **Admin UI** | `admin/` | Next.js 14 App Router (`admin/app/`), shadcn/ui (`admin/components/ui/`), shared helpers (`admin/lib/`). |
| **Shared types** | `packages/types/` | Optional workspace package for shared types. |
| **Migrations** | `migrations/` | SQL migrations applied by the API at startup (`npm run migrate` or via `migrate` script). |
| **Tests** | `tests/` | Vitest tests. |
| **Internal docs** | `docs/internal/` | Product and architecture notes (not user-facing). |

### Hono API (where things live)

- **Entry:** `src/index.ts` — wires routes, runs migrations, starts Node server.
- **Routes:** `src/routes/` — e.g. `health.ts`, `support.ts`, `ws.ts`, `admin.ts`, `knowledge.ts`, `integrations.ts`.
- **Data:** `src/repositories/`, `src/db/`.
- **Domain types:** `src/domain/` (no DB/HTTP imports).
- **Services:** `src/services/` — diagnosis, storage (S3/Railway), Notion, Firecrawl, activity, etc.
- **Middleware:** `src/middleware/` — org API key auth, Clerk JWT for admin.

### Next.js admin (where things live)

- **App routes:** `admin/app/` — `(admin)/` group holds dashboard, sessions, settings, knowledge.
- **UI & charts:** `admin/components/` — sidebar, charts, forms, `lib/api.ts` (`adminFetch` to Hono).
- **Config:** `admin/next.config.mjs`, `admin/tailwind.config.ts`, `admin/tsconfig.json`.

**Development ports:** Run the API and admin on **different** ports. The API defaults to **3000** (`PORT`). Start Next on another port, e.g. `cd admin && npx next dev -p 3001`, and set `NEXT_PUBLIC_API_URL=http://localhost:3000` in `admin/.env.local`.

---

## Environment files

| File | Used by | Gitignored |
|------|---------|------------|
| **`.env`** (repo root) | Hono API (`npm run dev`, `npm start`) | Yes — copy from `.env.example` |
| **`admin/.env.local`** | Next.js admin only (`cd admin && npm run dev`) | Yes — copy from `admin/.env.local.example` |

`dotenv` loads the **root** `.env` for the API. Next.js loads **`admin/.env.local`** automatically (and does not read the root `.env` unless you configure it).

### Root `.env` — Hono API

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres (e.g. Neon) connection string |
| `ANTHROPIC_API_KEY` | Yes | Claude / diagnosis |
| `CLERK_SECRET_KEY` | Yes for admin routes | Same secret as Clerk dashboard; verifies JWTs on `/admin/*` |
| `PORT` | No | API listen port (default `3000`) |
| `SESSION_TTL_MS` | No | Session store TTL (default 1 hour) |
| `FIRECRAWL_API_KEY` | No | URL scraping for knowledge base |
| **Railway Buckets (S3)** | No* | `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, `REGION` — file uploads / presigned URLs |
| `AGENTMAIL_*` | No | Email channel / webhooks (see `src/index.ts` / `channels/email`) |

\*Required if you use presigned uploads to the bucket.

### `admin/.env.local` — Next.js admin

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk browser / SSR |
| `CLERK_SECRET_KEY` | Yes | Clerk server-side (must match the same Clerk application as the API) |
| `NEXT_PUBLIC_API_URL` | No** | **Full URL of the Hono API** (e.g. `http://localhost:3000`). If unset, defaults to `http://localhost:3000`. **Do not leave empty** — empty string breaks `adminFetch` and requests hit Next.js instead of the API. |

**Must be the origin only** (no trailing slash): `http://localhost:3000`, not the Next dev URL.

Optional / legacy:

- `BLOB_READ_WRITE_TOKEN` — only if you still use Vercel Blob anywhere; primary storage is Railway Buckets via the API.

### Same Clerk app

Use **one** Clerk application. The **same** `CLERK_SECRET_KEY` (and matching publishable key) should appear in:

- Root `.env` (API verifies admin JWTs)
- `admin/.env.local` (Next.js Clerk)

---

## Commands

```bash
# API (from repo root)
npm install
cp .env.example .env   # then fill DATABASE_URL, ANTHROPIC_API_KEY, CLERK_SECRET_KEY, …
npm run dev              # http://localhost:3000 (or PORT)

# Admin UI (separate terminal)
cd admin && npm install
cp .env.local.example .env.local
npm run dev -- -p 3001   # avoid clashing with API on 3000
```

See **`CLAUDE.md`** for detailed API conventions, route list, and deployment notes.
