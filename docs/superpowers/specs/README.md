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

### 🟡 In progress

| Spec | Related plan |
|---|---|
| [2026-06-18 — Production Auth](in-progress/2026-06-18-production-auth-design.md) (Spec 2/4) | Plans A/B1/B2/C1 [done](../plans/_done/); [C2 to-be-reviewed](../plans/to-be-reviewed/2026-06-20-prod-auth-phase3-policy-config-hardening.md) |

### ⚪ Done

| Spec | Related plan |
|---|---|
| [2026-04-28 — Mobile Design System](_done/2026-04-28-mobile-design-system-design.md) | [2026-04-28 — Mobile Design System](../plans/_done/2026-04-28-mobile-design-system.md) |
| [2026-06-01 — Test Overhaul](_done/2026-06-01-test-overhaul-design.md) | [Phases 0–3](../plans/_done/) |
| [2026-06-11 — ESM Migration](_done/2026-06-11-esm-migration-design.md) | [2026-06-11 — ESM Migration](../plans/_done/2026-06-11-esm-migration.md) |
| [2026-06-13 — Chat SSE Disconnect Fix](_done/2026-06-13-chat-sse-disconnect-fix-design.md) | [2026-06-13 — Chat SSE Disconnect Fix](../plans/_done/2026-06-13-chat-sse-disconnect-fix.md) |
| [2026-06-19 — Local Supabase Stack](_done/2026-06-19-local-supabase-stack-design.md) (Spec 1/4) | [2026-06-19 — Local Supabase Stack](../plans/_done/2026-06-19-local-supabase-stack.md) |
| [2026-06-19 — DEV_AUTO_LOGIN](_done/2026-06-19-dev-auto-login-design.md) (Spec 4/4) | _shipped in `apps/mobile/app/_layout.tsx` (no standalone plan)_ |

---

## Filename format

`YYYY-MM-DD-{area}-{descriptor}.md`

If there are multiple related specs:

`YYYY-MM-DD-{area}-[-spec{N}]-{descriptor}.md`
