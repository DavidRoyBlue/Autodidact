# Decisions log

Dated, one-line-ish decisions that change what happens next in this repo, with
the reason. Durable architectural choices get an ADR in
`architecture/ADRs/` instead; this log is for operational and sequencing calls
that an ADR would be too heavy for. Newest first.

## 2026-09-29 — Catch-up prod deploy (#320)

Owner (David) answers to the runbook worker's questions; the runbook itself is
[`gcp_infra_setup.md` §9](gcp_infra_setup.md#9-redeploy-after-a-pause--the-2026-10-catch-up-deploy-320).

- **One deploy, only after #321 lands.** Prod stays degraded until the
  AgentPlatform route is on `master`; the first deploy in three months ships a
  working product rather than a green health check with broken course
  generation.
- **Restore the Supabase project now, deploy later.** The project is on the Pro
  plan (no 90-day paused-restore deadline), but restoring now lets the early
  backup and the DB sanity checks happen this week instead of on deploy day.
- **Backup = local `pg_dump` over the session pooler (5432), kept outside every
  repo.** `0014_course_on_platform` drops columns irreversibly; a dump the owner
  holds is the rollback, independent of Supabase's managed backups.
- **Migrate from the laptop (`pnpm migrate:prod`) before promoting.** A
  migration failure then never mixes with a deploy failure, and the CI migrate
  step becomes a verified no-op. Cost: the June images are broken between the
  migration and the new revisions, so 9.4 → 9.7 are one sitting.
- **`terraform plan`/`apply` before promoting.** `main.tf` changed since June
  (#323 dropped `LLM_PROVIDER`/`CHECKPOINTER`; #321 may add secrets); applying
  first means the images roll onto matching env wiring. The expected plan is
  enumerated in §9.3 so anything else is a stop signal.
- **Smoke test = health + migrations only.** Course generation and module chat
  end to end are the first thing to try after the deploy, but their failure is a
  bug to file, not a reason to roll back the deploy.
