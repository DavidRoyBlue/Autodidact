# Subtree Instructions — services/agent/src/graphs/module-chat/

> These rules apply only within this folder. They extend `services/agent/AGENTS.md`.

## Purpose of this subtree

Implements a stateful, multi-turn LangGraph `StateGraph` for AI-guided module learning. The `teacher` node responds to each student message; when the teacher detects sufficient understanding it appends a completion signal. A conditional edge then routes to the `evaluator` node, which produces a numeric score (0–100). Conversation history is persisted across turns via the injected checkpointer.

---

## Invariants (must not be broken)

- **`thread_id` = `sessionId`:** the LangGraph `configurable.thread_id` is always set to the `sessionId` UUID from the request body. This is the key under which the checkpointer stores conversation history. Changing this value — or omitting it — breaks multi-turn continuity. Never derive `thread_id` from anything other than the request `sessionId`.
- **Completion marker must be stripped:** the teacher LLM appends `[MODULE_COMPLETE:score=N]` to signal completion. This marker MUST be removed from `cleanContent` before it is stored in `messages` and before tokens reach the SSE stream. Users must never see this string. The strip regex is in `nodes.ts` — do not remove or weaken it.
- **`completionSignaled` gates the evaluator:** the conditional edge after `teacher` routes to `evaluator` only when `state.completionSignaled === true`. Do not call the evaluator node on every turn. Do not add a direct edge from `teacher` to `evaluator`.
- **Evaluator score range:** the evaluator node returns `{ completed: boolean; score: number; feedback: string }`. The score is expected to be 0–100. If the evaluator response is not valid JSON, the node falls back to `state.completionScore ?? 75` — do not remove this fallback.
- **`messages` reducer:** `ModuleChatState.messages` uses `messagesStateReducer` from LangGraph. Nodes must return new messages as an array (e.g. `[new AIMessage(...)]`), not replace the full messages array. The reducer appends; it does not overwrite.
- **Checkpointer is required:** this graph is compiled with `graph.compile({ checkpointer })`. The checkpointer comes from `ICheckpointerProvider`. Never compile this graph without a checkpointer — doing so makes the graph stateless and breaks all multi-turn conversations.
- **Do not add nodes between teacher and evaluator** without auditing the checkpoint state shape. Nodes added to an existing graph with live checkpointed sessions can break replay if they introduce new state keys.
- **Only `teacher` node tokens may stream to the client.** `streamMode: 'messages'` emits tokens from *every* LLM call in the graph, including the `evaluator` (which produces raw scoring JSON). The route (`routes/module-chat.ts`) filters on `meta.langgraph_node === 'teacher'`; never remove that filter or the evaluator's JSON leaks into the SSE `token` stream. Any new LLM-calling node is non-user-facing by default — add it to the filter allowlist only if its output is meant for the learner.

---

## State shape

Defined in `state.ts`. Fields:

| Field | Type | Role |
|-------|------|------|
| `messages` | `BaseMessage[]` | Full conversation history (append-only via reducer) |
| `moduleBlueprint` | `ModuleBlueprint` | Current module context (objectives, content) |
| `courseProgress` | `CourseProgressContext` | How far along the student is in the course |
| `completionSignaled` | `boolean` | Set to `true` by teacher node on `[MODULE_COMPLETE:...]` detection |
| `completionScore` | `number \| null` | Preliminary score from teacher signal; refined by evaluator |
| `teachingPhase` | `'introduction' \| 'teaching' \| 'evaluation'` | Tracks current phase; set to `'evaluation'` when completion signaled |

---

## Graph topology

```
START → teacher → (completionSignaled?) → evaluator → END
                                        ↘ END (not complete)
```

---

## Key patterns to follow

- Always pass `{ configurable: { thread_id: sessionId } }` when calling `graph.stream()` and `graph.getState()`.
- Use `graph.getState(config)` after streaming ends to read `completionSignaled` and `completionScore` for the `module_complete` SSE event.
- Use `@autodidact/prompts` for all system prompts (`buildModuleSystemPrompt`, `COMPLETION_EVALUATOR_SYSTEM_PROMPT`, `buildCompletionEvaluatorPrompt`).

---

## Anti-patterns to avoid

- Do not store the completion signal text in `messages` — it must be stripped before the `AIMessage` is created.
- Do not call the evaluator node directly from route code — it must only be triggered via the graph's conditional edge.
- Do not hardcode a fallback score of 75 in new code paths — that value only exists as a last-resort JSON-parse failure guard.
