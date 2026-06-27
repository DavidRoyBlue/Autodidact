# Mobile UI/UX Overhaul — Part 4: Screen Design (Figma)

**Date:** 2026-06-27
**Parent:** 2026-06-27-mobile-ui-ux-overhaul.md
**Owner:** Joint (David + Claude design)

Design the redesigned screens in Figma — wireframe to high-fidelity — grounded in the Part 1 references and the Part 3 information architecture. This is the "sit down with Claude design and design screens" task from #85.

---

## Goal

Approved high-fidelity designs for the core flow, consistent with the agreed IA and buildable on NativeWind/RNR, so Part 5 (design-system) and Part 6 (roadmap) have a concrete target.

## Scope — screens to design

Driven by Part 3's IA, but at minimum the core loop:

- **Home / landing** — the "start in the action" surface that replaces the creation form.
- **My Courses** — the enrolled list, redesigned (cards, progress, status).
- **Course detail** — title, progress, module list with clear locked/available/complete states.
- **Module chat** — the AI-tutor experience: messages, streaming, input, completion moment.
- **Course creation** — wherever Part 3 relocated it.
- **Profile** and **Auth** — lighter polish pass for consistency.
- Cross-cutting: empty / loading / error states and key micro-interactions (generation progress, module-complete celebration).

## Approach

- **Wireframe first** (structure & flow), review against Part 3, then push to **high-fidelity** using the design tokens (extend in Part 5 as needed).
- Use the Figma MCP / design workflow; map each designed component to an existing `src/components/` primitive where one exists, and flag *new* components/tokens needed (feeds Part 5).
- Design light **and** dark themes (the app ships both, per `ui-system.md`).

## Constraints

- Designs must be implementable in NativeWind v4 + RNR — no patterns that require a different styling system (ADR-029).
- Reuse the existing component library where it already covers a need; only introduce new components when justified.

## Deliverable

A Figma file (or frames) with approved hi-fi designs for the core-loop screens + key states, and an annotated list of *new* tokens/components the designs require (the input to Part 5). Link the Figma source from this sub-issue.

## Tasks

- [ ] Wireframe the core-loop screens against Part 3's IA; review
- [ ] Produce high-fidelity designs (light + dark) for the core flow
- [ ] Design empty/loading/error states and key micro-interactions
- [ ] Map each design element to existing components; list new components/tokens needed
- [ ] Get David's approval on the hi-fi set
- [ ] Hand off the new-component/token list to Part 5 and the approved designs to Part 6

## Done when

There is an approved high-fidelity design set for the core flow (light + dark, with key states) plus a documented list of new tokens/components it requires.
