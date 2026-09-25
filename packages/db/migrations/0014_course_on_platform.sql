-- 0014_course_on_platform.sql
-- ADR-030 — course generation runs on AgentPlatform's course-creator workflow:
-- a course carries the learner's time budget, a module carries its full lesson
-- and resources; the blueprint and the outline go.
-- Hand-authored SQL (db:generate is broken; see packages/db/AGENTS.md). The schema
-- files enums.ts / courses.ts / modules.ts are updated in the same commit.
CREATE TYPE "public"."time_budget" AS ENUM('30min', '1h', '4h', 'unrestricted');--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "time_budget" "time_budget" DEFAULT '1h' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "blueprint";--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "resources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Existing modules only have an outline: render it as the lesson so nothing is lost.
UPDATE "modules" SET "content" = COALESCE((
  SELECT string_agg(
    '## ' || (s->>'title') || E'\n' ||
    COALESCE((SELECT string_agg('- ' || p, E'\n') FROM jsonb_array_elements_text(s->'points') AS p), ''),
    E'\n\n')
  FROM jsonb_array_elements("content_outline") AS s
), '');--> statement-breakpoint
ALTER TABLE "modules" ALTER COLUMN "content" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" DROP COLUMN "content_outline";
