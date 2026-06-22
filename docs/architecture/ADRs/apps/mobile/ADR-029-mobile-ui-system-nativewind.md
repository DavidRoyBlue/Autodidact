# ADR-029: Mobile UI system — NativeWind + React Native Reusables

## Status

Accepted
Date: 2026-06-22
Supersedes [ADR-013](./ADR-013-mobile-ui-system.md)

## Context

ADR-013 chose Tamagui for the mobile UI system, but marked the decision `🚩 Accepted with reconsideration flag`. The flag stated: NativeWind is a lighter, more idiomatic fit for our React-Native-only app; Tamagui's biggest differentiator (compile-time CSS atomization for web) doesn't pay off without a web target. The listed migration triggers were a planned UI refresh, sustained Tamagui RC churn, or measurable bundle-weight impact on launch.

By mid-2026 two of those triggers had fired:
1. **Sustained RC churn.** Tamagui remained pinned at `2.0.0-rc.41` — a release candidate — with API drift across RC versions. The token-caching bug (clearing `$TMPDIR/metro-cache` + `.tamagui` on every token edit) became a recurring dev friction point.
2. **Planned UI refresh.** The June 2026 work cycle included a full-screen redesign pass — a natural rewrite moment.

This ADR records the decision made during that migration. The app has no web target; it is `apps/mobile` only, running on Expo SDK 52 + React Native 0.76 + Expo Router 4.

## Non-goals

- Specific color values or token names — those are owned by [`src/global.css`](../../../../apps/mobile/src/global.css).
- Component implementation details — owned by `apps/mobile/src/components/` and `apps/mobile/src/components/ui/`.
- Navigation, state management, or auth patterns — owned by ADR-014, ADR-015, ADR-020 respectively.
- Any future web target — if a web app is added, this ADR will need revisiting.

## Decision Drivers

- **Idiomatic fit for RN-only** — Tamagui's compile-time cross-platform web/native optimization is irrelevant with no web app; we should pay only for what we use.
- **Onboarding cost** — Tailwind is the de-facto styling language in 2026; any dev familiar with Tailwind can read and contribute immediately.
- **Bundle size** — fewer bytes shipped to every user's device without the Tamagui compiler runtime.
- **RC / stability risk** — staying on Tamagui `2.0.0-rc.41` with no GA release means ongoing churn risk.
- **In-repo component ownership** — we author our own UI components; we don't need a large upstream component library.
- **Dark + light theming** — system-driven (RN `useColorScheme()`) with no hard-coded theme bootstrap.
- **Developer tooling simplicity** — remove the Tamagui babel plugin, compiler, and theme bootstrap ceremony.

## Options Considered

### Option A: Stay with Tamagui (status quo)

**What it is:** Keep Tamagui `2.0.0-rc.41` pinned; wait for the GA `2.0.0` release before upgrading.

**Pros**
- No migration work; existing code continues to function.
- Tamagui's cross-platform story remains available if a web target is added later.
- TypeScript theme tokens are fully typed.

**Cons**
- RC churn is ongoing; GA `2.0.0` has not shipped as of mid-2026. Each RC bump risks API drift.
- The token-cache invalidation bug (`$TMPDIR/metro-cache` + `.tamagui` must be cleared on every token edit) is reproducible and unresolved upstream.
- Tamagui's cross-platform compile-time differentiator does not benefit us — we have no web app.
- Smaller community than NativeWind in 2026; fewer patterns in the wild.
- Babel plugin + compiler + `createTamagui` bootstrap adds setup overhead that NativeWind avoids.

### Option B: NativeWind v4 + React Native Reusables (chosen)

**What it is:** NativeWind v4 brings Tailwind CSS utility classes to React Native via a babel preset + Metro transform; React Native Reusables (RNR) provides copy-paste, unstyled accessible primitives (shadcn-style for RN) owned in-repo at `src/components/ui/`.

