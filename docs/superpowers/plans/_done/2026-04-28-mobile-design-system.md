# Mobile Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all inline `StyleSheet.create` and raw `colors.ts` with a Tamagui-powered design system — token layer, semantic theme, named typography scale, 13 shared components — and fully migrate all 7 screens.

**Architecture:** Layered `src/design/` (tokens → themes → typography → config) feeds a `src/components/` library (layout / typography / interactive / display). Screens import only from `@/components` via a barrel. Zero `StyleSheet.create` anywhere after migration.

**Tech Stack:** Expo 52, React Native 0.76, Tamagui 2.0.0-rc.41 (RC — React 18 works despite `react>=19` peer dep warning), `@tamagui/animations-react-native`, `@tamagui/babel-plugin`, system fonts, TypeScript strict.

**Verification note:** The mobile app has no test runner. Each task verifies correctness with `pnpm --filter @autodidact/mobile typecheck` (runs `tsc --noEmit`). This is the TDD loop for a UI-only migration.

---

## File Map

**Created:**
- `apps/mobile/src/design/tokens.ts`
- `apps/mobile/src/design/themes.ts`
- `apps/mobile/src/design/typography.ts`
- `apps/mobile/src/design/config.ts`
- `apps/mobile/src/design/README.md`
- `apps/mobile/src/lib/supabase.ts`
- `apps/mobile/src/components/layout/Screen.tsx`
- `apps/mobile/src/components/typography/AppText.tsx`
- `apps/mobile/src/components/typography/Heading.tsx`
- `apps/mobile/src/components/interactive/Button.tsx`
- `apps/mobile/src/components/interactive/IconButton.tsx`
- `apps/mobile/src/components/interactive/Input.tsx`
- `apps/mobile/src/components/interactive/Chip.tsx`
- `apps/mobile/src/components/display/Card.tsx`
- `apps/mobile/src/components/display/Badge.tsx`
- `apps/mobile/src/components/display/ProgressBar.tsx`
- `apps/mobile/src/components/display/PositionBadge.tsx`
- `apps/mobile/src/components/display/ChatBubble.tsx`
- `apps/mobile/src/components/display/EmptyState.tsx`
- `apps/mobile/src/components/index.ts`
- `apps/mobile/src/components/README.md`

**Modified:**
- `apps/mobile/babel.config.js` — add `@tamagui/babel-plugin`
- `apps/mobile/tsconfig.json` — add `@/` path alias
- `apps/mobile/package.json` — add Tamagui deps
- `apps/mobile/app/_layout.tsx` — add `TamaguiProvider`, import shared Supabase
- `apps/mobile/app/(auth)/sign-in.tsx` — full migration
- `apps/mobile/app/(app)/index.tsx` — full migration
- `apps/mobile/app/(app)/profile.tsx` — full migration
- `apps/mobile/app/(app)/courses/index.tsx` — full migration
- `apps/mobile/app/(app)/courses/[id]/index.tsx` — full migration
- `apps/mobile/app/(app)/courses/[id]/modules/[moduleId]/chat.tsx` — full migration

**Deleted:**
- `apps/mobile/src/constants/colors.ts`

---

