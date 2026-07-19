# Specs

Design specifications written before implementation plans.

---

## Purpose

Specs explore and define a feature's design before implementation begins. A spec produces clarity on scope, approach, and constraints — the output feeds into a plan.

---

## Where this fits

- Parent: [superpowers/README.md](../README.md)
- Rules: [../CLAUDE.md](../CLAUDE.md)

---

## Triage model

A spec's **status is the subfolder it lives in** — this is the single source of truth. Move the file to change its status.

| | Folder | Meaning |
|---|---|---|
| 🔵 | [`to-be-reviewed/`](to-be-reviewed/) | Proposed design — not yet planned or started |
| 🟡 | [`in-progress/`](in-progress/) | Design being implemented (a plan is underway) |
| ⚪ | [`_done/`](_done/) | The designed feature has shipped |

---

## Index

### 🔵 To be reviewed

| Spec | Related plan |
|---|---|
| [2026-05-14 — Sync main: SessionStart hook](to-be-reviewed/2026-05-14-sync-main-session-start-hook.md) | [to-be-reviewed](../plans/to-be-reviewed/2026-05-14-sync-main-session-start-hook.md) |
| [2026-06-19 — Onboarding Course + Auto-Enroll](to-be-reviewed/2026-06-19-onboarding-course-design.md) (Spec 3/4) | _pending_ |
| [2026-06-27 — UI/UX Overhaul](to-be-reviewed/2026-06-27-mobile-ui-ux-overhaul.md) (umbrella, issue #85) | _6 parts below_ |
| [2026-07-19 — Working Mobile Dev Environment](to-be-reviewed/2026-07-19-dev-environment-design.md) | _pending_ |
| &nbsp;&nbsp;↳ [Part 1 — Inspiration & component research](to-be-reviewed/2026-06-27-mobile-uiux-1-inspiration-research.md) | _pending_ |
| &nbsp;&nbsp;↳ [Part 2 — Current-app audit](to-be-reviewed/2026-06-27-mobile-uiux-2-current-app-audit.md) | _pending_ |
| &nbsp;&nbsp;↳ [Part 3 — Information architecture](to-be-reviewed/2026-06-27-mobile-uiux-3-information-architecture.md) | _pending_ |
| &nbsp;&nbsp;↳ [Part 4 — Screen design (Figma)](to-be-reviewed/2026-06-27-mobile-uiux-4-screen-design.md) | _pending_ |
| &nbsp;&nbsp;↳ [Part 5 — Design-system foundation](to-be-reviewed/2026-06-27-mobile-uiux-5-design-system-foundation.md) | _pending_ |
| &nbsp;&nbsp;↳ [Part 6 — Implementation roadmap](to-be-reviewed/2026-06-27-mobile-uiux-6-implementation-roadmap.md) | _pending_ |

### 🟡 In progress

| Spec | Related plan |
|---|---|
| [2026-06-22 — Social Sign-In (Google + Facebook)](in-progress/2026-06-22-social-sign-in-design.md) | [Phase 1](../plans/in-progress/2026-06-22-social-sign-in-phase1-oauth-sign-in.md) + [Phase 2](../plans/in-progress/2026-06-22-social-sign-in-phase2-guest-oauth-upgrade.md) (code merged; provider config + verification owner-gated) |

### ⚪ Done

| Spec | Related plan |
|---|---|
| [2026-04-28 — Mobile Design System](_done/2026-04-28-mobile-design-system-design.md) | [2026-04-28 — Mobile Design System](../plans/_done/2026-04-28-mobile-design-system.md) |
| [2026-06-01 — Test Overhaul](_done/2026-06-01-test-overhaul-design.md) | [Phases 0–3](../plans/_done/) |
| [2026-06-11 — ESM Migration](_done/2026-06-11-esm-migration-design.md) | [2026-06-11 — ESM Migration](../plans/_done/2026-06-11-esm-migration.md) |
| [2026-06-13 — Chat SSE Disconnect Fix](_done/2026-06-13-chat-sse-disconnect-fix-design.md) | [2026-06-13 — Chat SSE Disconnect Fix](../plans/_done/2026-06-13-chat-sse-disconnect-fix.md) |
| [2026-06-18 — Production Auth](_done/2026-06-18-production-auth-design.md) (Spec 2/4) | Plans [A/B1/B2/C1/C2 done](../plans/_done/) — shipped to prod 2026-06-26 (issue #50) |
| [2026-06-19 — Local Supabase Stack](_done/2026-06-19-local-supabase-stack-design.md) (Spec 1/4) | [2026-06-19 — Local Supabase Stack](../plans/_done/2026-06-19-local-supabase-stack.md) |
| [2026-06-19 — DEV_AUTO_LOGIN](_done/2026-06-19-dev-auto-login-design.md) (Spec 4/4) | _shipped in `apps/mobile/app/_layout.tsx` (no standalone plan)_ |

---

## Filename format

`YYYY-MM-DD-{area}-{descriptor}.md`

If there are multiple related specs:

`YYYY-MM-DD-{area}-[-spec{N}]-{descriptor}.md`
