# Module: Chat

## Responsibility

Manages chat sessions between users and the AI teacher. Owns session creation, message persistence, running AgentPlatform's `course-teacher` agent per turn, and triggering module completion logic (ADR-031).

## Files

| File | Description |
|------|-------------|
| `chat.controller.ts` | `POST /chat/sessions`, `POST /chat/sessions/:id/stream` (SSE) |
| `chat.service.ts` | Session lifecycle, one `course-teacher` run per turn, message persistence |
| `chat.module.ts` | NestJS module wiring |
| `retriever.ts` | RAG grounding: embeds the query, appends the closest `module_content_chunks` (ADR-024) |

## Session Lifecycle

```
1. Client calls POST /chat/sessions { moduleId }
     → INSERT chat_sessions row (userId, moduleId, threadId=null, messages=[])
     → return { id, messages }

2. Client calls POST /chat/sessions/:id/stream { content }
     → Append user ChatMessage to JSONB column
     → threadId === null?
         → yes: create an AgentPlatform thread, send the module (title, position,
           objectives, full lesson) + the learner's text as the first message
         → no: send the learner's text + retrieved reference material (retriever.ts)
     → Run course-teacher on the thread → { reply, module_complete, score }
     → Emit token (whole reply), then module_complete {score} if signaled, then complete
     → Persist assistant ChatMessage
     → If module_complete && score >= 60 → ProgressService.completeModule()
```

## SSE Contract

The API's SSE contract to the mobile client is unchanged by ADR-031, but it is no
longer a proxy of a real Agent SSE stream — the whole reply arrives from one
AgentPlatform run and is written as a single `token` event:

```
Mobile ←──SSE──── API Service
              (raw @Res() response, written from the awaited platform reply)
```

Implementation detail:

1. `ChatController.stream()` sets SSE headers on the raw `@Res()` response (not `@Sse()`, which is GET-only — the client sends the message in the body via `@microsoft/fetch-event-source`)
2. `ChatService.streamMessage()` returns `Observable<MessageEvent>`; the controller subscribes and writes each event as `data: ...\n\n`
3. Inside `streamMessage()`, the platform run is awaited (`ApiPlatformClient.teach()`, which itself polls the run to a terminal status), then `token`, `module_complete` (if signaled) and `complete` are pushed to the Subject in order

## Message Persistence

Chat history is stored in the `chat_sessions.messages` JSONB column as `ChatMessage[]`. Each turn:

1. User message appended **before** the platform run is created
2. Assistant message appended **after** the reply is in

`chat_sessions.thread_id` is the AgentPlatform thread (`null` until the first turn) — not a LangGraph checkpoint key any more.

## Completion Handling

The teacher's reply carries `module_complete` and `score` as structured fields — no marker to parse out of prose. `module_complete: true` with `score >= 60` triggers `ProgressService.completeModule()`. Scores below 60 do not mark the module as completed.

## Key Dependency

`ChatModule` imports `ProgressModule` to call `ProgressService` on completion. This is the only cross-module dependency in the API service.
