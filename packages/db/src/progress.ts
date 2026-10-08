import { sql } from 'drizzle-orm';
import type { DB } from './client.js';

/**
 * Creates enrolled learners' progress rows for a course: the first module open,
 * the rest locked; rows that exist are kept. The one place these rows are made —
 * on enrollment (one learner) and when a generated course's modules land (every
 * enrolled learner). Takes the db or a transaction.
 */
export async function openModuleProgress(db: Pick<DB, 'execute'>, courseId: string, userId?: string) {
  await db.execute(sql`
    INSERT INTO module_progress (user_id, module_id, course_id, status)
    SELECT e.user_id, m.id, m.course_id,
           CASE WHEN m.position = 0 THEN 'available'::module_status ELSE 'locked'::module_status END
    FROM enrollments e JOIN modules m ON m.course_id = e.course_id
    WHERE e.course_id = ${courseId} ${userId ? sql`AND e.user_id = ${userId}` : sql``}
    ON CONFLICT DO NOTHING
  `);
}
