# Subtree Instructions — services/api/src/modules/chat/

> These rules apply only within `services/api/src/modules/chat/`. They extend `services/api/AGENTS.md`.

## Purpose of this subtree

The chat module owns the Socratic teaching interaction. It:
- Creates and retrieves chat sessions
- Proxies the SSE stream from the Agent service to the mobile client
- Persists user and assistant messages to `chat_sessions.messages`
- Triggers module completion via `ProgressService` when the Agent signals a passing score

---

## Invariants (must not be broken)

- **Message persistence order**: the user message is written to `chat_sessions` BEFORE the Agent fetch is made; the assistant message is written AFTER the SSE stream is fully consumed. Never reverse or merge these writes.
- **Module completion threshold**: a module is completed when the Agent emits a `complete` event with `score >= 60`. This value is hardcoded in `chat.service.ts` and is not configurable at runtime. Do not expose it as an env var without a migration plan.
- **SSE bridge**: `streamMessage()` creates an RxJS `Subject<MessageEvent>` bridging the Node.js fetch/ReadableStream reader to the controller. The stream endpoint is a **`@Post('sessions/:id/stream')`** that writes SSE frames to the raw `@Res()` response (the client sends the message in the body via `@microsoft/fetch-event-source`, so it cannot be `@Sse`, which is GET-only). Do not replace this pattern with a PassThrough stream or revert to `@Sse` without restoring a body-bearing transport.
- **`chatSessionId` on `module_progress`**: this column exists in the schema but is intentionally not populated here (Phase 2 feature). Do not start writing to it without a corresponding Phase 2 task.
- **Cross-module dependency**: `ChatModule` is the only module that imports `ProgressModule`. Do not add further cross-module imports to the API feature modules without updating this note and the service-level `AGENTS.md`.

---

## Key patterns to follow

- `ChatService.streamMessage()` runs its async logic in a void-wrapped IIFE and returns the observable synchronously; the controller subscribes and writes each event to the raw SSE response.
- Each Agent SSE line is forwarded to the client as-is via `subject.next({ data: jsonStr })`. Transformation of event shapes is the Agent's responsibility, not this service's.
- The Agent's `/module-chat/stream` requires both `moduleBlueprint` (`contentOutline`, `objectives`, etc.) **and** `courseProgress` (`courseTitle`, `completedModuleCount`, `totalModuleCount`) in the request body — `streamMessage()` computes these so the Agent needs no DB lookup. The Agent carries the completion score on the `module_complete` event; `complete` is the terminator.

---

## Anti-patterns to avoid

- Writing the assistant message before the stream completes (creates partial/duplicate messages on error)
- Calling `ProgressService.completeModule()` from outside `ChatService` (it must only be triggered by a chat stream completion event)
- Hardcoding the Agent service URL — always read `AGENT_SERVICE_URL` from env
