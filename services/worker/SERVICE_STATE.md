# Service State: Worker

> Background job processor (BullMQ). No HTTP server. Always-on daemon.
> Pair docs: [`README.md`](./README.md) · [`CLAUDE.md`](./CLAUDE.md)

## Purpose

Consumes two Redis queues. `course-generation`: calls the Agent for a blueprint, writes course + all module rows in one transaction (`status → ready`), then enqueues the embedding job. `embedding`: calls the Agent for a topic vector and stores it via raw pgvector SQL, making the course eligible for similarity reuse. The only service that writes `status = 'ready'`.

## Status

- Dev Ready: ✅
- Beta Ready: ⚠️
- Production Ready: ❌

## Current State

- Both processors implemented with retry (`attempts: 3`, exponential backoff, 5s base) and concurrency (course: 3, embedding: 5).
- Course write is transactional; module rows roll back with the status update.
- Job chaining (course → embedding) implemented; graceful SIGTERM/SIGINT shutdown.
- All AI calls go through `AgentClient` (`/course/generate`, `/embeddings/text`); no direct LLM SDKs.
- 3 test files (agent client, both processors). Green in CI.

## Infrastructure

- API (HTTP): ➖ none by design (pure worker)
- Database: ✅ Drizzle/Postgres + raw pgvector SQL
- Auth: ➖ none (internal)
- Queue: ✅ BullMQ on Redis/Memorystore
- Error Tracking: ❌ none wired

## Current Bottleneck

No failed-job recovery. After 3 failed attempts a course is left stuck in `status = 'generating'` with no cleanup job — the user can never recover it without manual DB intervention. This is the single biggest gap before real users.

## Known Issues

- Stuck `generating` courses are unrecoverable (no dead-letter handling / reconciliation job).
- Requires `min-instances = 1` on Cloud Run to avoid a cold-start queue backlog (configured in Terraform).
- ADR-007 carries a 🚩 reconsideration flag (BullMQ/Memorystore vs. Cloud Tasks).
- No alerting on repeated job failures.

## Next Steps

1. Add a cleanup/reconciliation job to mark long-stuck `generating` courses as `failed` and surface them.
2. Add a dead-letter queue or failure webhook + alerting.
3. Wire error tracking for processor exceptions.
4. Resolve the ADR-007 transport decision before scaling.

## Open Questions

- Should a failed generation auto-retry from the user's side, or surface a "retry" action in the app?
- Cloud Tasks vs. BullMQ for production durability (ADR-007)?

## Confidence

- Developers: ✅ — small, well-tested, clear invariants.
- Internal testers: ⚠️ — works with Redis + DB + Agent up; failures leave stuck rows.
- Beta users: ⚠️ — needs failed-job recovery so users aren't stranded.
- Production users: ❌ — no recovery, no alerting, transport decision open.
