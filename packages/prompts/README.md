# @autodidact/prompts

## Purpose

System prompts and prompt builder functions for every in-app LLM interaction in Autodidact. Centralising prompts here means the Agent service never hard-codes prompt strings inline. Course generation runs on AgentPlatform's `course-creator` workflow (ADR-030) and owns its own prompts there; this package covers module teaching and completion evaluation only.

## Consumers

| Consumer | Usage |
|----------|-------|
| `services/agent` | Module teaching and completion evaluation prompts |

No other service uses this package directly.

## Public API

```typescript
import {
  // Module teaching
  buildModuleSystemPrompt,
  type UserContext,

  // Completion evaluation
  COMPLETION_EVALUATOR_SYSTEM_PROMPT,
  buildCompletionEvaluatorPrompt,
} from '@autodidact/prompts';
```

## Internal Structure

```
packages/prompts/src/
├── module-teacher.ts         # AI teacher prompt + completion signal format
├── completion-evaluator.ts   # Assessment AI prompt
└── index.ts                  # Re-exports all of the above
```

## Prompt Reference

### Module Teacher (`module-teacher.ts`)

**System prompt builder**:
```typescript
buildModuleSystemPrompt(module, userContext, retrievedContext?)
// → Multi-section prompt including course title, module position/title,
//   description, learning objectives, the module's lesson content, and
//   teaching instructions. retrievedContext is optional RAG grounding
//   (ADR-024) for the student's current question.
```

**Completion signal**: The teacher prompt instructs the LLM to append `[MODULE_COMPLETE:score=<0-100>]` at the end of its response when the student has demonstrated understanding of **all** objectives. The signal is extracted via regex and stripped from the response before it reaches the client.

```
[MODULE_COMPLETE:score=87]   ← detected by teacher node, never shown to user
```

**Context awareness**: The prompt includes `completedModules / totalModules` so the teacher knows where the student is in the course.

---

### Completion Evaluator (`completion-evaluator.ts`)

**System prompt**: Instructs a second LLM call to assess whether the student has met the learning objectives, based on the conversation history.

**User prompt builder**:
```typescript
buildCompletionEvaluatorPrompt(objectives)
// → "Evaluate whether the student has demonstrated understanding of these objectives:
//    1. ...  2. ...  Analyze the conversation above and return your assessment as JSON."
```

**Output format**:
```json
{ "completed": true, "score": 85, "feedback": "Good understanding of..." }
```

**Scoring guide** (embedded in system prompt):

| Score | Meaning |
|-------|---------|
| 90–100 | Excellent — can explain concepts clearly |
| 70–89 | Good — minor gaps |
| 50–69 | Partial — some misconceptions |
| < 50 | Insufficient |

## Change Safety Notes

- **Completion signal format**: The regex in `module-chat/nodes.ts` is `/\[MODULE_COMPLETE:score=(\d+)\]/`. If you change the signal format in the prompt, update the regex.
- **Score threshold**: The minimum passing score is **60** (checked in `ChatService`, not here). The prompts define the scoring scale but not the pass/fail threshold.
