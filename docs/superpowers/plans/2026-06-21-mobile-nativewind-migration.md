# Mobile NativeWind + React Native Reusables Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tamagui with NativeWind v4 + React Native Reusables (RNR) as the styling/UI-primitive system for `apps/mobile`, preserving the current dark theme exactly and adding a system-driven light theme.

**Architecture:** NativeWind is installed and configured *alongside* Tamagui first (they coexist cleanly). The design-system wrapper layer (`src/components/`) is migrated component-by-component bottom-up, then screens, then the root layout. Tamagui is removed **last**, once nothing imports it — so the Metro bundle builds and the app boots at every task boundary. Theme tokens move from `src/design/` (Tamagui `createTokens`/`createTamagui`) to a single `src/global.css` (CSS variables, light + dark) consumed via `tailwind.config.js`.

**Tech Stack:** Expo SDK 52, React Native 0.76, Expo Router 4, NativeWind v4, `tailwindcss@3.3.2`, React Native Reusables (copy-paste components), `class-variance-authority`, `clsx`, `tailwind-merge`, `@rn-primitives/slot`, `lucide-react-native`, `react-native-svg`, jest-expo + `@testing-library/react-native`.

## Global Constraints

- **NativeWind v4** (`pnpm add nativewind`) + **`tailwindcss@3.3.2`** (dev dep) — exact versions from the spec.
- **`nativewind/babel` is a babel _preset_, not a plugin** in v4. The spec's STEP 2 ("add to plugins array") is v2 syntax and would break the build. Add it to `presets`.
- **Path alias is `@/` → `./src/`** (see `apps/mobile/tsconfig.json` + `jest.config.js` `moduleNameMapper`). RNR docs use `~/`; rewrite every RNR import to `@/`. Do **not** introduce `~/`.
- **Tailwind spacing == Tamagui space scale** (both 4px-per-unit): `$0.5→0.5`, `$1→1`, `$2→2`, `$3→3`, `$4→4`, `$5→5`, `$6→6`, `$8→8`, `$10→10`. Token→class is a literal swap (`gap="$3"` → `gap-3`).
- **Border radius scale:** `$sm`=8px → `rounded-sm`, `$md`=12px → `rounded-md`, `$lg`=16px → `rounded-lg`, `$xl`=9999 → `rounded-full` (configured in `tailwind.config.js`).
- **Type scale (px / lineHeight):** `xs` 12/16 · `sm` 13/18 · `md` 15/22 · `lg` 16/24 · `xl` 18/27 · `h2` 26/32 · `h1` 32/38 — configured as named `fontSize` keys (`text-xs`…`text-h1`).
- **Never reinstall Tamagui.** No `StyleSheet.create` where a Tailwind class exists. No inline styles where a class exists (RN-only props with no class equivalent — e.g. `contentContainerStyle`, `KeyboardAvoidingView` offsets — stay as `style`).
- **Dark-mode behavior must be byte-identical to today** after migration; light mode is new and additive.
- **Verification per task:** `pnpm --filter @autodidact/mobile typecheck` and `pnpm --filter @autodidact/mobile test` must pass. Until Tamagui is removed (Task 10), the app builds with both libraries present.

---

## Color Token Map (source of truth for Tasks 1–9)

Current dark theme (`src/design/themes.ts`) → semantic CSS variable → Tailwind color. Dark values are **exact** (preserve appearance); light values are **authored**. HSL channel format `H S% L%` (computed from the existing hex tokens).

| Tamagui token (`$…`) | Semantic / Tailwind class | Dark (`.dark`) | Light (`:root`) |
|---|---|---|---|
| `$bg` | `background` / `bg-background` | `222 47% 11%` (slate900) | `0 0% 100%` (white) |
| `$text` | `foreground` / `text-foreground` | `210 40% 96%` (slate100) | `222 47% 11%` (slate900) |
| `$surface` | `card` / `bg-card` | `217 33% 17%` (slate800) | `0 0% 100%` (white) |
| `$surfaceHover` | `muted` / `bg-muted` | `215 25% 27%` (slate700) | `210 40% 96%` (slate100) |
| `$overlay` | `popover` | `222 47% 11%` | `0 0% 100%` |
| `$textMuted` | `muted-foreground` / `text-muted-foreground` | `215 20% 65%` (slate400) | `215 16% 47%` (slate500) |
| `$border` | `border` + `input` / `border-border` | `215 25% 27%` (slate700) | `214 32% 91%` (slate200) |
| `$primary` | `primary` / `bg-primary` `text-primary` | `239 84% 67%` (indigo500) | `239 84% 67%` (indigo500) |
| `$primaryHover` | `primary-hover` | `234 89% 74%` (indigo400) | `239 84% 67%` (indigo500) |
| `$text` on primary | `primary-foreground` / `text-primary-foreground` | `210 40% 96%` (slate100) | `0 0% 100%` (white) |
| `$success` | `success` / `text-success` `bg-success` | `142 71% 45%` (green500) | `142 71% 45%` |
| `$warning` | `warning` | `38 92% 50%` (amber500) | `38 92% 50%` |
| `$danger` | `destructive` / `bg-destructive` `text-destructive` | `0 84% 60%` (red500) | `0 84% 60%` |
| `$userBubble` | `user-bubble` / `bg-user-bubble` | `239 84% 67%` (indigo500) | `239 84% 67%` |
| `$assistantBubble` | `assistant-bubble` / `bg-assistant-bubble` | `217 33% 17%` (slate800) | `210 40% 96%` (slate100) |

**Subtle variants** (`$primarySubtle`/`$successSubtle`/`$warningSubtle`/`$dangerSubtle` = base color at ~13–15% alpha) are **not** separate tokens. Express via opacity modifier on the base: `$primarySubtle` → `bg-primary/[0.13]`, `$successSubtle` → `bg-success/[0.15]`, `$warningSubtle` → `bg-warning/[0.15]`, `$dangerSubtle` → `bg-destructive/[0.15]`. (HSL `<alpha-value>` channel format makes this work.)

**Light-mode correctness adjustments** (new, faithful to intent — dark behavior unchanged):
- Button `primary`/`danger` label and IconButton spinner use `text-primary-foreground` (white in light, slate100 in dark) instead of raw `$text`, so text stays legible on the indigo/red fill in light mode.
- ChatBubble **user** bubble text uses `text-primary-foreground`; **assistant** bubble text uses `text-foreground`.

---

## Task 1: Install & configure NativeWind v4 + Tailwind (coexists with Tamagui)

**Files:**
- Modify: `apps/mobile/package.json` (add deps)
- Create: `apps/mobile/tailwind.config.js`
- Create: `apps/mobile/src/global.css`
- Create: `apps/mobile/nativewind-env.d.ts`
- Modify: `apps/mobile/babel.config.js` (add preset; keep Tamagui plugin for now)
- Modify: `apps/mobile/metro.config.js` (wrap with `withNativeWind`; keep `enablePackageExports` for now)
- Modify: `apps/mobile/app/_layout.tsx` (import `@/global.css` only — keep TamaguiProvider for now)

**Interfaces:**
- Produces: Tailwind classes resolve in JSX (`className`) via the NativeWind babel preset + Metro transform; theme classes (`bg-background`, `text-foreground`, …) defined in `tailwind.config.js`; `.dark` class toggles dark values.

- [ ] **Step 1: Install deps**

```bash
cd apps/mobile
pnpm add nativewind
pnpm add -D tailwindcss@3.3.2
```

- [ ] **Step 2: Create `apps/mobile/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          hover: 'hsl(var(--primary-hover) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        'user-bubble': 'hsl(var(--user-bubble) / <alpha-value>)',
        'assistant-bubble': 'hsl(var(--assistant-bubble) / <alpha-value>)',
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px' },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'Monaco', 'Consolas', 'Roboto Mono', 'Courier New', 'monospace'],
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        md: ['15px', '22px'],
        lg: ['16px', '24px'],
        xl: ['18px', '27px'],
        h2: ['26px', '32px'],
        h1: ['32px', '38px'],
      },
    },
  },
  plugins: [],
};
```

