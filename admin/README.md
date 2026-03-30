# Apoyo Admin UI

Next.js 14 admin dashboard for managing Apoyo organizations, knowledge bases, sessions, and integrations.

Monorepo context: the **Hono API** lives in the repo root (`src/`). See the **[root README](../README.md)** for full layout and **root `.env`** variables.

## Setup

```bash
cd admin
npm install
cp .env.local.example .env.local   # fill Clerk keys + API URL (see below)
npm run dev -- -p 3001               # use 3001 so the API can own 3000
```

Open `http://localhost:3001`. Ensure the API is running at `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`).

## Environment (`admin/.env.local`)

Next.js reads **`admin/.env.local`** only (not the repo root `.env`). Copy from **`admin/.env.local.example`**.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (`pk_...`) for the browser |
| `CLERK_SECRET_KEY` | Yes | Clerk secret (`sk_...`) — **must match** the same Clerk app as the API’s `CLERK_SECRET_KEY` in the root `.env` |
| `NEXT_PUBLIC_API_URL` | Recommended | Hono API origin, e.g. `http://localhost:3000`. If omitted, code defaults to `http://localhost:3000`. **Never leave this as an empty string** — that sends `/admin/*` requests to Next.js and returns 404 HTML. |

Optional / legacy:

| Variable | Description |
|----------|-------------|
| `BLOB_READ_WRITE_TOKEN` | Only if you still use Vercel Blob; primary uploads use Railway Buckets via the API |

## Stack

- **Framework:** Next.js 14 (App Router, React Server Components)
- **Auth:** Clerk (`@clerk/nextjs`)
- **UI:** shadcn/ui + Tailwind CSS (zinc-based dark theme)
- **Charts:** Recharts
- **Toasts:** Sonner

## Pages

| Path | Description |
|------|-------------|
| `/dashboard` | Analytics: stat cards, timeline chart, outcome donut, org breakdown |
| `/sessions` | Filterable session list with pagination + CSV export |
| `/sessions/:id` | Session detail with conversation timeline |
| `/settings` | Organization list + create form |
| `/settings/:slug` | Org detail: Overview, API Keys, Settings, Integrate tabs |
| `/knowledge` | Org picker for knowledge base |
| `/knowledge/:slug` | Doc sources table, URL/file upload, Notion integration |

## Architecture

- Server Components fetch data via `adminFetch()` in `lib/api.ts` (calls Hono with Clerk JWT; base URL from `lib/api-base.ts`)
- Client Components handle interactions (forms, dialogs, filters)
- `components/ui/` contains shadcn/ui primitives (do not edit directly)
- `components/charts/` contains Recharts-based visualization components
