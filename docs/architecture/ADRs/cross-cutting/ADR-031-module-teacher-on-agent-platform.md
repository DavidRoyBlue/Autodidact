# ADR-031: The module teacher runs on AgentPlatform

## Status

Accepted
Date: 2026-09-25

## Context

ADR-030 moved course generation onto AgentPlatform and left the module teacher
where it was: a LangGraph in `services/agent` (teacher node, RAG grounding, a
completion evaluator) prompted from the module outline and streamed to the
phone over SSE. With ADR-030 a module carries its full lesson, which that
prompt did not know, and the machine-wide rule that every agent runs on
AgentPlatform now had a lone exception — the only LangGraph left in the app.

AgentPlatform ships `course-teacher` (its `docs/architecture/course-creator.md`
§9): a tool-less agent whose thread carries the conversation, taking the module
in the first message and returning `{reply, module_complete, score}`. David
decided on 2026-09-25 that the teacher is that agent and the app keeps its chat
plumbing.

## Non-goals

This ADR does not decide:
- token streaming from the platform (a platform follow-up; the phone receives
  the reply as one event until then)
- the Terraform secret names the LLM/checkpointer layer used
  (`infra/`); the code, env keys and examples go with this change
- hosting the platform for production (ADR-030's open follow-up)

## Decision Drivers

- One home for agents — the rule, and one place to iterate on a teacher that
  now has a lesson to teach from.
- The conversation lives with the model call — the platform records every
  turn on the thread and compacts long ones; the app should not re-send a
  lesson per turn.
- The phone's contract is stable — `token` / `module_complete` / `complete`
  over SSE and the ≥ 60 pass mark stay, so no mobile change.
- Delete what is replaced — the graph, its route, prompts, retriever, error
  mapping and eval harness go with it.

## Options Considered

### Option A: Keep the LangGraph teacher, teach from the lesson
**What it is:** update `buildModuleSystemPrompt` to render `modules.content`
and leave the graph, evaluator and SSE proxy in place.

**Pros**
- Smallest diff; token streaming keeps working as today.

**Cons**
- The one agent left outside the platform, with its own prompt, retry and
  cost path to maintain.
- The evaluator's second model call per completed turn stays.

### Option B: The platform's `course-teacher`, the app keeps chat plumbing
**What it is:** the api opens a platform thread per chat session and runs
`course-teacher` once per learner turn; it keeps `chat_sessions`, RAG
retrieval (moved from the agent into the chat module), progress and the SSE
contract to the phone.

**Pros**
- Conversation history, compaction, usage and events come from the platform.
- Completion is a field of the reply, not a marker parsed out of prose; no
  separate evaluator call.
- `services/agent` shrinks to embeddings and health.

**Cons**
- No token streaming until the platform's run stream carries tokens; a reply
  arrives whole after ~a few seconds.
- Production chat depends on the platform being reachable (same gap as
  ADR-030).

### Option C: Whole chat on the platform
**What it is:** the phone talks to the platform directly; sessions, messages
and progress move there.

**Pros**
- One fewer hop per turn.

**Cons**
- Moves product data (progress, enrolment, entitlements) out of the app's
  database and auth boundary; the platform is a run substrate, not a product
  backend.

## Decision

**We chose: Option B.**

The api runs the platform's `course-teacher` per turn on a thread per session;
the app keeps chat persistence, retrieval, progress and the SSE contract.

## Rationale

Option B is the only one that both honours the rule and keeps the app the
owner of its product data. What we give up is token streaming for now: the
platform's run stream carries step events, not tokens, so the phone gets the
reply in one `token` event. That is a platform feature to add, not a reason to
keep a second teacher.

## Consequences

### Positive
- `chat_sessions.thread_id` is the platform thread, opened on the first turn;
  the module (title, position, objectives, full lesson) is sent once.
- `services/agent` loses the module-chat graph, route, retriever, error
  mapping and eval harness; `packages/prompts` goes entirely.
- The completion evaluator's extra model call is gone.

### Negative
- A reply arrives whole; the phone's streaming UX is flat until the platform
  streams tokens.
- Existing chat sessions restart their conversation on the platform (migration
  0015 clears the LangGraph thread ids); the messages shown in the app are kept.
- The API gets its own hand-written AgentPlatform client
  (`services/api/src/services/agent-platform.client.ts`, thread + run + poll)
  next to the worker's (ADR-030): the platform's TypeScript client is still
  unpublished. Both retire the day it is, one abstraction before then would
  serve two callers.
- A turn is one platform run polled to a terminal status, so an SSE request
  stays open as long as the platform's `course-teacher` timeout (120 s).
- Retrieval (ADR-024) runs on every turn after the first, with no
  `RAG_ENABLED` opt-in and no best-effort fallback: an embedding failure
  fails the turn with an `error` event instead of a silently ungrounded
  reply.

### Follow-up decisions
- Token streaming on the platform's run stream.
- Drop the LLM/checkpointer secret names from `infra/`.

## Related

- ADR-030 (generation on the platform); supersedes
  [ADR-006](../_superseded/ADR-006-ai-orchestration-framework.md) (LangGraph);
  updates [ADR-011](../services/agent/ADR-011-realtime-streaming-transport.md)
  (streaming transport); narrows ADR-024 (content RAG)
- AgentPlatform `docs/architecture/course-creator.md` §9, PR #236
