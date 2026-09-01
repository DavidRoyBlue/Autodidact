# ADR-004: REST API framework

## Status

Accepted
Date: 2026-05-10

## Context

`services/api` is the public-facing HTTP API for the mobile app. It owns
authentication enforcement, request validation, business orchestration
(enqueue course generation, manage progress, persist chat sessions, proxy
SSE streams from `services/agent`), and OpenAPI documentation.

The service has five feature modules today (`auth`, `chat`, `courses`,
`health`, `progress`) and concrete cross-cutting concerns: JWT-based
guards, request validation pipes for Zod schemas, dependency injection
for the [provider abstraction](../../packages/providers/ADR-009-external-vendor-abstraction.md),
exception filters, and SSE proxying. Every endpoint is small; the surface
area as a whole is non-trivial.

This ADR is downstream of [ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md)
(provider abstraction must integrate with whatever DI the framework uses)
and [ADR-016](../../packages/schemas/ADR-016-runtime-schema-validation.md)
(Zod integration with request validation). It is upstream of nothing —
the choice is the API service's internal concern, contained behind HTTP.

## Non-goals

- Specific endpoint design or REST style — owned by `services/api/src/modules/*/CLAUDE.md`.
- The agent service's framework — that's [ADR-005](../agent/ADR-005-ai-agent-server-framework.md). API and agent can have different frameworks.
- SSE streaming protocol — that's [ADR-011](../agent/ADR-011-realtime-streaming-transport.md).
- Validation library — that's [ADR-016](../../packages/schemas/ADR-016-runtime-schema-validation.md).
- API gateway / edge layer — out of scope; we're behind Cloud Run directly.

## Decision Drivers

- **Structured surface area** — five feature modules, growing. Auth guards, validation pipes, exception filters, DI for providers — these are five concerns that benefit from a framework's structure rather than per-route ad-hoc implementations.
- **DI integration with `packages/providers`** — `IAuthProvider`, `IQueueProvider` are injected; the framework's DI must compose with that.
- **Zod + OpenAPI generation** — request bodies validated by Zod ([ADR-016](../../packages/schemas/ADR-016-runtime-schema-validation.md)); API surface must be discoverable (Swagger or equivalent) so the mobile app and external integrators have a contract.
- **Cloud Run cold start** — first request after scale-to-zero must respond fast enough not to time out the mobile app.
- **SSE pass-through** — the API proxies an SSE stream from the agent to the mobile app. Framework must support streaming responses without buffering.
- **Onboarding cost** — solo team. The framework's mental model has to be learnable in a day or two.
- **Long-term maintainability** — the API will grow; structural conventions matter.

## Options Considered

### Option A: NestJS (current)
**What it is:** Opinionated framework on top of Express (or Fastify, optionally). Modules, controllers, providers, guards, pipes, interceptors, exception filters. Decorator-based DI. Built-in Swagger/OpenAPI generation via `@nestjs/swagger`.

**Pros**
- Structural conventions for everything we need: `AuthGuard` for JWT, `ZodValidationPipe` for request bodies, `Module` for feature scoping, exception filters for consistent error responses.
- DI container integrates cleanly with our [provider abstraction](../../packages/providers/ADR-009-external-vendor-abstraction.md): factories register as providers, controllers `@Inject()` the interface tokens.
- `@nestjs/swagger` produces OpenAPI from controller decorators; combined with `nestjs-zod` (or `@anatine/zod-nestjs`) the same Zod schema validates the body and feeds the OpenAPI spec.
- SSE supported via `@Sse()` decorator returning `Observable<MessageEvent>`; or via the platform-express response stream for proxy-style pass-through.
- Largest community among Node frameworks for *this kind* of structured API service. Documentation, examples, plug-ins are abundant.
- Cold start has improved meaningfully over the years; on Cloud Run a small NestJS service starts in ~300–600 ms cold (acceptable for our mobile-app SLOs).

**Cons**
- Heavyweight by Node standards. Decorator-based DI requires `experimentalDecorators` and `emitDecoratorMetadata` plus `reflect-metadata` — a TS config impact and a runtime dep.
- The framework has its opinions baked in. Adding a non-NestJS pattern (e.g., a feature using `Effect` or a non-DI route handler) fights the framework.
- Cold start penalty is real, even if acceptable. Hono cold-starts in <50 ms; NestJS is an order of magnitude heavier.
- Bundle size is meaningful — full NestJS application image is ~50 MB+.
- Performance per request is below Fastify and Hono. Not a hot-path issue at our scale, but it is true.

