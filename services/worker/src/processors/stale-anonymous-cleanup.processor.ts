import { sql, inArray, getDb, users } from '@autodidact/db';
import type { StaleAnonymousCleanupJobData } from '@autodidact/types';
import type { Logger } from '@autodidact/observability';

export const DEFAULT_RETENTION_DAYS = 90;
export const MAX_DELETE_BATCH = 1000;

export interface StaleAnonymousCleanupDeps {
  logger: Logger;
}

/**
 * Deletes anonymous users created more than `retentionDays` ago (default 90).
 * Order matters (spec 1e): delete public.users FIRST — cascading to
 * enrollments / module_progress / chat_sessions via the ON DELETE CASCADE FKs
 * (migration 0006) — THEN delete the auth.users rows (no FK links the two, so
 * it is a separate explicit step; in real GoTrue that delete cascades within
 * the auth schema). Both deletes run in ONE transaction so a crash can't orphan
 * auth.users rows (the next run keys off public.users, which would be gone).
 * Capped at MAX_DELETE_BATCH per run; the scheduled job drains any backlog over
 * successive runs. Runs as the postgres role (BYPASSRLS) via getDb(). Idempotent.
 */
export async function processStaleAnonymousCleanup(
  data: StaleAnonymousCleanupJobData,
  { logger }: StaleAnonymousCleanupDeps,
): Promise<{ deleted: number }> {
  const retentionDays = data.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const db = getDb();
  const cutoff = sql`now() - (${String(retentionDays)} || ' days')::interval`;

  // Candidate ids (bounded), parameterized — never string-built SQL.
  const stale = await db.execute(
    sql`select id from public.users
        where is_anonymous = true and created_at < ${cutoff}
        limit ${MAX_DELETE_BATCH}`,
  );
  const ids = (stale.rows as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) {
    logger.info({ retentionDays }, 'Stale-anonymous cleanup: nothing to delete');
    return { deleted: 0 };
  }

  await db.transaction(async (tx) => {
    // 1. public.users — cascades to enrollments/module_progress/chat_sessions (0006).
    await tx.delete(users).where(inArray(users.id, ids));
    // 2. auth.users — not in the Drizzle schema. drizzle expands the `ids` array
    // into a comma-separated parameter list ($1, $2, …), so this is `id in
    // ($1, …)` — fully parameterized, never string-built. ids is non-empty here
    // (early return above), and bounded by MAX_DELETE_BATCH.
    await tx.execute(sql`delete from auth.users where id in (${ids})`);
  });

  logger.info({ retentionDays, deleted: ids.length }, 'Stale-anonymous cleanup complete');
  return { deleted: ids.length };
}
