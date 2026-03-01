# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn dev            # Start dev server (localhost:3000)
yarn build          # Production build
yarn lint           # Run ESLint
yarn format:check   # Check formatting with Prettier
yarn format:fix     # Auto-fix formatting

yarn db:push        # Push Prisma schema to DB (no migration file)
yarn db:migrate     # Create and run a migration
yarn db:generate    # Regenerate Prisma client after schema changes
yarn db:studio      # Open Prisma Studio GUI
yarn db:seed        # Seed database (requires CLERK_SECRET_KEY for Clerk org sync)
```

No test suite is configured. TypeScript checking: `yarn build` or `npx tsc --noEmit`.

## Architecture

**Stack:** Next.js 16 (App Router), TypeScript, Clerk auth, Prisma + PostgreSQL, Tailwind CSS v4, shadcn/ui.

**Package manager:** Yarn 4 (`packageManager: "yarn@4.12.0"`). Use `yarn`, not `npm`.

**Path alias:** `@/*` maps to `src/*`.

### Routing

All authenticated team pages live under the `[team-slug]` dynamic segment:
- `/[team-slug]/dashboard` — main dashboard
- `/[team-slug]/settings` — team settings, members, developers

Public/unauthenticated routes: `/sign-in`, `/sign-up`, `/accept-invitation`, `/create-team`.

### Auth & Middleware

`src/middleware.ts` uses `clerkMiddleware` to protect all routes except those matched by `isPublicRoute`. Internal API calls bypass auth via the `x-internal-api-call: true` header. On auth failure, redirects to `NEXT_PUBLIC_APP_URL/sign-in`.

### Provider Hierarchy

`WorkspaceLayout` (`src/components/layouts/workspace-layout.tsx`) wraps the entire app and conditionally renders providers based on the current path:

```
ClerkProvider
  └── TooltipProvider
        └── (auth pages)  → bare centered layout
            (create-team) → UserProvider → centered layout
            (app pages)   → UserProvider → TeamProvider → children
```

- **`UserProvider`** (`src/app/providers/user-provider.tsx`): fetches the DB user from `/api/user/get-user`. Exposes `useCurrentUser()`.
- **`TeamProvider`** (`src/app/providers/team-provider.tsx`): fetches team data from `/api/team/get-team` via SWR. Handles redirects to `/create-team` if no team exists. Exposes `useTeam()`.

The `[team-slug]` layout (`src/app/[team-slug]/layout.tsx`) adds the sidebar (`AppSidebar`), `Header`, and `KBar` command palette.

### Database

Prisma schema is at `prisma/schema.prisma`. Key models: `User`, `Team`, `TeamUser` (join table with `Role` enum: `SUPER_ADMIN | ADMIN | MEMBER`). `Team` has a unique `slug` and `apiKey`.

The Prisma client uses `@prisma/adapter-pg` (connection pool via `pg`). Singleton instance: `src/lib/prisma.ts`. Generated client outputs to `src/generated/`.

After schema changes, run `yarn db:generate` to update the generated client.

### API Routes

Pattern: `src/app/api/[resource]/[action]/route.ts`. All routes authenticate via `currentUser()` from `@clerk/nextjs/server` and look up the matching `User` by `authId`.

Key routes:
- `POST /api/user/create-user` — Clerk webhook endpoint (public); creates a DB user on `user.created` event; verified with `USER_CREATED_WEBHOOK_SECRET`
- `GET /api/team/get-team` — returns the user's team (by slug or first found)
- `POST /api/team/create-team` — creates a team with a unique slug and generated API key

### UI Components

shadcn/ui components live in `src/components/ui/`. Add new ones with `npx shadcn@latest add <component>`. Custom shared components are in `src/components/` (non-`ui/` subdirectory).

Client state is managed with React Context + SWR (no Redux/Zustand). Use `useTeam()` for team/user display data in team-scoped pages.

## Environment Variables

Required: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`.

For local development with Clerk webhooks, use ngrok and set `NEXT_PUBLIC_APP_URL` to the tunnel URL. See `docs/setup.md` for full setup.

## Git Workflow

### Branch structure
- `main` — shared foundation only: schema changes, dependency updates, gitignore, shared infra (middleware, sidebar, docs). Never dump feature work directly on main.
- `feat/<workstream>` — one branch per logical workstream or plan, branched off main after shared foundation is committed. Example: `feat/plan-1-core-platform`, `feat/plan-2-sdk-ses-workflow`.

### Commit discipline
- Atomic commits per logical unit (one lib file, one API group, one page). Never one giant commit per branch.
- Commit message format: `feat(scope): short description` — e.g. `feat(plan-1): add Slack Events API endpoint`
- Always include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` trailer.
- Stage files explicitly by path (`git add src/lib/slack.ts`), never `git add -A` or `git add .`.
- When schema changes land on main via `db:push`, commit `prisma/schema.prisma` + `yarn.lock`/`package.json` together as one "foundation" commit before branching.

### Worktrees
- Use git worktrees (`EnterWorktree` tool or `git worktree add`) when two workstreams need to be implemented in parallel without branch-switching overhead.
- Each worktree works on its own feature branch; merge/PR back to main independently.

### DB changes
- This repo uses `yarn db:push` (no migration history). Run on main before creating feature branches so both branches share the same schema baseline.
- After any schema change, always run `yarn db:generate` and commit the regenerated client alongside the schema.

## Parallelization

**Always maximize parallel execution:**
- Fire independent tool calls in a single response (reads, searches, writes to non-overlapping files).
- Launch background agents for independent workstreams that write to non-overlapping files — e.g. Plan 1 lib files and Plan 2 SDK files can be written simultaneously.
- Read all needed files upfront in one parallel batch before starting implementation, not one at a time.
- When implementing two plans, do deps install once, then write both plans' files in parallel batches grouped by layer (lib → API → pages).

## Token Efficiency

- Load only the relevant plan file when executing a workstream — do not load PRD + plan together unless bridging product decisions into implementation.
- Use `Read` with `offset`/`limit` for large files; read only the sections needed.
- Prefer `Grep`/`Glob` over full file reads when searching for a specific pattern.
- Reuse already-read file content within a session rather than re-reading.
