# ADR-017: Observability stack

## Status

Accepted
Date: 2026-05-10

## Context

Three services run on Cloud Run, communicating asynchronously
(API → Worker via [BullMQ](../../_superseded/ADR-007-background-job-queue.md);
API → Agent over internal HTTP; Agent → LLM vendors). When something goes
wrong — a 500 from a course-creation request, a stuck `generating`
status, an SSE stream that silently drops — we need three things:

1. **Logs** — what happened, in order, per service.
2. **Traces** — the request that crossed three services and an LLM call.
3. **Correlation** — a single request id ties the logs together with
   the trace. Without correlation, debugging cross-service issues is
   archaeology.

This ADR covers logs and traces. Metrics (Cloud Run already exposes the
basics through GCP Cloud Monitoring) are out of scope.

The decision plays out across three sub-questions:
- **Logger library** — what writes JSON lines to stdout?
- **Tracing instrumentation** — what produces spans across services?
- **Where logs and traces *go*** — backend / sink.

These are co-decided because the logger has to be able to embed trace
context (so logs and spans correlate), and the sink has to ingest both
formats.

## Non-goals

- Specific dashboards, alert rules, SLOs — operational, owned by `infra/CLAUDE.md` and per-service runbooks.
- Per-event business analytics (course completion rates, engagement) — that's product analytics, separate from system observability.
- Real User Monitoring on the mobile client — out of scope for now; if it ships it would be a separate ADR.
- Error tracking on the mobile client — separate decision; mobile crash reporting can be added independently.
- Specific OTel exporter destination (Jaeger, Cloud Trace, Honeycomb, etc.) — operational; current default is Cloud Trace via OTLP.

## Decision Drivers

- **Cloud Run native ergonomics** — Cloud Run captures stdout as Cloud Logging entries automatically. Whatever logger we pick must produce JSON Cloud Logging parses correctly (preserves severity, trace correlation).
- **Trace correlation across services** — API enqueues a job; Worker processes it 2 minutes later. A "follow this request" view across the boundary requires tracing.
- **Vendor neutrality** — committing to a vendor's proprietary agent (Datadog, New Relic) is hard to reverse. Cost can grow fast.
- **Performance overhead** — logging is ubiquitous. A slow logger taxes every code path.
- **TypeScript ergonomics** — child loggers per request, typed log helpers, contextual fields.
- **Operational simplicity** — solo team. Self-hosting Jaeger, Loki, etc. is a no.
- **Cost at MVP** — should be near-zero for our log/trace volumes.

## Options Considered

### Option A: pino + OpenTelemetry (current)
**What it is:** `pino` for structured JSON logging at the application layer; `@opentelemetry/sdk-node` for tracing initialized at process start; logs include the active trace id via OTel's logging instrumentation. Logs go to stdout (Cloud Logging picks them up); spans export via OTLP HTTP to Cloud Trace.

**Pros**
- pino is the fastest JSON logger in the Node.js ecosystem (~5× Winston in published benchmarks). Logging hot paths (per-request structured logs) cost almost nothing.
- pino's child-logger pattern (`logger.child({ requestId })`) maps cleanly to per-request context.
- pino-pretty exists for human-readable dev output without changing the production format.
- OpenTelemetry is vendor-neutral; the same instrumentation exports to Cloud Trace today and (with one config change) to Jaeger, Honeycomb, Datadog, or a self-hosted backend tomorrow.
- Cloud Logging parses pino's JSON output natively; severity and trace fields display correctly in the GCP console without custom parsers.
- Initialization cost is small but not zero — the OTel SDK adds ~50–100 ms to cold start, captured and accepted.
- Both libraries are open source and widely deployed; no vendor relationship.

**Cons**
- Two libraries to learn instead of one. Some duplication: pino has its own `traceId` field, OTel has its own context — bridging them requires deliberate setup.
- OTel's API has churned a lot through 2023–2025; even in 2026 the JS implementation has rough edges for some auto-instrumentations.
- "Where do logs go" still needs a destination decision. Cloud Logging is the default but not opinionated about retention or aggregation across services.
- Auto-instrumentations are uneven in quality across libraries. NestJS, Fastify, BullMQ, and `pg` all have community OTel instrumentations of varying maturity.
- Self-host or use a managed OTel backend? The default we picked (Cloud Trace via OTLP) is fine but locks us into GCP for tracing visualization unless we add a second exporter.

### Option B: Winston + OpenTelemetry
**What it is:** Replace pino with Winston (older, more configurable, slower).

**Pros**
- Mature transport ecosystem (file rotation, syslog, custom formatters).
- More flexible at composing format/transport pipelines.
- OTel has an official `@opentelemetry/instrumentation-winston` that auto-correlates Winston logs with active spans.

**Cons**
- ~2.4–5× slower than pino on raw log throughput. Not a crisis at our volumes, but no upside.
- Configurability we don't need. We always emit JSON to stdout, period.
- Adopting Winston in 2026 for a new project is contrarian — Winston's strengths are for legacy stacks with custom transport needs.

### Option C: Sentry (full-stack: errors + tracing + breadcrumbs)
**What it is:** Sentry SDK in each service. Captures errors, performance traces, breadcrumbs, integrates with NestJS/Fastify/BullMQ. Hosted backend.

**Pros**
- Best-in-class error grouping, alerting, and stack-trace surfacing — substantially better than rolling our own from logs.
- Tracing comes for free with the same SDK.
- Generous free tier (typically 5k events/month plus performance units).
- Strong integrations across Node, mobile, and frontend — same vendor for all crash data later.
- Alerting and Slack/email integration are out of the box.