## Task 1: Install Tamagui and configure Babel

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/babel.config.js`

- [ ] **Step 1: Install Tamagui packages**

Run from the repo root:
```bash
pnpm --filter @autodidact/mobile add tamagui @tamagui/animations-react-native
pnpm --filter @autodidact/mobile add -D @tamagui/babel-plugin
```

Expected: packages added to `apps/mobile/package.json`, lockfile updated.

- [ ] **Step 2: Add Tamagui babel plugin to `apps/mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/design/config.ts',
          logTimings: true,
          disableExtraction: process.env.NODE_ENV === 'development',
        },
      ],
    ],
  };
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/babel.config.js apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(mobile): install tamagui and configure babel plugin"
```

---

## Task 2: Configure `@/` path alias

**Files:**
- Modify: `apps/mobile/tsconfig.json`

- [ ] **Step 1: Add path alias to tsconfig**

Replace the entire file:
```json
{
  "extends": "@autodidact/config/tsconfig.react-native.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

Expo 52's Metro bundler picks up `tsconfig.json` paths automatically — no extra babel plugin needed.

- [ ] **Step 2: Verify typecheck passes (project is still clean at this point)**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/tsconfig.json
git commit -m "chore(mobile): add @/ path alias for src/"
```

---

## Task 3: Create `src/design/tokens.ts`

**Files:**
- Create: `apps/mobile/src/design/tokens.ts`

- [ ] **Step 1: Create the file**

```ts
import { createTokens } from '@tamagui/core';

export const tokens = createTokens({
  color: {
    slate50:       '#f8fafc',
    slate100:      '#f1f5f9',
    slate400:      '#94a3b8',
    slate500:      '#64748b',
    slate600:      '#475569',
    slate700:      '#334155',
    slate800:      '#1e293b',
    slate900:      '#0f172a',
    indigo400:     '#818cf8',
    indigo500:     '#6366f1',
    indigo500a13:  'rgba(99, 102, 241, 0.13)',
    green500:      '#22c55e',
    green500a15:   'rgba(34, 197, 94, 0.15)',
    amber500:      '#f59e0b',
    amber500a15:   'rgba(245, 158, 11, 0.15)',
    red500:        '#ef4444',
    red500a15:     'rgba(239, 68, 68, 0.15)',
    transparent:   'rgba(0,0,0,0)',
  },
  space: {
    0.5: 2,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
  },
  size: {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 56,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 9999,
  },
  zIndex: {
    1: 100,
    2: 200,
    3: 300,
  },
});
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/design/tokens.ts
git commit -m "feat(mobile): add design tokens (primitive values)"
```

---

## Task 4: Create `src/design/themes.ts`

**Files:**
- Create: `apps/mobile/src/design/themes.ts`

- [ ] **Step 1: Create the file**

```ts
import { tokens } from './tokens';

export const dark = {
  // Backgrounds
  bg:              tokens.color.slate900,
  surface:         tokens.color.slate800,
  surfaceHover:    tokens.color.slate700,
  overlay:         tokens.color.slate900,

  // Text
  text:            tokens.color.slate100,
  textMuted:       tokens.color.slate400,

  // Structure
  border:          tokens.color.slate700,

  // Brand
  primary:         tokens.color.indigo500,
  primaryHover:    tokens.color.indigo400,
  primarySubtle:   tokens.color.indigo500a13,

  // Status
  success:         tokens.color.green500,
  successSubtle:   tokens.color.green500a15,
  warning:         tokens.color.amber500,
  warningSubtle:   tokens.color.amber500a15,
  danger:          tokens.color.red500,
  dangerSubtle:    tokens.color.red500a15,

  // Chat
  userBubble:      tokens.color.indigo500,
  assistantBubble: tokens.color.slate800,
};
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/design/themes.ts
git commit -m "feat(mobile): add dark theme semantic tokens"
```

---

## Task 5: Create `src/design/typography.ts`

**Files:**
- Create: `apps/mobile/src/design/typography.ts`

- [ ] **Step 1: Create the file**

```ts
import { createFont } from '@tamagui/core';

// Numeric keys map to Tamagui's internal $1–$7 font size scale.
// Our named scale (xs–h1) maps to these keys via the typescale export.
export const systemFont = createFont({
  family:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica Neue, sans-serif',
  size: {
    1: 12, // xs
    2: 13, // sm
    3: 15, // md
    4: 16, // lg
    5: 18, // xl
    6: 26, // h2
    7: 32, // h1
  },
  lineHeight: {
    1: 16,
    2: 18,
    3: 22,
    4: 24,
    5: 27,
    6: 32,
    7: 38,
  },
  weight: {
    1: '400',
    2: '600',
    3: '700',
  },
  letterSpacing: {
    1: 0,
  },
});

// Named scale — used in AppText and Heading variants to avoid exposing $1/$7 to screens.
export const typescale = {
  size: {
    xs: 1,
    sm: 2,
    md: 3,
    lg: 4,
    xl: 5,
    h2: 6,
    h1: 7,
  },
  weight: {
    regular:  '400',
    semibold: '600',
    bold:     '700',
  },
} as const;
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/design/typography.ts
git commit -m "feat(mobile): add system font and named typography scale"
```

---

## Task 6: Create `src/design/config.ts` and `src/design/README.md`

**Files:**
- Create: `apps/mobile/src/design/config.ts`
- Create: `apps/mobile/src/design/README.md`

- [ ] **Step 1: Create `config.ts`**

```ts
import { createTamagui } from '@tamagui/core';
import { createAnimations } from '@tamagui/animations-react-native';
import { tokens } from './tokens';
import { dark } from './themes';
import { systemFont } from './typography';

const animations = createAnimations({
  fast:   { damping: 20, mass: 1.2, stiffness: 250, type: 'spring' },
  medium: { damping: 15, stiffness: 120, type: 'spring' },
  slow:   { damping: 20, stiffness: 60, type: 'spring' },
});

const config = createTamagui({
  animations,
  tokens,
  themes: { dark },
  fonts: {
    body:    systemFont,
    heading: systemFont,
  },
  defaultFont: 'body',
  shorthands: {
    p:  'padding',
    px: 'paddingHorizontal',
    py: 'paddingVertical',
    m:  'margin',
    mx: 'marginHorizontal',
    my: 'marginVertical',
    bg: 'backgroundColor',
    f:  'flex',
    ai: 'alignItems',
    jc: 'justifyContent',
  } as const,
});

export type AppConfig = typeof config;

// Merge our config into Tamagui's module so all styled() calls are fully typed.
declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
```

- [ ] **Step 2: Create `README.md`**

```md
# design/

Single source of truth for all visual values. Nothing outside this folder
defines colors, spacing, or type sizes. `src/constants/colors.ts` is deleted.

## Dependency chain

tokens → themes → typography → config

Each layer depends only on the one before it. Never import config.ts from
tokens, themes, or typography — that would create a circular dependency.

## tokens.ts

Primitive scales: raw hex values, spacing steps, border radius, icon sizes.
No semantic meaning. If you need a new color in the app, it starts here.

## themes.ts

Semantic mapping. Names a subset of token values by intent: bg, surface,
surfaceHover, text, textMuted, border, primary, primaryHover, success,
warning, danger, overlay. Screens and components reference these names,
never raw tokens. Adding a light theme = add one new object here.

## typography.ts

Font system. System font family + named type scale: xs, sm, md, lg, xl, h2, h1.
Also exports `typescale` which maps those names to Tamagui's numeric font keys.

## config.ts

Single call to `createTamagui`. Exported and consumed only by `TamaguiProvider`
in `app/_layout.tsx`. Nothing else should call `createTamagui`.
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/design/
git commit -m "feat(mobile): add Tamagui config and design system README"
```

---

## Task 7: Wire `TamaguiProvider` in `app/_layout.tsx`

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import config from '@/design/config';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const { token, setToken, clearSession } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setToken(session.access_token);
      } else {
        clearSession();
      }
    });
    return () => subscription.unsubscribe();
  }, [setToken, clearSession]);

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (token && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [token, segments, router]);

  return (
    <TamaguiProvider config={config} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <Slot />
      </QueryClientProvider>
    </TamaguiProvider>
  );
}
```

Note: this imports `supabase` from `'../src/lib/supabase'` which is created in Task 8. The typecheck will fail until Task 8 is done — complete both tasks before running the check.

- [ ] **Step 2: Commit stub (do not typecheck yet — Task 8 completes the import)**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): wire TamaguiProvider as root provider"
```

---

## Task 8: Create `src/lib/supabase.ts` (shared singleton)

**Files:**
- Create: `apps/mobile/src/lib/supabase.ts`
- Modify: `apps/mobile/app/(auth)/sign-in.tsx` — remove local client creation
- Modify: `apps/mobile/app/(app)/profile.tsx` — remove local client creation

Three files currently create their own `supabase` client. This task collapses them into one.

- [ ] **Step 1: Create `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

