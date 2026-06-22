# ADR-013: Mobile UI system

## Status

⬛ Superseded by [ADR-029](./ADR-029-mobile-ui-system-nativewind.md)
Date: 2026-05-10
Superseded: 2026-06-22 — NativeWind migration triggered by sustained Tamagui RC churn + planned UI refresh (the two flags from this ADR's reconsideration block).

## Context

The mobile app needs a UI primitive system: typography, layout primitives
(Stack, Box), buttons, inputs, theming (light/dark), responsive sizing.
The app does not need a heavy enterprise component library — most screens
are simple lists, chat bubbles, and forms. But we do need tokenized
theming and consistent text styles.

This decision is downstream of [ADR-003](./ADR-003-mobile-application-platform.md)
(Expo + React Native). The UI system has to work on RN's bridge / new
architecture and integrate cleanly with Expo Router ([ADR-014](./ADR-014-mobile-navigation.md)).

## Non-goals

- Specific design tokens / color palette / type scale — owned by `apps/mobile/src/theme/`.
- Component library (pre-built sign-in screens, etc.) — out of scope; we author our own components from primitives.
- Web UI library — we have no web app.
- Accessibility policy — operational, owned by `apps/mobile/CLAUDE.md`.

## Decision Drivers

- **Native-feeling primitives** — `<Stack>`, `<Box>`, `<Text>`, etc., that compose into screens with platform-appropriate styling.
- **Performance** — startup cost and per-render cost on RN's runtime; styling shouldn't dominate frame budget.
- **Theming** — light/dark, design tokens (color, spacing, typography) that scale.
- **Bundle size** — RN apps ship the dependency to every user's device; bigger ≠ better here.
- **TypeScript ergonomics** — type-safe theme tokens, autocomplete on style props.
- **Onboarding cost** — a new dev should be productive in days, not weeks.
- **Maintenance trajectory** — solo team; ecosystem volatility translates to upgrade cost.
- **Cross-platform reuse** — if we ever ship a web app, can the same components serve it?

## Options Considered

### Option A: Tamagui (current)
**What it is:** Optimizing compiler + UI toolkit. Compile-time style extraction (CSS on web, optimized RN styles on native), tokenized theming, cross-platform (RN + web), animation primitives, comprehensive component library. We pin `2.0.0-rc.41`.

**Pros**
- Excellent perf characteristics on web through CSS atomization; on native the compiler flattens style objects to reduce bridge work.
- Sophisticated theming: token-based design system, light/dark, media query equivalents.
- Cross-platform out of the box — same component, same styling syntax, RN and web.
- Animations and gesture primitives are first-class.
- TypeScript story is strong — theme tokens are typed.

**Cons**
- We're on `2.0.0-rc.41` — a release candidate. v2 has been in RC longer than typical; production users have seen API drift between RC versions.
- Setup cost is meaningful: babel plugin, theme bootstrap, compiler config. Not "import and go."
- Bundle size on native is non-trivial despite the compiler — we're shipping the runtime regardless.
- Tamagui's biggest differentiator (compile-time CSS atomization for web) is for the web target, which we don't have.
- Learning curve: 5–10 hours for the basics (tokens, themes, the `styled` API, the `Stack`/`XStack`/`YStack` primitives, the `theme` prop).
- Smaller community than NativeWind / Gluestack in 2026; finding patterns in the wild is harder.

### Option B: NativeWind
**What it is:** Tailwind CSS for React Native. Utility-first class-based styling. Compiles Tailwind classes into RN style objects ahead of time. v4+ in 2026.

**Pros**
- Tailwind is the de-facto styling language for React in 2026 — onboarding cost is near-zero for any dev who's used Tailwind elsewhere.
- Compile-time class processing keeps runtime cost low.
- Smaller dependency footprint than Tamagui.
- Theming via Tailwind config; familiar to web devs.
- Active development; first-class with Expo via Metro plugins.
- Gluestack v3 uses NativeWind under the hood — the ecosystem is consolidating around it.

**Cons**
- Utility-first styling produces verbose JSX on complex components (`className="flex-1 items-center justify-center bg-white dark:bg-gray-900 px-4 py-6 rounded-lg"`). Many devs love it; some hate it.
- No optimizing compiler at Tamagui's level — for cross-platform web/native scenarios, Tamagui still has a perf edge.
- Component primitives (`<View>`, `<Text>`) are still RN's, not custom. We compose them; we don't get a Tamagui-style `<XStack>` / `<YStack>` set built in.
- Migrating from Tamagui to NativeWind is real work: every component's styling syntax changes.

### Option C: Gluestack v3 (built on NativeWind)
**What it is:** Component library that ships unstyled, accessible primitives styleable via NativeWind/Tailwind. Effectively "shadcn for RN."

**Pros**
- Pre-built accessible components (Modal, Drawer, Combobox, etc.) we'd otherwise author ourselves.
- Built on NativeWind — inherits its perf and ergonomics.
- "Own your code" model: components are copy-paste, not opaque dependencies.
- Strong accessibility focus.

**Cons**
- Adds another layer of abstraction. We don't need most of Gluestack's components today.
- Pre-built components mean inheriting their styling decisions; consistent with Gluestack's design opinion until you customize.
- Migration cost is the same as adopting NativeWind plus extra: copy in Gluestack components, restyle as needed.

### Option D: React Native Paper
**What it is:** Material Design components for React Native. Mature, conventional UI library.

**Pros**
- Battle-tested; widely deployed.
- Material Design out of the box — instant consistency on Android.
- Comprehensive component set.

**Cons**
- Material Design on iOS feels off-platform. Many users prefer iOS-native styling on iOS.
- Heavy library with many components we'd never use.
- Theming is Material-flavored; harder to deviate from MD aesthetics.
- Less TypeScript-modern feel than Tamagui or NativeWind.

### Option E: Plain React Native + StyleSheet
**What it is:** Use RN's built-in `StyleSheet.create` with no library. Hand-author all styling.

**Pros**
- Zero dependencies. Smallest bundle.
- Full control. No magic.
- Closest to "just RN" — everything in the docs applies directly.

**Cons**
- We rebuild what Tamagui or NativeWind gives free: theming, dark mode, responsive utilities, component primitives.
- Style-object verbosity; no utility classes.
- TypeScript on `StyleSheet` is workable but doesn't catch token-name typos without extra ceremony.
- For a solo team, "build the styling system from scratch" is time spent not building product.

### Option F: Unistyles
**What it is:** A newer styling library (v3 in 2025–2026) that uses StyleSheet.create with theme injection at compile time.

**Pros**
- Tiny runtime; very fast.
- Works without a compiler plugin in v3.
- Theme tokens are typed.

**Cons**
- Younger than Tamagui or NativeWind; ecosystem is smaller.
- No component primitives — same authoring effort as plain RN, with better theming.
- Migration from Tamagui or to Unistyles isn't markedly cheaper than to NativeWind.

## Decision

**We keep Tamagui.**

## Rationale

Lining up the drivers:

- **Native-feeling primitives (#1)**: A is most opinionated (Stack/XStack/YStack/Box from Tamagui). B and C are class-based on top of RN primitives. E is bare RN.
- **Performance (#2)**: A has the compiler advantage; on native that advantage narrows; B's compile-time class processing is comparable. E is fastest in absolute terms but does no work for us.
- **Theming (#3)**: A's tokenized theme is excellent. B has Tailwind's config-based theme — also good, more familiar to web devs. D is Material-flavored; C inherits B.
- **Bundle size (#4)**: B and E are smallest. A is meaningful. D is heavy.
- **TS ergonomics (#5)**: A and B both strong. C inherits B. E is workable.
- **Onboarding (#6)**: B wins (Tailwind familiarity). A is a 5–10-hour ramp. C similar to B.
- **Maintenance trajectory (#7)**: B has the broader community traction in 2026. A's RC tail and smaller community are real. C is built on B; same trajectory.
- **Cross-platform reuse (#8)**: A wins decisively *if we have a web app*. We don't.

The first-principles ranking favors **B (NativeWind)** for our specific
profile (RN-only, solo team, Tailwind-familiar, no web app). Tamagui's
strongest differentiator (cross-platform compile-time CSS atomization)
isn't a benefit we collect. NativeWind would mean smaller bundle, faster
onboarding, broader community, less ceremony.

We are choosing **A (Tamagui)** anyway because:

1. The mobile app's UI is already written against Tamagui. Migration is
   "rewrite every component's styling," which is a 1–2 week project
   spread across every screen.
2. Tamagui works in production. The complaints (RC churn, learning curve,
   bundle weight) are real but not user-visible problems.
3. We're not building a web app, but we're also not ruling it out forever;
   if we *do* build one, Tamagui's RN-and-web story still pays off.

This is **expedience over merit**. The reconsideration flag is real.

> 🚩 **Reconsideration flag:** NativeWind (option B) is the lighter, more
> idiomatic fit for our RN-only mobile app. Tamagui's compile-time
> cross-platform optimization, its biggest differentiator, doesn't pay
> off without a web target. Staying with Tamagui because the existing UI
> is written against it. Migration trigger: planned UI refresh, sustained
> RC churn, evidence that bundle weight affects launch time, or a new
> developer joining who would benefit from Tailwind familiarity.

## Consequences

### Positive
- Sophisticated theming and token system already in place.
- Existing UI code works.
- Cross-platform readiness if we ever add a web target.
- Animations and gesture helpers integrated.

### Negative
- We're on a release candidate (v2 RC) with API drift risk.
- Bundle size and runtime weight pay for cross-platform features we don't use.
- Smaller community / fewer patterns in the wild than NativeWind.
- Higher onboarding tax for new contributors.

### Follow-up decisions
- Specific design tokens, component conventions — owned by `apps/mobile/src/theme/` and `apps/mobile/CLAUDE.md`.
- When Tamagui v2 ships stable: re-evaluate whether the migration trigger fires.
- Reconsider this ADR if: any of the migration triggers in the flag fire, the v2 RC saga continues into 2027, or a future redesign creates a natural "rewrite UI" moment.
