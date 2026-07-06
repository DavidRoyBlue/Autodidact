---
name: frontend-component
description: Use when creating or modifying UI in apps/mobile — a new component, screen, or visual element in the Expo React Native app. Triggers on "new component", "add a screen", "build the UI for", "add a button/card/list/modal", or any styling/layout work.
---

# Frontend component

## Overview

Builds mobile UI the repo's way: React Native Reusables first, NativeWind tokens only, screens compose components. Binding invariants (styling, state split, networking) live in `apps/mobile/CLAUDE.md` — this skill is the build procedure and its definition of done.

## When to use

- New component, screen, or visual change in `apps/mobile`
- Wiring UI to server data (TanStack Query) or client state (Zustand)

## When NOT to use

- Backend/API changes the UI merely consumes
- Pure store/hook logic with no rendered output (still respect mobile CLAUDE.md)

## Workflow

1. **Reusables first.** Check `src/components/ui/` for an existing RNR primitive; extend or compose before writing custom. New shared components go in `src/components/<domain>/`, never raw primitives in screen files.
2. Style with NativeWind `className` and tokens from `src/global.css` / `tailwind.config.js` only — no hardcoded hex/spacing, no `StyleSheet.create`. Text via `AppText`/`Heading`.
3. Data: server state through a TanStack Query hook in `src/api/` (hook + typed fetch in the same file); client-only state in Zustand only if it genuinely outlives the component — default to local `useState`.
4. **Handle all three states** for anything data-backed: loading, error, empty. An unstyled spinner-less blank screen is a bug.
5. Accessibility: `accessibilityRole`, `accessibilityLabel` (and `accessibilityState` where relevant) on interactive elements.
6. Verify: `pnpm --filter @autodidact/mobile typecheck`; add/update Jest tests for logic per `.claude/rules/testing.md`.

## Definition of done

- [ ] Loading, error, and empty states handled for data-backed UI
- [ ] Accessibility props on interactive elements
- [ ] RNR primitive reused/composed, or a note on why custom was necessary
- [ ] Tokens only — no hardcoded colors/spacing, no `StyleSheet.create`
- [ ] `pnpm --filter @autodidact/mobile typecheck` passes
- [ ] No unnecessary global state (no server data in Zustand, no store for local UI state)
