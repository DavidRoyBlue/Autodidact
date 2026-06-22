# Chat SSE Empty-Stream Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent's `POST /module-chat/stream` actually stream SSE events by detecting client disconnect on the response stream (`reply.raw`) instead of the request stream (`request.raw`), and lock it in with a real-HTTP regression test.

**Architecture:** One-line behavioural fix in the Fastify SSE route. The disconnect-cancellation `AbortController` must be wired to `reply.raw`'s `'close'` (fires on real socket teardown), not `request.raw`'s `'close'` (fires as soon as a POST body is read, which instantly false-aborts the graph). A new agent test boots Fastify on a real port and POSTs over a real socket — the only way to reproduce the request-body-close timing (`inject()` cannot).

**Tech Stack:** Fastify, LangGraph (`streamMode: 'messages'`), Vitest, `@autodidact/providers` mock LLM + memory checkpointer.

---

## Background (why this is the fix)

`services/agent/src/routes/module-chat.ts` registers:

```ts
const onClose = () => abortController.abort();
request.raw.on('close', onClose);   // BUG: request readable closes when POST body is read
```

On a POST, `request.raw` (the request body `Readable`) emits `'close'` the moment
the body is consumed — before the graph emits anything — so the abort fires
immediately and 0 SSE frames are written. Verified with instrumented e2e runs.
Fix: listen on `reply.raw` (the `ServerResponse`), which closes only on genuine
client disconnect.

The existing `module-chat.route.test.ts` mocks the whole graph and uses
`inject()`, which does not reproduce real socket close timing — that is why this
shipped green. The new test uses `app.listen()` + `fetch`.

---

## File Structure

- **Modify** `services/agent/src/routes/module-chat.ts` — swap `request.raw` →
  `reply.raw` for the `'close'` listener add (and the matching `.off` in
  `finally`). No other change.
- **Create** `services/agent/src/__tests__/module-chat.stream.integration.test.ts`
  — real-HTTP regression test using the real graph + mock provider. Kept separate
  from the existing graph-mocking `module-chat.route.test.ts` (different
  responsibility: that file unit-tests route logic with a faked graph; this one
  proves the real socket path streams).
- **Modify** `services/agent/CLAUDE.md` — add the durable SSE-disconnect rule.

---

## Task 1: Add the failing real-HTTP regression test

**Files:**
- Create: `services/agent/src/__tests__/module-chat.stream.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `services/agent/src/__tests__/module-chat.stream.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { createLLMProvider, createCheckpointer } from '@autodidact/providers';
import { registerModuleChatRoute } from '../routes/module-chat.js';

// Real-HTTP test (NOT app.inject): the bug is that `request.raw.on('close')`
// fires as soon as a POST body is read, which only happens over a real socket.
// inject() short-circuits the HTTP layer and cannot reproduce it.

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => frame.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => Boolean(l))
    .map((l) => JSON.parse(l.slice(6)) as SseEvent);
}

const validBody = {
  sessionId: '00000000-0000-0000-0000-000000000123',
  message: 'I understand this module now.',
  moduleBlueprint: {
    id: 'mod-1',
    position: 0,
    title: 'Variables',
    description: 'Learn Python variables.',
    objectives: ['Declare variables'],
    contentOutline: [{ title: 'Basics', points: ['Assignment'] }],
    estimatedMinutes: 30,
  },
  courseProgress: { courseTitle: 'Python', completedModuleCount: 0, totalModuleCount: 3 },
  isFirstMessage: true,
};

