# todos

<!-- ## Github mcp / actions ci/ci
- [x] Set it
- [x] Make it work -->

## ENV variable setup
- [ ] Set it
- [ ] Make it work

## Code-review-graph
- [x] Add code-revire-graph
- [x] Generate graph visually
- [ ] Use graph to improve codebase

## Map the services and tie them to adr and readme
- [x] map the services
- [ ] understand the architechture

## ADRS
- [x] Go trough all my services one by one and set up adrs

## READMEs and CLAUDE.md
- [x] Go trough all my services one by one and set em up.

## .claude folder setup
- [x] agents, commands, hooks, skills, settings in place

## Deploy & operate

> MVP is code-complete and CI-green. These close the "builds" → "deployable &
> operable" gap. Per-deployable status lives in the root `PRODUCTION.md`.

### 1. Provision + reconcile environment (current bottleneck)
- [x] Fix Terraform/code secret-name drift — `main.tf` now injects `SUPABASE_SECRET_KEY` (matching `packages/env/src/schema.ts`); dropped the unread `SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Set Secret Manager values — fill `infra/secrets.env` and run `scripts/gcp-bootstrap.sh`
- [ ] Run one full deploy + smoke test against staging/prod

### 2. Make it durable for real sessions
- [ ] Flip `CHECKPOINTER=postgres` (currently defaults to in-memory) and verify
- [ ] Add Worker failed-job recovery so stuck courses aren't unrecoverable

### 3. Make it observable + safe to expose
- [ ] Wire error tracking / OTEL backend
- [ ] Add API rate limiting
- [ ] Add LLM cost/token controls in the Agent

### 4. Ship the client
- [x] EAS build config for Mobile (`apps/mobile/eas.json`: development/preview/production) — Play Store submission still pending
- [ ] Add real Mobile test coverage (E2E, not just light unit tests)

## Open questions (block the above)
- [ ] Staging environment, or does `master` deploy straight to prod (`deploy.yml`)?
- [ ] Acceptable LLM spend ceiling, and how enforced?
- [ ] First beta target: iOS, Android, or both — which distribution channel?
- [x] BullMQ/Memorystore vs. Cloud Tasks for prod job durability → resolved: Cloud Tasks (ADR-027, supersedes ADR-007)