export const supabase = createClient(
  extra?.['supabaseUrl'] ?? '',
  extra?.['supabaseAnonKey'] ?? '',
);
```

- [ ] **Step 2: Remove the local client from `app/(auth)/sign-in.tsx`**

Delete these lines:
```ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
const supabase = createClient(extra?.['supabaseUrl'] ?? '', extra?.['supabaseAnonKey'] ?? '');
```

Add this import at the top instead:
```ts
import { supabase } from '@/lib/supabase';
```

- [ ] **Step 3: Remove the local client from `app/(app)/profile.tsx`**

Delete these lines:
```ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
const supabase = createClient(extra?.['supabaseUrl'] ?? '', extra?.['supabaseAnonKey'] ?? '');
```

Add this import instead:
```ts
import { supabase } from '@/lib/supabase';
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/supabase.ts apps/mobile/app/(auth)/sign-in.tsx apps/mobile/app/(app)/profile.tsx
git commit -m "refactor(mobile): extract shared Supabase singleton to src/lib/supabase.ts"
```

---

## Task 9: Create `layout/Screen.tsx`

**Files:**
- Create: `apps/mobile/src/components/layout/Screen.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode } from 'react';
import { ScrollView, YStack } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padding?: boolean;
};

export function Screen({ children, scroll = false, padding = true }: ScreenProps) {
  const inner = (
    <YStack flex={1} backgroundColor="$bg" padding={padding ? '$4' : 0}>
      {children}
    </YStack>
  );

  if (scroll) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView backgroundColor="$bg" contentContainerStyle={{ flexGrow: 1 }}>
          {inner}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={{ flex: 1 }}>{inner}</SafeAreaView>;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/layout/Screen.tsx
git commit -m "feat(mobile): add Screen layout component"
```

---

## Task 10: Create `typography/AppText.tsx`

**Files:**
- Create: `apps/mobile/src/components/typography/AppText.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { styled, Text } from 'tamagui';

export const AppText = styled(Text, {
  name: 'AppText',
  color: '$text',

  variants: {
    variant: {
      body:    { color: '$text',     fontSize: '$3' },
      muted:   { color: '$textMuted', fontSize: '$3' },
      caption: { color: '$textMuted', fontSize: '$2' },
      label:   { color: '$textMuted', fontSize: '$1', fontWeight: '600', textTransform: 'uppercase' },
      error:   { color: '$danger',   fontSize: '$2' },
    },
    size: {
      xs: { fontSize: '$1' },
      sm: { fontSize: '$2' },
      md: { fontSize: '$3' },
      lg: { fontSize: '$4' },
      xl: { fontSize: '$5' },
    },
    weight: {
      regular:  { fontWeight: '400' },
      semibold: { fontWeight: '600' },
      bold:     { fontWeight: '700' },
    },
  } as const,

  defaultVariants: {
    variant: 'body',
  },
});
```

Font sizes `$1`–`$5` map to the numeric keys in `typography.ts`: `$1`=12px(xs), `$2`=13px(sm), `$3`=15px(md), `$4`=16px(lg), `$5`=18px(xl). The `size` variant overrides the variant default when both are specified.

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/typography/AppText.tsx
git commit -m "feat(mobile): add AppText typography component with semantic variants"
```

---

## Task 11: Create `typography/Heading.tsx`

**Files:**
- Create: `apps/mobile/src/components/typography/Heading.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { styled, Text } from 'tamagui';

export const Heading = styled(Text, {
  name: 'Heading',
  color: '$text',
  fontWeight: '700',

  variants: {
    size: {
      h1: { fontSize: '$7', lineHeight: 38 },
      h2: { fontSize: '$6', lineHeight: 32 },
    },
  } as const,

  defaultVariants: {
    size: 'h1',
  },
});
```

`$6`=26px (h2), `$7`=32px (h1) — from the font size scale in `typography.ts`.

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/typography/Heading.tsx
git commit -m "feat(mobile): add Heading component (h1/h2)"
```

---

## Task 12: Create `interactive/Button.tsx`

**Files:**
- Create: `apps/mobile/src/components/interactive/Button.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode } from 'react';
import { styled, XStack, Spinner } from 'tamagui';
import { AppText } from '../typography/AppText';

