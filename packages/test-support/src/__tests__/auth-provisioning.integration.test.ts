import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTestDatabase } from '../database.js';
import { sql } from 'drizzle-orm';

describe('auth provisioning trigger', () => {
  let h: Awaited<ReturnType<typeof withTestDatabase>>;
  beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
  afterAll(async () => { await h.close(); });

  it('provisions a public.users row on auth.users INSERT (real user)', async () => {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values ($1, false) returning id`,
      ['real@test.dev'],
    );
    const id = rows[0].id as string;
    const r = await h.pool.query(`select id, supabase_id, email, is_anonymous from public.users where id = $1`, [id]);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].supabase_id).toBe(id);
    expect(r.rows[0].email).toBe('real@test.dev');
    expect(r.rows[0].is_anonymous).toBe(false);
  });

  it('provisions an anonymous user (email NULL, is_anonymous true)', async () => {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values (NULL, true) returning id`,
    );
    const id = rows[0].id as string;
    const r = await h.pool.query(`select email, is_anonymous from public.users where id = $1`, [id]);
    expect(r.rows[0].email).toBeNull();
    expect(r.rows[0].is_anonymous).toBe(true);
  });

  it('syncs public.users on anon→real UPDATE of auth.users (UUID preserved)', async () => {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values (NULL, true) returning id`,
    );
    const id = rows[0].id as string;
    await h.pool.query(`update auth.users set email = $1, is_anonymous = false where id = $2`, ['upgraded@test.dev', id]);
    const r = await h.pool.query(`select email, is_anonymous from public.users where id = $1`, [id]);
    expect(r.rows[0].email).toBe('upgraded@test.dev');
    expect(r.rows[0].is_anonymous).toBe(false);
  });
});
