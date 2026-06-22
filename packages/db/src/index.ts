export { db, pool, getDb, getPool } from './client.js';
export { getSupabaseAdmin } from './supabase.js';
export * from './schema/index.js';
export type { DB } from './client.js';
export { eq, sql, and, or, inArray, desc, asc, gt, lt, gte, lte } from 'drizzle-orm';
export { seedOnboardingCourse } from './seed/onboarding.js';
