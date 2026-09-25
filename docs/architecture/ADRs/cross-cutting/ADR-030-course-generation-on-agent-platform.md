# ADR-030: Course generation runs on AgentPlatform's course-creator workflow

## Status

Accepted
Date: 2026-09-25

Supersedes the direction of #89 (a multi-node generation graph inside `services/agent`).

## Context

Course generation was one LLM call in `services/agent` (a single-node LangGraph,
ADR-006) that returned a *blueprint*: module titles, objectives and a content
outline. The teacher then improvised the lesson from that outline in chat. Epic
#84 wants real courses: intent distilled, research when the subject needs it, a
reviewed plan, a full lesson per module, and a time budget the learner chooses
instead of a module count. #89 designed that as a multi-node graph in the Agent
service.

Meanwhile the machine-wide standard says every agent and every workflow runs on
AgentPlatform (`~/AgentPlatform`): a registry, a deterministic workflow executor
with checkpoints and resume, per-run usage and events, and a versioned
`course-creator` workflow (its `docs/architecture/course-creator.md`, ADR 0045)
that already does exactly what #84 asks — planner with web research, parallel
module writers, measured word budget, decide-first review loops. Building the
same graph a second time in this repo would duplicate it.

The platform runs on David's WSL machine (`127.0.0.1:8400`) and is not reachable
from the Cloud Run worker; the app's production is on GCP (ADR-027, ADR-028).

## Non-goals

This ADR does not decide:
- where the module *teacher* runs (AgentPlatform PR #236 makes it a platform
  agent; the chat wiring is a separate change in this repo)
- quality tiers, payment or per-course cost (#90, #95)
- how the platform is hosted or exposed to GCP
- the generation-progress UX (#96)

## Decision Drivers

- One implementation of the course graph — it is expensive, model-heavy and
  under active iteration; two copies drift.
- Checkpointed, resumable, observable runs — a course takes ~16 minutes and
  ~$11 of model calls; a failure half-way must not restart from zero silently.
- The app stays the owner of its data and its product surface — persistence,
  chat, RAG, progress, entitlements.
- Ship the learner-visible change now (full lessons, a time budget) in dev,
  without waiting on hosting work.

## Options Considered

### Option A: Grow the in-app graph (#89)
**What it is:** implement the multi-node graph (distill → research → plan →
per-module write → assemble) in `services/agent` with LangGraph.

**Pros**
- Everything stays in this repo and deploys with it; production works today.
- LangGraph checkpointer already exists here (Postgres-backed).

**Cons**
- Rebuilds a workflow the platform already runs and tests, node for node.
- Per-run cost, usage and review loops would be reimplemented; #90's cost
  model would have two sources.
- Violates the standing rule that agents and workflows live on the platform.

### Option B: Run generation on AgentPlatform; the app owns persistence, chat and RAG
**What it is:** the worker creates a `course-creator` run through the
platform's `/api/v1`, polls it to a terminal status, and commits the returned
course (full `content` and `resources` per module) in one transaction.

**Pros**
- One course graph, versioned and measured on the platform; the app consumes
  a contract (`GeneratedCourseSchema`).
- Runs are checkpointed and resumable; usage and events are recorded per run.
- The app's own code shrinks: the generation graph, its route, prompt and
  tests go.

**Cons**
- Production cannot reach the platform until it is hosted or tunnelled; until
  then a production course fails (the worker marks it `failed`).
- A synchronous ~16-minute task; Cloud Tasks and Cloud Run default deadlines
  would need raising when production is wired.
- A second inter-service dependency (`AGENT_PLATFORM_URL`).

### Option C: A dedicated generation service on GCP
**What it is:** a new Cloud Run service running the multi-node graph, called by
the worker like the Agent service is today.

**Pros**
- Reachable from production; scales independently of the Agent service.

**Cons**
- Same duplication as A, plus a new service to deploy, secure and pay for.
- Still no shared registry or run model with the rest of the machine's agents.

## Decision

**We chose: Option B.**

Course generation is a run on AgentPlatform's `course-creator` workflow; the
app persists the result and keeps chat, RAG and progress.

## Rationale

The platform already implements #84's graph with checkpoints, usage and review
loops; Option B is the only one that does not build it twice, and it honours
the machine-wide rule that workflows run on the platform. What we sacrifice is
production reach for now: the platform is local, so this lands as a dev
integration with the gap stated here and in `PRODUCTION.md`, and production
courses generate again once the platform is reachable from GCP (a hosting
decision this ADR does not make).

## Consequences

### Positive
- Modules carry a full lesson (`modules.content`, markdown) and vetted
  `resources`; the RAG corpus chunks the lesson, not an outline.
- The learner chooses a time budget (`30min | 1h | 4h | unrestricted`); the
  reuse key becomes (topic embedding, difficulty, time budget).
- `services/agent` loses the generation graph, route, prompt and tests;
  `courses.blueprint` goes.

### Negative
- Production generation is broken until the platform is reachable; the worker
  reports it as a failed course rather than hanging.
- The worker holds a task open for the whole run (~16 min); loopback is fine,
  Cloud Tasks/Cloud Run deadlines must be raised when production is wired.
- The word budget is computed at a fixed 150 words/minute until a per-user
  rate exists.
- The worker talks to `/api/v1` through its own 60-line typed fetch client
  rather than the platform's generated TypeScript client: that client is
  committed in a private repository and not published, and a git dependency
  would break this repo's CI install. It is retired the day the platform
  publishes its client.
- The worker polls a run with no deadline of its own; the platform's run
  timeout (three hours for `course-creator`) bounds it, which is far above
  the ~16 minutes a course takes — tightened with the Cloud Tasks deadlines.

### Follow-up decisions
- Host or expose the platform for GCP (and enforce API keys) before production
  relies on it.
- Move the module teacher to the platform's `course-teacher` agent (the chat
  service calls it per turn; the in-app teacher goes).
- Progress UX from the run's `step.iteration` events (#96).

## Related

- AgentPlatform `docs/architecture/course-creator.md` (§5 output contract,
  §7 this app's contract, §9 the teacher)
- #84, #89, #292
- ADR-006 (AI orchestration framework), ADR-024 (content RAG), ADR-027 (Cloud
  Tasks)
