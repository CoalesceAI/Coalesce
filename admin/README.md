# Coalesce Admin UI

Next.js 14 admin dashboard for managing Coalesce organizations, knowledge bases, sessions, and integrations.

## Setup

```bash
npm install
cp .env.local.example .env.local  # Configure Clerk + API URL
npm run dev                        # http://localhost:3001
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_API_URL` | Hono backend URL (default: `http://localhost:3000`) |

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

- Server Components fetch data via `adminFetch()` (calls Hono backend with Clerk JWT)
- Client Components handle interactions (forms, dialogs, filters)
- `components/ui/` contains shadcn/ui primitives (do not edit directly)
- `components/charts/` contains Recharts-based visualization components
