# Subtree Instructions — services/api/src/modules/chat/

> These rules apply only within `services/api/src/modules/chat/`. They extend `services/api/AGENTS.md`.

## Purpose of this subtree

The chat module owns the Socratic teaching interaction. It:
- Creates and retrieves chat sessions
- Runs one learner turn at a time on AgentPlatform's `course-teacher` agent (ADR-031) and streams the reply to the mobile client over SSE
- Persists user and assistant messages to `chat_sessions.messages`
- Triggers module completion via `ProgressService` when the teacher signals completion with a passing score

---

## Invariants (must not be broken)

- **Message persistence order**: the user message is written to `chat_sessions` BEFORE the platform run is created; the assistant message is written AFTER the reply is in. Never reverse or merge these writes.
- **One thread per session, opened on the first turn**: `chat_sessions.thread_id` is the AgentPlatform thread; it is `null` until the first turn, which creates it and sends the module (course title, position, objectives, the full `modules.content`) with the learner's text. Later turns send only the learner's text plus retrieved reference material — the platform's thread history carries the rest. Never re-send the lesson.
- **Module completion threshold**: a module is completed when the reply has `module_complete: true` and `score >= 60` (`PASS_SCORE` in `chat.service.ts`). Do not expose it as an env var without a migration plan.
- **SSE bridge and event contract**: `streamMessage()` creates an RxJS `Subject<MessageEvent>` the controller writes to the raw `@Res()` response of a **`@Post('sessions/:id/stream')`** (the client sends the message in the body via `@microsoft/fetch-event-source`, so it cannot be `@Sse`, which is GET-only). Events are `token` (the whole reply, once), `module_complete {score}` when the teacher says so, `complete`, or `error`. Do not change the event names without changing `apps/mobile/src/hooks/useSSE.ts`.
- **`chatSessionId` on `module_progress`**: this column exists in the schema but is intentionally not populated here (Phase 2 feature).
- **Cross-module dependency**: `ChatModule` is the only module that imports `ProgressModule`. Do not add further cross-module imports to the API feature modules without updating this note and the service-level `AGENTS.md`.

---

## Key patterns to follow

- `ChatService.streamMessage()` runs its async logic in a void-wrapped IIFE and returns the observable synchronously; the controller subscribes and writes each event to the raw SSE response.
- The platform is reached through `ApiPlatformClient` (`services/api/src/services/agent-platform.client.ts`): `createThread` once, `teach(threadId, message)` per turn, which polls the run to a terminal status and parses the reply with `TeacherReplySchema`.
- RAG grounding (ADR-024) lives in `retriever.ts`: the query is embedded through `ApiAgentClient`, the top chunks of the module's lesson are appended to the learner's text under `Reference material`; empty when nothing is close enough.

---

## Anti-patterns to avoid

- Writing the assistant message before the reply is in (creates partial/duplicate messages on error)
- Calling `ProgressService.completeModule()` from outside `ChatService` (it must only be triggered by a teacher reply)
- Hardcoding the platform URL — always read `AGENT_PLATFORM_URL` from env