### Option B: Fastify
**What it is:** High-performance Node HTTP framework. Plugin architecture; built-in JSON Schema validation. Lightweight and modular; less opinionated than NestJS.

**Pros**
- Faster than NestJS on raw request throughput (though performance gap with Express has narrowed in recent years).
- Smaller and lighter; faster cold starts.
- Plugin ecosystem covers most needs (`fastify-jwt`, `fastify-helmet`, `fastify-cors`, etc.).
- We already use Fastify in [`services/agent`](../agent/ADR-005-ai-agent-server-framework.md), so the team knows it.
- Native JSON Schema validation; OpenAPI generation via `fastify-swagger`.

**Cons**
- No built-in DI. We'd hand-wire the provider abstraction (or add `awilix` / `tsyringe` as a separate concern).
- No first-class concept of guards, pipes, modules. We'd build conventions for these from primitives — ~500–1000 lines of structural code to roughly match NestJS's organization.
- Zod integration is community-supported via `fastify-type-provider-zod`; works well, but is one more plug-in to maintain.
- Plug-in versions sometimes lag Fastify minor versions; minor compat hiccups in production over time.
- For a 5+ module API with auth, validation, error handling, and DI, "Fastify + we built our own structure" turns into "we re-implemented half of NestJS, less polished."

### Option C: Hono
**What it is:** Web-Standards-aligned (Request/Response objects), tiny (~14 KB), runs on Node, Bun, Deno, Cloudflare Workers, Vercel Edge. Designed for edge-first deployment.

**Pros**
- Smallest bundle, fastest cold start. Cloud Run cold starts would drop to <100 ms.
- Type-safe routing via `c.json()` / `c.req.valid()` patterns.
- `@hono/zod-validator` is first-class; OpenAPI generation via `@hono/zod-openapi`.
- Edge-runtime compatible — if we ever want to deploy this service to Workers or Edge Functions, no rewrite needed.
- API surface is intuitive; small mental model.

**Cons**
- Younger ecosystem. Community plug-ins for guards, exception filters, etc., are simpler — we'd build more ourselves.
- No built-in DI; same pattern as Fastify.
- We don't deploy to edge runtimes; Hono's main differentiator (edge-readiness) doesn't pay off for our Cloud Run target.
- Adopting Hono means migrating ~5 modules of NestJS-shaped code. Real cost for a benefit (cold-start improvement) we can already live with.
- Auto-generated OpenAPI works but is less rich than `@nestjs/swagger`'s annotations-driven spec.

### Option D: tRPC (RPC instead of REST)
**What it is:** Type-safe RPC. Server defines procedures with Zod inputs; client gets fully typed calls without OpenAPI or hand-written types.

**Pros**
- End-to-end type safety: change a procedure signature on the server, the mobile app fails to compile until updated.
- Eliminates the need for OpenAPI generation — types *are* the contract.
- Excellent DX for full-stack TypeScript when you control both client and server.

**Cons**
- The mobile client is React Native — tRPC's React Native support exists but doesn't have the polish of its Next.js story.
- We lose REST/HTTP conventions: caching headers, idempotency keys, third-party tooling that expects REST. SSE through tRPC is possible but awkward.
- tRPC is not a REST replacement so much as an alternative paradigm; if we ever need a non-TS client (a third party, a web admin tool), the tRPC contract is opaque to them.
- Migrating the existing controllers to tRPC procedures is a non-trivial refactor.
- Doesn't replace the structural concerns NestJS solves (auth, DI, modules) — we'd still need to add those on top of tRPC.

### Option E: Express (with Zod and a hand-rolled structure)
**What it is:** The original Node HTTP framework. Minimal, ubiquitous.

**Pros**
- Universal familiarity; almost any Node engineer can read Express in their sleep.
- Smallest abstraction; what you see is what you get.
- Plug-in ecosystem is the largest in Node, period.

**Cons**
- Not in active development for years; Express 5 stabilized but feature velocity is glacial.
- No built-in TypeScript — types are community-maintained.
- No built-in DI, validation, or structure. We'd build everything from scratch (or pull in libraries that recreate what NestJS gives natively).
- No reason to pick Express in 2026 for a new project that has any structural needs.

### Option F: Encore.ts
**What it is:** TypeScript-first backend framework with built-in infra primitives (databases, queues, pub/sub). Code-first inference of cloud topology.

**Pros**
- Strong opinionated structure; very high performance benchmarks.
- Built-in distributed-tracing and monitoring without separate setup.
- Code-first infra: you write a Postgres declaration in code and Encore provisions it.

