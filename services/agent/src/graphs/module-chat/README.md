# Graph: Module Chat

## Purpose

A checkpointed LangGraph `StateGraph` that powers the AI teacher conversation. Persists full conversation history across turns (one session = one LangGraph thread). Conditionally routes to an evaluator node when the teacher signals module completion.

## Files

| File | Description |
|------|-------------|
| `graph.ts` | Graph definition: nodes, edges, checkpointer wiring |
| `nodes.ts` | `makeTeacherNode()`, `makeEvaluationNode()` |
| `state.ts` | `ModuleChatState` — includes `messagesStateReducer` |

## State Schema

```typescript
{
  messages:           BaseMessage[],         // Full conversation, reduced (appended)
  moduleBlueprint:    CourseModule,           // Course module content and objectives
  courseProgress:     CourseProgressContext,  // completedModuleCount, totalModuleCount, courseTitle
  completionSignaled: boolean,                // true when teacher emits [MODULE_COMPLETE:score=N]
  completionScore:    number | null,          // Set by evaluator node
  teachingPhase:      'introduction' | 'teaching' | 'evaluation',
}
```

**`messages` uses `messagesStateReducer`**: LangGraph appends new messages to the existing array instead of replacing it. This is how conversation history accumulates across turns.

## Graph Structure

```
START
  │
  ▼
teacher ──▶ (completionSignaled?) ──▶ evaluator ──▶ END
               │ false
               ▼
              END
```

Most turns: `teacher → END` (normal teaching response).  
Completion turn: `teacher → evaluator → END` (teacher signals + evaluator scores).

## Checkpointing

The graph is compiled with a checkpointer:

```typescript
graph.compile({ checkpointer: checkpointerProvider.getCheckpointer() })
```

Each invocation uses `{ configurable: { thread_id: sessionId } }` where `sessionId` is the `chat_sessions.threadId` UUID (not the session row `id`). LangGraph uses this thread ID to load/save state, providing full conversation history on every turn without the caller needing to send it.

**Dev**: `MemorySaver` — in-process, lost on restart. Fast, no setup.  
**Prod**: `PostgresSaver` — persists to `DATABASE_URL`. Required for multi-instance scaling.

## teacher Node

```typescript
1. Build system prompt: buildModuleSystemPrompt(state.moduleBlueprint, state.courseProgress)
2. Invoke LLM with [SystemMessage(prompt), ...state.messages]
3. Check response for /\[MODULE_COMPLETE:score=(\d+)\]/
4a. Match found:
      → score = parseInt(match[1])
      → cleanContent = content.replace(regex, '').trim()
      → return { messages: [AIMessage(cleanContent)], completionSignaled: true, completionScore: score }
4b. No match:
      → return { messages: [AIMessage(content)], completionSignaled: false }
```

The `[MODULE_COMPLETE:score=N]` marker is **never sent to the user**. It is stripped from the response before appending to messages.

## evaluator Node

```typescript
1. Invoke LLM with:
     [SystemMessage(COMPLETION_EVALUATOR_SYSTEM_PROMPT),
      ...state.messages,
      HumanMessage(buildCompletionEvaluatorPrompt(state.moduleBlueprint.objectives))]
2. Parse JSON response: { completed: boolean, score: number, feedback: string }
3. return { completionScore: result.score }
   (fallback to state.completionScore ?? 75 on parse error)
```

The evaluator recalculates the score independently of the teacher's self-reported score. The evaluator score is what gets stored in `module_progress.completion_score`.

## Streaming

The route (`routes/module-chat.ts`) uses `graph.stream(inputState, { streamMode: 'messages' })` which yields `[message, metadata]` tuples for each message token. After streaming, it calls `graph.getState(config)` to read `completionSignaled` and emit the `module_complete` SSE event.
