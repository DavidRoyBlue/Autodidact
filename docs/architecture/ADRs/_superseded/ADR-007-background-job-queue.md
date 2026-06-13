# ADR-007: Background job queue

## Status

Superseded by [ADR-027](../services/worker/ADR-027-background-job-queue-cloud-tasks.md)
Date: 2026-05-10 (superseded 2026-06-11)

The 🚩 reconsideration flag below fired: the migration to GCP Cloud Tasks was
executed during an infra-simplification sprint. See ADR-027 for the decision.

🚩 Reconsideration flag (historical): GCP Cloud Tasks would let us drop the Memorystore Redis instance and the standalone worker service, simplifying infra and lowering monthly cost. Staying with BullMQ because the worker code, retry semantics, and local-dev story are already in place. Migration trigger: an explicit infra-simplification sprint, or when Memorystore costs become noticeable on the monthly GCP bill.

## Context

Course generation is LLM-heavy (10–30 s, sometimes more). Running it
synchronously inside an HTTP request would (a) tie up the connection for
30 s, (b) lose work silently if the client times out or disconnects,
(c) leave no retry mechanism for transient LLM/network failures, and
(d) make Cloud Run scaling harder (a request that runs that long counts as
"in-flight" against concurrency budgets).

We need a way to decouple "request received" from "work done": the API
accepts the request, returns a job id, and the client polls for status. A
worker processes jobs in the background with retries. After course
generation succeeds, a follow-up embedding job stores the topic vector
([ADR-010](../packages/db/ADR-010-vector-search-strategy.md)).

This ADR sits inside our [Cloud Run hosting](../infra/ADR-012-cloud-hosting-platform.md)
context — that constrains some choices (no always-on VMs we manage; the
worker either polls a queue from a long-running container, or is invoked
by HTTP from a queue service).

## Non-goals

- Job retry semantics, idempotency rules, dead-letter handling — implementation details, owned by `services/worker/CLAUDE.md` and `services/worker/src/processors/CLAUDE.md`.
- The generation graph itself — that's [ADR-006](../services/agent/ADR-006-ai-orchestration-framework.md).
- Hosting platform — see [ADR-012](../infra/ADR-012-cloud-hosting-platform.md).
- Provider abstraction for the queue — see [ADR-009](../packages/providers/ADR-009-external-vendor-abstraction.md). The queue lives behind `IQueueProvider`.

## Decision Drivers

- **Decouple request from work** — primary requirement; any option that delivers durable async execution qualifies.
- **Retries with backoff** — LLM and network failures are transient; retries are not optional.
- **Cloud Run compatibility** — the runtime is Cloud Run. A worker that polls a queue must be a long-running container; an HTTP-invoked worker can be ephemeral.
- **Operational simplicity** — solo team. Fewer moving parts is real value.
- **Cost** — Memorystore Redis (smallest tier) is ~$50–80/month on GCP. Avoiding that is meaningful at MVP stage.
- **Local development** — devs need a way to run the queue end-to-end locally.
- **Observability** — being able to see queue depth, failed jobs, retry traces.
- **Vendor lock-in** — we already depend on GCP for hosting; piling on more GCP-specific surface deepens that dependency.

## Options Considered

### Option A: BullMQ + Redis (current)
**What it is:** Open-source, MIT-licensed queue library on top of Redis Streams. The worker service is a long-running Cloud Run container that polls Redis and processes jobs. Retries with exponential backoff are configured per queue (`{ attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` — retries at 5 s, 25 s, 125 s). Bull Board provides a queue dashboard.

**Pros**
- Mature, MIT-licensed, owned by no single vendor.
- Strong TypeScript ergonomics; `Worker`, `Queue`, `Job` are well-typed.
- Rich features beyond what we use today (delayed jobs, repeatable jobs, priorities, rate limiters, flows).
- Local dev is straightforward — `docker-compose up redis` and the same code paths run.
- Decoupled from any cloud vendor; portable to any host that can run Node + Redis.
- Bull Board (or Arena) gives a usable dashboard for inspecting queue state.

**Cons**
- Requires an always-on Redis instance. On GCP Memorystore, that's $50–80/month minimum, plus VPC connector costs.
- Requires a worker as a separate Cloud Run service, which has a min-instance count to actually pull jobs (Cloud Run scale-to-zero would mean no consumer; we keep ≥1 instance running).
- Two infrastructure components (Redis + worker container) to monitor and pay for, both serving one feature set.
- After 3 failures the course row is left in `generating` status with no automatic reset — captured in the superseded ADR; still true and documented in `services/worker/CLAUDE.md`.
- Job idempotency on retry is the application's problem (we have to ensure module rows aren't double-inserted on a retried job).

### Option B: GCP Cloud Tasks
**What it is:** Google's managed task queue. The API creates a task; Cloud Tasks invokes an HTTP endpoint (a Cloud Run service or any HTTP target) with the task payload, with retries on non-2xx responses. No queue server to operate.

