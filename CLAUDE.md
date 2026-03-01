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
