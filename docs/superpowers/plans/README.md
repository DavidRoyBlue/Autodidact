# Plans

Step-by-step implementation plans for Autodidact features.

---

## Purpose

Plans are structured task lists written before implementation begins. They are the primary input for agentic workers executing multi-step features.

---

## Where this fits

- Parent: [superpowers/README.md](../README.md)
- Rules: [../CLAUDE.md](../CLAUDE.md)

---

## Triage model

A plan's **status is the subfolder it lives in** — this is the single source of truth. Move the file to change its status.

| | Folder | Meaning |
|---|---|---|
| 🔵 | [`to-be-reviewed/`](to-be-reviewed/) | To review / not started — proposed work, not yet picked up |
| 🟡 | [`in-progress/`](in-progress/) | Implementation underway |
| ⚪ | [`_done/`](_done/) | Completed / implemented — shipped, kept as a record |

Done plans are never deleted; they record how and why something was built. Their in-file `- [ ]` checkboxes may lag the real outcome — trust the folder and git history over the boxes.

---

## Index

### 🔵 To be reviewed

| Plan | Notes |
|---|---|
| [2026-05-14 — Sync main: SessionStart hook](to-be-reviewed/2026-05-14-sync-main-session-start-hook.md) | Proposed; hook script not yet created |
| [2026-06-22 — Onboarding Course (Spec 3/4)](to-be-reviewed/2026-06-22-onboarding-course-implementation.md) | Auto-enroll + placeholder seed + first-launch deep-link; resolves Spec 3 D9/D10 |

### 🟡 In progress

> Code for all three is merged to `master`; what remains is owner-gated config + real-device/prod verification. See `note-to-self.md` (repo root) for the authoritative checklist.

| Plan | Notes |
|---|---|
| [2026-06-20 — Prod Auth Plan C2: Policy & Config Hardening](in-progress/2026-06-20-prod-auth-phase3-policy-config-hardening.md) (Spec 2/4, Phase 3 / D4') | Migration `0010` merged + on prod; GoTrue dashboard hardening + anon-ON-in-prod outstanding |
| [2026-06-22 — Social Sign-In Phase 1: OAuth Sign-In](in-progress/2026-06-22-social-sign-in-phase1-oauth-sign-in.md) (Google native + Facebook web-PKCE) | Code merged; OAuth provider config + dev-build verification owner-gated |
| [2026-06-22 — Social Sign-In Phase 2: Guest→OAuth Upgrade](in-progress/2026-06-22-social-sign-in-phase2-guest-oauth-upgrade.md) (`0011`+`0012`, `linkIdentity`) | Code merged; prod migration apply + manual-linking + verification owner-gated |

### ⚪ Done

| Plan | Completed |
|---|---|
| [2026-04-28 — Mobile Design System](_done/2026-04-28-mobile-design-system.md) | Tamagui design system + screens shipped (later replaced — see NativeWind migration) |
| [2026-06-21 — Mobile NativeWind + RNR Migration](_done/2026-06-21-mobile-nativewind-migration.md) | 2026-06-23 (PR #37) — Tamagui removed; NativeWind v4 + light/dark tokens |
| [2026-04-29 — Fix Vitest Hoisting](_done/2026-04-29-fix-vitest-hoisting.md) | `vi.hoisted()` migration |
| [2026-04-29 — JWKS Auth](_done/2026-04-29-jwks-auth.md) | JWKS/RS256 local verification |
| [2026-06-01 — Test Overhaul Phase 0: Foundation](_done/2026-06-01-test-overhaul-phase-0-foundation.md) | `packages/test-support` harness |
| [2026-06-01 — Test Overhaul Phase 1: Backend Integration](_done/2026-06-01-test-overhaul-phase-1-backend-integration.md) | provider/db/worker integration tests |
| [2026-06-01 — Test Overhaul Phase 2: API E2E](_done/2026-06-01-test-overhaul-phase-2-api-e2e.md) | `services/api` e2e harness |
| [2026-06-01 — Test Overhaul Phase 3: Cross-service E2E](_done/2026-06-01-test-overhaul-phase-3-cross-service-e2e.md) | `e2e/` workspace golden path |
| [2026-06-02 — CI/CD & Dependency Hardening](_done/2026-06-02-cicd-dependency-fixes.md) | merged in PR #25 |
| [2026-06-11 — ESM Migration](_done/2026-06-11-esm-migration.md) | all packages `type:module`, Node 22.12 |
| [2026-06-13 — Chat SSE Disconnect Fix](_done/2026-06-13-chat-sse-disconnect-fix.md) | `reply.raw` disconnect detection |
| [2026-06-19 — Local Supabase Stack](_done/2026-06-19-local-supabase-stack.md) (Spec 1/4) | 2026-06-19 |
| [2026-06-19 — Prod Auth Plan A: Provisioning & Identity](_done/2026-06-19-prod-auth-1-provisioning.md) (Spec 2/4, Phase 0-1) | 2026-06-20 (merged + applied to prod) |
| [2026-06-20 — Prod Auth Plan B1: Anonymous Sign-In & Mobile Lifecycle](_done/2026-06-20-prod-auth-planB1-anonymous-mobile.md) (Spec 2/4, Phase 1d/1f) | 2026-06-20 |
| [2026-06-20 — Prod Auth Plan B2: Stale-Anonymous Cleanup Job](_done/2026-06-20-prod-auth-planB2-stale-anon-cleanup.md) (Spec 2/4, Phase 1e) | 2026-06-20 (Cloud Scheduler wiring deferred to infra) |
| [2026-06-20 — Prod Auth Plan C1: Data-API Lockdown](_done/2026-06-20-prod-auth-phase2-data-api-lockdown.md) (Spec 2/4, Phase 2 / D3) | migration 0009 landed (commit e310078) |

> Review-pipeline byproducts (`*.diff.md`, `*.parallel.md`, `*.review.md`) are left at the folder root next to this index; they are transient artifacts, not plans.

---

## Filename format

`YYYY-MM-DD-{area}-{descriptor}.md`

If there are multiple plans for one area (a big chunk of work):

`YYYY-MM-DD-{area}-{spec{x}}-[plan{N}]-{descriptor}.md`

Make the title clear about which spec and which phase the plan covers.
