# Mobile UI/UX Overhaul — Part 2: Current-App Audit & Pain-Point Inventory

**Date:** 2026-06-27
**Parent:** 2026-06-27-mobile-ui-ux-overhaul.md
**Owner:** David (Claude assists with screenshots & capture)

Walk the current app screen by screen and write down, honestly, what's ugly, confusing, or purposeless — so the redesign targets real pain instead of guesses. This is the "look at the current app state and just vibe it" task from #85.

---

## Goal

A documented, per-screen pain-point inventory: for every screen, what works, what feels bad, and what doesn't earn its place. This is the ground truth the design decisions in Parts 3–4 must answer to.

## Scope — screens to audit

The six real surfaces (verified 2026-06-27):

- **Learn / home** (`app/(app)/index.tsx`) — currently a cold course-creation form; prime target for "start in the action".
- **My Courses** (`app/(app)/courses/index.tsx`) — enrolled-course list + generation polling.
- **Profile** (`app/(app)/profile.tsx`) — stats, email, sign-out, guest-upgrade card.
- **Course detail** (`app/(app)/courses/[id]/index.tsx`) — title, description, progress bar, module list (locked/available states).
- **Module chat** (`app/(app)/courses/[id]/modules/[moduleId]/chat.tsx`) — the AI tutor: message list, streaming, input.
- **Auth** (`app/(auth)/sign-in.tsx`, `sign-up.tsx`) — sign-in/up, guest, email-confirmation.

## How

- Run the app on the emulator (`pnpm mobile:run` / run-mobile skill) and walk every screen as a first-time user *and* a returning user.
- For each screen note: **purpose** (is it obvious?), **first impression** (ugly / flat / fine), **friction** (what's confusing or slow), **what's missing** (empty/loading/error states, guidance).
- Claude assists by capturing screenshots (mobile-mcp) and turning David's spoken "vibes" into the structured inventory.

## Known rough edges to validate (from code review, not exhaustive)

- Home is a creation form, not an activity — biggest north-star miss.
- No empty/first-run state on the Learn tab; generation-progress UI uses opaque hardcoded status labels.
- Module lock/unlock is server-driven and visually opaque.
- Chat scroll-to-end and keyboard handling may lag on-device.
- No merged loading state on course-detail; generic skeleton only.
- Sign-up confirmation screen has no "resend email" affordance.

## Deliverable

A pain-point inventory doc (proposed: append a section to the Part 2 file or a `docs/design/current-app-audit.md`) with a row per screen: purpose / first impression / friction / missing — plus David's priority ranking of what hurts most.

## Tasks

- [ ] Walk all six screens on a real emulator session (first-time + returning user)
- [ ] Capture annotated screenshots per screen (Claude assists)
- [ ] Record purpose / impression / friction / gaps per screen
- [ ] Rank the pain points by how much they hurt the experience
- [ ] Hand off the ranked inventory to Part 3 (IA)

## Done when

Every screen has a documented verdict, the worst pain points are ranked, and Part 3 has a concrete problem list to design against.
