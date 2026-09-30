# ADR-032: Production reaches AgentPlatform on GCP with a bearer key per service

## Status

Accepted
Date: 2026-09-30

## Context

ADR-030 and ADR-031 moved course generation (worker, workflow
`course-creator-lean`) and the module teacher (api, agent `course-teacher`)
onto AgentPlatform's `/api/v1`. Both work against the platform at
`http://localhost:8400` on the owner's WSL machine, and only there: nothing in
`infra/` wired a platform URL or credential, neither client sent auth, and the
worker polled a run with no deadline of its own. Production (Cloud Run, Cloud
Tasks, ADR-027) had no route to the platform, so both features could not run
there. Both ADRs left this as their open follow-up (#321).

AgentPlatform already ships opt-in bearer auth (its ADR 0008): with
`AGENT_PLATFORM_API_KEYS=actor:token,...` set server-side, every `/api/v1`
call needs `Authorization: Bearer <token>`, and the token's actor is what the
audit trail records. The platform lives in its own repo (`~/AgentPlatform`)
with its own Supabase project.

A course-creator run took ~24 min before #399; the lean workflow measured
6 min 17 s for 7,973 words ($1.95) on 2026-09-30 (`run_e9f045984552`, preset `1h`). Cloud Tasks caps
an HTTP task's dispatch deadline at 30 min, and a retried task starts a new,
separately billed run.

## Non-goals

This ADR does not decide:
- how AgentPlatform is deployed on GCP (Cloud Run shape, its database, its
  secrets) — owned by `~/AgentPlatform`
- the Cloud Tasks `dispatch_deadline` and Cloud Run request timeout for the
  worker (ADR-030's deadline follow-up, a separate change)
- streaming generation or its progress UX (#96)

## Decision Drivers

- The platform is a product of its own — one operator, one deploy, one
  database; Autodidact should consume a URL, not host a copy.
- Credentials identify the caller — the platform's audit trail should say which
  service started a run, and one leaked key should be revocable alone.
- One secret path — every prod secret already flows `infra/secrets.env` →
  `gcp-bootstrap.sh` → Secret Manager → `main.tf`.
- A retry must not double-bill — a worker that gives up on a run has to stop it.
- No silent degradation — there is no in-app generator or teacher left to fall
  back to (ADR-030/031).

## Options Considered

### Option A: GCP-hosted platform, bearer key per service
**What it is:** `~/AgentPlatform` deploys the platform on GCP (Cloud Run + its
own Supabase). The api and worker get its URL and one key each (actors
`autodidact-api`, `autodidact-worker`) through Secret Manager.

**Pros**
- No dependency on the owner's machine being on; same auth model the platform
  already enforces.
- Per-service attribution and revocation.

**Cons**
- Production waits on a platform deploy in another repo.

### Option B: Tunnel or VPN from Cloud Run to the WSL machine
**What it is:** expose `localhost:8400` through a tunnel (Cloudflare, Tailscale)
and point prod at it.

**Pros**
- Works today, no platform deploy.

**Cons**
- Prod is down whenever the laptop sleeps; a home connection on the request
  path; a tunnel is a new attack surface to own.

### Option C: Placeholders only, defer the route
**What it is:** wire env names, leave hosting undecided.

**Pros**
- Smallest change.

**Cons**
- Decides nothing; prod still cannot run either feature and the next session
  re-opens the same question.

## Decision

**We chose: Option A.**

- The api and worker read `AGENT_PLATFORM_URL` and `AGENT_PLATFORM_API_KEY`
  (optional; unset only against a keyless local platform) and send
  `Authorization: Bearer <key>`.
- Secret Manager: `autodidact-agent-platform-url` (shared; seeded as
  `https://placeholder` until the platform is hosted), and
  `autodidact-api-agent-platform-key` / `autodidact-worker-agent-platform-key`
  (required by `gcp-bootstrap.sh`, generated with `openssl rand -hex 32`, and
  registered on the platform as `autodidact-api:<t>,autodidact-worker:<t>`).
- Fail closed: an unreachable platform or rejected key surfaces as the error it
  is — a failed course (after queue retries) or a chat `error` event.
- The worker stops polling a run after 15 min, `POST
  /api/v1/runs/:id/cancel`s it, and throws, so the Cloud Tasks retry starts
  from a stopped run rather than paying for two.

## Rationale

Option A is the only one that keeps production independent of one machine,
and it reuses the auth the platform already has instead of inventing one. Per-
service keys cost one extra secret and buy attribution and independent
revocation. 15 min is ~2.5× the measured
`1h` run and half the Cloud Tasks cap: generous for the presets people pick,
while a runaway run is stopped and billed for 15 min, not 30. The `4h` and
`unrestricted` presets (4× or more the words, not yet measured) will likely hit
it; that is accepted as the pressure to make generation faster (#96), not a
reason to raise the ceiling.

## Consequences

### Positive
- Prod's route to the platform is declarative (`main.tf`, bootstrap) and
  complete on this side; flipping the URL secret is the only step left.
- Runs in the platform's audit trail name the service that started them.
- A hung run can no longer hold a worker instance forever or overlap its retry.

### Negative
- Both features stay unavailable in prod until `~/AgentPlatform` is deployed on
  GCP with keys enforced.
- The worker timeout is only real once the Cloud Tasks / Cloud Run deadlines
  exceed it; until then the request is killed first and the run is not
  cancelled (deadline follow-up).
- A course whose generation legitimately runs longer than 15 min fails: each
  of the `TASK_MAX_ATTEMPTS` retries starts a fresh run that is cancelled at
  15 min again, so it costs up to three partial runs before the course is
  marked `failed`.

### Follow-up decisions
- AgentPlatform: deploy on GCP, set `AGENT_PLATFORM_API_KEYS` with both actors
  (owned by `~/AgentPlatform`).
- Raise the worker's Cloud Tasks `dispatch_deadline` and Cloud Run timeout above
  the run timeout (ADR-030 follow-up).

## Related

- ADR-030, ADR-031 (their hosting follow-up); ADR-027 (Cloud Tasks)
- AgentPlatform `docs/decisions/0008-auth-async-evals-pagination.md`
- #321, #320, #399
