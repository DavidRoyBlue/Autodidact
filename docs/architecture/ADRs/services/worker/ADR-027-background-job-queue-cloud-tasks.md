# ADR-027: Background job queue — migrate to GCP Cloud Tasks

## Status

Accepted
Date: 2026-06-11
Supersedes: [ADR-007](../../_superseded/ADR-007-background-job-queue.md)

## Context

[ADR-007](../../_superseded/ADR-007-background-job-queue.md) chose BullMQ +
Memorystore Redis with an explicit 🚩 reconsideration flag: its own
first-principles analysis concluded **GCP Cloud Tasks** was the better fit for
our constraints, and BullMQ was kept only because the worker was already built.
The flag named the migration trigger: *"an explicit infra-simplification
sprint, or when Memorystore costs become noticeable on the monthly GCP bill."*
This ADR records the execution of that flagged migration during exactly such a
sprint.

Stack situation at decision time: three Cloud Run services
([ADR-012](../../infra/ADR-012-cloud-hosting-platform.md)); two queues
(`course-generation`, `embedding`) behind the `IQueueProvider` abstraction
([ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md));
a standalone worker service running as an always-on BullMQ poller
(`min_instances = 1`); a 1 GB STANDARD_HA Memorystore Redis instance
(~$50–80/month) existing solely to carry a handful of jobs per hour. Job
payloads are tiny JSON; generation runs 10–30 s — far inside Cloud Run's
60-minute request ceiling that ADR-007 noted as the main Cloud Tasks boundary
risk.

What changed since ADR-007: nothing about the options — the calculus ADR-007
already ran still holds. What changed is that the migration trigger fired, and
the cost of carrying two pieces of always-on infrastructure (Redis + worker
min-instance) for a pre-revenue product became the thing being paid for
"expedience" that no longer saves any time.

## Non-goals

- Hosting platform — [ADR-012](../../infra/ADR-012-cloud-hosting-platform.md)
  (an `## Update` note there records the worker's new shape).
- The generation graph itself — [ADR-006](../agent/ADR-006-ai-orchestration-framework.md).
- Provider abstraction — [ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md);
  the queue stays behind `IQueueProvider`.
- Job idempotency rules and processor semantics — owned by
  `services/worker/CLAUDE.md` and `services/worker/src/processors/CLAUDE.md`.

## Decision Drivers

Identical to ADR-007's drivers; the ones that decide the outcome here:

- **Operational simplicity** — solo team; Redis + an always-on worker container
  were two systems on the ops checklist serving one feature.
- **Cost** — Memorystore (~$50–80/mo) + worker min-instance compute, vs
  pay-per-task (<$5/mo at our volume) and a scale-to-zero worker.
- **Cloud Run compatibility** — Cloud Tasks invokes an HTTP endpoint with IAM
  auth natively; the platform does the authentication before a request reaches
  the container.
- **Local development** — ADR-007's strongest argument for staying. Any
  migration has to keep `pnpm dev` pleasant without a queue emulator.
- **Failure recovery** — the documented #1 worker gap (courses stuck in
  `generating` forever after retry exhaustion) needs a place to live; Cloud
  Tasks' final-attempt semantics give it one.

## Options Considered

### Option A: Keep BullMQ + Redis (status quo)

**Pros**
- Zero migration work; worker code battle-tested.
- Best local dev story of all options (`docker compose up redis`).
- Bull Board dashboard; portable across clouds.

**Cons**
- ~$50–80/month Memorystore + always-on worker instance, indefinitely, for a
  handful of jobs per hour.
- Two infra components to monitor for one feature set.
- ADR-007's own analysis already concluded this is the wrong first-principles
  answer for our constraints; keeping it means carrying a known-flagged debt.

### Option B: GCP Cloud Tasks (HTTP push to the worker)

**What it is:** the API (and worker, for the follow-up embedding task) creates
a task; Cloud Tasks POSTs it to the worker's `/tasks/:name` endpoint with an
OIDC token; Cloud Run IAM rejects unauthenticated calls before they reach the
container. Retry/backoff is queue-level config in Terraform.

**Pros**
- Deletes the Memorystore instance and the always-on worker requirement
  (worker becomes scale-to-zero).
- Pay-per-task: effectively free at our volume.
- Retries with backoff are managed config, not application code.
- The final-attempt header (`X-CloudTasks-TaskRetryCount`) gives a clean hook
  to mark exhausted courses `failed` — closing the stuck-`generating` gap.
- IAM-authenticated push means no auth code in the worker.

**Cons**
- Worker restructures from poller to HTTP service — the "real engineering
  effort" ADR-007 deferred (now spent, in this change).
- Local dev needs a substitute for the queue: solved with a loopback provider
  (enqueue = direct HTTP POST to the worker), not the awkward emulator.
