# ADR-026: End-to-end testing strategy

## Status

Accepted
Date: 2026-06-01

## Context

[ADR-018](./ADR-018-testing-strategy.md) chose Vitest + Testcontainers and
listed "E2E tests against deployed services — out of scope; if added later,
deserves its own ADR" as a non-goal. This is that ADR.

Today there are **no e2e tests**. Service-to-service contracts between
`services/api`, `services/agent`, and `services/worker` are exercised only
through mocked `fetch` (`vi.stubGlobal('fetch')`), so a drift between, say, the
API's expectation of the agent's SSE contract and the agent's actual response
passes every test and breaks only in production. The mobile app's full journeys
(login → browse → generate → learn) are likewise unverified end to end.

A defining constraint is the **LLM**. The agent calls real models
([ADR-006](../services/agent/ADR-006-ai-orchestration-framework.md)); doing so
in tests is non-deterministic, slow, and costs money on every run. But the
providers layer ([ADR-009](../packages/providers/ADR-009-external-vendor-abstraction.md))
abstracts the model behind a swappable interface selected by `LLM_PROVIDER`.
That gives us a single, clean seam: run the **real services** end to end with a
**mock model provider**, rather than stubbing the network.

## Non-goals

- Backend unit/integration strategy — owned by [ADR-018](./ADR-018-testing-strategy.md).
- Mobile unit/component layer and the second-runner decision — owned by [ADR-025](./ADR-025-mobile-testing-second-runner.md).
- CI job topology specifics — operational; lives in the CI workflows ([ADR-022](../infra/ADR-022-cicd-platform.md)).

## Decision Drivers

- **Contract fidelity** — must catch real api↔agent↔worker contract drift that mocked-`fetch` tests cannot.
- **Determinism** — no flakiness; the same inputs must produce the same result on every run.
- **Cost & speed on PRs** — PRs must not call paid LLM APIs; the PR pipeline must stay cheap and fast.
- **One mock seam** — minimize what is faked; the more real the system under test, the more bugs it catches.
- **CI compatibility** — runs on GitHub Actions with real Postgres + Redis; no Mac required for the API-level and cross-service layers.

## Options Considered

### Option A: Layered e2e with a provider-swapped mock model (chosen)
**What it is:** Three e2e layers, each faking only the model:
1. **API-level** — boot the real NestJS app, drive it with `supertest` over real Postgres + Redis (Testcontainers, per [ADR-018](./ADR-018-testing-strategy.md)); the agent's LLM is mocked.
2. **Cross-service** — bring up `api` + `agent` + `worker` + Postgres + Redis together (compose / Testcontainers) with `LLM_PROVIDER=mock`, and run full journeys (create course → worker generates → enroll → chat → complete → unlock).
3. **Mobile** — drive the built app as a user (tool chosen below) against a backend running the mock provider.

Plus a tiny opt-in **live smoke** suite (`LIVE_SMOKE=1`) that hits the real
provider for contract sanity, run nightly/manually — never on PRs.

**Pros**
- The single mock seam is the model. Everything else — routing, auth, DB, queues, SSE, service-to-service HTTP — is real, so contract drift is caught.
- Deterministic and zero-LLM-cost on PRs; the mock provider returns fixed blueprints/responses.
- Reuses the existing provider swap ([ADR-009](../packages/providers/ADR-009-external-vendor-abstraction.md)) instead of inventing a test-only seam.
- Live smoke keeps the real-provider contract honest without burdening PRs.

**Cons**
- Cross-service layer adds CI complexity: multiple services + real infra to orchestrate.
- A `mock` LLM provider must exist in the providers factory and be maintained alongside the real ones.

### Option B: Stubbed-`fetch` "e2e" (status quo, extended)
**What it is:** Keep faking the network between services with `vi.stubGlobal('fetch')`.

**Pros**
- No new infrastructure; fast.

**Cons**
- This *is* the current gap. Stubs encode our *assumptions* about the other service's contract; when the real contract drifts, the stub keeps passing. It tests the mock, not the system.

### Option C: Full-journey against the real LLM on every run
**What it is:** Real services *and* real model in the e2e suite.

**Pros**
- Highest realism, including model behavior.

**Cons**
- Non-deterministic: model output varies, so assertions are flaky or must be trivially loose.
- Costs money on every CI run and every PR.
- Slow. Directly violates the determinism and cost drivers.

### Option D: Record/replay LLM responses (VCR-style cassettes)
**What it is:** Record real LLM HTTP exchanges once, replay them in tests.

**Pros**
- Deterministic replay with real-shaped payloads; no per-run cost.

**Cons**
- Cassettes go stale as prompts/models change and silently misrepresent current behavior.
- Brittle matching (prompt hashing) and a cassette-management burden.
- The provider-swap seam (A) gives the same determinism with far less machinery, since we control the mock provider in-process.

## Decision

**We adopt layered e2e (API-level via `supertest`, cross-service via a compose
harness, mobile via Maestro), with the LLM as the single mock seam — using the
`LLM_PROVIDER=mock` provider swap rather than network stubbing — plus a tiny
opt-in live smoke suite that runs nightly/manually and never on PRs.**

Mobile e2e tool: **Maestro** — YAML flows, no native-build glue, strong RN
support, runs the same flows across platforms; chosen over Detox (heavier
native build + setup) given the solo-team onboarding driver. This composes with
[ADR-025](./ADR-025-mobile-testing-second-runner.md).

## Rationale

Against the drivers: contract fidelity and the one-seam principle rule out B
(the status-quo gap) — it tests assumptions, not contracts. Determinism and PR
cost rule out C. D achieves determinism but with a stale-cassette maintenance
burden that A avoids by owning an in-process mock provider. A keeps everything
real except the model, reuses an abstraction we already have, and confines paid,
non-deterministic real-model testing to an opt-in nightly smoke suite. The
cross-service layer's CI complexity is the price of catching the exact class of
bug (service-to-service drift) that motivated this ADR.

## Consequences

### Positive
- Real regression net for api↔agent↔worker contracts and full user journeys.
- Deterministic and zero-LLM-cost on PRs.
- Single, well-understood mock seam (the model), via an existing abstraction.
- Real-provider contract still checked, nightly, out of the PR path.

### Negative
- Cross-service e2e needs real Postgres + Redis + three services in CI — more orchestration than unit/integration jobs.
- A `mock` LLM provider becomes a maintained artifact in `packages/providers`.

### Invariant (must not be broken)
- **PR pipelines never call a real LLM provider.** Real-model testing happens only in the opt-in live smoke suite (`LIVE_SMOKE=1`), gated to nightly/manual runs.

### Follow-up
- Mobile unit/component layer + second-runner rule — [ADR-025](./ADR-025-mobile-testing-second-runner.md).
- Reconsider if: the cross-service compose harness becomes a CI bottleneck (a long-lived shared test environment may then be cheaper), or the provider abstraction changes such that the mock seam no longer represents real model behavior faithfully.

## Update

**2026-09-01** — [ADR-027](../services/worker/ADR-027-background-job-queue-cloud-tasks.md)
executed ADR-007's flagged migration: Redis is gone from the stack. The
"Postgres + Redis" mentions in Decision Drivers, Option A, and Consequences
should read as Postgres only (the queue is Cloud Tasks in prod, `loopback` in
dev and tests). The layering and driver logic are unaffected. The decision
recorded here is unchanged.
