# Subtree Instructions — packages/prompts/

> These rules apply only within `packages/prompts/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

All LLM prompt templates and prompt builder functions for Autodidact. The Agent service never hard-codes prompt strings inline — every prompt originates here.

---

## Invariants (must not be broken)

- All LLM prompt templates live here, not in graph code. If a LangGraph node needs a prompt, it imports from `@autodidact/prompts`. Inline prompt strings in graph nodes are not permitted.
- Treat prompts as behavioral configuration, not string constants. A prompt change changes AI behavior for all users in production. Review prompt changes with the same care as logic changes.
- Prompts must be exported with descriptive names that make their purpose unambiguous: `COURSE_GENERATION_SYSTEM_PROMPT`, `COMPLETION_EVALUATOR_SYSTEM_PROMPT`, `buildModuleSystemPrompt`.
- The completion signal format embedded in the module teacher prompt (`[MODULE_COMPLETE:score=<0-100>]`) must stay in sync with the regex in the agent's `module-chat/nodes.ts`. If you change the signal format here, update the regex in the same PR.
- The JSON schema example in `COURSE_GENERATION_SYSTEM_PROMPT` must stay in sync with `CourseBlueprintSchema` in `@autodidact/schemas`. If you add a required field to the schema, add it to the prompt example — otherwise the LLM will not produce it.

---

## Library / tooling rules

- No runtime dependencies beyond `@autodidact/types` (for type imports). Prompts are plain TypeScript strings and functions.
- Do not import from `@autodidact/schemas` in prompt builders — prompts produce text, not validated objects. Validation of LLM output happens in the graph node.

---

## Source of truth

- `src/course-generation.ts` — curriculum designer system prompt and user prompt builder.
- `src/module-teacher.ts` — AI teacher system prompt builder, completion signal format, and `UserContext` type.
- `src/completion-evaluator.ts` — assessment AI system prompt and objectives prompt builder.

---

## Key patterns to follow

- Constant system prompts (no dynamic content) are exported as `const` strings.
- Dynamic prompts that incorporate runtime data (module blueprint, user context, objectives list) are exported as builder functions (`buildXxxPrompt(...)`).
- Test prompt changes by running the affected graph in development against a real LLM call. Prompt regression is difficult to catch with unit tests alone.

---

## Anti-patterns to avoid

- Do not inline prompt strings in `services/agent` graph nodes — import from this package.
- Do not add scoring thresholds or pass/fail logic to prompts. The prompts define the scoring scale; the threshold (currently 60) lives in `ChatService`.
- Do not add imports from service-level code (e.g., database queries) to prompt builders — they must remain pure functions of their arguments.
