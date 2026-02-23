# Engineering Guidelines

Rules for maintaining a best-in-class TypeScript/Next.js codebase.

---

## TypeScript

- **Strict mode always on.** No `// @ts-ignore`, no `any` unless genuinely unavoidable (and then eslint-disable with a comment explaining why).
- **Types live in `src/types/`.** One file per domain (`market.ts`, `team.ts`). Barrel export from `src/types/index.ts`.
- **Prefer interfaces for object shapes, type aliases for unions/intersections.** Interfaces are extendable; types are composable.
- **All API responses are typed.** Every `fetch` call returns a generic type via a typed wrapper (see `src/lib/predexon.ts`).
- **No inline type assertions (`as`).** Use type guards or generic parameters instead.

## Next.js (App Router)

- **`"use client"` only where needed.** Every file that uses hooks, event handlers, or browser APIs gets the directive. Everything else stays as a Server Component.
- **API keys and secrets are server-only.** Never prefix with `NEXT_PUBLIC_`. Access only in API routes and server components.
- **API routes proxy all external calls.** The client never talks to third-party APIs directly. All external data flows through `/api/*` routes.
- **Use route handlers (`route.ts`) for data, page components (`page.tsx`) for UI.** Keep pages thin -- delegate to `_components/` for logic.
- **Metadata goes in `page.tsx`.** Export `metadata` from page files, not from client components.

## React Patterns

- **No `setState` inside `useEffect` bodies.** Defer with `setTimeout(0)` or derive state from props/data.
- **SWR for all client-side data fetching.** Consistent caching, revalidation, and error handling. Configure `refreshInterval` for live data.
- **Custom hooks encapsulate data fetching.** One hook per data domain (e.g., `useMarkets`, `useOrderbook`). Keep components focused on rendering.
- **Memoize context values.** Always wrap context provider values in `useMemo` to prevent unnecessary re-renders.

## Styling (Tailwind + shadcn/ui)

- **Use shadcn/ui components for all UI primitives.** Don't rebuild buttons, dialogs, tables, etc.
- **Tailwind only -- no inline styles, no CSS modules.** Exception: third-party libraries that require inline styles (e.g., lightweight-charts).
- **Use `cn()` from `@/lib/utils` to merge class names.** Never concatenate strings manually.
- **Dark mode via CSS variables.** All colors use the `--` variable system defined in `globals.css`. Never hardcode hex values in components (green/red for buy/sell prices are the exception).

## File Structure

```
src/
  app/
    api/          # Route handlers (server-only)
    [team-slug]/  # Team-scoped pages
      _components/  # Page-specific client components
    providers/    # React context providers
  components/
    ui/           # shadcn/ui primitives (don't edit unless necessary)
    layouts/      # Shared layout components
  hooks/          # Custom React hooks
  lib/            # Server-side utilities and API clients
  types/          # TypeScript type definitions
  constants/      # Static data and configuration
```

## Naming

- **Files:** `kebab-case.tsx` for components, `kebab-case.ts` for utilities.
- **Components:** `PascalCase` named exports. One primary export per file.
- **Hooks:** `use-kebab-case.ts`, exported as `useCamelCase`.
- **Types:** `PascalCase` interfaces and types.
- **API routes:** `route.ts` in descriptive folder paths (`/api/markets/[id]/trades/route.ts`).

## Data Flow

```
Client Component
  -> SWR hook (use-markets.ts)
    -> /api/markets/* (route handler)
      -> src/lib/predexon.ts (typed API client)
        -> Predexon REST API (external)
```

All external API keys stay at the `lib/` layer. Client components never know about upstream providers.

## Error Handling

- **API routes:** Catch `PredexonApiError` and return structured JSON errors with appropriate status codes.
- **Client components:** Use SWR's `error` state. Show inline error banners, not alerts.
- **Never swallow errors.** Always `console.error` in catch blocks for observability.

## Performance

- **ISR caching on API routes.** Use `next: { revalidate: 60 }` in fetch options for data that doesn't need to be real-time.
- **SWR deduplication.** Multiple components requesting the same key share a single request.
- **Lazy load heavy components.** Use `dynamic()` for chart components if bundle size becomes a concern.