> Note: the spec lists semantic names `background, foreground, primary, secondary, muted, border, card, destructive`. This config covers all of them (plus the app-specific `success`, `warning`, `*-bubble`, `primary-hover` the audit found). `secondary` is intentionally omitted — the audit found no distinct "secondary" surface; `muted`/`card` cover `surfaceHover`/`surface`. **Flag if a `secondary` token is later required.**

- [ ] **Step 3: Create `apps/mobile/src/global.css`** (theme variable definitions — the new single source of truth for color values)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --popover: 0 0% 100%;
    --primary: 239 84% 67%;
    --primary-foreground: 0 0% 100%;
    --primary-hover: 239 84% 67%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 239 84% 67%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 71% 45%;
    --warning: 38 92% 50%;
    --user-bubble: 239 84% 67%;
    --assistant-bubble: 210 40% 96%;
  }

  .dark:root {
    --background: 222 47% 11%;
    --foreground: 210 40% 96%;
    --card: 217 33% 17%;
    --popover: 222 47% 11%;
    --primary: 239 84% 67%;
    --primary-foreground: 210 40% 96%;
    --primary-hover: 234 89% 74%;
    --muted: 215 25% 27%;
    --muted-foreground: 215 20% 65%;
    --border: 215 25% 27%;
    --input: 215 25% 27%;
    --ring: 239 84% 67%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 210 40% 96%;
    --success: 142 71% 45%;
    --warning: 38 92% 50%;
    --user-bubble: 239 84% 67%;
    --assistant-bubble: 217 33% 17%;
  }
}
```

- [ ] **Step 4: Create `apps/mobile/nativewind-env.d.ts`**

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 5: Update `apps/mobile/babel.config.js`** — add the NativeWind **preset** (keep the Tamagui plugin until Task 10)

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/design/config.ts',
          logTimings: true,
          disableExtraction: process.env.NODE_ENV !== 'production',
        },
      ],
    ],
  };
};
```

- [ ] **Step 6: Update `apps/mobile/metro.config.js`** — wrap with `withNativeWind` (keep `enablePackageExports` while Tamagui is present)

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Required by tamagui v2's package `exports` map (removed in Task 10 with Tamagui).
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: './src/global.css' });
```

- [ ] **Step 7: Import `global.css` in `apps/mobile/app/_layout.tsx`** — add at the top of the import block (keep TamaguiProvider for now)

```tsx
import '@/global.css';
```

- [ ] **Step 8: Verify build & typecheck**

```bash
cd apps/mobile
pnpm --filter @autodidact/mobile typecheck   # Expected: PASS
pnpm --filter @autodidact/mobile test        # Expected: PASS (existing suites unchanged)
```

Then confirm Metro bundles: `pnpm --filter @autodidact/mobile start` and let it build once (Ctrl+C after "Bundled"). Expected: no resolution errors; app still renders via Tamagui.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/package.json apps/mobile/pnpm-lock.yaml ../../pnpm-lock.yaml apps/mobile/tailwind.config.js apps/mobile/src/global.css apps/mobile/nativewind-env.d.ts apps/mobile/babel.config.js apps/mobile/metro.config.js apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): add NativeWind v4 + Tailwind config alongside Tamagui"
```

---

## Task 2: React Native Reusables primitives (`cn` util + ui components)

**Files:**
- Modify: `apps/mobile/package.json` (RNR peer deps)
- Create: `apps/mobile/src/lib/utils.ts`
- Create: `apps/mobile/src/components/ui/text.tsx`
- Create: `apps/mobile/src/components/ui/button.tsx`
- Create: `apps/mobile/src/components/ui/input.tsx`
- Create: `apps/mobile/src/components/ui/card.tsx`
- Create: `apps/mobile/src/components/ui/separator.tsx`

**Interfaces:**
- Produces:
  - `cn(...inputs: ClassValue[]): string` from `@/lib/utils`
  - `Text` (+ `TextClassContext`) from `@/components/ui/text`
  - `Button` (`buttonVariants`, props `variant`, `size`) + `Text` inheritance from `@/components/ui/button`
  - `Input` from `@/components/ui/input`
  - `Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription` from `@/components/ui/card`
  - `Separator` from `@/components/ui/separator`
- Consumes: theme classes from Task 1.

