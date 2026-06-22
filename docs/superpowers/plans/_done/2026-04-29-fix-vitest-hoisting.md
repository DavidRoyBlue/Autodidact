# Fix Vitest `vi.mock` Hoisting Failures in `packages/providers`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two test files in `packages/providers` that fail at collection time with `ReferenceError: Cannot access '...' before initialization` caused by `vi.mock` factories referencing `const` variables before those variables are initialised.

**Architecture:** Vitest hoists all `vi.mock(...)` calls to the top of the file before any `const`/`let` declarations run. Any `const` referenced directly inside a `vi.mock` factory is therefore in the Temporal Dead Zone. The fix is `vi.hoisted()`, which also runs before declarations and returns values that are safe for both `vi.mock` factory bodies and normal test bodies. The new `supabase-auth.provider.test.ts` in this repo already demonstrates the correct pattern.

**Tech Stack:** Vitest 2.x, TypeScript

---

## Root-cause summary

| File | Variable causing TDZ error | Why it's in a `vi.mock` factory |
|---|---|---|
| `factory.test.ts` | `MockOpenAILLMProvider`, `MockAnthropicLLMProvider` | Passed directly as values: `{ OpenAILLMProvider: MockOpenAILLMProvider }` |
| `bullmq.provider.test.ts` | `MockQueue` | Passed directly: `{ Queue: MockQueue }` |

`mockQuit` in `bullmq.provider.test.ts` is used *inside a nested lambda* in the `ioredis` factory, so it does not trigger a TDZ error at factory-call time — but it is tidier to hoist it alongside the rest.

---

## Files

| Action | Path |
|---|---|
| Modify | `packages/providers/src/__tests__/factory.test.ts` |
| Modify | `packages/providers/src/__tests__/bullmq.provider.test.ts` |

---

## Task 1 — Fix `factory.test.ts`

**Files:**
- Modify: `packages/providers/src/__tests__/factory.test.ts:9-19`

The only change is replacing the two top-level `const Mock...` declarations with a single `vi.hoisted()` call that returns the same values under the same names. Everything below line 19 (the `vi.mock` calls, imports, and test bodies) is untouched.

- [ ] **Step 1: Verify the current failure**

```bash
pnpm --filter @autodidact/providers test -- --reporter=verbose 2>&1 | grep -E 'factory|FAIL|Cannot access'
```

Expected output contains:
```
FAIL  src/__tests__/factory.test.ts
ReferenceError: Cannot access 'MockOpenAILLMProvider' before initialization
```

- [ ] **Step 2: Replace lines 9-16 with `vi.hoisted()`**

Remove:
```typescript
const MockOpenAILLMProvider = vi.fn().mockImplementation(() => ({
  getModel: vi.fn().mockReturnValue({}),
  getModelName: vi.fn().mockReturnValue('gpt-4o'),
}));
const MockAnthropicLLMProvider = vi.fn().mockImplementation(() => ({
  getModel: vi.fn().mockReturnValue({}),
  getModelName: vi.fn().mockReturnValue('claude-3-5-sonnet'),
}));
```

Replace with:
```typescript
const { MockOpenAILLMProvider, MockAnthropicLLMProvider } = vi.hoisted(() => ({
  MockOpenAILLMProvider: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({}),
    getModelName: vi.fn().mockReturnValue('gpt-4o'),
  })),
  MockAnthropicLLMProvider: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({}),
    getModelName: vi.fn().mockReturnValue('claude-3-5-sonnet'),
  })),
}));
```

Everything from line 18 onwards (the `vi.mock(...)` calls, imports, `afterEach`, and all `describe` blocks) is unchanged.

- [ ] **Step 3: Run factory tests and confirm all pass**

```bash
pnpm --filter @autodidact/providers test -- --reporter=verbose src/__tests__/factory.test.ts 2>&1
```

