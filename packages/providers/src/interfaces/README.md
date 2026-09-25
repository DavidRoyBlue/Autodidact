# Interfaces

TypeScript interfaces that define the contract every provider implementation must satisfy. Consumers depend only on these interfaces, never on concrete classes.

## Files

| File | Interface | Description |
|------|-----------|-------------|
| `embedding.ts` | `IEmbeddingProvider` | Generates float vector representations of text |
| `queue.ts` | `IQueueProvider` | Enqueues background jobs and queries job status |
| `auth.ts` | `IAuthProvider` | Verifies a bearer token and returns the authenticated user |

---

## Interface Contracts

### `IEmbeddingProvider`
```typescript
interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getEmbeddings(): Embeddings;   // from @langchain/core — for LangChain integrations
}
```

---

### `IQueueProvider`
```typescript
interface IQueueProvider {
  enqueue<T>(
    queueName: string,
    jobName: string,
    data: T,
    options?: EnqueueOptions   // advisory — retries are queue-level (Terraform) under Cloud Tasks
  ): Promise<string>;          // returns the created task id

  close(): Promise<void>;
}
```
There is no per-task status method — generation status is DB-backed (`courses.status`, read by the API service).

---

### `IAuthProvider`
```typescript
interface IAuthProvider {
  verifyToken(token: string): Promise<AuthUser>;
}
```
`AuthUser` is `{ id: string; supabaseId: string; email: string }` — the minimal identity needed by the API service.

---

## Design Notes

- **All interfaces are minimal.** They expose only what the application needs, not the full vendor SDK surface. This keeps implementations easy to test with mocks.
