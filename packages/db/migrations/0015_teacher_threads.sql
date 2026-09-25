-- 0015_teacher_threads.sql
-- ADR-031 — the module teacher runs on AgentPlatform: chat_sessions.thread_id now
-- holds the platform thread, opened on a session's next turn. The LangGraph thread
-- ids stored so far name nothing any more.
-- Hand-authored SQL (db:generate is broken; see packages/db/AGENTS.md).
UPDATE "chat_sessions" SET "thread_id" = NULL;
