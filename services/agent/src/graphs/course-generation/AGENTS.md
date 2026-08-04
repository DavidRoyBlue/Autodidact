# Subtree Instructions — services/agent/src/graphs/course-generation/

> These rules apply only within this folder. They extend `services/agent/AGENTS.md`.

## Purpose of this subtree

Implements a single-node LangGraph `StateGraph` that generates a structured course blueprint from a topic, difficulty level, and module count. The output is validated against `CourseBlueprintSchema` from `@autodidact/schemas`. If validation fails the graph retries up to 3 times before giving up.

---

## Invariants (must not be broken)

- **Single node:** the graph has exactly one node (`generateBlueprint`). The conditional edge routes back to that node on retry, or to `END` on success or retry exhaustion.
- **Max 3 retries:** `retryCount` starts at 0 and increments on each failed `safeParse`. When `retryCount` reaches 3 the graph exits via `END` with `blueprint: null`. The route layer must check for `null` and return a 500 — never treat a null blueprint as a recoverable condition.
- **Output contract:** the node must return either a fully valid `CourseBlueprint` (conforming to `CourseBlueprintSchema`) or `{ blueprint: null, retryCount: n+1, error: message }`. Never return partial or unvalidated data as the blueprint.
- **JSON extraction:** the LLM response may wrap JSON in markdown code fences (` ```json ... ``` `) or return bare JSON. The node strips fences with a regex before calling `JSON.parse`. Do not assume the LLM always returns bare JSON.
- **Module IDs:** `CourseBlueprintSchema` may or may not require IDs on modules. The node uses `crypto.randomUUID()` to fill any missing `id` field after successful parse. Do not move this assignment elsewhere.
- **Schema is the contract:** do not add fields to the blueprint that are not in `CourseBlueprintSchema`. If new fields are needed, update the schema package first, then the node.
- **No checkpointer:** this graph is compiled without a checkpointer (`graph.compile()` with no arguments). Course generation is stateless per request — do not add a checkpointer here.

---

## State shape

Defined in `state.ts`. Fields:

| Field | Type | Role |
|-------|------|------|
| `topic` | `string` | Input: course subject |
| `difficulty` | `DifficultyLevel` | Input: `beginner` / `intermediate` / `advanced` |
| `moduleCount` | `number` | Input: requested number of modules |
| `blueprint` | `CourseBlueprint \| null` | Output: validated blueprint, or null on failure |
| `retryCount` | `number` | Retry counter, starts at 0 |
| `error` | `string \| null` | Last Zod validation error message |

---

## Key patterns to follow

- Always use `CourseBlueprintSchema.safeParse()` (not `parse()`). Let the graph routing handle the retry loop — do not throw inside the node on a parse failure.
- Retrieve the model via `llmProvider.getModel()` at node invocation time, not at graph build time.
- Use `@autodidact/prompts` (`COURSE_GENERATION_SYSTEM_PROMPT`, `buildCourseGenerationPrompt`) — do not inline prompt strings.

---

## Anti-patterns to avoid

- Do not add nodes to this graph without also updating `CourseBlueprintSchema` if the new node changes the output shape.
- Do not catch `JSON.parse` errors silently — if the LLM returns text that is not parseable JSON at all, the outer `try/catch` in the route will surface a 500.
- Do not increase the retry limit above 3 without understanding the latency impact (each retry is a full LLM round trip).
