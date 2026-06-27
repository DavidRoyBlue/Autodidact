# Mobile UI/UX Overhaul — Part 1: Inspiration & Component-Kit Research

**Date:** 2026-06-27
**Parent:** 2026-06-27-mobile-ui-ux-overhaul.md
**Owner:** Claude

Research and curate external UI/UX inspiration for a mobile learning app, plus concrete component/template options that fit the existing Expo + NativeWind + React Native Reusables stack — so Parts 3 and 4 design from references, not from a blank page.

---

## Goal

Produce a single curated reference David can skim that answers: *what does a great learning-app mobile experience look like, and what can we reuse to build it here?*

## Scope

- **Pattern research** — how best-in-class learning / habit apps (e.g. Duolingo, Brilliant, Khan Academy, Sololearn, Headspace) handle: first-run "drop into the action", the home/landing surface, course/lesson browsing, an in-lesson/chat experience, progress & streaks, and empty states. Capture *patterns*, with annotated screenshots or links — not just app names.
- **"Start in the action" home patterns** — specifically collect 3–5 home-screen patterns that put the learner mid-activity on open (continue-lesson card, daily-goal hero, resumable session), since that is the north star (parent spec).
- **Component / template options** — identify 2–3 directions for accelerating the build that are compatible with **Expo SDK 52 + NativeWind v4 + React Native Reusables** (ADR-029). Candidates: extending the RNR catalog, NativeWind-compatible component kits/blocks, Tailwind-based RN UI libraries, or curated design-token palettes. For each: license, stack fit, what it gives us, and what it would cost to adopt.

## Constraints

- Must respect the locked stack — anything proposed has to work with NativeWind v4 className styling and the `src/global.css` + `tailwind.config.js` token model. No StyleSheet/other styling libs (ADR-029).
- Inspiration is *directional*, not prescriptive — it feeds the Part 3 IA decision and Part 4 design, it does not pre-decide them.

## Deliverable

A reference doc committed to the repo (proposed: `apps/mobile/docs/ui-inspiration.md`, or a `docs/design/` note) containing: annotated pattern catalogue, the shortlist of "start in the action" home patterns, and the 2–3 component/template directions with a recommendation. Link it back from this sub-issue.

## Tasks

- [ ] Survey 4–6 reference learning/habit apps; capture annotated patterns per surface (home, browse, lesson/chat, progress, empty states)
- [ ] Collect 3–5 "start in the action" home-screen patterns with pros/cons for our model
- [ ] Evaluate 2–3 NativeWind/RNR-compatible component-kit or template directions (license + stack-fit + adoption cost)
- [ ] Write the curated reference doc and recommend a direction
- [ ] Hand off: link the reference into Part 3 (IA) and Part 4 (design)

## Done when

The reference doc exists, is linked from the parent spec, and gives Parts 3–4 a concrete set of patterns and a recommended component/template direction to design against.