**Pros**
- No Redis instance, no separate worker service. Cloud Tasks invokes an HTTP endpoint on `services/api` (or a small dedicated handler service) directly.
- Native integration with Cloud Run (IAM-authenticated, no public exposure of the worker endpoint needed).
- Pay-per-task pricing — likely <$5/month at our scale, vs $50+/month for Memorystore.
- Built-in retries with backoff; we configure max attempts and rate limits at the queue level.
- Operationally simple — Google operates the queue.

**Cons**
- Job execution is bounded by the receiver's request timeout. Cloud Run's max request timeout is 60 minutes (per current GCP docs); typical course generation fits inside it, but tail-end LLM behavior could brush against it. Would need explicit handling for tasks approaching the limit.
- Job size limit: 1 MB. Our payloads are tiny (a course request, a job id) — fine, but boundary noted.
- Cloud Tasks dashboard is functional but less polished than Bull Board for queue introspection.
- Local development without Cloud Tasks needs an emulator or an alternative path. The official emulator exists but is less ergonomic than `docker-compose up redis`.
- Vendor lock-in to GCP deepens — moving off GCP later would mean re-implementing the queue layer.
- Long-running synchronous behavior in the receiver means the receiver Cloud Run instance is spending its concurrency budget on long jobs. With min instances and proper concurrency tuning, fine — but it shifts the worker pattern from "polls and processes" to "receives long-running HTTP requests."

### Option C: GCP Pub/Sub (with push subscription to Cloud Run)
**What it is:** Pub/Sub topic + push subscription that delivers messages as HTTP POSTs to a Cloud Run endpoint.

**Pros**
- Same "no Redis, no worker process" benefits as Cloud Tasks.
- Massive throughput ceiling; designed for streaming-scale workloads.
- Pub/Sub's at-least-once delivery + acknowledgment model.

**Cons**
- Pub/Sub is fundamentally a messaging system, not a task queue. Per-message retry behavior, ordering, and dead-letter conventions feel less natural for "do this discrete unit of work" than Cloud Tasks does.
- 7-day max message retention; long retry tails would hit this limit.
- Higher base cost than Cloud Tasks for low-volume workloads — Pub/Sub charges per GiB, and a low-volume task queue uses tiny message sizes but still pays the 10 GB/month minimums to a degree.
- We don't need fanout / multi-subscriber semantics, which is where Pub/Sub shines.

### Option D: Inngest
**What it is:** Hosted event-driven job platform with a TypeScript SDK. Functions react to events, with step-level durability, retries, and replay. SDK open-source; orchestration engine is Inngest's.

**Pros**
- Best-in-class DX for TypeScript jobs in 2026 — function-style definitions, step composition, replay debugging.
- No infra to operate; Inngest hosts the queue and orchestration.
- Generous free tier; pay-per-step pricing scales smoothly.
- Step-level retries are clean for our two-step flow (generate course → generate embedding). Each step is independently retriable.

**Cons**
- Vendor: another company in the stack. Concentrates risk that we'd otherwise avoid by sitting on GCP primitives or open-source Redis.
- Functions live in our codebase but the orchestration is hosted; debugging when Inngest is having an incident means waiting on their status page.
- Cannot self-host the orchestration engine (the SDK is open source; the hosted product is not).
- Adds another env var pile and a webhook contract.
- For "MVP, two queues, low volume" we're paying a DX premium for something BullMQ already covers.

### Option E: Trigger.dev
**What it is:** Similar to Inngest — hosted workflow/job platform with a TypeScript SDK. Self-hostable since v3.

**Pros**
- Self-hostable (unlike Inngest), so the vendor-lock concern is softer.
- Comparable DX to Inngest; durable workflows, step retries, observability dashboard.

**Cons**
- Self-hosting adds the same "ops surface" we're trying to avoid by leaving Redis. The serverless model is the actual draw, but it brings the vendor relationship with it.
- Newer than BullMQ; ecosystem is still catching up.
- Same overall calculus as Inngest for our scale.

### Option F: Temporal (self-hosted or Temporal Cloud)
**What it is:** Durable workflow engine; the gold standard for long-running, fault-tolerant workflows.

**Pros**
- Best-in-class for complex multi-step workflows with compensation, signals, timers, and durable state.
- Powers serious workloads at major companies.
- Both self-hosted and managed (Temporal Cloud) options.

**Cons**
- Massive overspec for two sequential queue steps. We'd be installing a workflow engine to run "generate course, then embed it."
- Self-hosted requires a Cassandra or PostgreSQL backend, plus the Temporal server cluster.
- Temporal Cloud is comparable to or pricier than Inngest at our scale.
- The mental model (workflows, activities, queries, signals) is meaningfully more complex than BullMQ's `Queue.add()` / `Worker.process()`.

