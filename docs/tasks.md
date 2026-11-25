# Tasks

> What is owed, one row per task, read each morning by `task-sweep`. A task with a due date goes in Dated, one waiting on something in Blocked, any other in Undated; a follow-up issue is a row too, its `owner/repo#N` in Issue. Dates are `YYYY-MM-DD`; Owner is who does it. A finished task is deleted, not ticked.

## Dated

| Due | Task | Owner | Issue | Details |
|---|---|---|---|---|

## Blocked

| Task | Waits on | Since | Issue |
|---|---|---|---|

## Undated

| Task | Owner | Issue | Details |
|---|---|---|---|
| Decide what replaces AgentPlatform (retired 2026-11-25) for course generation, module teacher and chat, or remove them | David | DavidRoyBlue/Autodidact#544 | Down since 2026-11-22; client, env vars and ADR-030..032 still reference it |
