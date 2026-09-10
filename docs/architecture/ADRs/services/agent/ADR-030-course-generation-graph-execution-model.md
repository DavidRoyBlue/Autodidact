# ADR-030: Course-generation graph — multi-node topology and execution model

## Status

Proposed
Date: 2026-09-10

Design detail (state, node contracts, schema, rollout) lives in the companion spec
[`2026-09-10-course-generation-multi-node-graph-design.md`](../../../../superpowers/specs/to-be-reviewed/2026-09-10-course-generation-multi-node-graph-design.md).
This ADR records the decision; the spec is the implementer's reference.

## Context

Course generation today is **one LLM call** (`generateBlueprint`, audited in
[`agent-graphs.md`](../../../agent-graphs.md)): the Worker POSTs to the Agent, the Agent
returns a `CourseBlueprint` whose modules are *outlines* (`{title, points[]}`), and the
Worker commits course + module rows in one transaction. No research, no per-module
content, no progress signal — the mobile app polls a four-state `courses.status`.

Epic #84 asks for a different pipeline: distill what the learner wants → research the
subject online → plan the course module by module → generate each module (with its own
research) → assemble. It also introduces **tiers**: a free course skips the online research
nodes, a premium course (price open, see #90) runs the full flow. Issue #89 (this ADR)
produces the design the build issues #91–#96 will follow.

The stages are prescribed by #84/#89 and are not in question here:

```
distill-intent → [course-research?] → course-plan → per-module loop { [module-research?] → generate-module-content } → assemble
```

#84 also states the ordering — "module creation one by one" — which this ADR takes as
the owner's requirement while flagging (driver 6, Rationale) that its coherence benefit
is unmeasured. What *is* a durable decision is **how that multi-node graph executes
across the Agent/Worker/DB boundary** — because it changes the failure economics, the
ownership of DB writes, the infra limits we run against, and the contract the mobile app
reads progress from. That is the decision area of this ADR.

**Stack situation.** The graph runs in `services/agent` on LangGraph 0.2.74 (ADR-006;
the 1.x upgrade is deferred by ADR-023 — `Send`, `Command`, node `retryPolicy` and
`streamMode` are all present in 0.2.74, verified in `node_modules`). The Worker is invoked
per task by Cloud Tasks (ADR-027: 3 attempts, 5 s→125 s backoff; the final attempt marks
the course `failed`). Every LLM call goes through `invokeModel()` (per-attempt timeout,
transient-error retry, abort propagation) behind `ILLMProvider` (ADR-009). The Agent
already streams SSE for module chat (ADR-011) and reads app data only for RAG chunks
(ADR-024). Both services run on Cloud Run with **no `timeout` set in Terraform**
(`infra/modules/cloud-run-service/main.tf`), i.e. the 300 s default; the Cloud Tasks
provider sets no `dispatchDeadline` (10 min default, 30 min max). Cloud Run allows up to
3600 s per request ([Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/request-timeout);
[Cloud Tasks HTTP target deadlines](https://docs.cloud.google.com/tasks/docs/dual-overview)).

## Non-goals

This ADR does not decide:
- **Tier economics** — the premium price, which model each tier uses, and the per-course
  cost model (#90). Here `tier` is an input, `'free' | 'premium'`, and research is gated on it.
- **Payment and entitlement** (#95).
- **Which web-research provider** we adopt (#93). Candidates and a recommendation are in
  the spec; the interface is fixed here, the vendor is not.
- Mobile UX for tier selection and progress (#96) — this ADR only guarantees a progress
  source the API can expose.
- The exact prompts (they live in `@autodidact/prompts` and will iterate).

## Decision Drivers

1. **Failure economics of a paid, long run.** A premium run is many sequential LLM and
   research calls. Cloud Tasks retries the whole task up to 3× — if a retry regenerates
   everything, one late failure can triple the cost of a course whose price is fixed.
2. **Honest progress from the source of truth the API already reads.** #96 needs
   "Researching… / Module 3 of 8". The API reads `courses`; the Worker writes it. Progress
   must land in the DB without inventing a new read path.
3. **Ownership boundaries stay as they are.** Graphs own generation logic, routes own
   transport (agent `AGENTS.md`); the Worker owns course/module writes; the Agent's DB
   access is read-only RAG (ADR-024). A design that makes the Agent write app rows is a
   boundary change that needs its own justification.
4. **Fits the platform's limits with configuration, not architecture.** 5 min default /
   60 min max Cloud Run request; 10 min default / 30 min max Cloud Tasks dispatch.
5. **One legible graph.** #84's own words: "something visual to properly understand how
   my nodes are connected". The #88 audit deferred LangGraph Studio *until* a multi-node
   graph exists — the design should be one graph Studio can render, not logic split
   across services.
6. **Pedagogical coherence.** Module N should know what modules 1…N-1 taught, or the
   course repeats itself. This favours generating modules in order — and matches #84's
   stated flow. The plan already gives every module its siblings' outlines, so the
   *marginal* gain from generated-content summaries is an assumption; the spec adds the
   eval that would measure it.
7. **Lean.** Reuse `invokeModel`, `instrumentNode`, the Zod `safeParse`+retry pattern,
   the existing SSE route pattern and Drizzle. Every new mechanism must earn its place.
8. **Tier is data, not a code path.** Free and premium run the *same* graph; conditional
   edges skip research when `tier === 'free'`. No second graph to keep in sync.

## Options Considered

All five options implement the prescribed stages inside LangGraph; they differ in how
the run crosses the Worker→Agent boundary and where partial results live.

### Option A: One blocking invocation, sequential loop, persist at the end (today's contract, extended)
**What it is:** The Worker keeps calling `POST /course/generate` and blocks until the whole
graph finishes; the loop is a conditional edge back to `generate-module-content`; the
response carries the plan plus full module content; the Worker commits everything in one
transaction exactly as today.

**Pros**
- Smallest diff: the Worker's processor, `AgentClient` and the ready-transaction barely change.
- One graph, trivially renderable; sequential loop preserves cross-module coherence (driver 6).
- Idempotency story is unchanged (delete-then-insert on retry).

**Cons**
- Any failure or timeout after module 1 discards every finished module; a Cloud Tasks
  retry re-runs distill, research, plan and all modules — worst case 3× the LLM and
  research spend for one course (driver 1).
- No progress signal at all; #96 would need a second mechanism (e.g. the Agent writing
  `courses.generation_progress` itself — a boundary change, driver 3).
- A single HTTP request must stay open for the whole run; Cloud Run and Cloud Tasks
  timeouts must be raised regardless (driver 4).

### Option B: One invocation with `Send` parallel fan-out per module
**What it is:** After `course-plan`, a conditional edge returns one `Send('generate-module', {...})`
per module; LangGraph runs them in one superstep and a reducer concatenates results;
`assemble` fans in. Otherwise as Option A.

**Pros**
- Wall-clock ≈ the slowest module instead of the sum; keeps 20-module premium runs
  comfortably inside the 30-min dispatch cap.
- Still one graph, still one request; `Send` is in the installed 0.2.74
  ([LangGraph.js `Send` reference](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.Send.html)).

**Cons**
- Modules see their siblings' *outlines* (from the plan) but not their generated
  content (driver 6). Whether that raises overlap and repetition is unmeasured; if it
  does, the mitigation (a coherence pass) adds a node and cost.
- Departs from #84's stated "one by one" flow without evidence that the trade is worth it.
- Burst of M simultaneous LLM + research calls per course; with `max_concurrent_dispatches = 3`
  that is up to 60 concurrent calls, the shape most likely to hit provider 429s
  (`invokeModel` retries them, but with backoff that erodes the latency win).
- Same persist-at-end and no-progress problems as Option A; a `Send` superstep is
  all-or-nothing from the graph's point of view.

### Option C: Worker-orchestrated stages — one Cloud Task per module
**What it is:** The Agent exposes stage endpoints (`/course/plan`, `/course/module`);
the Worker runs the plan, inserts skeleton module rows, enqueues one `generate-module`
task per module, and a final task assembles when all modules are `ready`.

**Pros**
- Durability and per-module retry come from the queue for free; progress is literally
  the module rows (drivers 1, 2).
- No long-lived request; each task is one LLM call plus one research call (driver 4).
- Natural horizontal scale via queue concurrency.

**Cons**
- The "graph" no longer exists as one LangGraph graph — the loop is a state machine
  spread over Worker tasks and DB rows; nothing renders it (driver 5).
- Fan-in ("all modules done → assemble") is a distributed-count problem: races on the
  last two modules, a stuck task leaves the course `generating` forever unless a
  sweeper exists. New failure modes, new code (driver 7).
- Research context must be persisted between tasks (course research JSONB on the
  course row) so that every module task can read it — more schema, more coupling.
- Sequential coherence (driver 6) is lost unless tasks are chained one after another,
  which forfeits most of the queue's benefits.

### Option D: One invocation, sequential loop, streamed stage events; Worker persists incrementally and can resume
**What it is:** The Worker calls `POST /course/generate` once; the Agent runs the graph
with LangGraph `stream()` and emits typed SSE events as nodes complete (`stage`, `plan`,
`module`, `done`, `error`). The Worker consumes the stream and persists each event: the
plan becomes the course row + skeleton module rows, each `module` event fills one row,
`done` flips `status = 'ready'`. On a Cloud Tasks retry the Worker passes the persisted plan
(with the course research digest) and the positions already completed; the route
pre-populates the graph state and a conditional edge from `START` skips straight to the
loop for the missing modules. Each attempt claims the course row with an attempt token
and every write is fenced on it, so an attempt that Cloud Tasks has already given up on
cannot keep writing alongside its successor.

**Pros**
- A late failure keeps every finished module; a retry costs only the missing ones (driver 1).
- Progress is a by-product of persistence — the Worker writes `courses.generation_progress`
  on each event; the API's status endpoint reads it unchanged in shape (driver 2).
- Boundaries hold: the Agent streams (it already does for chat), the Worker writes,
  the graph is one graph (drivers 3, 5).
- Sequential loop keeps coherence; each module receives the summaries of the previous ones (driver 6).
- Resume-by-position is one input field and one conditional edge; idempotency becomes
  "upsert by `(course_id, position)`" instead of delete-then-insert.

**Cons**
- New surface: an internal SSE event protocol between two services, an SSE reader in the
  Worker, a resume input on the graph, and an attempt-token fence on every Worker write
  (~200 lines total, but a contract to keep).
- Still one long request: Cloud Run request timeouts (agent, worker) and the Cloud Tasks
  `dispatchDeadline` must be raised and *ordered* (driver 4) — the 30-min dispatch
  ceiling bounds the sequential run, which caps `moduleCount` for premium or forces
  bounded parallelism later.
- Overlapping attempts are possible by construction (Cloud Run severs the response at
  the deadline but does not kill the handler); the fence turns that into a benign
  early exit, but it is one more invariant to test.
- Partial courses are now visible in the DB mid-run (`status = 'generating'` with some
  modules filled) — readers must treat `status` as the gate, which they already do.
- Ready-time atomicity weakens from "course + all modules in one transaction" to
  "each event in its own small transaction, `ready` last".

### Option E: Option D's graph, but resume via the LangGraph Postgres checkpointer
**What it is:** Compile the course-generation graph with the checkpointer the Agent
already runs for module chat (`thread_id = courseId`); on a Cloud Tasks retry the Worker
re-invokes with `null` input and LangGraph continues from the last completed superstep.
The Worker still consumes the event stream and persists rows for progress and reads.

**Pros**
- *All* state survives a retry exactly — course research, module summaries, attempts —
  with no `resume` input, no route pre-population and no Worker-side reconstruction.
- LangGraph-native; Studio's checkpoint inspection (the #88 audit's stated reason to
  wire Studio) works out of the box.

**Cons**
- A second durable copy of every module's content: the `modules` channel is
  append-reduced, so each superstep's checkpoint carries all modules so far — O(M²)
  content bytes per course in the checkpoint tables, plus a cleanup story for
  finished threads that does not exist today.
- Does not remove the Worker's persistence path (the API reads `courses`/`modules`, not
  checkpoints), so it is additive: two stores that must agree, versus Option D's one
  input field and one conditional edge.
- Does not remove the overlapping-attempt problem — two attempts resuming the same
  thread concurrently is *worse* (both continue from the same checkpoint), so the fence
  is still required.
- Reverses the graph's "No checkpointer" invariant for a benefit Option D achieves by
  persisting one extra digest in the blueprint.

## Decision

**We chose Option D:** one LangGraph course-generation graph per course, invoked once by
the Worker, running a sequential per-module loop and streaming typed stage events that the
Worker persists incrementally and can resume from on retry.

## Rationale

Driver 1 rules out A and B: for a paid run, discarding finished work on retry is a cost
multiplier we would be choosing on purpose. Driver 5 rules out C: the whole point of #84 is
a graph the owner can see and reason about, and C dissolves it into queue plumbing with
its own fan-in races. D and E both give durability *and* progress *and* one graph; we
prefer D because the Worker must persist rows anyway (the API reads them), so resuming
from those rows costs one input field, one pre-populated state and one edge, whereas the
checkpointer (E) adds a second, larger store of the same data without removing the
attempt fence. D reuses what exists — the SSE route pattern, `invokeModel`,
`instrumentNode`, Drizzle upserts — rather than adding a second orchestrator or a
second store. E remains the natural next step if the graph ever needs human-in-the-loop
interrupts or state the Worker cannot reconstruct.

**What we sacrifice.**
- Latency: sequential generation is the sum of module times, and every expensive
  thing downstream (the premium module cap, the ordered timeouts, the stall detector)
  follows from the run being long. We accept this because #84 asks for it and because
  the run is asynchronous with real progress — but the coherence gain behind it is
  unmeasured. The spec adds a coherence eval; if it shows no gain, bounded parallelism
  (a `Send` batch of size k) removes the ceiling without changing the persistence or
  streaming decisions here.
- Transactional simplicity: we trade one big transaction for per-event upserts and a
  `ready` flip at the end. `status` remains the only gate readers use.
- Infra defaults: we must set explicit request timeouts and a dispatch deadline. These
  were already implicit risks (a 20-module run could exceed 300 s today under load).

The in-graph resilience today provides — three validation retries around the blueprint
call — is preserved per node and made cheaper: retries feed the validation error back to
the model instead of re-sending the identical prompt, and per-module failures degrade to
an outline-only module rather than failing the course.

## Consequences

### Positive
- Free and premium share one graph; tier gating is two conditional edges.
- Partial results and progress live in the DB, so #96 needs an API field, not a new channel.
- A retry never re-bills completed modules; per-module fallback means a course rarely fails outright.
- The graph is one artifact — the #88 audit's "wire LangGraph Studio when multi-node lands" trigger fires.

### Negative
- An internal SSE contract between Agent and Worker to version and test.
- Cloud Run `timeout` and Cloud Tasks `dispatchDeadline` become load-bearing, *ordered*
  configuration (Terraform + `CloudTasksQueueProvider`), and the 30-min dispatch ceiling
  caps sequential run length.
- The Worker's "module rows commit in the same transaction as `ready`" invariant is
  replaced by per-event fenced writes with `ready` last — a weaker but explicit rule.
- `modules` rows exist before content does; `content` is nullable and every reader must
  handle `null` (outline-only) — which is also what keeps legacy courses valid.

### Follow-up decisions
- #90 — tier/model/cost: how `ILLMProvider.getModel()` learns the tier (the spec reserves the hook).
- #93 — research provider vendor (interface fixed in the spec; candidates + recommendation listed).
- #94 — persist `tier` and the progress column; raise timeouts/deadline in Terraform.
- #95 — payment; what a degraded (partially outline-only) premium course means commercially.
- Reuse gate (`courses.service.ts` similarity ≥ 0.92) must become tier-aware — a free
  request may reuse a premium course, a premium request must not be served a free one.
- Revisit this ADR if premium `moduleCount` needs to exceed what a 30-min sequential run
  allows, or if the Agent ever needs to persist application rows itself.