const ButtonFrame = styled(XStack, {
  name: 'Button',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '$md',
  cursor: 'pointer',
  pressStyle: { opacity: 0.75 },

  variants: {
    variant: {
      primary: { backgroundColor: '$primary' },
      danger:  { backgroundColor: '$danger' },
      ghost:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: '$border' },
    },
    size: {
      sm: { paddingHorizontal: '$3', paddingVertical: '$2', height: 36 },
      md: { paddingHorizontal: '$4', paddingVertical: '$3', height: 44 },
      lg: { paddingHorizontal: '$4', paddingVertical: '$4', height: 52 },
    },
    disabled: {
      true: { opacity: 0.4 },
    },
  } as const,

  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

type ButtonProps = {
  variant?: 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onPress,
  children,
}: ButtonProps) {
  return (
    <ButtonFrame
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      {loading ? (
        <XStack gap="$2" alignItems="center">
          <Spinner size="small" color="$text" />
          <AppText weight="semibold" color="$text">{children}</AppText>
        </XStack>
      ) : (
        <AppText weight="semibold" color="$text">{children}</AppText>
      )}
    </ButtonFrame>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/interactive/Button.tsx
git commit -m "feat(mobile): add Button component (primary/danger/ghost, sm/md/lg)"
```

---

## Task 13: Create `interactive/IconButton.tsx`

**Files:**
- Create: `apps/mobile/src/components/interactive/IconButton.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode } from 'react';
import { styled, XStack, Spinner } from 'tamagui';

const IconButtonFrame = styled(XStack, {
  name: 'IconButton',
  width: 40,
  height: 40,
  borderRadius: '$full',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  pressStyle: { opacity: 0.75 },

  variants: {
    variant: {
      primary: { backgroundColor: '$primary' },
      ghost:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: '$border' },
    },
    disabled: {
      true: { opacity: 0.4 },
    },
  } as const,

  defaultVariants: {
    variant: 'primary',
  },
});

