-- 0013_onboarding.sql
-- Spec 3 — onboarding course mechanism.
-- Hand-authored SQL (db:generate is broken; see packages/db/CLAUDE.md). The schema
-- files courses.ts / users.ts are updated in the same commit to remain the source of truth.

ALTER TABLE "courses" ADD COLUMN "is_onboarding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "courses_is_onboarding_unique" ON "courses" ("is_onboarding") WHERE "is_onboarding";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp;
