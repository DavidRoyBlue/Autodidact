# Plans

Step-by-step implementation plans for Autodidact features.

---

## Purpose

Plans are structured task lists written before implementation begins. They are the primary input for agentic workers executing multi-step features.

---

## Where this fits

- Parent: [superpowers/README.md](../README.md)

---

## Index

| Plan | Status |
|---|---|
| [2026-04-28 — Mobile Design System](2026-04-28-mobile-design-system.md) | In progress |
| [2026-04-29 — Fix Vitest Hoisting](2026-04-29-fix-vitest-hoisting.md) | In progress |
| [2026-04-29 — JWKS Auth](2026-04-29-jwks-auth.md) | In progress |
| [2026-06-02 — CI/CD & Dependency Hardening](2026-06-02-cicd-dependency-fixes.md) | Not started |
| [2026-06-19 — Local Supabase Stack](2026-06-19-local-supabase-stack.md) (Spec 1/4) | Complete (2026-06-19) |
| [2026-06-19 — Prod Auth Plan A: Provisioning & Identity](2026-06-19-prod-auth-1-provisioning.md) (Spec 2/4, Phase 0–1 provisioning) | Complete (2026-06-20, merged + applied to prod) |
| [2026-06-20 — Prod Auth Plan B1: Anonymous Sign-In & Mobile Lifecycle](2026-06-20-prod-auth-planB1-anonymous-mobile.md) (Spec 2/4, Phase 1d/1f) | Not started |
| [2026-06-20 — Prod Auth Plan B2: Stale-Anonymous Cleanup Job](2026-06-20-prod-auth-planB2-stale-anon-cleanup.md) (Spec 2/4, Phase 1e) | Complete (2026-06-20, endpoint + processor; Cloud Scheduler wiring deferred to infra) |

---

## Filename format

`YYYY-MM-DD-{area}-{descriptor}.md`

if there is multiple plans related to one big chunk of work, name should be

`YYYY-MM-DD-{area}-{descriptor}[-phase{N}]-{phase-descriptor}.md`

make the title of the plan clear as to what spec it is about, and also wich phase it is.