Expected:
```
✓ createLLMProvider() > returns a provider with getModel() and getModelName() ...
✓ createLLMProvider() > getModelName() contains "gpt" ...
✓ createLLMProvider() > instantiates OpenAILLMProvider when LLM_PROVIDER=openai
✓ createLLMProvider() > instantiates AnthropicLLMProvider when LLM_PROVIDER=anthropic
✓ createLLMProvider() > returns anthropic provider when LLM_PROVIDER=anthropic
✓ createLLMProvider() > config object overrides env var
✓ createLLMProvider() > defaults to openai when LLM_PROVIDER is not set
✓ createEmbeddingProvider() > returns a provider with embed() and embedBatch()
✓ createQueueProvider() > returns a provider with enqueue(), getJobStatus(), and close()
✓ createCheckpointer() > returns memory checkpointer by default
✓ createCheckpointer() > returns postgres checkpointer when configured
✓ createAuthProvider() > returns a provider with verifyToken()
Tests  12 passed (12)
```

- [ ] **Step 4: Commit**

```bash
git add packages/providers/src/__tests__/factory.test.ts
git commit -m "fix(providers): migrate factory.test.ts mocks to vi.hoisted() to fix TDZ failure"
```

---

## Task 2 — Fix `bullmq.provider.test.ts`

**Files:**
- Modify: `packages/providers/src/__tests__/bullmq.provider.test.ts`

This file has more moving parts. The approach:

1. Move `mockQuit`, `mockQueueAdd`, `mockQueueGetJob`, `mockQueueClose`, and `MockQueue` into `vi.hoisted()`. `mockQueueGetJob` is initialised without an implementation here (just `vi.fn()`) because its implementation needs to close over `mockJob`, which lives inside the `describe` block.
2. Remove the module-level `let mockJobGetState` and `let mockJob` — move them as `let` declarations inside the `describe` block so they're scoped to tests.
3. In `beforeEach`: initialise `mockJobGetState` and `mockJob`, then call `mockQueueGetJob.mockImplementation(async () => mockJob)` to attach the implementation (which captures the `mockJob` binding — reassignments in individual tests will be visible to the closure).

`vi.clearAllMocks()` clears call history but not implementations, so the `mockImplementation` set in `beforeEach` persists through each test's assertion phase.

- [ ] **Step 1: Verify the current failure**

```bash
pnpm --filter @autodidact/providers test -- --reporter=verbose 2>&1 | grep -E 'bullmq|FAIL|Cannot access'
```

Expected output contains:
```
FAIL  src/__tests__/bullmq.provider.test.ts
ReferenceError: Cannot access 'MockQueue' before initialization
```

- [ ] **Step 2: Replace the module-level mock setup (lines 8-26)**

Remove everything from `const mockQuit = ...` through `vi.mock('bullmq', ...)`:

```typescript
const mockQuit = vi.fn().mockResolvedValue(undefined);
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({ quit: mockQuit })),
}));

let mockJobGetState = vi.fn().mockResolvedValue('waiting');
let mockJob: { id: string; getState: ReturnType<typeof vi.fn> } | null = null;

const mockQueueAdd = vi.fn().mockImplementation(async () => ({ id: 'job-123' }));
const mockQueueGetJob = vi.fn().mockImplementation(async () => mockJob);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const MockQueue = vi.fn().mockImplementation(() => ({
  add: mockQueueAdd,
  getJob: mockQueueGetJob,
  close: mockQueueClose,
}));

vi.mock('bullmq', () => ({ Queue: MockQueue }));
```

Replace with:

```typescript
const { mockQuit, mockQueueAdd, mockQueueGetJob, mockQueueClose, MockQueue } = vi.hoisted(() => {
  const mockQuit = vi.fn().mockResolvedValue(undefined);
  const mockQueueAdd = vi.fn().mockImplementation(async () => ({ id: 'job-123' }));
  const mockQueueGetJob = vi.fn(); // implementation set per-test in beforeEach
  const mockQueueClose = vi.fn().mockResolvedValue(undefined);
  const MockQueue = vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
    close: mockQueueClose,
  }));
  return { mockQuit, mockQueueAdd, mockQueueGetJob, mockQueueClose, MockQueue };
});

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({ quit: mockQuit })),
}));

vi.mock('bullmq', () => ({ Queue: MockQueue }));
```