**Cons**
- Encore wants to be the *whole* backend platform — its value lights up when you let it provision Postgres, queues, pub/sub itself. We have already chosen these (Supabase Postgres, BullMQ on Memorystore, Cloud Run hosting). Adopting Encore would partially supersede those choices.
- Younger ecosystem; less battle-tested for our stack's specific shape.
- Vendor framework risk — Encore is a company, and their hosted offering is part of the value prop.

## Decision

**We use NestJS for the API service.**

## Rationale

Lining up the drivers:

- **Structured surface area (#1)**: NestJS wins decisively. Five modules, guards, pipes, exception filters — the framework's primitives map 1:1 to what we need. Fastify, Hono, Express force us to build that structure ourselves; the cost in code, bugs, and onboarding accumulates.
- **DI for providers (#2)**: NestJS DI is mature; integrating `packages/providers` is "register the factory under the interface token" — boilerplate, but obvious. Fastify and Hono have no built-in DI; we'd add tsyringe or awilix and maintain a parallel pattern.
- **Zod + OpenAPI (#3)**: NestJS + `@nestjs/swagger` + a Zod adapter gives us OpenAPI for free from the same schemas that validate. Hono and Fastify both have Zod-aware OpenAPI plug-ins; the experience is comparable but lower-volume than NestJS's tooling.
- **Cold start (#4)**: NestJS is slowest of the credible options but still inside our budget on Cloud Run. We accept 300–600 ms cold start in exchange for the framework's structure.
- **SSE pass-through (#5)**: NestJS supports SSE via `@Sse()` and platform-express's underlying response stream, which we use for the agent → mobile pass-through. Other frameworks support it equally well.
- **Onboarding (#6)**: NestJS's learning curve is real but the tooling is well-documented; a new dev with TypeScript experience can be productive in 2–3 days. Fastify+homemade-structure has a smaller per-day curve but a longer total ramp because the conventions live in our code, not in docs.
- **Long-term maintainability (#7)**: The cost of *not* having structural conventions compounds; we have already paid for the framework's structure once and benefit from it across every new feature module.

What we are sacrificing by picking NestJS over Fastify:
- Per-request performance (modest at our scale).
- Lighter cold start.
- Simpler mental model.

What we are sacrificing by picking NestJS over Hono:
- Cold-start time (NestJS is 5–10× slower to boot than Hono).
- Edge-runtime portability (we don't need it; Cloud Run is our target).

What we are sacrificing by picking NestJS over tRPC:
- End-to-end type safety with the mobile app. We mitigate this by sharing
  Zod schemas via `packages/schemas` — types flow through, just not as
  tightly coupled as tRPC would do.

No reconsideration flag is raised. NestJS is the first-principles choice
for an API of our shape (multiple modules, structural conventions matter,
mobile-only client, server-side TypeScript). The cold-start tax is the
clearest negative; it's accepted because the structural value dominates.

## Consequences

### Positive
- Auth guards, validation pipes, exception filters, DI all native — we don't reinvent any of these.
- `@nestjs/swagger` produces OpenAPI for the mobile app's contract reference.
- Provider abstraction integrates via NestJS DI; switching a provider is config-time.
- Module boundaries are enforced by the framework; new features land in their own module without touching others.

### Negative
- Cold start is 300–600 ms on Cloud Run vs <100 ms on Hono. Mobile users on a fresh app launch occasionally hit this; cached-response patterns mitigate.
- Decorator metadata + `reflect-metadata` adds runtime weight and TS-config complexity.
- Framework opinions occasionally fight us on non-CRUD patterns (e.g., long-lived SSE streams need careful response handling).
- Larger bundle than necessary — Cloud Run image is ~50 MB+.

### Follow-up decisions
- Specific module structure conventions, naming — owned by `services/api/CLAUDE.md`.
- Integration with [ADR-016](../../packages/schemas/ADR-016-runtime-schema-validation.md) Zod via `nestjs-zod` or `@anatine/zod-nestjs` — operational, not architectural.
- Reconsider this ADR if: cold-start performance becomes a user-visible problem (Hono delivers a 5–10× improvement we'd need to evaluate against migration cost), the API surface stops growing (overhead of NestJS structure stops earning its keep), or the mobile-only assumption changes (a TypeScript web client could change the calculus toward tRPC).

## Update

**2026-09-01** — [ADR-027](../worker/ADR-027-background-job-queue-cloud-tasks.md)
executed ADR-007's flagged migration: the queue moved from BullMQ + Memorystore
Redis to GCP Cloud Tasks. Option F's rejection cites "BullMQ on Memorystore" as
an already-made choice; read that as Cloud Tasks — the argument is unaffected.
The decision recorded here is unchanged.