> These are the canonical RNR components (https://rnr.netlify.app) adapted to: (a) `@/` alias, (b) this app's token names. Only the five the audit requires are copied — no others.

- [ ] **Step 1: Install RNR peer deps**

```bash
cd apps/mobile
pnpm add class-variance-authority clsx tailwind-merge @rn-primitives/slot lucide-react-native react-native-svg
```

- [ ] **Step 2: Create `apps/mobile/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create `apps/mobile/src/components/ui/text.tsx`**

```tsx
import * as React from 'react';
import { Text as RNText } from 'react-native';
import { cn } from '@/lib/utils';

const TextClassContext = React.createContext<string | undefined>(undefined);

const Text = React.forwardRef<
  React.ElementRef<typeof RNText>,
  React.ComponentPropsWithoutRef<typeof RNText> & { className?: string }
>(({ className, ...props }, ref) => {
  const textClass = React.useContext(TextClassContext);
  return (
    <RNText
      className={cn('text-md text-foreground', textClass, className)}
      ref={ref}
      {...props}
    />
  );
});
Text.displayName = 'Text';

export { Text, TextClassContext };
```

- [ ] **Step 4: Create `apps/mobile/src/components/ui/button.tsx`**

```tsx
import * as React from 'react';
import { Pressable } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'flex-row items-center justify-center rounded-md active:opacity-75',
  {
    variants: {
      variant: {
        primary: 'bg-primary',
        danger: 'bg-destructive',
        ghost: 'bg-transparent border border-border',
      },
      size: {
        sm: 'px-3 py-2 h-9',
        md: 'px-4 py-3 h-11',
        lg: 'px-4 py-4 h-[52px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

const buttonTextVariants = cva('font-semibold', {
  variants: {
    variant: {
      primary: 'text-primary-foreground',
      danger: 'text-primary-foreground',
      ghost: 'text-foreground',
    },
    size: { sm: 'text-md', md: 'text-md', lg: 'text-md' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  ({ className, variant, size, disabled, ...props }, ref) => (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        ref={ref}
        className={cn(buttonVariants({ variant, size }), disabled && 'opacity-40', className)}
        disabled={disabled}
        {...props}
      />
    </TextClassContext.Provider>
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants, buttonTextVariants };
export type { ButtonProps };
```

- [ ] **Step 5: Create `apps/mobile/src/components/ui/input.tsx`**

```tsx
import * as React from 'react';
import { TextInput } from 'react-native';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<
  React.ElementRef<typeof TextInput>,
  React.ComponentPropsWithoutRef<typeof TextInput> & { className?: string }
>(({ className, placeholderClassName, ...props }, ref) => (
  <TextInput
    ref={ref}
    className={cn(
      'h-11 rounded-md border border-input bg-card px-4 text-md text-foreground',
      props.editable === false && 'opacity-50',
      className,
    )}
    placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
```

> The app's compound `Input` (label + error/helper) is the wrapper in `src/components/interactive/Input.tsx` (Task 4), which composes this primitive.

- [ ] **Step 6: Create `apps/mobile/src/components/ui/card.tsx`**

```tsx
import * as React from 'react';
import { View } from 'react-native';
import { Text, TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<
  React.ElementRef<typeof View>,
  React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => (
  <View ref={ref} className={cn('rounded-md border border-border bg-card p-4', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  React.ElementRef<typeof View>,
  React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => (
  <View ref={ref} className={cn('gap-1.5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  React.ElementRef<typeof Text>,
  React.ComponentPropsWithoutRef<typeof Text>
>(({ className, ...props }, ref) => (
  <Text ref={ref} className={cn('text-lg font-semibold text-card-foreground', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  React.ElementRef<typeof Text>,
  React.ComponentPropsWithoutRef<typeof Text>
>(({ className, ...props }, ref) => (
  <Text ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  React.ElementRef<typeof View>,
  React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => (
  <TextClassContext.Provider value="text-card-foreground">
    <View ref={ref} className={cn('', className)} {...props} />
  </TextClassContext.Provider>
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  React.ElementRef<typeof View>,
  React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => (
  <View ref={ref} className={cn('flex-row items-center', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 7: Create `apps/mobile/src/components/ui/separator.tsx`**

```tsx
import * as React from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  React.ElementRef<typeof View>,
  React.ComponentPropsWithoutRef<typeof View> & { orientation?: 'horizontal' | 'vertical' }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <View
    ref={ref}
    className={cn('bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };
```

- [ ] **Step 8: Typecheck & commit**

```bash
pnpm --filter @autodidact/mobile typecheck   # Expected: PASS
git add apps/mobile/package.json apps/mobile/pnpm-lock.yaml ../../pnpm-lock.yaml apps/mobile/src/lib/utils.ts apps/mobile/src/components/ui
git commit -m "feat(mobile): add RNR primitives (cn, text, button, input, card, separator)"
```

---

## Task 3: Migrate typography wrappers (AppText, Heading)

**Files:**
- Modify: `apps/mobile/src/components/typography/AppText.tsx`
- Modify: `apps/mobile/src/components/typography/Heading.tsx`

**Interfaces:**
- Produces: `AppText` with the SAME prop surface used across the app: `variant` (`body|muted|caption|label|error`), `size` (`xs|sm|md|lg|xl`), `weight` (`regular|semibold|bold`), plus pass-through `className`, `numberOfLines`, `textAlign` (as class), and a `color` escape hatch replaced by `className`. `Heading` with `size` (`h1|h2`).
- Consumes: `Text` from `@/components/ui/text`, `cn` from `@/lib/utils`.

> **Important:** existing callers pass Tamagui props this component must keep absorbing or that must be migrated at the call site: `color="$..."`, `fontFamily="$mono"`, `backgroundColor`, `paddingHorizontal`, `borderRadius`, `textAlign`, `flex`. AppText's new API exposes `className` so callers pass `className="..."` instead. Calls that passed `color={textColorMap[...]}` (Badge) become `className` from a class map. See Tasks 4–8 for each call site.

- [ ] **Step 1: Rewrite `AppText.tsx`** using `cva` over the RNR `Text`

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const textVariants = cva('', {
  variants: {
    variant: {
      body: 'text-md text-foreground',
      muted: 'text-md text-muted-foreground',
      caption: 'text-sm text-muted-foreground',
      label: 'text-xs font-semibold uppercase text-muted-foreground',
      error: 'text-sm text-destructive',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-md',
      lg: 'text-lg',
      xl: 'text-xl',
    },
    weight: {
      regular: 'font-normal',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  defaultVariants: { variant: 'body' },
});

type AppTextProps = React.ComponentPropsWithoutRef<typeof Text> &
  VariantProps<typeof textVariants>;

export function AppText({ variant, size, weight, className, ...props }: AppTextProps) {
  return <Text className={cn(textVariants({ variant, size, weight }), className)} {...props} />;
}
```

- [ ] **Step 2: Rewrite `Heading.tsx`**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const headingVariants = cva('font-bold text-foreground', {
  variants: {
    size: {
      h1: 'text-h1',
      h2: 'text-h2',
    },
  },
  defaultVariants: { size: 'h1' },
});

type HeadingProps = React.ComponentPropsWithoutRef<typeof Text> &
  VariantProps<typeof headingVariants>;

export function Heading({ size, className, ...props }: HeadingProps) {
  return <Text className={cn(headingVariants({ size }), className)} {...props} />;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: FAILs only where other files still pass Tamagui-only props to AppText/Heading (`color="$..."`, `fontFamily`). Those are fixed in Tasks 4–8. If it fails **only** elsewhere, proceed; the typography files themselves must compile.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/typography
git commit -m "feat(mobile): migrate AppText/Heading to NativeWind"
```

---

## Task 4: Migrate interactive wrappers (Button, IconButton, Input, Chip)

**Files:**
- Modify: `apps/mobile/src/components/interactive/Button.tsx`
- Modify: `apps/mobile/src/components/interactive/IconButton.tsx`
- Modify: `apps/mobile/src/components/interactive/Input.tsx`
- Modify: `apps/mobile/src/components/interactive/Chip.tsx`

**Interfaces:**
- Produces (unchanged public props): `Button` (`variant: primary|danger|ghost`, `size: sm|md|lg`, `loading`, `disabled`, `onPress`, `children`); `IconButton` (`icon`, `variant: primary|ghost`, `loading`, `disabled`, `onPress`); `Input` (compound: `label?`, `error?`, `helper?`, `editable?`, + `TextInput` props incl. `flex`/`multiline`/`maxLength` — note `flex` becomes `className="flex-1"` at call sites); `Chip` (`label`, `selected`, `onPress`).
- Consumes: `Button` (RNR), `Input` (RNR), `Text`/`TextClassContext` from `@/components/ui/*`, `ActivityIndicator` from `react-native`, `AppText`.

- [ ] **Step 1: Rewrite `Button.tsx`** (wrap RNR `Button`; replace `Spinner` → `ActivityIndicator`)

```tsx
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button as UIButton } from '@/components/ui/button';
import { AppText } from '../typography/AppText';

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
  const textClass = variant === 'ghost' ? 'text-foreground' : 'text-primary-foreground';
  return (
    <UIButton
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      {loading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" className={textClass} />
          <AppText weight="semibold" className={textClass}>{children}</AppText>
        </View>
      ) : (
        <AppText weight="semibold" className={textClass}>{children}</AppText>
      )}
    </UIButton>
  );
}
```

> `ActivityIndicator` `color` from a class: NativeWind maps `className` color to the `color` prop for `ActivityIndicator`. If the spinner color doesn't apply in testing, fall back to `color="white"` (dark) — verify on device in Task 12.

- [ ] **Step 2: Rewrite `IconButton.tsx`**

```tsx
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { cn } from '@/lib/utils';

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
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      className={cn(
        'h-10 w-10 items-center justify-center rounded-full active:opacity-75',
        variant === 'primary' ? 'bg-primary' : 'border border-border bg-transparent',
        isDisabled && 'opacity-40',
      )}
    >
      {loading ? <ActivityIndicator size="small" className="text-primary-foreground" /> : icon}
    </Pressable>
  );
}
```

> `$lg` size token = 40px → `h-10 w-10`. `$xl` radius = 9999 → `rounded-full`.

- [ ] **Step 3: Rewrite `Input.tsx`** (compound; wraps RNR `Input`)

```tsx
import { View } from 'react-native';
import type { ComponentPropsWithoutRef } from 'react';
import { Input as UIInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';

type InputProps = ComponentPropsWithoutRef<typeof UIInput> & {
  label?: string;
  error?: string;
  helper?: string;
};

export function Input({ label, error, helper, className, ...props }: InputProps) {
  return (
    <View className="gap-1">
      {label && <AppText variant="label">{label}</AppText>}
      <UIInput className={cn(error && 'border-destructive', className)} {...props} />
      {error ? (
        <AppText variant="error">{error}</AppText>
      ) : helper ? (
        <AppText variant="caption">{helper}</AppText>
      ) : null}
    </View>
  );
}
```

> Behavior notes preserved: RNR `Input` already maps `editable === false` → `opacity-50`. Focus ring (`focusStyle` border-primary) is dropped (Tamagui-specific web behavior; RN `TextInput` has no `:focus` class) — acceptable; flag if focus styling is required. `placeholderTextColor` is handled via `placeholderClassName="text-muted-foreground"` in the primitive. The `flex` prop used at the chat call site becomes `className="flex-1"` (Task 8).

- [ ] **Step 4: Rewrite `Chip.tsx`**

```tsx
import { Pressable } from 'react-native';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-1 flex-row items-center justify-center rounded-sm border px-3 py-2 active:opacity-80',
        selected ? 'border-primary bg-primary/[0.13]' : 'border-border bg-card',
      )}
    >
      <AppText
        variant={selected ? 'body' : 'muted'}
        weight={selected ? 'semibold' : 'regular'}
        className={selected ? 'text-primary' : 'text-muted-foreground'}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: interactive files compile; remaining failures only in not-yet-migrated display/layout/screens.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/interactive
git commit -m "feat(mobile): migrate Button/IconButton/Input/Chip to NativeWind"
```

---

## Task 5: Migrate display wrappers — static (Card, Badge, Skeleton, ProgressBar, PositionBadge)

**Files:**
- Modify: `apps/mobile/src/components/display/Card.tsx`
- Modify: `apps/mobile/src/components/display/Badge.tsx`
- Modify: `apps/mobile/src/components/display/Skeleton.tsx`
- Modify: `apps/mobile/src/components/display/ProgressBar.tsx`
- Modify: `apps/mobile/src/components/display/PositionBadge.tsx`

**Interfaces:**
- Produces (unchanged props): `Card` (`variant: default|elevated|ghost`, `onPress?`, `disabled?`, `children`); `Badge` (`label`, `variant: default|success|warning|danger`); `SkeletonLine`, `SkeletonCard`; `ProgressBar` (`value: number`, `label?`); `PositionBadge` (`position: number`, `completed: boolean`).

- [ ] **Step 1: Rewrite `Card.tsx`** (own component — RNR Card primitive not used here; this wrapper has pressable + variants)

```tsx
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from '@/lib/utils';

const variantClass = {
  default: 'bg-card border border-border',
  elevated: 'bg-muted',
  ghost: 'bg-transparent border border-border',
} as const;

type CardProps = {
  variant?: 'default' | 'elevated' | 'ghost';
  onPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export function Card({ variant = 'default', onPress, disabled = false, children }: CardProps) {
  const className = cn('rounded-md p-4', variantClass[variant], disabled && 'opacity-45');
  if (onPress) {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        className={cn(className, 'active:opacity-85')}
      >
        {children}
      </Pressable>
    );
  }
  return <View className={className}>{children}</View>;
}
```

- [ ] **Step 2: Rewrite `Badge.tsx`**

```tsx
import { View } from 'react-native';
import { AppText } from '../typography/AppText';

const frameClass = {
  default: 'bg-primary/[0.13]',
  success: 'bg-success/[0.15]',
  warning: 'bg-warning/[0.15]',
  danger: 'bg-destructive/[0.15]',
} as const;

const textClass = {
  default: 'text-primary-hover',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const;

type BadgeProps = {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <View className={`self-start rounded-sm px-2 py-0.5 ${frameClass[variant]}`}>
      <AppText variant="label" className={textClass[variant]}>
        {label}
      </AppText>
    </View>
  );
}
```

- [ ] **Step 3: Rewrite `Skeleton.tsx`**

```tsx
import { View } from 'react-native';
import { cn } from '@/lib/utils';

export function SkeletonLine({ className }: { className?: string }) {
  return <View className={cn('h-4 w-full rounded-sm bg-muted opacity-50', className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return <View className={cn('h-20 w-full rounded-md bg-muted opacity-50', className)} />;
}
```

> Callers pass `width`/`height` props on `SkeletonLine` (course detail). Those call sites switch to `className="w-[70%] h-8"` etc. (Task 8). Keep the `className` pass-through above so they compose.

- [ ] **Step 4: Rewrite `ProgressBar.tsx`** (animated width via inline `style` — width % has no static class)

```tsx
import { View } from 'react-native';
import { AppText } from '../typography/AppText';

type ProgressBarProps = {
  value: number;
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View className="gap-1">
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </View>
      {label && <AppText variant="caption">{label}</AppText>}
    </View>
  );
}
```

> Dynamic `width: ${pct}%` stays inline `style` (no Tailwind class for a runtime percentage — allowed per rules). `transition="medium"` (Tamagui spring) is dropped; flag if animated fill is required (would use `react-native-reanimated`).

- [ ] **Step 5: Rewrite `PositionBadge.tsx`**

```tsx
import { View } from 'react-native';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';

type PositionBadgeProps = {
  position: number;
  completed: boolean;
};

export function PositionBadge({ position, completed }: PositionBadgeProps) {
  return (
    <View className={cn('h-8 w-8 items-center justify-center rounded-full', completed ? 'bg-success' : 'bg-muted')}>
      <AppText variant="body" weight="bold" size="sm">
        {completed ? '✓' : String(position)}
      </AppText>
    </View>
  );
}
```

> `$md` size = 32px → `h-8 w-8`.

- [ ] **Step 6: Typecheck & commit**

```bash
pnpm --filter @autodidact/mobile typecheck
git add apps/mobile/src/components/display/Card.tsx apps/mobile/src/components/display/Badge.tsx apps/mobile/src/components/display/Skeleton.tsx apps/mobile/src/components/display/ProgressBar.tsx apps/mobile/src/components/display/PositionBadge.tsx
git commit -m "feat(mobile): migrate Card/Badge/Skeleton/ProgressBar/PositionBadge to NativeWind"
```

---

## Task 6: Migrate display wrappers — content & animated (ChatBubble, EmptyState, Toast, ToastProvider)

**Files:**
- Modify: `apps/mobile/src/components/display/ChatBubble.tsx`
- Modify: `apps/mobile/src/components/display/EmptyState.tsx`
- Modify: `apps/mobile/src/components/display/Toast.tsx`
- Modify: `apps/mobile/src/components/display/ToastProvider.tsx`

**Interfaces:**
- Produces (unchanged props): `ChatBubble` (`message: ChatMessage`, `isStreaming?`); `EmptyState` (`message`, `icon?`, `action?`); `Toast` (`id`, `message`, `variant`); `ToastProvider` (no props).
- Consumes: `AppText`, `parseMarkdown`/`Segment` (`@/lib/markdown` — unchanged), `Ionicons`, `Button`, `useToastStore`, `useSafeAreaInsets`, `Animated` from `react-native` (replaces Tamagui `AnimatePresence`).

- [ ] **Step 1: Rewrite `ChatBubble.tsx`** — replace `YStack`→`View`; `$mono`→`font-mono`; bubble colors → classes; user-bubble text → `text-primary-foreground`

Full file:

```tsx
import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { parseMarkdown, type Segment } from '../../lib/markdown';
import type { ChatMessage } from '@autodidact/types';

type ChatBubbleProps = {
  message: ChatMessage;
  isStreaming?: boolean;
};

function formatTime(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function InlineContent({ segments, textClass }: { segments: Segment[]; textClass?: string }) {
  return (
    <AppText variant="body" className={textClass}>
      {segments.map((seg, i) => {
        if (seg.type === 'bold') {
          return <AppText key={i} weight="bold" className={textClass}>{seg.content}</AppText>;
        }
        if (seg.type === 'code') {
          return (
            <AppText key={i} className="font-mono rounded-sm bg-muted px-1">
              {` ${seg.content} `}
            </AppText>
          );
        }
        return <AppText key={i} className={textClass}>{seg.content}</AppText>;
      })}
    </AppText>
  );
}

function MarkdownContent({ content, textClass }: { content: string; textClass?: string }) {
  const segments = parseMarkdown(content);

  if (!segments.some((s) => s.type === 'codeblock')) {
    return <InlineContent segments={segments} textClass={textClass} />;
  }

  const nodes: React.ReactNode[] = [];
  let buf: Segment[] = [];
  let k = 0;

  const flush = () => {
    if (buf.length > 0) {
      nodes.push(<InlineContent key={k++} segments={buf} textClass={textClass} />);
      buf = [];
    }
  };

  for (const seg of segments) {
    if (seg.type === 'codeblock') {
      flush();
      nodes.push(
        <View key={k++} className="mt-2 rounded-sm bg-muted p-3">
          <AppText variant="body" size="sm" className="font-mono">{seg.content.trim()}</AppText>
        </View>,
      );
    } else {
      buf.push(seg);
    }
  }
  flush();

  return <View className="gap-1">{nodes}</View>;
}

export function ChatBubble({ message, isStreaming = false }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const timeLabel = !isStreaming && message.createdAt ? formatTime(message.createdAt) : '';
  const bubbleTextClass = isUser ? 'text-primary-foreground' : 'text-foreground';

  return (
    <View className={`max-w-[85%] gap-1 ${isUser ? 'self-end' : 'self-start'}`}>
      <View
        className={[
          'rounded-lg p-3',
          isUser ? 'bg-user-bubble rounded-br-sm' : 'bg-assistant-bubble rounded-bl-sm border border-border',
        ].join(' ')}
      >
        <MarkdownContent content={message.content} textClass={bubbleTextClass} />
        {isStreaming && <AppText variant="body" className="text-primary">▋</AppText>}
      </View>
      {timeLabel ? (
        <AppText variant="caption" className={`px-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {timeLabel}
        </AppText>
      ) : null}
    </View>
  );
}
```

> Asymmetric corners: `borderBottomRightRadius/$sm` etc. → `rounded-br-sm`/`rounded-bl-sm` on top of `rounded-lg`. Inline `code` background uses `bg-muted` (was `$surfaceHover`).

- [ ] **Step 2: Rewrite `EmptyState.tsx`** — replace `useTheme().textMuted.get()` with a resolved color

```tsx
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { AppText } from '../typography/AppText';
import { Button } from '../interactive/Button';

type EmptyStateProps = {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ message, icon, action }: EmptyStateProps) {
  const { colorScheme } = useColorScheme();
  const mutedColor = colorScheme === 'dark' ? '#94a3b8' : '#64748b';

  return (
    <View className="flex-1 items-center justify-center gap-4 pt-10">
      {icon && <Ionicons name={icon} size={48} color={mutedColor} />}
      <AppText variant="muted" className="text-center">
        {message}
      </AppText>
      {action && (
        <Button variant="ghost" size="sm" onPress={action.onPress}>
          {action.label}
        </Button>
      )}
    </View>
  );
}
```

> `Ionicons` needs a literal `color` (not a class). Resolve from `useColorScheme()` (nativewind) → muted-foreground hex per theme (dark `#94a3b8` slate400, light `#64748b` slate500). This pattern recurs in screens that read `theme.*.get()` (Task 8).

- [ ] **Step 3: Rewrite `Toast.tsx`** — drop Tamagui enter/exit anim props (handled by ToastProvider's Animated wrapper); map bg/border/text to classes

```tsx
import { useEffect } from 'react';
import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { useToastStore, type ToastVariant } from '../../stores/toast.store';

const frameClass: Record<ToastVariant, string> = {
  success: 'bg-success/[0.15] border-success',
  error: 'bg-destructive/[0.15] border-destructive',
  info: 'bg-card border-border',
};

const textClass: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-foreground',
};

type ToastProps = {
  id: string;
  message: string;
  variant: ToastVariant;
};

export function Toast({ id, message, variant }: ToastProps) {
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), 3000);
    return () => clearTimeout(timer);
  }, [id, removeToast]);

  return (
    <View className={`flex-row items-center gap-2 rounded-md border px-4 py-3 ${frameClass[variant]}`}>
      <AppText weight="semibold" className={`flex-1 ${textClass[variant]}`}>
        {message}
      </AppText>
    </View>
  );
}
```

- [ ] **Step 4: Rewrite `ToastProvider.tsx`** — replace Tamagui `AnimatePresence` with RN `Animated` fade-in

```tsx
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../stores/toast.store';
import { Toast } from './Toast';

function AnimatedToast({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      pointerEvents="none"
      className="absolute left-4 right-4 z-50 gap-2"
      style={{ top: insets.top + 8 }}
    >
      {toasts.map((toast) => (
        <AnimatedToast key={toast.id}>
          <Toast {...toast} />
        </AnimatedToast>
      ))}
    </Animated.View>
  );
}
```

> `top={insets.top+8}` is dynamic → inline `style`. `zIndex $lg` (300) → `z-50` (Tailwind max; sufficient for an overlay). Exit animation is dropped (AnimatePresence-only feature); flag if exit fade is required — would need `react-native-reanimated`'s `Layout`/`exiting`.

- [ ] **Step 5: Typecheck & commit**

```bash
pnpm --filter @autodidact/mobile typecheck
git add apps/mobile/src/components/display/ChatBubble.tsx apps/mobile/src/components/display/EmptyState.tsx apps/mobile/src/components/display/Toast.tsx apps/mobile/src/components/display/ToastProvider.tsx
git commit -m "feat(mobile): migrate ChatBubble/EmptyState/Toast/ToastProvider to NativeWind"
```

---

## Task 7: Migrate layout wrappers (Screen, ErrorBoundary)

**Files:**
- Modify: `apps/mobile/src/components/layout/Screen.tsx`
- Modify: `apps/mobile/src/components/layout/ErrorBoundary.tsx`

**Interfaces:**
- Produces (unchanged props): `Screen` (`children`, `scroll?`, `padding?`); `ErrorBoundary` (class component, `children`).
- Consumes: `ScrollView`, `View` from `react-native` (replaces Tamagui `ScrollView`/`YStack`); `SafeAreaView` (unchanged); `AppText`, `Button`, `Card`.

- [ ] **Step 1: Rewrite `Screen.tsx`**

```tsx
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '@/lib/utils';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padding?: boolean;
};

export function Screen({ children, scroll = false, padding = true }: ScreenProps) {
  const inner = <View className={cn('flex-1 bg-background', padding && 'p-4')}>{children}</View>;

  if (scroll) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView className="bg-background" contentContainerStyle={{ flexGrow: 1 }}>
          {inner}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={{ flex: 1 }}>{inner}</SafeAreaView>;
}
```

- [ ] **Step 2: Rewrite `ErrorBoundary.tsx`** (keep class component + lifecycle; swap `YStack`→`View`)

```tsx
import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { Button } from '../interactive/Button';
import { Card } from '../display/Card';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
          <Card variant="default">
            <View className="items-center gap-3">
              <AppText variant="body" weight="semibold" className="text-center">
                Something went wrong
              </AppText>
              <AppText variant="muted" className="text-center">
                An unexpected error occurred. Please try again.
              </AppText>
              <Button variant="ghost" size="md" onPress={() => this.setState({ hasError: false })}>
                Try again
              </Button>
            </View>
          </Card>
        </View>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 3: Typecheck & commit**

```bash
pnpm --filter @autodidact/mobile typecheck
git add apps/mobile/src/components/layout
git commit -m "feat(mobile): migrate Screen/ErrorBoundary to NativeWind"
```

---

## Task 8: Migrate screens & `(app)/_layout` (remove raw Tamagui primitives from `app/`)

**Files (each modified):**
- `apps/mobile/app/(app)/_layout.tsx` — `useTheme` → resolved theme colors object
- `apps/mobile/app/(app)/index.tsx` — `XStack/YStack` → `View`
- `apps/mobile/app/(app)/profile.tsx` — `YStack` → `View`; `color="$success"` → `className="text-success"`
- `apps/mobile/app/(auth)/sign-in.tsx` — `YStack` → `View`
- `apps/mobile/app/(auth)/sign-up.tsx` — `YStack` → `View`
- `apps/mobile/app/(app)/courses/index.tsx` — `useTheme`, `XStack/YStack` → `View`; `theme.primary.get()` → hex
- `apps/mobile/app/(app)/courses/[id]/index.tsx` — same; `SkeletonLine width/height` → className
- `apps/mobile/app/(app)/courses/[id]/modules/[moduleId]/chat.tsx` — `XStack/YStack/Spinner` → `View`/`ActivityIndicator`; `Input flex` → `className="flex-1"`

**Interfaces:**
- Consumes: migrated `@/components` (Tasks 3–7), `View`/`ActivityIndicator`/`FlatList`/`RefreshControl` from `react-native`.
- Produces: zero `tamagui` imports in `app/`.

**Mechanical substitution rules (apply uniformly):**
- `import { XStack, YStack } from 'tamagui'` → delete; use `import { View } from 'react-native'` (merge with existing RN import).
- `<YStack …>` → `<View className="…">` (flex-col is RN default). `<XStack …>` → `<View className="flex-row items-center …">` (Tamagui XStack defaults `alignItems: center`? No — only `flexDirection: row`. Add `items-*` only where the original set `alignItems`).
- Props → classes: `gap="$N"`→`gap-N`, `padding="$N"`→`p-N`, `paddingTop="$N"`→`pt-N`, `paddingVertical="$N"`→`py-N`, `paddingHorizontal="$N"`→`px-N`, `marginBottom="$N"`→`mb-N`, `marginTop="$N"`→`mt-N`, `marginRight="$N"`→`mr-N`, `flex={1}`→`flex-1`, `alignItems="center"`→`items-center`, `justifyContent="center"`→`justify-center`, `justifyContent="space-between"`→`justify-between`, `alignItems="flex-start"`→`items-start`, `alignItems="flex-end"`→`items-end`.
- Color props on `AppText`: `color="$success"`→`className="text-success"`, `color="$text"`→`className="text-foreground"`, `color="$primary"`→`className="text-primary"`.
- `Spinner` → `ActivityIndicator` (RN); `color="$primary"` → `className="text-primary"` (or literal color if class fails on device).
- `useTheme()` + `theme.X.get()` (used only for non-className APIs: `Tabs.screenOptions`, `RefreshControl.tintColor`) → a small literal color map keyed by current scheme (see Step 1).

- [ ] **Step 1: `app/(app)/_layout.tsx`** — replace `useTheme` with `useColorScheme` + a theme color map (Tabs `screenOptions` needs literal colors, not classes)

```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

const COLORS = {
  dark:  { bg: '#0f172a', text: '#f1f5f9', surface: '#1e293b', border: '#334155', primary: '#6366f1', textMuted: '#94a3b8' },
  light: { bg: '#ffffff', text: '#0f172a', surface: '#ffffff', border: '#e2e8f0', primary: '#6366f1', textMuted: '#64748b' },
} as const;

export default function AppLayout() {
  const { colorScheme } = useColorScheme();
  const theme = COLORS[colorScheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
      }}
    >
      {/* Tabs.Screen entries unchanged */}
      <Tabs.Screen name="index" options={{ title: 'Learn', tabBarIcon: ({ color, size }) => (<Ionicons name="book-outline" color={color} size={size} />) }} />
      <Tabs.Screen name="courses/index" options={{ title: 'My Courses', tabBarIcon: ({ color, size }) => (<Ionicons name="library-outline" color={color} size={size} />) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => (<Ionicons name="person-outline" color={color} size={size} />) }} />
    </Tabs>
  );
}
```

> The `COLORS` map duplicates four theme values for the two RN APIs that can't take classes (`Tabs.screenOptions`, `RefreshControl.tintColor`). This is the documented exception to "no literal colors" — RN navigation/refresh APIs accept only color strings. Keep it minimal.

- [ ] **Step 2: `app/(app)/index.tsx`** — swap `XStack/YStack`→`View`; apply substitution rules. Key changes: outer `<YStack gap="$6" paddingTop="$6">`→`<View className="gap-6 pt-6">`; difficulty row `<XStack gap="$3">`→`<View className="flex-row gap-3">`; inner label group `<YStack gap="$2">`→`<View className="gap-2">`. `AppText variant="error" textAlign="center"`→`className="text-center"`.

- [ ] **Step 3: `app/(app)/profile.tsx`** — `<YStack gap="$4" paddingTop="$4">`→`<View className="gap-4 pt-4">`; nested `<YStack marginTop="$2" gap="$1">`→`<View className="mt-2 gap-1">`; `<AppText variant="body" color="$success">`→`<AppText variant="body" className="text-success">`.

- [ ] **Step 4: `app/(auth)/sign-in.tsx`** — outer `<YStack flex={1} justifyContent="center" gap="$4">`→`<View className="flex-1 justify-center gap-4">`; header `<YStack gap="$2" marginBottom="$6">`→`<View className="gap-2 mb-6">`; fields `<YStack gap="$3">`→`<View className="gap-3">`.

- [ ] **Step 5: `app/(auth)/sign-up.tsx`** — same pattern as sign-in for all `YStack`s: `flex={1} justifyContent="center" gap="$4"`→`flex-1 justify-center gap-4`; `gap="$2" marginBottom="$4"`→`gap-2 mb-4`; `gap="$3"`→`gap-3`. (Two render branches — apply to both.)

- [ ] **Step 6: `app/(app)/courses/index.tsx`** — remove `useTheme`; add `useColorScheme` + reuse a `primary` hex for `RefreshControl tintColor` (`colorScheme==='dark' ? '#6366f1' : '#6366f1'` — same indigo both themes, so just `'#6366f1'`). Skeleton wrapper `<YStack gap="$3" paddingVertical="$1">`→`<View className="gap-3 py-1">`. `renderItem` card inner: `<XStack justifyContent="space-between" alignItems="flex-start" marginBottom="$2">`→`<View className="flex-row justify-between items-start mb-2">`; `<YStack flex={1} marginRight="$2">`→`<View className="flex-1 mr-2">`; completed `<YStack marginTop="$2">`→`<View className="mt-2">`; `<AppText variant="body" color="$success" size="sm">`→`className="text-success"`.

```tsx
// tintColor: indigo is identical in both themes, so a literal is fine:
refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#6366f1" />}
```

- [ ] **Step 7: `app/(app)/courses/[id]/index.tsx`** — remove `useTheme`; `RefreshControl tintColor="#6366f1"`. `LoadingSkeleton`: `<YStack gap="$3" paddingVertical="$1">`→`<View className="gap-3 py-1">`; `<SkeletonLine width="70%" height={32} />`→`<SkeletonLine className="w-[70%] h-8" />`; `<SkeletonLine width="100%" />`→`<SkeletonLine />`; `<SkeletonLine width="100%" height={6} />`→`<SkeletonLine className="h-1.5" />`. `ListHeaderComponent` `<YStack gap="$4" marginBottom="$4">`→`<View className="gap-4 mb-4">`. `renderItem` card inner `<XStack alignItems="center" gap="$3" marginBottom="$2">`→`<View className="flex-row items-center gap-3 mb-2">`; `<YStack flex={1}>`→`<View className="flex-1">`; `<AppText variant="muted" size="xl">›</AppText>` unchanged (no color prop).

- [ ] **Step 8: `app/(app)/courses/[id]/modules/[moduleId]/chat.tsx`** — replace `import { XStack, YStack, Spinner } from 'tamagui'` with `ActivityIndicator` (add to the existing `react-native` import) and `View`. `UpArrow`: `<AppText variant="body" weight="bold" color="$text">↑</AppText>`→`className="text-foreground"`. Loading branch `<YStack flex={1} alignItems="center" justifyContent="center" gap="$3">`→`<View className="flex-1 items-center justify-center gap-3">`; `<Spinner color="$primary" />`→`<ActivityIndicator className="text-primary" />` (or `color="#6366f1"` fallback). Main `<YStack flex={1} backgroundColor="$bg">`→`<View className="flex-1 bg-background">`. Input bar `<XStack padding="$3" gap="$2" borderTopWidth={1} borderTopColor="$border" backgroundColor="$surface" alignItems="flex-end">`→`<View className="flex-row items-end gap-2 border-t border-border bg-card p-3">`. `<Input flex={1} … />`→`<Input className="flex-1" … />`.

- [ ] **Step 9: Typecheck**

```bash
pnpm --filter @autodidact/mobile typecheck
```

Expected: **PASS** (all `app/` and `src/components/` Tamagui usage now gone except design files + providers, removed in Tasks 9–10). If failures remain, they must be only in `app/_layout.tsx`, `src/test-utils/render.tsx`, or `src/design/*` (handled next).

- [ ] **Step 10: Commit**

```bash
git add "apps/mobile/app"
git commit -m "feat(mobile): migrate all screens off Tamagui primitives to NativeWind"
```

---

## Task 9: Root layout dark/light wiring + test harness

**Files:**
- Modify: `apps/mobile/app/_layout.tsx` — replace `TamaguiProvider` with a NativeWind dark-mode driver
- Modify: `apps/mobile/src/test-utils/render.tsx` — drop `TamaguiProvider`

**Interfaces:**
- Consumes: `useColorScheme` (nativewind), `useColorScheme` (react-native, aliased), `View` from `react-native`.
- Produces: app renders with system-driven dark/light; `.dark` class applied at the root for `darkMode: 'class'`.

- [ ] **Step 1: Rewrite `app/_layout.tsx`** — remove `TamaguiProvider`/`config`; wire color scheme (spec STEP 5)

```tsx
import { useEffect } from 'react';
import { View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme } from 'nativewind';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { ErrorBoundary, ToastProvider } from '@/components';
import '@/global.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const { accessToken, refreshToken, setSession, clearSession } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();
  const { colorScheme, setColorScheme } = useColorScheme();
  const rnScheme = useRNColorScheme();

  useEffect(() => {
    setColorScheme(rnScheme ?? 'light');
  }, [rnScheme, setColorScheme]);

  // …(keep the three existing auth/session useEffects verbatim)…

  return (
    <View className={colorScheme === 'dark' ? 'dark flex-1' : 'flex-1'}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <Slot />
        </ErrorBoundary>
        <ToastProvider />
      </QueryClientProvider>
    </View>
  );
}
```

> Preserve the three existing `useEffect` blocks (session restore, `onAuthStateChange`, auth-guard redirect) exactly — only the provider wrapper and color-scheme wiring change. The root `<View className="dark …">` drives `darkMode: 'class'`. **Default-to-dark option:** the spec says `setColorScheme(rnScheme ?? 'light')`; since the app historically shipped **dark-only**, if the product intent is "dark unless the OS says light," this is correct (OS light → light, OS dark/unset → dark only when OS is dark). To force the old always-dark behavior, call `setColorScheme('dark')` instead — confirm desired default during validation (Task 12).

- [ ] **Step 2: Rewrite `src/test-utils/render.tsx`** — no provider needed (NativeWind works via babel transform)

```tsx
import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';

/** Render a component tree. NativeWind resolves classes via the babel transform — no provider required. */
export function renderWithProviders(ui: ReactElement) {
  return render(ui);
}
```

- [ ] **Step 3: Run the full test suite**

```bash
pnpm --filter @autodidact/mobile test
```

Expected: PASS. Existing component tests (`ChatBubble.test.tsx`, `UpgradeAccountCard.test.tsx`, `sign-in.test.tsx`) render through `renderWithProviders` and assert on text/roles — which still resolve. If any test asserted Tamagui-specific style output, update the assertion to query by text/role (these tests assert behavior/text, per the audit, so changes should be minimal/none).

- [ ] **Step 4: Typecheck & commit**

```bash
pnpm --filter @autodidact/mobile typecheck
git add apps/mobile/app/_layout.tsx apps/mobile/src/test-utils/render.tsx
git commit -m "feat(mobile): drive dark/light via NativeWind; drop TamaguiProvider from layout + tests"
```

---

## Task 10: Remove Tamagui entirely

**Files:**
- Modify: `apps/mobile/package.json` (remove `tamagui`, `@tamagui/*`)
- Modify: `apps/mobile/babel.config.js` (remove `@tamagui/babel-plugin`)
- Modify: `apps/mobile/metro.config.js` (remove `unstable_enablePackageExports`)
- Modify: `apps/mobile/jest.config.js` (drop `@tamagui|tamagui` from `transformIgnorePatterns`)
- Delete: `apps/mobile/src/design/config.ts`, `themes.ts`, `tokens.ts`, `typography.ts`, `src/design/README.md`
- Delete: `apps/mobile/src/design/` directory (now empty)

**Interfaces:** Produces: zero Tamagui in the tree; `grep` clean.

- [ ] **Step 1: Remove Tamagui deps**

```bash
cd apps/mobile
pnpm remove tamagui @tamagui/animations-react-native @tamagui/babel-plugin
```

- [ ] **Step 2: Update `babel.config.js`** — drop the Tamagui plugin (presets stay)

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
```

- [ ] **Step 3: Update `metro.config.js`** — drop `enablePackageExports` (was Tamagui-only)

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css' });
```

- [ ] **Step 4: Update `jest.config.js`** — remove `@tamagui|tamagui` from the `transformIgnorePatterns` negative-lookahead (leave the rest intact):

```js
// before: …|native-base|react-native-svg|@tamagui|tamagui|uuid|@autodidact))
// after:  …|native-base|react-native-svg|nativewind|react-native-css-interop|uuid|@autodidact))
```

> Add `nativewind|react-native-css-interop` (NativeWind ships untranspiled ESM that jest-expo must transform). Verify the exact package dir names if tests fail to parse.

- [ ] **Step 5: Delete the design folder**

```bash
git rm apps/mobile/src/design/config.ts apps/mobile/src/design/themes.ts apps/mobile/src/design/tokens.ts apps/mobile/src/design/typography.ts apps/mobile/src/design/README.md
```

- [ ] **Step 6: Verify zero Tamagui references**

```bash
grep -rn "tamagui" apps/mobile/src apps/mobile/app --include="*.ts" --include="*.tsx"   # Expected: no output
grep -rn "tamagui" apps/mobile/babel.config.js apps/mobile/metro.config.js apps/mobile/jest.config.js apps/mobile/package.json   # Expected: no output
```

- [ ] **Step 7: Full verification**

```bash
pnpm --filter @autodidact/mobile typecheck   # Expected: PASS
pnpm --filter @autodidact/mobile test        # Expected: PASS
pnpm --filter @autodidact/mobile start       # bundle once; Expected: no "tamagui" resolution
```

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/package.json apps/mobile/pnpm-lock.yaml ../../pnpm-lock.yaml apps/mobile/babel.config.js apps/mobile/metro.config.js apps/mobile/jest.config.js apps/mobile/src/design
git commit -m "feat(mobile): remove Tamagui (packages, babel/metro/jest config, design tokens)"
```

---

## Task 11: Documentation & ADR updates (required by root CLAUDE.md pruning/compounding rules)

**Files:**
- Create: `docs/architecture/ADRs/apps/mobile/ADR-026-mobile-ui-system-nativewind.md` (supersedes ADR-013)
- Modify: `docs/architecture/ADRs/apps/mobile/ADR-013-mobile-ui-system.md` (status → Superseded)
- Modify: `apps/mobile/CLAUDE.md` (UI invariants, library rules, source-of-truth, entry points)
- Modify: `apps/mobile/README.md` (stack table, folder map, ADR link)
- Modify: `apps/mobile/docs/ui-system.md` (rewrite for NativeWind)
- Modify: `apps/mobile/docs/frontend-architecture.md` (provider stack — remove TamaguiProvider)
- Modify: `docs/stack.md`, `docs/PROJECT_STATE.md`, `docs/architecture/ADRs/README.md` (Tamagui→NativeWind references)

**Interfaces:** Documentation only — no code. Keep updates short, factual, link upward (root CLAUDE.md README-style rule).

- [ ] **Step 1: Write ADR-026** (use the `write-adr` skill / existing ADR template). Status `Accepted`, date 2026-06-21, "Supersedes ADR-013." Context: ADR-013's reconsideration flag (NativeWind lighter for RN-only, no web target) — this migration is its documented trigger. Decision: NativeWind v4 + React Native Reusables (copy-paste components in `src/components/ui/`), Tailwind tokens via `src/global.css` CSS variables (light+dark). Consequences: no compiler/babel-plugin theme bootstrap; tokens are CSS vars not `createTokens`; RNR components are owned in-repo (no upstream dep).

- [ ] **Step 2: Mark ADR-013 Superseded** — change the status line to `⬛ Superseded by [ADR-026](./ADR-026-mobile-ui-system-nativewind.md)` and add a one-line note; leave the body as historical record.

- [ ] **Step 3: Update `apps/mobile/CLAUDE.md`** — replace the four UI invariants:
  - "Tamagui only — do not mix StyleSheet.create…" → "**NativeWind v4 only** for styling (`className`); React Native Reusables primitives live in `@/components/ui/`. Do not mix `StyleSheet.create` or other styling libraries. Inline `style` only for runtime-dynamic values with no class equivalent (e.g. progress width %, safe-area insets, RN navigation `screenOptions`/`tintColor` colors)."
  - "All design tokens flow through `src/design/`" → "**All design tokens are CSS variables in [`src/global.css`](./src/global.css)** consumed via [`tailwind.config.js`](./tailwind.config.js) — never hardcode hex/spacing in components; add tokens there only."
  - "Screens import only from `@/components`…no raw Tamagui primitives" → keep, reword "no raw Tamagui primitives" → "no styled primitives; screens compose `@/components` + plain RN `View`/`Text` with `className`."
  - Remove the `config.ts` circular-dependency invariant (file deleted).
  - In **Library/tooling rules**: `Tamagui 2 for UI` → `NativeWind v4 + React Native Reusables`. In **Source of truth**: `src/design/` → `src/global.css` + `tailwind.config.js`. In **Entry points** + **Testing rules**: "TamaguiProvider" → remove; "Component tests render through the app's Tamagui config / `renderWithProviders` (wraps TamaguiProvider)" → "`renderWithProviders` renders directly; NativeWind resolves classes via the babel transform." Update the ADR-013 link to ADR-026.

- [ ] **Step 4: Update `apps/mobile/README.md`** — stack table row `UI library | Tamagui | 2.0.0-rc.41` → `UI / styling | NativeWind + React Native Reusables | 4.x`; remove the RC-pin caveat paragraph (lines ~22); folder map `_layout.tsx # Root: TamaguiProvider…` → `…NativeWind dark-mode root…`; add `src/components/ui/` (RNR primitives) and `src/global.css` to the folder map; ADR-013 link → ADR-026.

- [ ] **Step 5: Rewrite `apps/mobile/docs/ui-system.md`** — replace the `src/design/` section with the `global.css` (CSS vars: light `:root` + `.dark`) + `tailwind.config.js` model; keep the `src/components/` catalog (now NativeWind-based) and add the `src/components/ui/` RNR primitive list; update the token table to the semantic Tailwind names from this plan's Color Token Map; replace "Reference in Tamagui props as `$primary`" with "Reference as Tailwind classes `bg-primary`, `text-muted-foreground`, etc." Update `frontend-architecture.md` provider-stack section (drop TamaguiProvider; note the NativeWind dark root `View`).

- [ ] **Step 6: Sweep remaining doc references** — update `docs/stack.md`, `docs/PROJECT_STATE.md`, `docs/architecture/ADRs/README.md` Tamagui→NativeWind one-liners. (Leave historical `docs/superpowers/plans/*` and `specs/*` untouched — they're dated records.)

- [ ] **Step 7: Commit**

```bash
git add docs/architecture/ADRs/apps/mobile/ADR-026-mobile-ui-system-nativewind.md docs/architecture/ADRs/apps/mobile/ADR-013-mobile-ui-system.md apps/mobile/CLAUDE.md apps/mobile/README.md apps/mobile/docs/ui-system.md apps/mobile/docs/frontend-architecture.md docs/stack.md docs/PROJECT_STATE.md docs/architecture/ADRs/README.md
git commit -m "docs(mobile): record NativeWind migration (ADR-026 supersedes ADR-013; update CLAUDE.md, README, ui-system)"
```

---

## Task 12: End-to-end validation on the Android emulator

**Files:** none (validation only).

- [ ] **Step 1: Boot the app** — use the `run-mobile` skill (or `pnpm emulator` then `pnpm mobile:run` from `apps/mobile`, per its CLAUDE.md). Confirm Metro bundles with no Tamagui/NativeWind errors.

- [ ] **Step 2: Walk every screen** (drive via mobile-mcp). Verify render + interactions, comparing against pre-migration dark appearance:
  - **sign-in** — heading, subtitle, two inputs, Sign In / Sign up / Continue-as-guest buttons (ghost vs primary), guest loading spinner.
  - **sign-up** — three inputs, confirm-password inline error (`text-destructive`), success "Check your email" branch.
  - **home `(app)/index`** — Heading, multiline topic Input, difficulty Chips (selected = indigo border + tint), Start button loading state, error text.
  - **courses list** — skeletons → cards; Badge difficulty; pull-to-refresh tint (indigo); EmptyState (icon color, ghost action button).
  - **course detail** — header Heading/desc/ProgressBar (fill width %), module Cards with PositionBadge (✓/number, success vs muted), locked/disabled opacity.
  - **chat** — session ActivityIndicator; user bubble (indigo, `text-primary-foreground`, rounded-br-sm) vs assistant bubble (card/muted, border, rounded-bl-sm); inline `code` + code block mono background; streaming ▋ cursor; Input `flex-1` + send IconButton (primary, disabled/loading).
  - **profile** — UpgradeAccountCard (guest only) Inputs+Button; progress Card (`text-success` completed count); email Card (elevated/muted); danger Sign Out button.
  - **tab bar** — active/inactive tint, header colors (from the `COLORS` map).

- [ ] **Step 3: Dark/light toggle** — change the emulator system theme (Settings → Display → Dark theme, or `adb shell "cmd uimode night yes|no"`). Confirm: dark = byte-identical to pre-migration; light = legible (indigo buttons keep white text, cards white, borders slate200, muted text readable). Decide the default-scheme behavior (Task 9 Step 1 note) and lock it in.

- [ ] **Step 4: Final grep gate**

```bash
grep -r "tamagui" apps/mobile/src apps/mobile/app --include="*.ts" --include="*.tsx"   # Expected: zero output
```

- [ ] **Step 5: Report** — summarize per-screen results, any dropped behaviors flagged during migration (input focus ring, ProgressBar spring, Toast exit animation), and the chosen default color scheme. Open follow-ups only if validation surfaces a real regression.

---

## Self-Review

**Spec coverage** (STEP 0–6 + Rules):
- STEP 0 (audit) → done inline (this plan's Color Token Map + per-file tasks encode it).
- STEP 1 (remove Tamagui) → **Task 10**, deliberately reordered to last (rationale: coexistence keeps a green build at every gate; the spec's "remove first + verify build" is internally unsatisfiable while 32 files still import Tamagui). Flagged.
- STEP 2 (install/config NativeWind) → **Task 1**, with the `nativewind/babel` **preset** correction (spec's "plugins array" is v2 and would break) and `darkMode: 'class'`, content globs, full semantic color map.
- STEP 3 (RNR) → **Task 2** (cn + button/card/input/text/separator, `@/` alias not `~/`, only audited components).
- STEP 4 (migrate components) → **Tasks 3–8**, every file from the import audit, with explicit class mappings.
- STEP 5 (dark mode) → **Task 9** (exact spec snippet) + authored light palette (Task 1 `global.css`).
- STEP 6 (validate) → **Task 12** (emulator walk + grep gate).
- Rules: never reinstall Tamagui ✓; no inline styles where a class exists ✓ (inline `style` only for runtime-dynamic values, documented); only-needed RNR components ✓; config not modified post-Task-2 without flagging ✓ (any later token need is flagged); no-equivalent → plain RN View/Text + classes ✓ (Toast/ProgressBar/ChatBubble).

**Placeholder scan:** no TBD/"handle edge cases"/"similar to Task N" — each component has full code or an explicit per-file class substitution list.

**Type consistency:** `cn`, `Text`/`TextClassContext`, `Button`/`buttonVariants`, `Input`, `Card*`, `Separator`, `AppText`/`Heading` prop surfaces are defined in Tasks 2–3 and consumed unchanged in 4–9; wrapper public props (Button/Input/Card/Badge/etc.) are preserved exactly so screen call sites compile without prop changes (except the documented `flex`→`className="flex-1"` and `color="$x"`→`className`).

**Flagged deviations / open decisions** (require a yes/no during execution, not blockers):
1. STEP 1 reordered to last (build-integrity).
2. `nativewind/babel` preset vs plugin (spec error corrected).
3. `~/` → `@/` alias (repo convention).
4. Default color scheme: `rnScheme ?? 'light'` (spec) vs forcing `'dark'` (historical behavior) — confirm in Task 12.
5. Dropped Tamagui-only behaviors: Input focus ring, ProgressBar spring transition, Toast exit animation — re-add via reanimated only if required.
6. No `secondary` token created (audit found none) — add if later needed.