### Option G: Postgres-based queue (pg-boss)
**What it is:** Background-job queue that uses Postgres (specifically `LISTEN/NOTIFY` and tables) as the backing store. No Redis; reuses our existing Supabase Postgres.

**Pros**
- Removes Redis as a dependency by using the database we already have.
- One fewer system to operate.
- Mature; pg-boss has been around since 2016.

**Cons**
- Job processing competes for Postgres connections and CPU with the rest of the app. At low volume this is fine, but a heavy queue load can degrade the rest of the DB.
- TS API and ergonomics are good but a step behind BullMQ's modern surface.
- Still requires a long-running worker process to consume jobs (no improvement on the "worker container needed" front vs BullMQ).
- Migration off BullMQ is meaningful work for limited gain — we'd save Redis cost, but we'd add load to the DB and rebuild our retry/backoff config.

## Decision

**We keep BullMQ + Redis.**

## Rationale

Lining up the drivers:

- **Decouple request from work (#1)**: All of A–G satisfy. Not differentiating.
- **Retries with backoff (#2)**: A, B, C, D, E, F, G all do. A, D, E, F are the most flexible.
- **Cloud Run compat (#3)**: A is "long-running worker container." B/C are "HTTP-invoked Cloud Run service" — different shape, same platform. D/E/F all work via HTTP webhooks against Cloud Run.
- **Operational simplicity (#4)**: B is the simplest by a meaningful margin (no Redis, no separate worker). A requires Memorystore + worker. D/E externalize ops to a vendor.
- **Cost (#5)**: B is the cheapest. A's Memorystore + worker min-instance costs add up. D/E free tiers exist but pay-per-step accumulates. F is enterprise-priced.
- **Local dev (#6)**: A wins (Redis in docker-compose). B requires the Cloud Tasks emulator, which is functional but not as nice. D/E require either local mode or a tunneled webhook.
- **Observability (#7)**: A's Bull Board is the most polished free option. D/E ship excellent dashboards as part of the product. B's Cloud Tasks console is OK.
- **Vendor lock-in (#8)**: A best (open source, portable). B/C lock further into GCP. D worst (proprietary orchestration).

The first-principles answer is **B (Cloud Tasks)** for our specific
constraints: we're on Cloud Run, we want fewer moving parts, we don't
benefit from BullMQ's advanced features (priorities, flows, rate limiters),
and the cost delta is ~$50–80/month for infrastructure that exists to
serve a handful of jobs an hour.

We are choosing **A (BullMQ)** anyway because:
1. The worker service exists and works. The retry semantics, idempotency
   handling, and Bull Board are wired up.
2. The migration from BullMQ to Cloud Tasks is real engineering effort —
   not just rewriting the queue calls, but restructuring the worker from
   "long-running poller" to "HTTP endpoint that runs the job synchronously
   per task." The agent-service interaction patterns would need adjustment.
3. The cost delta, while real, is not crisis-level pre-revenue. ~$50–80/month
   is hardly the line that decides whether we ship.
4. Local development with BullMQ + Redis is meaningfully more pleasant than
   any Cloud Tasks alternative.

This is **expedience-over-merit**. The reconsideration flag is real.

> 🚩 **Reconsideration flag:** Cloud Tasks would simplify infrastructure (no Memorystore Redis, no separate worker service) and lower monthly cost by ~$50–80. Staying with BullMQ because the worker is built and stable; migration is real work. Migration trigger: an explicit infra-simplification sprint, the Memorystore bill becoming visible enough to matter, or a need for features Cloud Tasks delivers more cleanly (e.g., scheduled jobs at specific times).

## Consequences

### Positive
- Worker is in place and battle-tested; we're not blocking on infra changes.
- Local dev unchanged from the existing `docker-compose` flow.
- BullMQ's feature surface (delayed jobs, scheduling, priorities, rate limiters) is available if we ever need it.
- Portable across hosting providers — if we ever leave GCP, the queue moves with us.

### Negative
- Recurring Memorystore Redis cost (~$50–80/month minimum on GCP) for a feature that has lower-cost native alternatives on the same cloud.
- Worker service must keep ≥1 min instance to actually pull jobs — that's another container always paying for itself.
- Two systems (Redis + worker) on the operational checklist for one feature set.
- Idempotency on job retries is application-code responsibility; future feature work has to keep this in mind.

### Follow-up decisions
- Cleanup pattern for stale `generating` courses (older than N hours stuck) — owned by `services/worker/CLAUDE.md`, not this ADR.
- Reconsider this ADR when: doing an explicit infra-simplification pass, dropping or replacing [ADR-012](../infra/ADR-012-cloud-hosting-platform.md) (different host might reframe the calculus), or considering an LLM observability/durable-workflow tool that overlaps Inngest/Trigger.dev — at which point comparing those to a fresh start is honest.