- [ ] **Step 3: Update the `describe` block — add `let` declarations and fix `beforeEach`**

The current `describe` block opens with:

```typescript
describe('BullMQQueueProvider', () => {
  let provider: InstanceType<typeof BullMQQueueProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJob = { id: 'job-123', getState: mockJobGetState };
    provider = new BullMQQueueProvider({ redisUrl: 'redis://localhost:6379' });
  });
```

Replace with:

```typescript
describe('BullMQQueueProvider', () => {
  let mockJobGetState: ReturnType<typeof vi.fn>;
  let mockJob: { id: string; getState: ReturnType<typeof vi.fn> } | null;
  let provider: InstanceType<typeof BullMQQueueProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJobGetState = vi.fn().mockResolvedValue('waiting');
    mockJob = { id: 'job-123', getState: mockJobGetState };
    mockQueueGetJob.mockImplementation(async () => mockJob);
    provider = new BullMQQueueProvider({ redisUrl: 'redis://localhost:6379' });
  });
```

Everything inside the `describe` block after `beforeEach` (`queue caching`, `enqueue()`, `getJobStatus()`, `close()` sub-describes) is unchanged.

- [ ] **Step 4: Run bullmq tests and confirm all pass**

```bash
pnpm --filter @autodidact/providers test -- --reporter=verbose src/__tests__/bullmq.provider.test.ts 2>&1
```

Expected (all 21 tests pass):
```
✓ BullMQQueueProvider > queue caching (getQueue) > creates a Queue with the correct name on the first call
✓ BullMQQueueProvider > queue caching (getQueue) > returns the same Queue instance on subsequent calls with the same name
✓ BullMQQueueProvider > queue caching (getQueue) > creates different Queue instances for different names
✓ BullMQQueueProvider > enqueue() > calls queue.add with name and data
✓ BullMQQueueProvider > enqueue() > applies default 3 attempts when no opts provided
✓ BullMQQueueProvider > enqueue() > applies exponential backoff with 5000ms delay by default
✓ BullMQQueueProvider > enqueue() > passes through custom attempts when provided
✓ BullMQQueueProvider > enqueue() > returns job.id as string
✓ BullMQQueueProvider > enqueue() > returns empty string when job.id is undefined
✓ BullMQQueueProvider > getJobStatus() > maps "waiting" state → "pending"
✓ BullMQQueueProvider > getJobStatus() > maps "active" state → "active"
✓ BullMQQueueProvider > getJobStatus() > maps "completed" state → "completed"
✓ BullMQQueueProvider > getJobStatus() > maps "failed" state → "failed"
✓ BullMQQueueProvider > getJobStatus() > maps "delayed" state → "delayed"
✓ BullMQQueueProvider > getJobStatus() > maps "paused" state → "pending"
✓ BullMQQueueProvider > getJobStatus() > maps "unknown" state → "failed"
✓ BullMQQueueProvider > getJobStatus() > returns "failed" when job is not found (getJob returns null)
✓ BullMQQueueProvider > close() > closes all queues and the Redis connection
Tests  18 passed (18)
```

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/__tests__/bullmq.provider.test.ts
git commit -m "fix(providers): migrate bullmq.provider.test.ts mocks to vi.hoisted() to fix TDZ failure"
```

---

## Task 3 — Full suite regression check

- [ ] **Step 1: Run the complete providers test suite**

```bash
pnpm --filter @autodidact/providers test 2>&1
```

Expected:
```
Test Files  3 passed (3)
Tests  39 passed (39)
```

(9 from `supabase-auth.provider.test.ts` + 12 from `factory.test.ts` + 18 from `bullmq.provider.test.ts`)

- [ ] **Step 2: Confirm no regressions in the API service**

```bash
pnpm --filter @autodidact/api test 2>&1 | grep -E 'Tests |passed|failed'
```

Expected:
```
Tests  33 passed (33)
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @autodidact/types build && pnpm --filter @autodidact/providers typecheck && pnpm --filter @autodidact/api typecheck
```

Expected: all three commands exit 0 with no errors.
