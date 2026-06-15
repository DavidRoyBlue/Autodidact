# Service State: Worker

> Background task handler (Fastify HTTP, invoked by Cloud Tasks / loopback). Internal only; scale-to-zero.
> Pair docs: [`README.md`](./README.md) · [`CLAUDE.md`](./CLAUDE.md)

## Purpose

Handles task POSTs on two endpoints. `/tasks/generate-course`: calls the Agent for a blueprint, writes course + all module rows in one transaction (`status → ready`), then enqueues the embedding task. `/tasks/generate-embedding`: calls the Agent for a topic vector and stores it via raw pgvector SQL, making the course eligible for similarity reuse. The only service that writes `status = 'ready'` or `status = 'failed'`.

## Status

- Dev Ready: ✅
- Beta Ready: ⚠️
- Production Ready: ❌

## Current State

- Migrated from BullMQ/Redis poller to a Cloud Tasks HTTP handler (ADR-027): Fastify app with zod-validated task endpoints; retries are queue-level (Terraform `retry_config`, 3 attempts, 5 s → 125 s).
- Failed-generation recovery implemented: the final failed attempt (retry-count header vs `TASK_MAX_ATTEMPTS`, or any loopback failure) marks the course `failed` — guarded so a committed `ready` course is never flipped back.
- Course write is transactional; module rows roll back with the status update.
- Task chaining (course → embedding) implemented; graceful SIGTERM/SIGINT shutdown (Fastify close + provider close).
- All AI calls go through `AgentClient` (`/course/generate`, `/embeddings/text`); no direct LLM SDKs.
- After a course is written, `indexModuleChunks()` (`src/rag/index-chunks.ts`) chunks each module's content into `module_content_chunks` with embeddings (ADR-024), making the course eligible for RAG-grounded chat.
- 7 test files (agent client, both processors, both integration suites, chunking, shutdown): app route semantics (validation, retry signalling, terminal failure), both processors (unit), and both task endpoints against real Postgres (integration). Green in CI.

## Infrastructure

- API (HTTP): ✅ internal task endpoints only (`/tasks/:name`, `/health`); IAM-authenticated in prod
- Database: ✅ Drizzle/Postgres + raw pgvector SQL
- Auth: ➖ platform-level (Cloud Run IAM verifies Cloud Tasks' OIDC tokens)
- Queue: ✅ GCP Cloud Tasks (prod) / loopback HTTP provider (dev)
- Error Tracking: ❌ none wired

## Current Bottleneck

No alerting. Failed generations now surface to the user as `status='failed'`, but nothing notifies us — repeated failures (agent outage, bad prompts) are only visible by inspecting the DB or Cloud Tasks console.

## Known Issues

- No alerting on repeated task failures or `failed`-course rate.
- Loopback dev mode is single-attempt — retry behaviour is not exercised locally.
- In-flight BullMQ jobs at cutover are not migrated (deploy during a quiet window or regenerate).

## Next Steps

1. Add alerting on the `failed`-course rate / Cloud Tasks queue metrics.
2. Wire error tracking for processor exceptions.
3. Surface a "retry generation" action in the app for `failed` courses.

## Open Questions

- Should a failed generation auto-retry from the user's side, or surface a "retry" action in the app?

## Confidence

- Developers: ✅ — small, well-tested, clear invariants.
- Internal testers: ✅ — works with DB + Agent up; failures mark the course `failed` instead of stranding it.
- Beta users: ⚠️ — recovery exists; alerting still missing.
- Production users: ❌ — no alerting/error tracking; Cloud Tasks path not yet exercised in prod.
