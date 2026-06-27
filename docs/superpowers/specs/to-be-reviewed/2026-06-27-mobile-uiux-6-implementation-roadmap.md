# Mobile UI/UX Overhaul — Part 6: Implementation Roadmap

**Date:** 2026-06-27
**Parent:** 2026-06-27-mobile-ui-ux-overhaul.md
**Owner:** Claude

Turn the approved designs and extended design system into a phased, screen-by-screen implementation roadmap — the set of plans that actually rebuilds the UI. This part produces *plans*, not screen code; each phase becomes its own superpowers plan (and sub-issue) executed later.

---

## Goal

A sequenced build plan that takes the redesign from "approved Figma + ready design system" to "shipped screens," broken into reviewable phases small enough to execute and verify one at a time.

## Why a roadmap step

The overhaul touches every screen; doing it as one mega-change is unreviewable and risky. This part decomposes the approved designs into ordered phases (by screen or by flow), each a self-contained plan with its own tests and verification, so implementation lands incrementally without a long-lived broken branch.

## Scope

- **Sequence the work** — order phases by dependency and value (e.g. design-system gaps already done in Part 5 → home/landing → course detail → chat → list → profile/auth polish). Put the north-star "start in the action" landing early so the headline change ships first.
- **One plan per phase** — for each phase write a superpowers plan (`docs/superpowers/plans/to-be-reviewed/`) listing the screens/components touched, the components reused vs. new, tests to add (jest-expo + RN Testing Library; Maestro e2e where relevant), and a verification step (run on emulator).
- **Risk & rollout** — note feature-flag / incremental-merge strategy so master stays releasable, and which changes are owner-gated (e.g. need real-device verification).

## Inputs

- Part 4 approved designs and Part 5 extended design system.
- `apps/mobile/CLAUDE.md` testing rules (Jest scoped to mobile; Maestro for e2e) and routing/state invariants.

## Constraints

- This part writes **plans only — no screen implementation code**. Execution happens when each plan is picked up (moved to `in-progress/`).
- Each plan must be independently shippable and keep master releasable.

## Deliverable

A roadmap (this file) listing the ordered phases, plus one drafted plan file per phase in `plans/to-be-reviewed/` (each parented appropriately so it becomes a sub-issue). Link them from here.

## Tasks

- [ ] Decompose approved designs into ordered, independently-shippable phases
- [ ] Decide sequencing (north-star landing first) and incremental-merge/flag strategy
- [ ] Draft one plan file per phase (screens, components, tests, verification)
- [ ] Flag owner-gated steps (device verification, store-impacting changes)
- [ ] Link all phase plans from this roadmap and hand off for execution

## Done when

There is an ordered roadmap and a drafted, reviewable plan per phase — enough that implementation can start phase-by-phase with no further structural decisions, closing out the #85 overhaul into concrete buildable work.