**Cons**
- Vendor lock-in for tracing (Sentry's tracing is OTel-compatible at the protocol level but the practical integration tilts you toward staying in Sentry). Switching later is real work.
- Pricing scales steeply with event volume. Predictable up front; surprising at growth.
- Sentry is excellent at errors but a less-polished general-purpose distributed tracing tool than pure OTel-to-X destinations like Honeycomb or Tempo.
- Replaces a logger only partially — you still want structured logs going somewhere; Sentry isn't a full log aggregator.

### Option D: Datadog (full-stack)
**What it is:** Datadog APM agent, log forwarding, error tracking, metrics — the proprietary "single pane of glass" model.

**Pros**
- Single vendor for everything — if your team already uses Datadog, adding services is mechanical.
- Maturity and feature breadth are unmatched at scale.
- High-quality auto-instrumentations across the entire Node ecosystem.

**Cons**
- Cost: Datadog pricing at scale is widely criticized for unpredictability; it's not a tool for pre-revenue MVPs.
- Vendor lock-in is deep — DD-specific tags, instrumentations, and query language permeate your code.
- The agent is a separate process / daemon to run, plus per-service SDKs. Operational footprint is real on Cloud Run.

### Option E: console.log + Cloud Logging structured logs (no library)
**What it is:** Use Node's built-in console plus structured-log helpers; let Cloud Logging parse JSON.

**Pros**
- Zero dependencies. Smallest possible bundle.
- Cloud Logging supports structured logs natively; you just emit JSON to stdout.

**Cons**
- No leveling, no child loggers, no typed helpers. We'd reinvent half of pino in 50 lines and the half we missed would bite later.
- No trace correlation without a separate library.
- Distributed tracing across services still requires OTel; we'd still pay OTel's setup cost without pino's logging convenience.
- Saves about ~5 KB and a `pino-pretty` dev dep at the cost of substantial DX.

### Option F: OpenTelemetry-only logging (skip pino, use OTel logs API)
**What it is:** Use OpenTelemetry's logging API for both logs and traces. Single SDK, unified data model.

**Pros**
- True single source of truth for logs + traces + metrics in one model.
- Vendor-neutral by construction.
- Spec-aligned: when a feature appears in OTel, all three signal types get it.

**Cons**
- OTel's logging API in JS is the least-mature of the three signals. As of 2026 it's usable but feels less "production-grade ergonomic" than pino. Documentation, examples, and community recipes lean heavily toward pino-or-Winston for the actual logger and OTel for tracing only.
- Performance hasn't caught up to pino's hot-path-friendly design.
- Replacing pino with OTel logs in our codebase would be a refactor of every `logger.info({...})` call — for a benefit we don't materially need yet.

## Decision

**We use pino + OpenTelemetry. Logs go to stdout (captured by Cloud Logging); traces export via OTLP HTTP to Cloud Trace.**

## Rationale

Lining up the drivers:

- **Cloud Run native (#1)**: A, B, E all yes. C and D require their own forwarding (Sentry SDK or Datadog agent). F yes if we configure the OTLP log exporter to Cloud Logging.
- **Trace correlation (#2)**: A, B, C, D, F all yes (via OTel or vendor SDK). E no without adding OTel anyway.
- **Vendor neutrality (#3)**: A, B, F yes. C and D explicitly no.
- **Performance (#4)**: A wins among the logger options. F may close the gap eventually but isn't there yet.
- **TypeScript ergonomics (#5)**: A, B, C, D all good. E is bare-bones; F is workable but less polished.
- **Operational simplicity (#6)**: A and F are fewest moving parts. B is similar. C and D add a vendor relationship.
- **Cost at MVP (#7)**: A, B, E, F all near-zero. C and D have free tiers but cost trajectory is steeper.

What we are sacrificing by picking A over C (Sentry):

- Best-in-class error grouping and alerting. We get coarser visibility on errors via Cloud Logging's filtering, plus whatever alert rules we set up on Cloud Monitoring. If error visibility becomes a bottleneck, we can add Sentry as a *second* receiver alongside OTel — Sentry's OTel-compatible mode means we don't pick exclusively.

What we are sacrificing by picking A over D (Datadog):

- A polished single pane of glass. We accept fragmentation — logs in Cloud Logging, traces in Cloud Trace. For a small team, the cost savings dominate.

What we are sacrificing by picking A over F (OTel-only logs):

- A unified data model. The current OTel JS logging API isn't ergonomic enough to justify giving up pino's polish in 2026.

No reconsideration flag is raised. pino + OTel is the first-principles
choice for our specific intersection (Cloud Run, vendor neutrality, low cost,
small team, TypeScript-first ergonomics).

## Consequences

### Positive
- Logs and traces correlate via the same trace id, visible in Cloud Logging's "View in Cloud Trace" link.
- Logger overhead is negligible on hot paths.
- Vendor-neutral: switching the trace backend (e.g., to Honeycomb) is one OTel config change.
- pino's child-logger pattern enables per-request context propagation cleanly.
- All open-source; no vendor surprise.

### Negative
- Logs and traces live in two systems (Cloud Logging + Cloud Trace) — the unified-pane-of-glass DX of a Datadog/Sentry doesn't apply.
- OTel JS auto-instrumentations are uneven in quality; some libraries we use (BullMQ, LangChain) require manual span creation for full coverage.
- Two libraries to learn instead of one.
- OTel adds ~50–100 ms to process cold-start; small but real on Cloud Run.

### Follow-up decisions
- Whether to add Sentry as a *secondary* error sink — operational, not architectural. Could ship under a feature flag without a new ADR.
- Specific span-naming conventions and required attributes — owned by `packages/observability/CLAUDE.md`.
- Reconsider this ADR if: log volume costs spike on Cloud Logging, error-triage time becomes the operational bottleneck (Sentry's value would dominate), or OTel JS logging closes the ergonomics gap with pino.
