# Mobile UI/UX Overhaul — Part 5: Design-System Foundation

**Date:** 2026-06-27
**Parent:** 2026-06-27-mobile-ui-ux-overhaul.md
**Owner:** Claude / Joint

Extend the existing NativeWind design-system foundation — tokens and shared components — so the Part 4 designs are buildable without one-off styling. This is a foundation step, not screen implementation: it grows the token set and component library the redesign needs, staying inside ADR-029.

---

## Goal

The design tokens (`src/global.css` + `tailwind.config.js`) and the shared component library (`src/components/`) contain every primitive the approved designs require — so Part 6's screen work composes existing pieces instead of inventing styling ad hoc.

## Why separate from screen implementation

The redesign will need new visual primitives (e.g. richer cards, a "continue learning" hero, celebration/streak elements, new color or elevation tokens). Building these once, in the design system, keeps the single-source-of-truth invariant (ADR-029, `apps/mobile/CLAUDE.md`) intact and prevents per-screen drift. It's the bridge between approved designs and screen code.

## Scope

- **Tokens** — add/adjust CSS variables in `src/global.css` (both `:root` and `.dark`) and the matching entries in `tailwind.config.js` for any new colors, type sizes, radii, or spacing the designs introduce. Follow the documented "adding a token" procedure in `apps/mobile/docs/ui-system.md`.
- **Components** — add new shared components to the right `src/components/` sub-folder (typography / interactive / display / layout), export from `index.ts`, and update the `ui-system.md` table. Extend RNR primitives in `src/components/ui/` only where a new low-level primitive is genuinely needed.
- **Audit existing first** — reuse/extend current components (`Card`, `Button`, `ProgressBar`, `ChatBubble`, `EmptyState`, etc.) before adding new ones.

## Inputs

- Part 4's annotated list of new tokens/components.
- `apps/mobile/docs/ui-system.md` (current tokens + component catalogue) and ADR-029.

## Constraints

- NativeWind v4 + RNR only; tokens stay the single source of truth — no hardcoded hex/spacing in components (`apps/mobile/CLAUDE.md`).
- Light + dark parity for every new token.
- This part adds *foundation* primitives; assembling them into full screens is Part 6.

## Deliverable

Updated `src/global.css`, `tailwind.config.js`, `src/components/`, and `ui-system.md`, with the new tokens/components the designs need — each with light/dark values and a catalogue entry. (This is the one part that touches code, but only the design-system layer, not screens — gated on Part 4 approval.)

## Tasks

- [ ] Diff Part 4's required tokens/components against what exists today
- [ ] Add new color/type/spacing/radius tokens (light + dark) per the token procedure
- [ ] Build the new shared components (and any new RNR primitives) with tests
- [ ] Update `ui-system.md` catalogue + token tables
- [ ] Verify themes render correctly on the emulator
- [ ] Hand off the extended system to Part 6

## Done when

Every token/component the approved designs require exists in the design-system layer, documented and theme-complete, ready for Part 6 to compose into screens.