type IconButtonProps = {
  icon: ReactNode;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function IconButton({
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
}: IconButtonProps) {
  return (
    <IconButtonFrame
      variant={variant}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      {loading ? <Spinner size="small" color="$text" /> : icon}
    </IconButtonFrame>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/interactive/IconButton.tsx
git commit -m "feat(mobile): add IconButton component"
```

---

## Task 14: Create `interactive/Input.tsx`

**Files:**
- Create: `apps/mobile/src/components/interactive/Input.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { styled, Input as TamaguiInput, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';
import { AppText } from '../typography/AppText';

const StyledInput = styled(TamaguiInput, {
  name: 'Input',
  backgroundColor: '$surface',
  borderColor: '$border',
  borderWidth: 1,
  borderRadius: '$md',
  color: '$text',
  fontSize: '$4',
  paddingHorizontal: '$4',
  placeholderTextColor: '$textMuted',

  focusStyle: {
    borderColor: '$primary',
    outlineWidth: 0,
  },

  variants: {
    hasError: {
      true: { borderColor: '$danger' },
    },
  } as const,
});

type InputProps = GetProps<typeof StyledInput> & {
  label?: string;
  error?: string;
  helper?: string;
};

export function Input({ label, error, helper, ...props }: InputProps) {
  return (
    <YStack gap="$1">
      {label && <AppText variant="label">{label}</AppText>}
      <StyledInput hasError={!!error} {...props} />
      {error
        ? <AppText variant="error">{error}</AppText>
        : helper
        ? <AppText variant="caption">{helper}</AppText>
        : null}
    </YStack>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/interactive/Input.tsx
git commit -m "feat(mobile): add Input component with label/error/helper"
```

---

## Task 15: Create `interactive/Chip.tsx`

**Files:**
- Create: `apps/mobile/src/components/interactive/Chip.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { styled, XStack } from 'tamagui';
import { AppText } from '../typography/AppText';

const ChipFrame = styled(XStack, {
  name: 'Chip',
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  borderRadius: '$sm',
  borderWidth: 1,
  borderColor: '$border',
  backgroundColor: '$surface',
  cursor: 'pointer',
  pressStyle: { opacity: 0.8 },

  variants: {
    selected: {
      true: {
        borderColor: '$primary',
        backgroundColor: '$primarySubtle',
      },
    },
  } as const,
});

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <ChipFrame selected={selected} onPress={onPress}>
      <AppText
        variant={selected ? 'body' : 'muted'}
        weight={selected ? 'semibold' : 'regular'}
        color={selected ? '$primary' : '$textMuted'}
      >
        {label}
      </AppText>
    </ChipFrame>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/interactive/Chip.tsx
git commit -m "feat(mobile): add Chip toggle component"
```

---

## Task 16: Create `display/Card.tsx`

**Files:**
- Create: `apps/mobile/src/components/display/Card.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode } from 'react';
import { styled, YStack } from 'tamagui';

const CardFrame = styled(YStack, {
  name: 'Card',
  borderRadius: '$md',
  padding: '$4',

  variants: {
    variant: {
      default:  {
        backgroundColor: '$surface',
        borderWidth: 1,
        borderColor: '$border',
      },
      elevated: {
        backgroundColor: '$surfaceHover',
        borderWidth: 0,
      },
      ghost: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '$border',
        borderStyle: 'dashed',
      },
    },
    pressable: {
      true: { pressStyle: { opacity: 0.85 } },
    },
    disabled: {
      true: { opacity: 0.45 },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
  },
});

type CardProps = {
  variant?: 'default' | 'elevated' | 'ghost';
  onPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export function Card({ variant = 'default', onPress, disabled = false, children }: CardProps) {
  return (
    <CardFrame
      variant={variant}
      pressable={!!onPress}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
    >
      {children}
    </CardFrame>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/display/Card.tsx
git commit -m "feat(mobile): add Card component (default/elevated/ghost, pressable, disabled)"
```

---

## Task 17: Create `display/Badge.tsx`

**Files:**
- Create: `apps/mobile/src/components/display/Badge.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { styled, XStack } from 'tamagui';
import { AppText } from '../typography/AppText';

const BadgeFrame = styled(XStack, {
  name: 'Badge',
  paddingHorizontal: '$2',
  paddingVertical: 3,
  borderRadius: '$sm',
  alignSelf: 'flex-start',

  variants: {
    variant: {
      default: { backgroundColor: '$primarySubtle' },
      success: { backgroundColor: '$successSubtle' },
      warning: { backgroundColor: '$warningSubtle' },
      danger:  { backgroundColor: '$dangerSubtle' },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
  },
});

const textColorMap = {
  default: '$primaryHover',
  success: '$success',
  warning: '$warning',
  danger:  '$danger',
} as const;

type BadgeProps = {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <BadgeFrame variant={variant}>
      <AppText variant="label" color={textColorMap[variant]}>
        {label}
      </AppText>
    </BadgeFrame>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/display/Badge.tsx
git commit -m "feat(mobile): add Badge component (default/success/warning/danger)"
```

---

## Task 18: Create `display/ProgressBar.tsx`

**Files:**
- Create: `apps/mobile/src/components/display/ProgressBar.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { YStack, XStack } from 'tamagui';
import { AppText } from '../typography/AppText';

type ProgressBarProps = {
  value: number;  // 0–1
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

  return (
    <YStack gap="$1">
      <XStack height={6} backgroundColor="$surfaceHover" borderRadius="$full" overflow="hidden">
        <XStack height={6} width={pct} backgroundColor="$primary" borderRadius="$full" />
      </XStack>
      {label && <AppText variant="caption">{label}</AppText>}
    </YStack>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/display/ProgressBar.tsx
git commit -m "feat(mobile): add ProgressBar component"
```

---

## Task 19: Create `display/PositionBadge.tsx`

**Files:**
- Create: `apps/mobile/src/components/display/PositionBadge.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { XStack } from 'tamagui';
import { AppText } from '../typography/AppText';

type PositionBadgeProps = {
  position: number;
  completed: boolean;
};

export function PositionBadge({ position, completed }: PositionBadgeProps) {
  return (
    <XStack
      width={32}
      height={32}
      borderRadius="$full"
      backgroundColor={completed ? '$success' : '$surfaceHover'}
      alignItems="center"
      justifyContent="center"
    >
      <AppText variant="body" weight="bold" size="sm">
        {completed ? '✓' : String(position)}
      </AppText>
    </XStack>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/display/PositionBadge.tsx
git commit -m "feat(mobile): add PositionBadge component"
```

---

## Task 20: Create `display/ChatBubble.tsx`

**Files:**
- Create: `apps/mobile/src/components/display/ChatBubble.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { XStack } from 'tamagui';
import { AppText } from '../typography/AppText';
import type { ChatMessage } from '@autodidact/types';

type ChatBubbleProps = {
  message: ChatMessage;
  isStreaming?: boolean;
};

export function ChatBubble({ message, isStreaming = false }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <XStack
      maxWidth="85%"
      alignSelf={isUser ? 'flex-end' : 'flex-start'}
      backgroundColor={isUser ? '$userBubble' : '$assistantBubble'}
      borderRadius="$lg"
      borderBottomRightRadius={isUser ? '$sm' : '$lg'}
      borderBottomLeftRadius={isUser ? '$lg' : '$sm'}
      borderWidth={isUser ? 0 : 1}
      borderColor="$border"
      padding="$3"
    >
      <AppText variant="body">
        {message.content}
        {isStreaming ? <AppText variant="body" color="$primary">▋</AppText> : null}
      </AppText>
    </XStack>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/display/ChatBubble.tsx
git commit -m "feat(mobile): add ChatBubble component with streaming cursor"
```

---

## Task 21: Create `display/EmptyState.tsx`

**Files:**
- Create: `apps/mobile/src/components/display/EmptyState.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { YStack } from 'tamagui';
import { AppText } from '../typography/AppText';

type EmptyStateProps = {
  message: string;
};

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" paddingTop="$10">
      <AppText variant="muted" textAlign="center">
        {message}
      </AppText>
    </YStack>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/display/EmptyState.tsx
git commit -m "feat(mobile): add EmptyState component"
```

---

## Task 22: Create barrel export and `components/README.md`

**Files:**
- Create: `apps/mobile/src/components/index.ts`
- Create: `apps/mobile/src/components/README.md`

- [ ] **Step 1: Create `index.ts`**

```ts
// layout
export { Screen } from './layout/Screen';

// typography
export { AppText } from './typography/AppText';
export { Heading } from './typography/Heading';

// interactive
export { Button } from './interactive/Button';
export { IconButton } from './interactive/IconButton';
export { Input } from './interactive/Input';
export { Chip } from './interactive/Chip';

// display
export { Card } from './display/Card';
export { Badge } from './display/Badge';
export { ProgressBar } from './display/ProgressBar';
export { PositionBadge } from './display/PositionBadge';
export { ChatBubble } from './display/ChatBubble';
export { EmptyState } from './display/EmptyState';
```

- [ ] **Step 2: Create `README.md`**

```md
# components/

All shared UI components. Built on Tamagui primitives (XStack, YStack, Text, etc.).
No StyleSheet.create or raw React Native primitives — screens are fully declarative.

Import from the barrel: `import { Card, AppText } from '@/components'`

## layout/

Components that control page structure and safe area behaviour.

**Screen** — wraps every screen. Handles SafeAreaView, background colour via `$bg`
token, and optional ScrollView. Exists so screens don't repeat safe-area boilerplate.

## typography/

Single source of truth for all text rendering.

**Heading** — structural headings only (h1/h2). Not for inline emphasis.
**AppText** — all other text. `variant` is the primary API:
  - body — default readable text ($text, md)
  - muted — secondary/description text ($textMuted, md)
  - caption — hints, helper text ($textMuted, sm)
  - label — uppercase labels and badge text ($textMuted, xs, semibold)
  - error — validation errors ($danger, sm)
  `size` and `weight` props override the variant's defaults when needed.

## interactive/

Components the user directly acts on.

**Button** — primary/danger/ghost variants, sm/md/lg sizes, built-in loading spinner.
**IconButton** — circular icon-only button. Used for the chat send action.
**Input** — text field with colocated label, error, and helper text. Exists so
  label+field+validation messaging is always kept together as one unit.
**Chip** — single-select toggle. Used for the difficulty picker on HomeScreen.

## display/

Read-only visual components that present data.

**Card** — surface container. default/elevated/ghost variants.
  `onPress` makes it pressable; `disabled` reduces opacity (locked modules).
**Badge** — small status pill. Communicates state at a glance (difficulty, completion).
**ProgressBar** — linear 0–1 fill bar with optional text label. Course completion.
**PositionBadge** — circular module step indicator. Shows step number or ✓ when complete.
**ChatBubble** — message bubble, user and assistant variants. Renders streaming
  cursor while `isStreaming` is true.
**EmptyState** — centred message for lists with no data.
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/index.ts apps/mobile/src/components/README.md
git commit -m "feat(mobile): add component barrel export and README"
```

---

## Task 23: Migrate `(auth)/sign-in.tsx`

**Files:**
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useState } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { Screen, Heading, AppText, Input, Button } from '@/components';
import { YStack } from 'tamagui';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);

  const handleSignIn = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign in failed', error.message);
      return;
    }
    if (data.session?.access_token) setToken(data.session.access_token);
  };

  return (
    <Screen>
      <YStack flex={1} justifyContent="center" gap="$4">
        <YStack gap="$2" marginBottom="$6">
          <Heading size="h1">Autodidact</Heading>
          <AppText variant="muted" size="lg">Learn anything, one module at a time.</AppText>
        </YStack>

        <YStack gap="$3">
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </YStack>

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          onPress={handleSignIn}
        >
          Sign In
        </Button>
      </YStack>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(auth)/sign-in.tsx
git commit -m "feat(mobile): migrate sign-in screen to Tamagui"
```

---

## Task 24: Migrate `(app)/index.tsx` (HomeScreen)

**Files:**
- Modify: `apps/mobile/app/(app)/index.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useState } from 'react';
import { Alert } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useCreateCourse } from '@/api/courses';
import { useCourseGeneration } from '@/hooks/useCourseGeneration';
import { Screen, Heading, AppText, Input, Button, Chip } from '@/components';

type Difficulty = 'beginner' | 'intermediate' | 'advanced';
const difficulties: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export default function HomeScreen() {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  const { mutateAsync: createCourse, isPending } = useCreateCourse();
  const { isGenerating, failed, status } = useCourseGeneration(pendingCourseId, pendingJobId);

  const handleStart = async () => {
    if (!topic.trim()) return;
    try {
      const result = await createCourse({ topic: topic.trim(), difficulty });
      setPendingCourseId(result.courseId);
      setPendingJobId(result.status === 'ready' || result.reused ? null : (result.jobId ?? null));
    } catch {
      Alert.alert('Error', 'Failed to start course generation');
    }
  };

  const isLoading = isPending || isGenerating;

  return (
    <Screen scroll>
      <YStack gap="$6" paddingTop="$6">
        <Heading size="h1">What do you want to learn?</Heading>

        <Input
          placeholder="e.g. Rust programming, Byzantine history..."
          value={topic}
          onChangeText={setTopic}
          multiline
          maxLength={200}
        />

        <YStack gap="$2">
          <AppText variant="label">Difficulty</AppText>
          <XStack gap="$3">
            {difficulties.map((d) => (
              <Chip
                key={d}
                label={d.charAt(0).toUpperCase() + d.slice(1)}
                selected={difficulty === d}
                onPress={() => setDifficulty(d)}
              />
            ))}
          </XStack>
        </YStack>

        <Button
          variant="primary"
          size="lg"
          loading={isLoading}
          disabled={!topic.trim()}
          onPress={handleStart}
        >
          {isGenerating ? `Building course (${status ?? '...'})` : 'Start Learning'}
        </Button>

        {failed && <AppText variant="error" textAlign="center">Course generation failed. Please try again.</AppText>}
      </YStack>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(app)/index.tsx
git commit -m "feat(mobile): migrate HomeScreen to Tamagui"
```

---

## Task 25: Migrate `(app)/profile.tsx`

**Files:**
- Modify: `apps/mobile/app/(app)/profile.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { YStack } from 'tamagui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { Screen, Card, AppText, Button } from '@/components';

export default function ProfileScreen() {
  const { user, clearSession } = useAuthStore();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearSession();
  };

  return (
    <Screen>
      <YStack gap="$6" paddingTop="$4">
        <Card variant="elevated">
          <AppText variant="label">Email</AppText>
          <AppText variant="body" size="lg" marginTop="$1">{user?.email ?? '—'}</AppText>
        </Card>

        <Button variant="danger" size="lg" onPress={handleSignOut}>
          Sign Out
        </Button>
      </YStack>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(app)/profile.tsx
git commit -m "feat(mobile): migrate ProfileScreen to Tamagui"
```

---

## Task 26: Migrate `(app)/courses/index.tsx`

**Files:**
- Modify: `apps/mobile/app/(app)/courses/index.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { XStack, YStack, Spinner } from 'tamagui';
import { useUserCourses } from '@/api/courses';
import { Screen, Card, AppText, Badge, EmptyState } from '@/components';

type Course = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  completedAt: string | null;
};

export default function MyCoursesScreen() {
  const router = useRouter();
  const { data: courses, isLoading } = useUserCourses();

  if (isLoading) {
    return (
      <Screen>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner color="$primary" />
        </YStack>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={courses ?? []}
        keyExtractor={(item: Course) => item.id}
        contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
        ListEmptyComponent={<EmptyState message="No courses yet. Start learning something!" />}
        renderItem={({ item }: { item: Course }) => (
          <Card variant="default" onPress={() => router.push(`/(app)/courses/${item.id}`)}>
            <XStack justifyContent="space-between" alignItems="flex-start" marginBottom="$2">
              <AppText variant="body" weight="semibold" size="lg" flex={1} marginRight="$2">
                {item.title}
              </AppText>
              <Badge label={item.difficulty} />
            </XStack>
            <AppText variant="muted" size="sm" numberOfLines={2}>{item.description}</AppText>
            {item.completedAt && (
              <AppText variant="body" color="$success" size="sm" marginTop="$2">✓ Completed</AppText>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(app)/courses/index.tsx
git commit -m "feat(mobile): migrate MyCoursesScreen to Tamagui"
```

---

## Task 27: Migrate `(app)/courses/[id]/index.tsx`

**Files:**
- Modify: `apps/mobile/app/(app)/courses/[id]/index.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { XStack, YStack, Spinner } from 'tamagui';
import { useCourse } from '@/api/courses';
import { useProgress } from '@/api/progress';
import { Screen, Heading, AppText, Card, Badge, ProgressBar, PositionBadge } from '@/components';
import type { ModuleBlueprint } from '@autodidact/types';

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: course, isLoading } = useCourse(id);
  const { data: progress } = useProgress(id);

  const progressMap = new Map(progress?.map((p) => [p.moduleId, p]) ?? []);
  const completedCount = progress?.filter((p) => p.status === 'completed').length ?? 0;
  const totalCount = progress?.length ?? 0;
  const progressPct = totalCount > 0 ? completedCount / totalCount : 0;

  if (isLoading) {
    return (
      <Screen>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner color="$primary" />
        </YStack>
      </Screen>
    );
  }

  if (!course) return null;

  return (
    <Screen>
      <FlatList
        data={(course.modules ?? []) as ModuleBlueprint[]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
        ListHeaderComponent={
          <YStack gap="$4" marginBottom="$4">
            <Heading size="h1">{course.title}</Heading>
            <AppText variant="muted">{course.description}</AppText>
            <ProgressBar value={progressPct} label={`${completedCount}/${totalCount} modules`} />
          </YStack>
        }
        renderItem={({ item }) => {
          const modProgress = progressMap.get(item.id);
          const status = modProgress?.status ?? 'locked';
          const isLocked = status === 'locked';
          const isCompleted = status === 'completed';

          return (
            <Card
              variant="default"
              onPress={isLocked ? undefined : () => router.push(`/(app)/courses/${id}/modules/${item.id}/chat`)}
              disabled={isLocked}
            >
              <XStack alignItems="center" gap="$3" marginBottom="$2">
                <PositionBadge position={item.position + 1} completed={isCompleted} />
                <YStack flex={1}>
                  <AppText variant="body" weight="semibold">{item.title}</AppText>
                  <AppText variant="caption">{status.replace('_', ' ')}</AppText>
                </YStack>
                {!isLocked && <AppText variant="muted" size="xl">›</AppText>}
              </XStack>
              <AppText variant="muted" size="sm" numberOfLines={2}>{item.description}</AppText>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(app)/courses/[id]/index.tsx"
git commit -m "feat(mobile): migrate CourseDetailScreen to Tamagui"
```

---

## Task 28: Migrate `modules/[moduleId]/chat.tsx`

**Files:**
- Modify: `apps/mobile/app/(app)/courses/[id]/modules/[moduleId]/chat.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { XStack, YStack, Spinner } from 'tamagui';
import { apiFetch } from '@/api/client';
import { useSSE } from '@/hooks/useSSE';
import { useChatStore } from '@/stores/chat.store';
import { Screen, AppText, Input, IconButton, ChatBubble } from '@/components';
import type { ChatMessage } from '@autodidact/types';

// ↑ icon rendered as text — no @expo/vector-icons dependency on this component
function UpArrow() {
  return <AppText variant="body" weight="bold" color="$text">↑</AppText>;
}

export default function ModuleChatScreen() {
  const { id: courseId, moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const { messages, streamingContent, isStreaming, setMessages, clearMessages } = useChatStore();
  const { send } = useSSE(sessionId ?? '', courseId);

  const { mutateAsync: createSession, isPending: creatingSession } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ moduleId, courseId }),
      });
      if (!res.ok) throw new Error('Failed to create session');
      return res.json() as Promise<{ id: string; messages: ChatMessage[] }>;
    },
  });

  useEffect(() => {
    clearMessages();
    void (async () => {
      const session = await createSession();
      setSessionId(session.id);
      if (session.messages?.length) setMessages(session.messages);
    })();
    return () => clearMessages();
  }, [moduleId]);

  useEffect(() => {
    if (messages.length || streamingContent) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, streamingContent]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !sessionId) return;
    const text = input.trim();
    setInput('');
    await send(text);
  }, [input, isStreaming, sessionId, send]);

  const allItems = [
    ...messages,
    ...(streamingContent
      ? [{ id: '__streaming__', role: 'assistant' as const, content: streamingContent, createdAt: '' }]
      : []),
  ];

  if (creatingSession) {
    return (
      <Screen>
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner color="$primary" />
          <AppText variant="muted">Starting session...</AppText>
        </YStack>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <YStack flex={1} backgroundColor="$bg">
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          data={allItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatBubble message={item} isStreaming={item.id === '__streaming__'} />
          )}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        <XStack
          padding="$3"
          gap="$2"
          borderTopWidth={1}
          borderTopColor="$border"
          backgroundColor="$surface"
          alignItems="flex-end"
        >
          <Input
            flex={1}
            placeholder="Ask a question or respond..."
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={4000}
            editable={!isStreaming}
          />
          <IconButton
            icon={<UpArrow />}
            variant="primary"
            loading={isStreaming}
            disabled={!input.trim()}
            onPress={handleSend}
          />
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(app)/courses/[id]/modules/[moduleId]/chat.tsx"
git commit -m "feat(mobile): migrate ModuleChatScreen to Tamagui"
```

---

## Task 29: Delete `constants/colors.ts` and final verification

**Files:**
- Delete: `apps/mobile/src/constants/colors.ts`

- [ ] **Step 1: Confirm no remaining imports of colors.ts**

```bash
grep -r "constants/colors" /home/bkd/Projects/Autodidact/apps/mobile/
```

Expected: no output. If any files are listed, fix them before proceeding.

- [ ] **Step 2: Delete the file**

```bash
rm apps/mobile/src/constants/colors.ts
```

- [ ] **Step 3: Run full typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: no errors.

- [ ] **Step 4: Confirm no StyleSheet imports remain in screens or components**

```bash
grep -r "StyleSheet" /home/bkd/Projects/Autodidact/apps/mobile/app/ /home/bkd/Projects/Autodidact/apps/mobile/src/components/
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mobile): delete constants/colors.ts — design system migration complete"
```
