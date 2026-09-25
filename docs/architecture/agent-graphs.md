# Agent graphs — retired

`services/agent` ran the last graph in this repo (`module-chat`, teacher + evaluator
nodes) until ADR-031 moved the module teacher to AgentPlatform's `course-teacher`
agent. Course generation had already moved to AgentPlatform's `course-creator`
workflow under ADR-030. `services/agent` now serves only embeddings and health —
see `services/agent/AGENTS.md` and `services/agent/src/routes/README.md`.

This file should be deleted (`git rm docs/architecture/agent-graphs.md`); it is
left as a stub because the session that wrote this note could not run `git rm`
in this repo (sandboxed to a different repository's worktree). Its former
content (the module-chat node-by-node flow, state shape, and the API→Worker→
AgentPlatform course-generation sequence diagram) is superseded by ADR-031 and
by `docs/architecture/ADRs/cross-cutting/ADR-030-course-generation-on-agent-platform.md`.
