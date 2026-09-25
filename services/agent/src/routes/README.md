# Routes

HTTP route handlers for the Agent service. All routes are registered in `main.ts` at startup. All routes are internal (not publicly accessible).

## Files

| File | Route | Caller |
|------|-------|--------|
| `embeddings.ts` | `POST /embeddings/text` | API service, Worker service |
| `health.ts` | `GET /health`, `GET /ready` | Cloud Run health checks |

Module teaching (formerly `POST /module-chat/stream`, a LangGraph graph) and course generation are runs on AgentPlatform now — see ADR-031 and ADR-030. This service has never run either graph since ADR-031 landed; it is embeddings and health only.

---

## POST /embeddings/text

Generates a text embedding vector.

**Request body**:
```typescript
{
  text: string
}
```

**Response** (200):
```typescript
{
  embedding: number[]   // 1536 floats (OpenAI text-embedding-3-small)
}
```

This route is called on:
1. Every `POST /courses` request (API service, for similarity search)
2. Every learner chat turn after the first, for RAG grounding (API service `chat` module's `retriever.ts`, ADR-024)
3. Every `GENERATE_EMBEDDING` job (Worker service, for storing the vector)
4. Worker RAG indexing, once per module chunk after course generation

---

## Common Patterns

**Error handling**: The route wraps its logic in `try/catch` and lets Fastify's default error handler respond with 500 on failure.

**No auth**: The Agent service is internal and does not verify JWTs. Network-level access control (Cloud Run internal-only setting) is the security boundary.
