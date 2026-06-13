# ADR-012: Cloud hosting platform

## Status

Accepted
Date: 2026-05-10

## Context

Three backend services run as containers: `services/api` (public-facing,
~5–10 endpoints, traffic spiky during user activity), `services/agent`
(internal, called by api/worker, usage drives LLM cost so we want
scale-to-zero when idle), `services/worker` (always-on background poller
for BullMQ — cannot scale to zero by design, see [ADR-007](./../_superseded/ADR-007-background-job-queue.md)).

The hosting platform decision determines: how containers are deployed,
how they scale, how they expose health checks, what the public-vs-internal
boundary looks like, and how IAM/secrets are managed.

This decision is independent of the database ([ADR-002](../cross-cutting/ADR-002-database-platform.md);
Supabase is consumed via its public hostname — works on any cloud) and
the queue ([ADR-007](./../_superseded/ADR-007-background-job-queue.md);
BullMQ on Memorystore Redis is GCP-specific in our current setup, but
Redis-on-anywhere works on any cloud).

Auth is on Supabase ([ADR-020](../cross-cutting/ADR-020-authentication-strategy.md))
which is hosting-agnostic.

## Non-goals

- Infrastructure-as-Code tool — see [ADR-021](./ADR-021-infrastructure-as-code.md).
- CI/CD platform — see [ADR-022](./ADR-022-cicd-platform.md).
- Specific instance sizing, autoscaling thresholds — operational, owned by `infra/CLAUDE.md`.
- Database hosting — see [ADR-002](../cross-cutting/ADR-002-database-platform.md).
- Mobile app distribution (App Store, Play Store, EAS) — separate concern.

## Decision Drivers

- **Container deployment** — services are Dockerized. Whatever we pick has to deploy containers.
- **Scale-to-zero for stateless services** — api and agent should not pay for idle compute. Worker is always-on by design.
- **Cold-start performance** — first request after scale-to-zero must respond inside our latency budget for the mobile app (~1–2 s acceptable for cold).
- **Internal service-to-service routing** — api → agent should be internal (not public internet) for both latency and security.
- **Secrets / IAM** — secrets shouldn't be checked into config; IAM should be principle-of-least-privilege per service.
- **Cost at MVP** — pre-revenue; idle cost should be near zero. Per-request cost should be predictable.
- **Operational simplicity** — solo team. Avoid Kubernetes-grade complexity.
- **Vendor concentration** — already on Supabase (DB + Auth) and Anthropic/OpenAI (LLMs). The hosting vendor should not multiply incident-blast-radius unnecessarily.
- **IaC support** — chosen platform must be addressable via Terraform / Pulumi / equivalent (see [ADR-021](./ADR-021-infrastructure-as-code.md)).

## Options Considered

### Option A: GCP Cloud Run (current)
**What it is:** Google's managed serverless container platform. Deploy a Docker image; Google handles scheduling, scaling (0 → N), HTTPS termination, traffic management. Native integration with Memorystore (Redis), Artifact Registry (image storage), Secret Manager, Cloud Trace.

**Pros**
- Scale-to-zero is the default. Idle services cost nothing.
- Internal-only services via "ingress: internal" — `services/agent` is not reachable from the public internet.
- IAM-based service-to-service auth is native (Cloud Run identity tokens).
- Tight integration with the rest of GCP we already use (Memorystore for [ADR-007](./../_superseded/ADR-007-background-job-queue.md)).
- Secret Manager for env-var-style secrets without checking them into code.
- Cold start is acceptable (typically 200–700 ms for our service shapes); min-instances option exists if we need warmer start.
- Up to 60-min request timeout (relevant for [ADR-007](./../_superseded/ADR-007-background-job-queue.md)'s long course-generation jobs and [ADR-011](./../services/agent/ADR-011-realtime-streaming-transport.md)'s SSE streams).
- Pay-per-use pricing predictable at low scale.
- Egress is reasonably priced; same-region GCP services have free egress.

