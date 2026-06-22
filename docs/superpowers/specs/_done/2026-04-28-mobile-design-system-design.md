# Mobile Design System — Spec

**Date:** 2026-04-28
**Scope:** `apps/mobile`
**Goal:** Production-ready, modular UI layer with a single source of truth for all visual values. Full migration of all existing screens to Tamagui.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Library | Tamagui | Full token system, typed theme, animations, component primitives in one package |
| Fonts | System fonts | Zero load time, native feel per platform (`-apple-system` / Roboto) |
| Migration | Full | App is small (7 screens); half-migrated codebases drift |
| Architecture | Layered (`src/design/` + `src/components/`) | Clean separation between primitive values, semantic tokens, and UI components |

---

## Folder Structure

```
apps/mobile/src/
├── design/
│   ├── README.md
│   ├── tokens.ts       ← primitive values
│   ├── themes.ts       ← semantic tokens
│   ├── typography.ts   ← font + type scale
│   └── config.ts       ← Tamagui assembly
│
├── components/
│   ├── README.md
│   ├── layout/
│   │   └── Screen.tsx
│   ├── typography/
│   │   ├── Heading.tsx
│   │   └── AppText.tsx
│   ├── interactive/
│   │   ├── Button.tsx
│   │   ├── IconButton.tsx
│   │   ├── Input.tsx
│   │   └── Chip.tsx
│   ├── display/
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── PositionBadge.tsx
│   │   ├── ChatBubble.tsx
│   │   └── EmptyState.tsx
│   └── index.ts        ← barrel export
│
├── api/       (unchanged)
├── hooks/     (unchanged)
└── stores/    (unchanged)
```

`constants/colors.ts` is **deleted** — all values migrate to `design/tokens.ts`.

---

## Token Layer

### tokens.ts — primitive values

Raw scales with no semantic meaning. Every value the app can ever use.

```ts
color: {
  slate50:   '#f8fafc',  slate100: '#f1f5f9',
  slate400:  '#94a3b8',  slate500: '#64748b',
  slate600:  '#475569',  slate700: '#334155',
  slate800:  '#1e293b',  slate900: '#0f172a',
  indigo400: '#818cf8',  indigo500: '#6366f1',
  green500:  '#22c55e',  amber500:  '#f59e0b',
  red500:    '#ef4444',
}

space:  { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 }
radius: { sm:8, md:12, lg:16, full:9999 }
size:   { sm:24, md:32, lg:40, xl:56 }
```

### themes.ts — semantic tokens

Maps primitive values to intent. Screens and components reference these names only — never raw hex.

```ts
dark: {
  // Backgrounds
  bg:           slate900,   // page/screen background
  surface:      slate800,   // cards, inputs, sheets
  surfaceHover: slate700,   // hover/pressed surface state
  overlay:      slate900,   // modals, bottom sheets

  // Text
  text:         slate100,   // primary readable text
  textMuted:    slate400,   // secondary/description text

  // Structure
  border:       slate700,

  // Brand
  primary:      indigo500,  // CTAs, active states
  primaryHover: indigo400,  // pressed/hover on primary

  // Status
  success:      green500,
  warning:      amber500,
  danger:        red500,

  // Chat
  userBubble:      indigo500,
  assistantBubble: slate800,
}
```

Adding a light theme = add one new object to `themes.ts`. Zero screen changes required.

### typography.ts — type scale

```ts
family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

size: {
  h1: 32,  // screen titles
  h2: 26,  // section headings
  xl: 18,  // large body / intros
  lg: 16,  // default body
  md: 15,  // compact body
  sm: 13,  // captions, hints
  xs: 12,  // labels, badges
}

weight: { regular: '400', semibold: '600', bold: '700' }
lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.7 }
```

### config.ts

Single call to `createTamagui`. Exported and consumed only by `TamaguiProvider` in `app/_layout.tsx`. Nothing else calls `createTamagui`.

---

## Component Layer

All components are built on Tamagui primitives (`XStack`, `YStack`, `Text`, etc.). No `StyleSheet.create` in any component or screen after migration.

Screens import exclusively from the barrel using a path alias: `import { Card, AppText, Button } from '@/components'`

The `@/` alias maps to `src/` and must be configured in `tsconfig.json` and `babel.config.js`. This avoids relative path fragility in deeply nested screens.

### layout/Screen

SafeAreaView + optional ScrollView wrapper. All screens use it to avoid repeating safe-area boilerplate.

```tsx
<Screen scroll padding>...</Screen>
```

### typography/Heading

Structural headings only — not for inline emphasis.

```tsx
<Heading size="h1">What do you want to learn?</Heading>
<Heading size="h2">My Courses</Heading>
```

