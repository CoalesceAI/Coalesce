# Apoyo Design System

**Palette:** Stone + Amber. Warm off-white surfaces in light mode, stone-950 in dark. Brand accent: amber-600 (light) / amber-400 (dark).

## Color Tokens

All colors live in `admin/app/globals.css` as CSS variables. Never hardcode hex values — always use the semantic tokens below.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `bg-background` | stone-50 | stone-950 | Page body |
| `bg-card` | white | stone-900 | Card surfaces |
| `bg-sidebar` | stone-100 | stone-900 | Sidebar |
| `text-foreground` | stone-900 | stone-50 | Primary text |
| `text-muted-foreground` | stone-500 | stone-400 | Secondary/label text |
| `text-primary` | amber-600 | amber-400 | Links, active states, CTAs |
| `border-border` | stone-200 | white/10% | All borders |
| `bg-muted` | stone-100 | stone-800 | Muted backgrounds |
| `bg-accent` | amber-50 | stone-800 | Hover/accent tints |
| `bg-sidebar-accent` | amber-100 | stone-800 | Active nav pill |
| `text-sidebar-accent-foreground` | amber-800 | amber-400 | Active nav text |

## Typography

- Font: Inter (via `next/font/google`, CSS var `--font-sans`)
- Page titles: `text-2xl font-semibold tracking-tight`
- Section headers: `text-sm font-medium text-muted-foreground uppercase tracking-wider`
- Card titles: `text-sm font-medium`
- Body: `text-sm`
- Monospace (IDs, slugs, keys): `font-mono text-xs`
- Stat numbers: `text-3xl font-bold`

## Components

### Cards
Use shadcn `<Card>` with no manual background/border overrides. The CSS vars handle light/dark automatically.

```tsx
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
      Label
    </CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-3xl font-bold">42</p>
    <p className="text-xs text-muted-foreground mt-1">subtitle</p>
  </CardContent>
</Card>
```

### Tables
Remove manual border/color overrides. shadcn `<Table>` uses CSS vars:

```tsx
<TableRow className="hover:bg-transparent">  {/* for headers */}
<TableRow>  {/* for data rows — no extra classes needed */}
<TableHead>  {/* no color override — muted-foreground is automatic */}
<TableCell className="text-muted-foreground">  {/* secondary data */}
```

### Status Badges
Pill-shaped badges with soft colored backgrounds:

```tsx
const STATUS_COLORS = {
  resolved: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25",
  needs_info: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  unknown: "bg-stone-500/15 text-stone-600 dark:text-stone-400 border-stone-500/25",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
};

<span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[status]}`}>
  {status}
</span>
```

### Links
Always use `text-primary hover:underline` for in-app navigation links.

### Sidebar Navigation (active state)
Uses CSS vars: `bg-sidebar-accent text-sidebar-accent-foreground` for active, `text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50` for inactive. Icon uses `text-sidebar-primary` when active.

## Light/Dark Mode

ThemeProvider wraps the app in `admin/app/layout.tsx`. Default theme is `"light"`.

The toggle button is in `admin/components/theme-toggle.tsx` — rendered in the sticky top header of the admin layout.

To add theme awareness in a client component:
```tsx
import { useTheme } from "next-themes";
const { resolvedTheme } = useTheme();
const dark = resolvedTheme === "dark";
```

## Spacing & Radius

- Card/surface radius: `--radius: 0.625rem` (10px) — shadcn components use this automatically
- Page padding: `p-6 md:p-8`
- Section gap: `space-y-8`
- Card grid gap: `gap-4`

## Adding New Pages

1. Page title: `<h1 className="text-2xl font-semibold tracking-tight">Title</h1>`
2. Section headers: `<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">`
3. Cards: no custom bg/border — shadcn defaults work in light + dark
4. Tables: no custom border-zinc overrides
5. Links: `text-primary hover:underline`
6. Muted text: `text-muted-foreground`
7. Empty states: `text-muted-foreground text-sm text-center py-8`