**Pros**
- Tailwind classes are the de-facto styling language for React in 2026 — near-zero onboarding cost.
- No compiler plugin; the babel preset is standard Metro setup.
- RNR primitives are copy-paste (in-repo) — no upstream dependency on a component library version; we own and can modify every file.
- System-driven dark/light theming via `useColorScheme()` + NativeWind `setColorScheme()` + `.dark` class on the root `View`; no theme-bootstrap ceremony.
- Design tokens as CSS variables in `src/global.css` (`:root` light, `.dark` dark) — simpler, web-familiar, no `createTokens`/`createTamagui`.
- Smaller dependency footprint; bundle lighter without Tamagui runtime.

**Cons**
- Utility-first JSX is more verbose on complex components (`className="flex-1 bg-background px-4 rounded-lg"`); some prefer prop-based styling.
- No `<XStack>` / `<YStack>` equivalents built in — we use plain RN `<View>` with `className="flex-row"` etc.
- Migration from Tamagui is real work: every component's styling syntax changes.
- NativeWind v4 is newer; its dark-mode class-based approach (`dark:bg-card`) requires the root `View` to carry the `dark` class, which is slightly more explicit than Tamagui's implicit theme context.

### Option C: Gluestack v3 (built on NativeWind)

**What it is:** Component library that ships unstyled, accessible primitives styleable via NativeWind/Tailwind — effectively "shadcn for RN with more batteries."

**Pros**
- Pre-built accessible components (Modal, Drawer, Combobox) we'd otherwise author ourselves.
- Built on NativeWind; inherits its perf and ergonomics.
- Copy-paste ownership model (like RNR).

**Cons**
- Adds more abstraction; we don't need most of Gluestack's advanced components for the current feature set.
- Gluestack's opinions on component structure and naming mean more learning than plain NativeWind + minimal RNR.
- Migration cost is the same as Option B plus extra scaffolding.
- RNR covers the primitives we actually need (text, button, input, card, separator); Gluestack's additional surface area is unused weight.

## Decision

**We adopt NativeWind v4 + React Native Reusables for all mobile styling and UI primitives.**

## Rationale

The ADR-013 reconsideration flag was explicit: NativeWind is the better-fit option for an RN-only app. The two migration triggers from that flag have now fired (RC churn + planned UI refresh), so the flag resolves into this decision.

Option B wins across every driver:
- **Idiomatic fit**: NativeWind v4 + RNR is designed for exactly our profile — RN-only, solo team, no web target.
- **Onboarding**: Tailwind familiarity transfers directly; no new mental model for `$tokens`, `styled()`, or `XStack`.
- **Stability**: no RC dependency; NativeWind v4 is stable. RNR components are in-repo — no upstream version to track.
- **Simplicity**: `src/global.css` CSS variables replace `createTokens`/`createTamagui`/`TamaguiProvider`. The provider stack becomes simpler.
- **Theming**: system-driven via `useColorScheme()` is more correct than dark-only; light mode is now first-class.

What we sacrifice: the `<XStack>` / `<YStack>` layout-primitive ergonomics and Tamagui's typed theme-token autocomplete. In practice, `<View className="flex-row gap-4">` is an acceptable substitute, and Tailwind class names are self-documenting. The loss is minor given the gains in simplicity and stability.

Option C (Gluestack) was rejected because RNR gives us the five primitives we need (text, button, input, card, separator) without Gluestack's additional surface area. Adding more components later is straightforward with the copy-paste model.

## Consequences

### Positive
- No upstream UI library version to track; RNR components are owned in-repo.
- CSS variable token model (`src/global.css`) is simpler to read and modify than `createTokens`.
- System-driven dark + light theming replaces the previous dark-only setup.
- Babel preset replaces the Tamagui babel plugin + compiler — faster Metro configuration.
- Tailwind class names are legible to any web dev without learning Tamagui-specific APIs.

### Negative
- JSX is more verbose on complex layouts (`className="..."` strings can be long).
- No typed theme-token autocomplete; token names are enforced by convention and CSS variable lookup, not TypeScript.
- Any component that was using Tamagui animation primitives (`AnimatePresence`, `useAnimations`) needs replacement with `react-native-reanimated` or plain RN `Animated`.

### Follow-up decisions
- RNR component additions (Modal, BottomSheet, etc.) as feature needs grow — copy in from the RNR catalog.
- If a web app is added: revisit NativeWind v4's web support or consider Tamagui again.
- Animation primitives for complex interactions: use `react-native-reanimated` (separate decision, not covered here).