- Queue introspection (console) is weaker than Bull Board.
- Deepens GCP lock-in: leaving GCP later means re-implementing the queue layer
  (mitigated: `IQueueProvider` keeps the seam, and the loopback provider proves
  a second implementation exists).

### Option C: GCP Pub/Sub push subscriptions

**Pros**
- Same "no Redis, no poller" shape as Cloud Tasks.
- Higher throughput ceiling than we will need for years.

**Cons**
- Messaging semantics, not task semantics — per-task retry control and
  dead-lettering are less natural than Cloud Tasks' per-queue `retry_config`.
- 7-day retention cap on retry tails.
- Costs more than Cloud Tasks at low volume; fanout (its actual strength) is
  not something we use.

### Option D: pg-boss (Postgres-backed queue)

**Pros**
- Drops Redis using the database we already run.
- No new vendor surface.

**Cons**
- Keeps the long-running worker container — half the savings don't materialise.
- Queue load competes with application queries on the same Postgres.
- A migration of equal size to Option B that lands on a worse end-state for our
  hosting (Cloud Run wants HTTP-invoked, scale-to-zero workloads).

## Decision

**We migrate to GCP Cloud Tasks (Option B).** The worker becomes a thin
Fastify HTTP task handler; local development uses a loopback queue provider
that POSTs directly to the same endpoints; retry policy moves to Terraform
queue config; generation status is read from `courses.status` (the DB was
already the real source of truth); retry exhaustion marks the course `failed`.

## Rationale

ADR-007 already did the honest comparison and named Cloud Tasks the
first-principles answer; it stayed on BullMQ for four reasons, each of which
this sprint dissolves:

1. *"The worker exists and works"* — the processor logic is preserved verbatim
   as pure functions; only the transport shell changed.
2. *"Migration is real engineering effort"* — true, and now paid once, versus
   an indefinite monthly carrying cost.
3. *"The cost delta is not crisis-level"* — still true, but the trigger the
   flag defined (infra-simplification sprint) is precisely the moment to stop
   paying it.
4. *"Local dev with Redis is more pleasant than the Cloud Tasks emulator"* —
   sidestepped rather than conceded: the loopback provider gives a *better*
   local story than before (no Redis container at all; `docker compose up`
   now boots only Postgres).

What we sacrifice: BullMQ's richer feature surface (delayed jobs, priorities,
rate limiters, flows — none in use), Bull Board introspection, and queue-layer
portability off GCP. The `IQueueProvider` seam bounds that last sacrifice to
one provider class.

No reconsideration flag. This lands on the option the analysis has pointed at
since ADR-007 was written.

## Consequences

### Positive
- Memorystore Redis instance, VPC exposure, and `redis`/`bullmq`/`ioredis`
  dependencies deleted across the repo.
- Worker scales to zero; no always-on containers exist solely for the queue.
- Retry policy is declarative infra (`infra/modules/cloud-tasks`), mirrored to
  the worker via `TASK_MAX_ATTEMPTS`.
- Courses can no longer be stuck in `generating` forever — the final failed
  attempt flips them to `failed` (guarded so a committed `ready` course is
  never flipped back).
- Status polling reads `courses.status` — one source of truth instead of DB
  state + transient Redis job state.
- Local dev sheds the Redis container; the loopback provider exercises the
  same HTTP contract production uses.

### Negative
- GCP lock-in deepens: the queue layer is now a GCP primitive.
- Loopback local dev means no retry simulation locally (single attempt,
  treated as final) — retry behaviour is only observable in production or
  against a real queue.
- Worker cold starts add ~1 s to the first task after idle (acceptable against
  a 10–30 s job).
- In-flight BullMQ jobs at cutover are not migrated; deploy during a quiet
  window or accept regenerating affected courses.

### Follow-up decisions
- Alerting on the `failed` course rate and on Cloud Tasks dead-letter behaviour
  — operational, owned by `services/worker/SERVICE_STATE.md` next steps.
- Cutover ordering: Terraform apply (queues + IAM + secrets) before deploying
  the new images; worker before api. Two Secret Manager values must be set by
  hand during cutover: `autodidact-queue-provider` changes from `bullmq` to
  `cloudtasks` (the factory rejects unknown values at boot), and
  `autodidact-worker-task-base-url` is created with the worker's Cloud Run URL
  after its first deploy (same chicken-and-egg pattern as
  `autodidact-agent-service-url`).
- Reconsider if: we leave GCP (the queue layer moves with the host decision,
  [ADR-012](../../infra/ADR-012-cloud-hosting-platform.md)), or scheduled /
  prioritised / flow-shaped jobs appear (re-open the Inngest/Trigger.dev
  comparison from ADR-007 at that point).
