# UI System

The design system is split into two layers: `src/global.css` + `tailwind.config.js` (tokens / values) and `src/components/` (components). Nothing outside these two files and folders defines colors, spacing, or type sizes.

## Design tokens — `src/global.css` + `tailwind.config.js`

Tokens are CSS variables defined in `src/global.css` and consumed via `tailwind.config.js`. The light theme is on `:root`; the dark theme is on `.dark` (applied by the root `View` in `app/_layout.tsx` when `useColorScheme()` returns `'dark'`).

### Adding or changing tokens

- **New color:** add a CSS variable to both `:root` and `.dark` in `src/global.css`, then add the Tailwind color entry to `theme.extend.colors` in `tailwind.config.js`.
- **Light theme:** edit `:root` values in `src/global.css`.
- **Dark theme:** edit `.dark` values in `src/global.css`.

### Semantic color token table

| CSS variable | Tailwind class | Dark value (HSL) | Light value (HSL) |
|---|---|---|---|
| `--background` | `bg-background` / `text-background` | `222 47% 11%` | `0 0% 100%` |
| `--foreground` | `text-foreground` | `210 40% 96%` | `222 47% 11%` |
| `--card` | `bg-card` | `217 33% 17%` | `0 0% 100%` |
| `--muted` | `bg-muted` | `215 25% 27%` | `210 40% 96%` |
| `--muted-foreground` | `text-muted-foreground` | `215 20% 65%` | `215 16% 47%` |
| `--border` | `border-border` | `215 25% 27%` | `214 32% 91%` |
| `--primary` | `bg-primary` / `text-primary` | `239 84% 67%` | `239 84% 67%` |
| `--primary-foreground` | `text-primary-foreground` | `210 40% 96%` | `0 0% 100%` |
| `--destructive` | `bg-destructive` / `text-destructive` | `0 84% 60%` | `0 84% 60%` |
| `--success` | `text-success` / `bg-success` | `142 71% 45%` | `142 71% 45%` |
| `--warning` | `text-warning` | `38 92% 50%` | `38 92% 50%` |
| `--user-bubble` | `bg-user-bubble` | `239 84% 67%` | `239 84% 67%` |
| `--assistant-bubble` | `bg-assistant-bubble` | `217 33% 17%` | `210 40% 96%` |

**Subtle variants** (e.g. `$primarySubtle` in the old Tamagui theme): express via Tailwind opacity modifier — `bg-primary/[0.13]`, `bg-success/[0.15]`, `bg-warning/[0.15]`, `bg-destructive/[0.15]`.

Reference tokens as Tailwind classes in `className`, e.g. `bg-primary`, `text-muted-foreground`, `border-border`. Never use raw hex values.

### Typography scale

Configured as named `fontSize` keys in `tailwind.config.js`:

| Class | Size / Line-height |
|---|---|
| `text-xs` | 12px / 16px |
| `text-sm` | 13px / 18px |
| `text-md` | 15px / 22px |
| `text-lg` | 16px / 24px |
| `text-xl` | 18px / 27px |
| `text-h2` | 26px / 32px |
| `text-h1` | 32px / 38px |

Use `AppText` / `Heading` components (which apply these classes) rather than inline `fontSize` style props in screens.

### Spacing / border radius

- Spacing: Tailwind's default 4px-per-unit scale (`gap-3` = 12px, `p-4` = 16px, etc.).
- Border radius: `rounded-sm` (8px), `rounded-md` (12px), `rounded-lg` (16px), `rounded-full` (9999px) — configured in `tailwind.config.js`.

## React Native Reusables — `src/components/ui/`

Low-level, accessible, unstyled primitives copied from the React Native Reusables catalog and owned in-repo. No upstream version to track; modify them freely.

| File | Primitive |
|---|---|
| `text.tsx` | `Text` with typography-scale variants |
| `button.tsx` | `Button` (primary / secondary / ghost / destructive / outline / link) |
| `input.tsx` | `Input` (text field) |
| `card.tsx` | `Card`, `CardHeader`, `CardContent`, `CardFooter` |
| `separator.tsx` | `Separator` (horizontal / vertical divider) |

Import from `@/components/ui/<name>` directly, or re-export via `@/components/index.ts`.

## src/components/

```
components/
├── ui/                     # React Native Reusables copy-paste primitives (see above)
├── typography/
│   ├── AppText.tsx         # Variant text: body | muted | caption | label | error
│   └── Heading.tsx         # Semantic headings: h1 | h2
├── interactive/
│   ├── Button.tsx          # Primary/secondary/ghost, size sm|md|lg
│   ├── IconButton.tsx      # Icon-only pressable
│   ├── Input.tsx           # Compound: label + Input + error/helper text
│   └── Chip.tsx            # Selectable tag
├── display/
│   ├── Card.tsx            # Pressable surface: default | elevated | ghost
│   ├── Badge.tsx           # Status label: default | success | warning | danger
│   ├── ProgressBar.tsx     # Animated horizontal fill bar (0–1 value)
│   ├── ChatBubble.tsx      # User / assistant message bubble; renders inline markdown + timestamp
│   ├── EmptyState.tsx      # Centred empty-list state; optional icon + CTA action
│   ├── PositionBadge.tsx   # Numbered module step indicator
│   ├── Skeleton.tsx        # SkeletonLine (text row) and SkeletonCard (card placeholder)
│   ├── Toast.tsx           # Animated success/error/info notification pill
│   └── ToastProvider.tsx   # Overlay renderer for active toasts (place in root layout)
├── layout/
│   ├── Screen.tsx          # Safe-area scroll container
│   └── ErrorBoundary.tsx   # React class error boundary with retry fallback
└── index.ts                # Barrel: all components re-exported from one path
```

Import everything from `@/components`.

## Adding something new

- **New color token:** add CSS variables to both `:root` and `.dark` in `src/global.css`; add the Tailwind color entry to `tailwind.config.js`.
- **New component:** add to the appropriate sub-folder, export from `index.ts`, add a row to the table above.
- **New RNR primitive:** copy the component from the RNR catalog into `src/components/ui/`, adjust imports from `~/` to `@/`.