### typography/AppText

All non-heading text. `variant` is the primary API — sets semantic defaults for color, size, and weight. `size` and `weight` override when needed.

| Variant | Size | Weight | Color |
|---|---|---|---|
| `body` | md | regular | text |
| `muted` | md | regular | textMuted |
| `caption` | sm | regular | textMuted |
| `label` | xs | semibold | textMuted (uppercase) |
| `error` | sm | regular | danger |

```tsx
<AppText variant="body">Description</AppText>
<AppText variant="muted" size="lg">Secondary</AppText>
<AppText variant="label">DIFFICULTY</AppText>
<AppText variant="error">{errors.email}</AppText>
```

### interactive/Button

```tsx
// variant: primary | danger | ghost
// size:    sm | md | lg
<Button variant="primary" size="lg" loading={isPending}>Start Learning</Button>
<Button variant="danger"  size="lg">Sign Out</Button>
<Button variant="ghost"   size="sm">Cancel</Button>
```

- `loading` shows a spinner and disables the button
- `size="lg"` is full-width for CTA use

### interactive/IconButton

Circular icon-only button. Used for the chat send action.

```tsx
<IconButton icon={<ArrowUp />} variant="primary" size="md" />
```

### interactive/Input

Compound component — label, field, and feedback text are colocated.

```tsx
<Input label="Email" keyboardType="email-address" error={errors.email} />
<Input label="Password" secureTextEntry helper="At least 8 characters" />
<Input multiline maxLength={4000} />  // chat — no label
```

- Border turns `danger` color when `error` is set
- `label`, `error`, `helper` are all optional

### interactive/Chip

Single-select toggle chip. Used for the difficulty picker.

```tsx
<Chip label="Beginner" selected={difficulty === 'beginner'} onPress={() => setDifficulty('beginner')} />
```

### display/Card

Surface container.

```tsx
// variant: default | elevated | ghost
// onPress makes it pressable; disabled reduces opacity to 0.45
<Card variant="default" onPress={() => router.push(...)}>...</Card>
<Card variant="default" disabled={isLocked}>...</Card>
<Card variant="elevated">...</Card>
```

### display/Badge

Small status pill.

```tsx
// variant: default | success | warning | danger
<Badge label="beginner" />
<Badge label="Completed" variant="success" />
```

### display/ProgressBar

```tsx
<ProgressBar value={0.6} label="3/5 modules" />
```

### display/PositionBadge

Circular step indicator used in module lists.

```tsx
<PositionBadge position={1} completed={false} />
<PositionBadge position={2} completed />
```

### display/ChatBubble

```tsx
<ChatBubble message={msg} isStreaming={false} />
```

Renders streaming cursor (`▋`) while `isStreaming` is true.

### display/EmptyState

```tsx
<EmptyState message="No courses yet. Start learning something!" />
```

---

## READMEs

### design/README.md

Explains the dependency chain (`tokens → themes → typography → config`), the rule that every new color starts in `tokens.ts`, and that `constants/colors.ts` is deleted.

### components/README.md

Explains each component: what it renders, and *why it exists as a separate component* rather than being inline in screens. Organized by folder.

---

## Migration Checklist

All 7 screens are fully migrated. No screen retains `StyleSheet.create` or imports from `constants/colors.ts`.

| Screen | Key changes |
|---|---|
| `app/_layout.tsx` | Add `TamaguiProvider` with config; move Supabase client to `src/lib/supabase.ts` (shared singleton) |
| `(auth)/sign-in.tsx` | Replace `StyleSheet` with Tamagui; use `Input`, `Button`, `Heading`, `AppText`, `Screen` |
| `(app)/index.tsx` | Replace with `Screen`, `Heading`, `Input`, `Chip` row, `Button`, `AppText` |
| `(app)/profile.tsx` | Replace with `Screen`, `Card` (elevated), `AppText`, `Button` (danger) |
| `(app)/courses/index.tsx` | Replace with `Screen`, `FlatList` + `Card`, `Heading`, `Badge`, `AppText`, `EmptyState` |
| `(app)/courses/[id]/index.tsx` | Replace with `Screen`, `Heading`, `AppText`, `ProgressBar`, `Card` + `PositionBadge` + `Badge` |
| `(app)/courses/[id]/modules/[moduleId]/chat.tsx` | Replace with `Screen`, `FlatList` + `ChatBubble`, `Input`, `IconButton` |

---

## Out of Scope

- Light theme (foundation supports it — add to `themes.ts` when needed)
- Web app / `packages/ui` shared package (premature with one app)
- Navigation changes
- API / state management changes