**Cons**
- GCP-specific: vendor lock-in to Google. Migrating involves redoing IAM, networking, and container deployment configs.
- Cold-start latency on the chat critical path occasionally hits the user. 200–700 ms isn't bad but is real.
- Memorystore (managed Redis) is more expensive than running Redis on a small VM ($50+/mo minimum, see [ADR-007](./../_superseded/ADR-007-background-job-queue.md)'s flag).
- VPC connector cost when services reach Memorystore privately (~$10/mo per connector).
- GCP's pricing model has many SKUs (CPU-second, request, egress, idle) — easy to misforecast.

### Option B: Fly.io
**What it is:** Container hosting that runs Firecracker VMs distributed globally. Sub-second cold starts. App-level ergonomics (`fly deploy`, `fly logs`) feel local-first.

**Pros**
- Fast cold starts (often <1 s).
- Multi-region deployment is a `fly.toml` change.
- Pricing model is straightforward: pay for VM time at small increments.
- Strong DX; the CLI feels like a Heroku successor.
- Wireguard-based private networking between apps is clean.

**Cons**
- Not a fit for "scale-to-zero" by default — Fly's VMs are billed even when idle (though small idle costs ~$1–4/mo per VM at minimum spec). Not free at idle.
- Less first-class managed-service ecosystem than GCP — no equivalent of Memorystore inside the same vendor (we'd run Redis ourselves on Fly or rely on Upstash/another vendor).
- Less mature IAM model than GCP; service-to-service auth is wireguard + your own auth tokens.
- We'd recreate vendor relationships we already have on GCP.
- Smaller team behind it; in 2024 Fly had a high-profile outage that shook trust for some users; it's recovered but the operational track record is shorter.

### Option C: Railway
**What it is:** Heroku-style PaaS with great DX. Ship a Dockerfile or a Node service; Railway provisions, scales, manages.

**Pros**
- Best-in-class DX for solo developers.
- Plugins for Postgres, Redis, etc., one-click.
- Predictable pricing model.

**Cons**
- Requires $5/month minimum (Hobby plan) since 2023; expensive at idle for multi-service apps.
- Always-on compute model; no granular scale-to-zero like Cloud Run.
- For a multi-service architecture (api + agent + worker + Redis), Railway's all-in-one model is convenient but pricing scales steeply.
- Smaller team / shorter operational history than GCP.
- Migrating off Railway later means reproducing whatever they did for us automatically.

### Option D: Render
**What it is:** PaaS with flat monthly pricing tiers. Similar shape to Railway with different pricing model.

**Pros**
- Predictable monthly cost (no per-request billing surprises).
- Heroku-style workflow; good DX.
- Free tier available for trial.

**Cons**
- Always-on compute; no scale-to-zero in the default tiers.
- Per-service pricing means three services + Redis adds up: $19/mo per professional service + add-ons.
- Less battle-tested at scale than Cloud Run.

### Option E: AWS App Runner / ECS Fargate
**What it is:** AWS's container hosting options. App Runner is simpler (similar to Cloud Run shape); ECS Fargate is more flexible (closer to Kubernetes-without-Kubernetes).

**Pros**
- AWS ecosystem if we'd otherwise use AWS services (we don't).
- ECS Fargate has good autoscaling and fine-grained networking.

**Cons**
- Configuration complexity is meaningful; ECS in particular is a non-trivial learning curve.
- We'd lose our existing GCP integration with Memorystore and Secret Manager — replace each with AWS equivalents.
- App Runner is functional but less polished than Cloud Run.
- AWS pricing model is famously hard to forecast for small workloads.

### Option F: Kubernetes (GKE / EKS / self-hosted)
**What it is:** Container orchestration. We define Deployments, Services, Ingresses; the cluster runs them.

**Pros**
- Maximum control. Every option imaginable.
- Industry-standard for serious scale.

**Cons**
- Severe over-engineering for three small services. We'd write Helm charts to do what `gcloud run deploy` does in one command.
- Cluster operations alone is a part-time job.
- Cost at MVP is bad (a small GKE cluster's control plane has minimum costs).
- Onboarding a new dev to Kubernetes is weeks, not hours.

### Option G: Vercel
**What it is:** Frontend-first platform that has expanded to support functions and (in 2024+) longer-lived containers.

**Pros**
- Best-in-class DX for Next.js / web frontend.
- Some support for Node.js services and Edge functions.

**Cons**
- Vercel's strength is web frontends; backend services are a less-developed product line.
- Pricing for backend container workloads is less competitive than Cloud Run.
- We don't have a Vercel-deployable web frontend; the value prop doesn't align.
- More vendor concentration (we already have Vercel via Turbo and considered it for AI SDK).

## Decision

**We use GCP Cloud Run.**

## Rationale

Lining up the drivers:

- **Container deployment (#1)**: A, B, C, D, E, F, G all yes. Not differentiating.
- **Scale-to-zero (#2)**: A is best (default). B charges idle. C and D are always-on. E (App Runner) supports it. F you build yourself. G supports it for some shapes.
- **Cold-start (#3)**: B is fastest. A is acceptable (200–700 ms). C and D have warm always-on.
- **Internal routing (#4)**: A's "internal" ingress and IAM-authenticated requests are clean. B uses wireguard. C and D have private networking. E is fine. F is the most flexible but complex.
- **Secrets / IAM (#5)**: A wins on integrated Secret Manager + IAM. E close behind. B is workable. C and D have managed env vars but less polished IAM.
- **Cost at MVP (#6)**: A best (idle is free). B has small idle costs. C and D have minimum monthly fees that add up across services.
- **Operational simplicity (#7)**: A and C and D are simplest. F is the most complex. B is mid.
- **Vendor concentration (#8)**: We're not deeply concentrated anywhere except Supabase. A means GCP becomes a second concentration; this is acceptable because Supabase doesn't host compute. E (AWS) is a fresh relationship.
- **IaC support (#9)**: A has excellent Terraform support (used in [ADR-021](./ADR-021-infrastructure-as-code.md)). All others have varying-quality Terraform providers.

What we are sacrificing by picking Cloud Run over Fly.io:

- Faster cold starts and global multi-region distribution. Worth it; our
  user base is not currently global enough to make the latter pay off,
  and Cloud Run cold starts are inside our budget.

What we are sacrificing by picking Cloud Run over PaaS like Railway/Render:

- Predictable flat-monthly-fee billing. We accept pay-per-use unpredictability
  for the savings at idle.

What we are sacrificing by picking Cloud Run over AWS:

- Ecosystem breadth (AWS has more managed services). Not relevant to our
  current architecture.

No reconsideration flag is raised. Cloud Run is the first-principles
choice for our specific intersection (three small TS services, scale-to-zero
desirable, MVP cost-sensitive, IaC required, no need for global multi-region).

## Consequences

### Positive
- api and agent services cost nothing when idle. Worker is the only always-on container.
- IAM-based service-to-service auth removes the need for shared secrets between services.
- Secret Manager + Memorystore + Cloud Run all live in one cloud; configuration is one Terraform plan.
- 60-min request timeout supports our long-running flows ([ADR-007](./../_superseded/ADR-007-background-job-queue.md), [ADR-011](./../services/agent/ADR-011-realtime-streaming-transport.md)).
- Workload Identity Federation for GitHub Actions ([ADR-022](./ADR-022-cicd-platform.md)) means we don't ship long-lived service account keys.

### Negative
- GCP vendor lock-in. Migration to another cloud is a real project (re-do IAM, networking, IaC).
- Cold-start latency on chat critical path is occasionally noticeable.
- GCP pricing model has many SKUs; bills can surprise on growth.
- Memorystore Redis (~$50/mo+) is more expensive than self-managed Redis but worth the no-ops tradeoff at our scale.

### Follow-up decisions
- IaC tool to manage Cloud Run + supporting resources — see [ADR-021](./ADR-021-infrastructure-as-code.md).
- CI/CD pipeline — see [ADR-022](./ADR-022-cicd-platform.md).
- Per-service min-instances, scaling configuration, concurrency — operational, owned by `infra/CLAUDE.md`.
- Reconsider this ADR if: traffic spans multiple continents (Fly.io's multi-region story would matter), GCP costs scale unpredictably, or a non-GCP managed service becomes critical to the architecture (forcing the rest to move).

## Update

**2026-06-11** — [ADR-027](../services/worker/ADR-027-background-job-queue-cloud-tasks.md)
executed ADR-007's flagged migration: the queue moved from BullMQ + Memorystore
Redis to GCP Cloud Tasks. Consequences for this ADR's context: the Memorystore
instance no longer exists, and the worker is no longer an always-on poller — it
is an internal, IAM-invoked HTTP service with `min_instances = 0`
(scale-to-zero now applies to all three services). The decision recorded here
is unchanged.
