# ADR-023: Mobile testing strategy and second test runner

## Status

Accepted
Date: 2026-06-01

## Context

[ADR-018](./ADR-018-testing-strategy.md) chose Vitest + Testcontainers for the
backend and explicitly listed "Mobile UI tests — no mobile testing strategy in
place yet" as a non-goal, deferring it to its own ADR. This is that ADR.

`apps/mobile` is an Expo / React Native app ([ADR-003](../apps/mobile/ADR-003-mobile-application-platform.md))
with 32 source files and **zero tests**: components, the `useSSE` and
`useCourseGeneration` hooks, the Zustand stores (auth/chat/toast —
[ADR-015](../apps/mobile/ADR-015-mobile-state-management.md)), and the API
clients are all unguarded. Every mobile change ships untested.

The backend standardized on Vitest. The natural instinct is "one runner
everywhere." But React Native does not run on plain Node: components depend on
the RN renderer, native modules, and the Expo runtime. The test runner has to
provide an RN-aware environment, transform RN/Expo packages, and mock the
native bridge. This decision is therefore co-decided with whether to accept a
**second** test runner in the monorepo.

A separate question is mobile **end-to-end** testing (driving the built app
like a user). That overlaps with the broader e2e strategy and is decided in
[ADR-024](./ADR-024-e2e-testing-strategy.md); this ADR covers the unit/component
layer and records the second-runner decision that the e2e tool choice also
depends on.

## Non-goals

- Backend test strategy — owned by [ADR-018](./ADR-018-testing-strategy.md); unchanged.
- The full e2e strategy (API-level, cross-service) — owned by [ADR-024](./ADR-024-e2e-testing-strategy.md).
- Mock factory conventions — owned by `packages/config/CLAUDE.md`.
- Coverage thresholds — operational; enforced per-package in CI.

## Decision Drivers

- **RN/Expo fidelity** — the runner must execute components in an RN-aware environment with the native bridge mocked, and transform Expo's ESM packages out of the box.
- **Ecosystem support** — RN testing tooling (Testing Library, matchers, mocks) should target the runner first-class.
- **Onboarding cost** — solo team; the RN testing path should be the documented, low-surprise one.
- **Monorepo coherence** — a second runner is a real cost (two configs, two mental models, two coverage formats); it must be justified and strictly scoped.
- **CI compatibility** — runs on GitHub Actions ([ADR-022](../infra/ADR-022-cicd-platform.md)) without a Mac for the unit/component layer.

## Options Considered

### Option A: jest-expo + @testing-library/react-native (chosen)
**What it is:** Jest with Expo's official `jest-expo` preset, plus React Native
Testing Library for rendering and queries. This is the path Expo documents and
maintains.

**Pros**
- `jest-expo` is maintained by the Expo team and tracks each SDK: it ships the correct `transformIgnorePatterns`, native-module mocks, and environment for the installed Expo SDK. Upgrades stay coherent.
- `@testing-library/react-native` is the de-facto RN component-testing library; the entire RN ecosystem's examples assume Jest.
- Lowest-surprise path: when something breaks on an Expo upgrade, the fix is usually a documented `jest-expo` bump.
- Works headless on Linux CI for unit/component tests.

**Cons**
- Introduces **Jest as a second runner** alongside Vitest. Two configs, two coverage reporters (istanbul vs v8), two `mock` dialects.
- Jest is slower than Vitest, though the mobile suite is small.

### Option B: Vitest for React Native too (one runner everywhere)
**What it is:** Force RN/Expo into Vitest with a custom environment, manual
`transformIgnorePatterns`-equivalents, and hand-rolled native mocks.

**Pros**
- One runner across the whole monorepo; one mental model; one coverage format.
- Keeps the fast Vitest watch loop.

**Cons**
- RN/Expo support in Vitest is unofficial and brittle. There is no Expo-maintained preset; every SDK upgrade risks breaking the bespoke transform and native-mock setup, and debugging it falls entirely on us.
- `@testing-library/react-native` and most RN testing guidance assume Jest; we'd be off the documented path with no community to lean on.
- High maintenance for a solo team — the opposite of the onboarding driver.

### Option C: No mobile unit/component tests (e2e only)
**What it is:** Skip the unit/component layer; rely solely on mobile e2e.

**Pros**
- No second runner; simplest config.

**Cons**
- Hooks (`useSSE`, `useCourseGeneration`) and stores hold real logic (SSE framing, sequential unlock, optimistic updates) that e2e exercises slowly and indirectly, if at all. Leaving them untested keeps the largest gap open.
- e2e is slow and coarse; logic bugs surface as flaky end-to-end failures instead of precise unit failures.

## Decision

**We adopt `jest-expo` + `@testing-library/react-native` for mobile
unit/component tests, accepting Jest as a second test runner scoped strictly to
`apps/mobile`. All backend packages and services remain on Vitest
([ADR-018](./ADR-018-testing-strategy.md)).**

## Rationale

Against the drivers: RN/Expo fidelity and ecosystem support decisively favor A —
`jest-expo` is the only option the Expo team maintains, and the RN testing
ecosystem is Jest-first. The single real cost of A is the second runner; that
cost is bounded by scoping Jest to `apps/mobile` only and forbidding it
elsewhere. Option B trades that bounded cost for an unbounded, solo-maintained
compatibility burden on every Expo upgrade — the wrong trade for a solo team.
Option C leaves the highest-value logic (hooks, stores) untested.

What we sacrifice by accepting two runners: one mental model and one coverage
format. We mitigate by a hard boundary (below) and by merging both coverage
reports in CI.

## Consequences

### Positive
- Mobile components, hooks, stores, and API clients become testable on the documented, maintained path.
- Expo SDK upgrades stay coherent via `jest-expo`.
- Backend keeps the fast Vitest loop untouched.

### Negative
- Two test runners in the monorepo (Vitest + Jest), two coverage formats to merge in CI.
- Contributors switching between backend and mobile switch `vi.*` ↔ `jest.*` mock dialects.

### Boundary invariant (must not be broken)
- **Jest is confined to `apps/mobile`.** No backend package or service may adopt Jest; they stay on Vitest. Conversely, mobile does not use Vitest. This keeps the second-runner cost contained and the rule unambiguous.

### Follow-up
- Mobile e2e tool choice (Maestro) — [ADR-024](./ADR-024-e2e-testing-strategy.md).
- Reconsider if: Vitest gains an Expo-maintained RN preset of equal fidelity (then collapsing to one runner becomes attractive), or Expo deprecates `jest-expo`.
