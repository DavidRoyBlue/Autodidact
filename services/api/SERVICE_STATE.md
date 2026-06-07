# Service State: API

> Public HTTP service (NestJS). The only service the mobile app talks to.
> Pair docs: [`README.md`](./README.md) · [`CLAUDE.md`](./CLAUDE.md)

## Purpose

Public-facing REST + SSE API. Owns the auth boundary (Supabase JWT), the course lifecycle (similarity check → reuse or enqueue generation), chat session persistence, SSE proxying to the Agent, and module progress tracking. Runs no AI itself.

## Status

- Dev Ready: ✅
- Beta Ready: ⚠️
- Production Ready: ❌

## Current State

- All controllers implemented and guarded: courses, chat, progress, health.
- Real JWT verification via `IAuthProvider` → Supabase JWKS (`jose`), not a stub.
- Zod input validation on every route; global `v1` prefix; `AllExceptionsFilter`.
- Queue enqueue via `QUEUE_PROVIDER_TOKEN` (BullMQ); single `ApiAgentClient` for all agent calls.
- 6 test files (auth guard, courses/chat/progress integration, slug, validation pipe). Green in CI.

## Infrastructure

- API (HTTP): ✅ implemented, Dockerfile + Cloud Run module present
- Database: ✅ Drizzle/Postgres via `@autodidact/db`
- Auth: ✅ Supabase JWKS verification (real)
- Queue: ✅ BullMQ enqueue
- Storage: ➖ not used
- Email: ❌ none
- Analytics: ❌ none
- Error Tracking: ❌ none wired (OTEL endpoint optional; blank = traces dropped)

## Current Bottleneck

Never validated end-to-end against provisioned infra. Prod env/secrets are not set up (`docs/todo.md`), and Terraform provisions secret names (`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) that the code does not read — the code uses JWKS (needs `SUPABASE_URL`) and `SUPABASE_SECRET_KEY`. A real deploy would fail on this drift.

## Known Issues

- Infra/runtime secret-name drift (above) — deployment-blocking.
- No rate limiting / abuse protection on public routes.
- No request observability backend configured (no Sentry, OTEL endpoint blank).
- Doc drift: README lists agent route `/generate-course`; actual route is `/course/generate` (client calls it correctly).

## Next Steps

1. Reconcile Terraform secret names with what the code reads; provision them in Secret Manager.
2. Wire an error-tracking/observability backend (set OTEL endpoint or add Sentry).
3. Add rate limiting to public endpoints before exposing to beta users.
4. Run one full deploy + smoke test against staging/prod.

## Open Questions

- Is there a staging environment, or does `master` push straight to prod (current `deploy.yml`)?
- Should chat message history be capped/paginated for long sessions?

## Confidence

- Developers: ✅ — clean module-per-feature structure, tests, docs.
- Internal testers: ⚠️ — works locally; needs full stack (agent + worker + Redis + DB) running.
- Beta users: ⚠️ — needs monitoring + rate limiting + a validated deploy first.
- Production users: ❌ — secret drift and absent observability block it.
