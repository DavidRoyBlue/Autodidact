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

  it('clears anonymity on link even when the identity carries no email (COALESCE keeps email NULL)', async () => {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values (NULL, true) returning id`,
    );
    const id = rows[0].id as string;
    await h.pool.query(
      `insert into auth.identities (user_id, identity_data, provider) values ($1, '{}'::jsonb, 'apple')`,
      [id],
    );
    const after = await h.pool.query(`select email, is_anonymous from public.users where id=$1`, [id]);
    expect(after.rows[0].email).toBeNull();
    expect(after.rows[0].is_anonymous).toBe(false);
  });

  // 0012 guard: the trigger fires ONLY for the anon→real upgrade. Linking another identity to an
  // already-real user must NOT touch their row (no spurious email overwrite on a 2nd provider link).
  it('does not touch an already-real user when a further identity is linked', async () => {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values ('real@test.dev', false) returning id`,
    );
    const id = rows[0].id as string;
    const before = await h.pool.query(`select updated_at from public.users where id=$1`, [id]);
    await h.pool.query(
      `insert into auth.identities (user_id, identity_data, provider) values ($1, $2::jsonb, 'google')`,
      [id, JSON.stringify({ email: 'other@provider.dev' })],
    );
    const after = await h.pool.query(`select email, is_anonymous, updated_at from public.users where id=$1`, [id]);
    expect(after.rows[0].email).toBe('real@test.dev'); // NOT overwritten by the linked identity's email
    expect(after.rows[0].is_anonymous).toBe(false);
    expect(after.rows[0].updated_at).toEqual(before.rows[0].updated_at); // row untouched (no-op)
  });
});
