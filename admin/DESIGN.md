# Apoyo Admin — Design System

The admin UI is the **control plane** for Apoyo. It is not the agent-facing support path. Design goals: clarity, density, and polish — inspired by Linear, Cursor, and Resend.

## Stack

- Next.js 14 (App Router, React Server Components)
- Tailwind CSS with CSS-variable design tokens (`globals.css`)
- shadcn/ui **base-nova** style (`components.json`, `tailwind.baseColor`: **taupe**)
- Lucide icons
- Recharts for data visualization
- Sonner for toasts

## Tokens

All colors are defined as CSS custom properties in `app/globals.css` and mapped via `tailwind.config.ts`. Light and dark modes are token-paired.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | taupe-50 | taupe-950 | Page background |
| `--foreground` | taupe-950 | taupe-50 | Primary text |
| `--card` | white | taupe-900 | Card / panel surfaces |
| `--muted` | taupe-100 | taupe-800 | Subtle backgrounds, table headers |
| `--muted-foreground` | taupe-500 | taupe-400 | Secondary text, labels |
| `--border` | taupe-200 | white/10% | Hairline dividers |
| `--primary` | taupe-900 | taupe-100 | Buttons, links, active indicators |
| `--accent` | taupe-100 | taupe-800 | Hover / selected surfaces |
| `--destructive` | red (oklch) | red (oklch) | Delete, revoke actions |
| `--sidebar-*` | taupe-100 | taupe-900 | Navigation sidebar |
| `--chart-1..5` | taupe + green | taupe + green | Recharts series |

Semantic tokens follow [shadcn theming](https://ui.shadcn.com/docs/theming); base grays use the **taupe** scale from Tailwind (OKLCH in `globals.css`).

## Patterns

### Surfaces, not borders

Prefer background separation (`bg-card` vs `bg-background`, `bg-muted/50`) over stacking borders. Use `border-border` only where structural clarity requires it: table rows, inputs, sidebar edge.

### Cards

Use the shadcn `Card` component. Do **not** override its background or border inline — the base-nova card uses token `border` + `shadow-xs`. Stack cards on `bg-background`; they contrast via `bg-card`.

### Buttons

Use shadcn `Button` variants:
- `default` — primary actions (amber)
- `outline` — secondary actions
- `ghost` — inline/toolbar actions
- `destructive` — delete/revoke

Do not use `className` to set custom background/text on buttons unless creating a one-off semantic variant.

### Status badges

Use the shadcn `Badge` component with semantic variants:

| Status | Variant |
|--------|---------|
| resolved | `default` (primary) or green-tinted `secondary` |
| needs_info | amber-tinted outline |
| unknown | `secondary` |
| active | blue-tinted outline |

Centralize status-to-badge mapping in a shared helper rather than inline `Record<string, string>` per page.

### Typography

- Page title: `text-2xl font-semibold tracking-tight`
- Section label: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
- Body: default `text-sm text-foreground`
- Mono: `font-mono text-xs` for IDs, keys, code

### Empty states

Use a centered `Card` with `CardDescription` or a small `EmptyState` component. Include an action button when applicable.

## Do / Don't

**Do:**
- Use semantic Tailwind classes: `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`
- Use shadcn primitives (`Card`, `Button`, `Badge`, `Table`, `Dialog`, etc.)
- Let dark mode work via tokens — avoid hardcoded hex or `zinc-*` / `slate-*`
- Use `--chart-*` CSS variables for Recharts colors

**Don't:**
- Use raw color scales (`zinc-900`, `slate-200`, `#22c55e`) for app chrome
- Stack `border` + `ring` on the same surface
- Override shadcn component backgrounds inline (e.g. `className="bg-zinc-900"`)
- Duplicate primitives — always check existing `components/ui/` first

## Adding components

Before adding or customizing shadcn components, use **find-skills** for `shadcn` (or the shadcn skill from the project skills list) to look up registry names, base-nova patterns, and CLI flags. Then install via:

```bash
cd admin && npx shadcn@latest add <component> --yes
```

Do not hand-roll components that exist in the shadcn registry.
