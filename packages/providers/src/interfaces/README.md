# Interfaces

TypeScript interfaces that define the contract every provider implementation must satisfy. Consumers depend only on these interfaces, never on concrete classes.

## Files

| File | Interface | Description |
|------|-----------|-------------|
| `llm.ts` | `ILLMProvider` | Returns a LangChain `BaseChatModel` for use in LangGraph nodes |
| `embedding.ts` | `IEmbeddingProvider` | Generates float vector representations of text |
| `queue.ts` | `IQueueProvider` | Enqueues background jobs and queries job status |
| `auth.ts` | `IAuthProvider` | Verifies a bearer token and returns the authenticated user |
| `checkpointer.ts` | `ICheckpointerProvider` | Returns a LangGraph `BaseCheckpointSaver` for conversation persistence |

---

## Interface Contracts

### `ILLMProvider`
```typescript
interface ILLMProvider {
  getModel(): BaseChatModel;    // from @langchain/core
  getModelName(): string;
}
```
`BaseChatModel` is the LangChain base class for all chat models. LangGraph nodes call `.invoke(messages)` or `.stream(messages)` on it directly.

---

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

### `ICheckpointerProvider`
```typescript
interface ICheckpointerProvider {
  getCheckpointer(): BaseCheckpointSaver;   // from @langchain/langgraph
}
```
The checkpointer is passed directly to `graph.compile({ checkpointer })`. LangGraph handles all serialisation.

---

## Design Notes

- **All interfaces are minimal.** They expose only what the application needs, not the full vendor SDK surface. This keeps implementations easy to test with mocks.
- **`ILLMProvider.getModel()` is synchronous.** The model is instantiated in the constructor. If you need async initialisation (e.g., loading credentials lazily), do it inside the constructor as a stored promise and resolve it on first `.invoke()` call.
- **`ICheckpointerProvider` returns a `BaseCheckpointSaver`.** This is the LangGraph internal type — implementations must return a compatible instance. Both `MemorySaver` and `PostgresSaver` implement this interface.
