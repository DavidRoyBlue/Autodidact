# UI / UX, tailor my screens to my needs

**Date:** 2026-06-27
**Status:** Umbrella spec — to be reviewed
**Tracks:** GitHub issue #85 (this file is its working spec; the six parts below are its sub-issues)

The mobile app has all the screens it needs but none of them feel purposeful, pretty, or intuitive. This is the umbrella spec for a full UI/UX overhaul of `apps/mobile`, decomposed into six sequenced workstreams (sub-issues). The north star: **start the user in the action** — the reason a course lives in the app at all — instead of dropping them on a cold form.

---

## Context

`apps/mobile` is the only client. It works end-to-end but the surface is unloved: David's words — "we have screens rn, but they all suck." The concrete problems:

- **The home tab is a cold course-*creation* form.** `app/(app)/index.tsx` ("Learn") asks a brand-new or returning user to type a topic and pick a difficulty before anything happens. The user never "starts in the action"; they start at paperwork.
- **UI isn't pretty.** Screens are functional NativeWind layouts with little visual hierarchy, motion, or polish.
- **UX isn't intuitive.** The path from "open app" → "learn something" isn't obvious; module locking, generation progress, and empty states are opaque (per the current-app audit, Part 2).

This is explicitly a **big task**, so it is split into research → audit → information architecture → design → design-system → implementation roadmap, each owned by David, Claude, or both.

## North star

> The user should open the app and immediately be *doing the thing* — in a lesson, in a chat, mid-course — not configuring one. Every screen must justify its existence against "does this move the learner forward?"

## Current state (verified 2026-06-27)

- **Screens:** tabs `Learn` (home = creation form), `My Courses` (enrolled list), `Profile` (stats + sign-out + guest upgrade); nested `Course detail` (`courses/[id]`) and `Module chat` (`courses/[id]/modules/[moduleId]/chat`); auth `sign-in` / `sign-up`.
- **Stack:** Expo SDK 52 + Expo Router 4; NativeWind v4 + React Native Reusables; TanStack Query + Zustand. (`apps/mobile/CLAUDE.md`.)
- **Design system:** CSS-variable tokens in `src/global.css` + `tailwind.config.js` (single source of truth, ADR-029); shared components in `src/components/`; documented in `apps/mobile/docs/ui-system.md`. **The overhaul extends this — it does not replace NativeWind/RNR.**

## Related, non-overlapping work

- [`2026-06-19-onboarding-course-design.md`](2026-06-19-onboarding-course-design.md) handles the **content/data** side of "start in the action" (auto-enrolling new users into a shared *Welcome* course and deep-linking them to it). This overhaul is the **visual + information-architecture** side. They are complementary: onboarding gives the user something real to land in; this redesign makes the landing — and every screen — purposeful and polished.

---

## Non-goals

- Re-platforming off Expo / NativeWind / RNR — the stack stays (ADR-003, ADR-029).
- Backend, API, or business-logic changes — this is client surface only.
- Writing implementation code now — every part below produces research, decisions, designs, or plans, not screens. Implementation is sequenced by Part 6.

---

## Decomposition (sub-issues)

Sequenced; later parts depend on earlier ones. Owner = who drives it.

| Part | Sub-issue | Owner | Depends on |
|---|---|---|---|
| 1 | [Inspiration & component-kit research](2026-06-27-mobile-uiux-1-inspiration-research.md) | Claude | — |
| 2 | [Current-app audit & pain-point inventory](2026-06-27-mobile-uiux-2-current-app-audit.md) | David (Claude assists) | — |
| 3 | [Information architecture & north-star journey](2026-06-27-mobile-uiux-3-information-architecture.md) | Joint | 1, 2 |
| 4 | [Screen design (Figma)](2026-06-27-mobile-uiux-4-screen-design.md) | Joint | 1, 2, 3 |
| 5 | [Design-system foundation](2026-06-27-mobile-uiux-5-design-system-foundation.md) | Claude / Joint | 4 |
| 6 | [Implementation roadmap](2026-06-27-mobile-uiux-6-implementation-roadmap.md) | Claude | 4, 5 |

Parts 1 and 2 can run in parallel. Part 3 fuses their outputs into a journey/IA decision. Part 4 designs against that. Part 5 grounds the designs in real tokens/components. Part 6 turns approved designs into phased build plans (which become their own plans/sub-issues — no code until then).

## Done when

All six sub-issues are closed: there is a curated inspiration reference, a documented pain-point inventory, an agreed information architecture, approved Figma screen designs, an extended design-system foundation, and a phased implementation roadmap ready to execute.
