# Design: fix empty chat SSE stream (`/module-chat/stream` false-disconnect)

**Date:** 2026-06-13
**Status:** approved
**Surfaced by:** cross-service e2e `golden-path.e2e.test.ts > a chat turn (SSE) completes the module` (PR #29)

## Problem

A chat turn over SSE returns **zero events**. The cross-service e2e fails with
`expected 0 to be greater than 0`. Reproduced locally and traced end-to-end with
temporary instrumentation.

## Root cause (verified, not hypothesised)

The agent route `services/agent/src/routes/module-chat.ts` detects client
disconnect to cancel in-flight LLM work:

```ts
const abortController = new AbortController();
const onClose = () => abortController.abort();
request.raw.on('close', onClose);   // ← BUG
```

The endpoint is a **POST** (the client sends the message in the body). On a POST,
`request.raw` is the *request body* `Readable`. Node emits its `'close'` as soon
as the request body has been fully consumed — which Fastify does before/at the
start of the handler. So `onClose` fires **immediately**, aborting the
`AbortController` before the graph emits anything.

Instrumented evidence (mock provider, real cross-service HTTP):

```
[agent] request close fired; sentSoFar=0 writableEnded=false   ← fires instantly
[api]   agent fetch ... status=200 ok=true hasBody=true
[api]   forwarded events=0
[test]  stream resp status=201 ct=text/event-stream len=0 body=""
```

`graph.stream` receives the aborted signal, throws, and the `catch` block's
`abortController.signal.aborted` branch logs "cancelled by client" and sends
**nothing**. The API proxy faithfully forwards 0 events.

This is a **latent production bug**, not a mock artifact: POST is POST regardless
of provider. The mock made it deterministic (instant graph), and the e2e is the
first test to exercise the route over real HTTP with a request body. Two reasons
it was never caught:
1. `LLM_PROVIDER=mock` was only added to the agent env schema on this branch, so
   before PR #29 the cross-service e2e could not boot the agent at all.
2. The existing `module-chat.route.test.ts` mocks the entire graph and uses
   Fastify `inject()`, which does not reproduce the real request/response
   `'close'` timing.

## Fix

Listen for disconnect on the **response** stream, which closes only when the SSE
connection actually ends (genuine client disconnect) — never when the request
body is read:

```ts
reply.raw.on('close', onClose);   // and reply.raw.off('close', onClose) in finally
```

Single-line change (plus the matching `.off`). Verified: with it, the agent
streams all 4 events (2 `token`, `module_complete`, `complete`), the API forwards
them, and all 6 e2e tests pass.

This preserves the original intent — cancelling in-flight LLM work on a real
mid-stream disconnect — because `reply.raw` `'close'` fires on socket/connection
teardown.

## Scope

In scope:
- `services/agent/src/routes/module-chat.ts`: `request.raw` → `reply.raw` for the
  close listener registration and removal.
- A focused agent regression test that boots Fastify on a real port
  (`app.listen`, not `inject()`), POSTs to `/module-chat/stream`, and asserts the
  SSE body contains streamed events. `inject()` cannot reproduce the
  request-body-close timing, so the test must use a real socket.
- Remove the temporary diagnostic instrumentation (already reverted; the working
  tree is clean — this is a guard, not a task).

Out of scope:
- The pre-existing `request.raw.on('close')` cancellation unit behaviour, beyond
  confirming the happy path streams. (A dedicated disconnect-cancel test was
  considered and deferred per the approved test strategy.)
- The cross-service e2e already covers the end-to-end path; no e2e change needed.
- No change to the API proxy (`chat.service.ts`) — it is correct; it only ever
  saw 0 events because the agent sent 0.

## Test strategy (approved)

1. **Agent unit/integration regression** (new): real-HTTP route test pinning the
   exact bug at the unit level.
2. **Cross-service e2e** (existing): already asserts the full
   create→generate→enroll→chat→unlock journey and now passes with the fix.

## Verification

- New agent route test fails on `request.raw`, passes on `reply.raw`.
- `pnpm --filter @autodidact/agent test` green.
- `pnpm --filter @autodidact/e2e test:e2e` green (golden path chat turn passes).
- Full gate: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.

## Docs

- `services/agent/CLAUDE.md` "SSE streaming" pattern note: add that disconnect
  detection must use `reply.raw` (response) `'close'`, never `request.raw`, on
  body-bearing (POST) SSE routes — with the one-line reason. This is the durable
  lesson a future agent needs.
