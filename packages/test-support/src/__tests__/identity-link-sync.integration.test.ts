import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.js';

describe('handle_identity_linked trigger (Phase 2 guest→OAuth upgrade)', () => {
  let h: TestDatabase;
  beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
  afterAll(async () => { await h.close(); });
  beforeEach(async () => { await h.truncate(); await h.pool.query('delete from auth.users; delete from auth.identities'); });

  it('syncs public.users when an identity is linked to an anonymous user', async () => {
    // anonymous user provisioned by handle_new_user (email NULL, is_anonymous true)
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values (NULL, true) returning id`,
    );
    const id = rows[0].id as string;
    const before = await h.pool.query(`select email, is_anonymous from public.users where id=$1`, [id]);
    expect(before.rows[0].is_anonymous).toBe(true);

    // simulate linkIdentity's DB effect: a new auth.identities row carrying the email
    await h.pool.query(
      `insert into auth.identities (user_id, identity_data, provider) values ($1, $2::jsonb, 'google')`,
      [id, JSON.stringify({ email: 'linked@test.dev' })],
    );

    const after = await h.pool.query(`select email, is_anonymous from public.users where id=$1`, [id]);
    expect(after.rows[0].email).toBe('linked@test.dev');
    expect(after.rows[0].is_anonymous).toBe(false);
  });

  it('preserves existing email when the linked identity has none', async () => {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values ('real@test.dev', false) returning id`,
    );
    const id = rows[0].id as string;
    await h.pool.query(
      `insert into auth.identities (user_id, identity_data, provider) values ($1, '{}'::jsonb, 'google')`,
      [id],
    );
    const after = await h.pool.query(`select email, is_anonymous from public.users where id=$1`, [id]);
    expect(after.rows[0].email).toBe('real@test.dev');
    expect(after.rows[0].is_anonymous).toBe(false);
  });
});
