# Mobile UI/UX Overhaul — Part 3: Information Architecture & North-Star Journey

**Date:** 2026-06-27
**Parent:** 2026-06-27-mobile-ui-ux-overhaul.md
**Owner:** Joint (David + Claude)

Decide the app's information architecture before any screen is designed: what the user lands in, the navigation model, and the core learning loop — so "start in the action" is a structural decision, not a coat of paint. Spec-only (no ADR for now, per decision 2026-06-27).

---

## Goal

An agreed map of the redesigned experience: the first-run journey, the returning-user landing, the tab/navigation structure, and the primary learning loop — written down clearly enough that Part 4 can design screens against it without re-litigating structure.

## Why this is its own step

You can't design coherent screens until you've decided *what each screen is for and how a user moves between them*. Today the home tab is a creation form; "start in the action" implies the landing should be an activity (continue a lesson / resume a course / a clear single next action). That's an IA decision that constrains every subsequent design.

## Scope — questions to answer

- **First-run journey** — what does a brand-new user (real or guest) see and do first? How does it compose with the onboarding *Welcome* course (see `2026-06-19-onboarding-course-design.md`, which deep-links new users into a course)?
- **Returning-user landing** — what is "home" for someone mid-course? (continue-card hero? today's next step?) This replaces the cold creation form.
- **Where course *creation* lives** — if home is no longer the creation form, where does "make a new course" go (FAB? a tab? inside My Courses?).
- **Navigation model** — keep the 3-tab shell (Learn / My Courses / Profile) or restructure? What are the tabs *for* after the redesign?
- **Core learning loop** — the canonical path: open → land in activity → lesson/chat → progress → next module → next course. Name each state and transition.

## Inputs

- Part 1 inspiration (home patterns, IA references) and Part 2 audit (ranked pain points).
- Existing nav decision ADR-014 (Expo Router) and the onboarding spec.

## Deliverable

This file, filled in with: the agreed journey (first-run + returning), a navigation-structure decision, the placement of course creation, and a named core-loop diagram/list. Flag any choice big enough to deserve a later ADR, but don't block on one.

## Tasks

- [ ] Synthesize Part 1 + Part 2 into the problem/opportunity framing
- [ ] Decide the returning-user landing ("start in the action") and where creation moves
- [ ] Decide the navigation model (tabs / structure) post-redesign
- [ ] Define and name the core learning loop (states + transitions)
- [ ] Reconcile with the onboarding deep-link flow
- [ ] Write the agreed IA into this spec; note any candidate future ADR

## Done when

There is one agreed, written information architecture — landing, navigation, creation placement, and core loop — that Part 4 can design directly from.