describe('POST /module-chat/stream over a real socket (mock LLM)', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = Fastify();
    const llm = createLLMProvider({ llmProvider: 'mock' });
    const checkpointer = createCheckpointer({ checkpointer: 'memory' });
    await registerModuleChatRoute(app, llm, checkpointer);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('streams token + module_complete + complete events (does not false-abort on the POST body close)', async () => {
    const res = await fetch(`${baseUrl}/module-chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);

    const events = parseSse(await res.text());

    // The mock teacher replies with [MODULE_COMPLETE:score=85].
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'token')).toBe(true);
    expect(events.some((e) => e.type === 'module_complete')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'complete' });
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS (reproduces the bug)**

Run: `pnpm --filter @autodidact/agent exec vitest run src/__tests__/module-chat.stream.integration.test.ts`
Expected: FAIL — `expected 0 to be greater than 0` (the body is empty because the
route aborts on the POST request-body close before emitting any event).

- [ ] **Step 3: Commit the failing test**

```bash
git add services/agent/src/__tests__/module-chat.stream.integration.test.ts
git commit -m "test(agent): failing real-HTTP test for /module-chat/stream empty-stream bug"
```

---

## Task 2: Apply the fix

**Files:**
- Modify: `services/agent/src/routes/module-chat.ts`

- [ ] **Step 1: Swap the close listener registration to the response stream**

In `services/agent/src/routes/module-chat.ts`, find:

```ts
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    request.raw.on('close', onClose);
```

Replace with:

```ts
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    // Detect a genuine client disconnect on the RESPONSE stream. Do NOT use
    // request.raw: on a POST, the request readable emits 'close' as soon as the
    // body is consumed (immediately), which would abort the graph before it
    // streams a single token. reply.raw 'close' fires only on real socket teardown.
    reply.raw.on('close', onClose);
```

- [ ] **Step 2: Swap the matching listener removal in `finally`**

In the same file, find:

```ts
    } finally {
      request.raw.off('close', onClose);
      reply.raw.end();
    }
```

Replace with:

```ts
    } finally {
      reply.raw.off('close', onClose);
      reply.raw.end();
    }
```

- [ ] **Step 3: Run the new test to verify it PASSES**

Run: `pnpm --filter @autodidact/agent exec vitest run src/__tests__/module-chat.stream.integration.test.ts`
Expected: PASS — events include `token`, `module_complete`, and a final `complete`.

- [ ] **Step 4: Run the full agent suite to confirm no regression**

Run: `pnpm --filter @autodidact/agent test`
Expected: PASS — including the existing `module-chat.route.test.ts` (its `inject()`
+ mocked-graph tests are unaffected; the abort-signal test only asserts a signal
is passed, not which stream it listens on).

- [ ] **Step 5: Commit the fix**

```bash
git add services/agent/src/routes/module-chat.ts
git commit -m "fix(agent): stream module-chat SSE by detecting disconnect on reply.raw not request.raw

On a POST, request.raw ('close') fires when the request body is read, instantly
aborting graph.stream so zero SSE events reach the client. Listen on the response
stream (reply.raw) instead, which closes only on genuine client disconnect.
Surfaced by the cross-service e2e chat turn."
```

---

## Task 3: Record the durable lesson in the subtree CLAUDE.md

**Files:**
- Modify: `services/agent/CLAUDE.md`

- [ ] **Step 1: Update the SSE streaming pattern note**

In `services/agent/CLAUDE.md`, find the "Key patterns to follow" bullet:

```markdown
- **SSE streaming:** set `Content-Type: text/event-stream` and all required headers, then use `reply.raw.write()` for each event. Always call `reply.raw.end()` in the `finally` block — on completion and on error.
```

Replace with:

```markdown
- **SSE streaming:** set `Content-Type: text/event-stream` and all required headers, then use `reply.raw.write()` for each event. Always call `reply.raw.end()` in the `finally` block — on completion and on error. Detect client disconnect (to cancel in-flight LLM work) on **`reply.raw.on('close')`**, never `request.raw` — on a POST route, `request.raw` ('close') fires the instant the request body is read, which would abort the stream before the first token.
```

- [ ] **Step 2: Commit the doc update**

```bash
git add services/agent/CLAUDE.md
git commit -m "docs(agent): note SSE disconnect must use reply.raw not request.raw"
```

---

## Task 4: Full verification gate

- [ ] **Step 1: Build, typecheck, lint, unit/integration**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green (11/11 tasks).

- [ ] **Step 2: Cross-service e2e (the suite that surfaced the bug)**

Run: `pnpm --filter @autodidact/e2e test:e2e`
Expected: PASS — `golden-path.e2e.test.ts` including
`a chat turn (SSE) completes the module and unlocks the next` (8/8 tests).
Requires Docker (Testcontainers).

- [ ] **Step 3: Confirm the working tree has no leftover diagnostics**

Run: `git status --porcelain`
Expected: clean (the temporary instrumentation used during root-causing was
already reverted before this plan).

- [ ] **Step 4: Push the branch (updates PR #29)**

```bash
git push
```
Expected: PR #29 re-runs CI; the Cross-service e2e check goes green.
(Note: the `claude-review` / `review-changed-adrs` checks fail independently on a
missing `ANTHROPIC_API_KEY` repo secret — unrelated to this fix.)

---

## Self-Review

**Spec coverage:**
- Fix `request.raw` → `reply.raw` (add + off) → Task 2 Steps 1–2. ✓
- Real-HTTP agent regression test (app.listen, not inject) → Task 1. ✓
- Existing e2e covers end-to-end → Task 4 Step 2 (no e2e change needed). ✓
- `services/agent/CLAUDE.md` durable note → Task 3. ✓
- Diagnostics already reverted / tree clean → Task 4 Step 3. ✓
- API proxy (`chat.service.ts`) unchanged → not touched in any task. ✓

**Placeholder scan:** none — every step has exact paths, full code, exact commands, expected output.

**Type/name consistency:** `registerModuleChatRoute(app, llm, checkpointer)` matches the route signature; `createLLMProvider({ llmProvider: 'mock' })` and `createCheckpointer({ checkpointer: 'memory' })` match `@autodidact/providers` factory signatures; `parseSse`/`SseEvent` are defined in the test file before use; the `module_complete` / `complete` / `token` event types match the route's emitted shapes.
