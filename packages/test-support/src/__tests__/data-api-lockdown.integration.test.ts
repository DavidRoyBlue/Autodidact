import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.js';

// Spec 2 Plan C — verifies the Data-API lockdown (C1: revoked grants + RLS) and the
// policy hardening (C2: TO authenticated own-row scoping) against a real Postgres with
// every migration applied. The harness stubs auth.uid() to the zero UUID, so a user
// provisioned with supabase_id = zero is the "current" authenticated user.
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

describe('Data-API lockdown + policy hardening (Spec 2 C1/C2)', () => {
  let h: TestDatabase;
  beforeAll(async () => {
    h = await withTestDatabase();
  }, 90_000);
  afterAll(async () => {
    await h?.close();
  });
  beforeEach(async () => {
    await h.truncate();
    await h.pool.query('delete from auth.users');
  });

  // ── C1: grants revoked from the PostgREST roles ──────────────────────────
  it('denies the authenticated role SELECT on a domain table (grants revoked)', async () => {
    const client = await h.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await expect(client.query('select * from public.users')).rejects.toMatchObject({
        code: '42501', // insufficient_privilege
      });
    } finally {
      await client.query('rollback').catch(() => {});
      client.release();
    }
  });

  it('denies the anon role SELECT on a domain table (grants revoked)', async () => {
    const client = await h.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role anon');
      await expect(client.query('select * from public.courses')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('rollback').catch(() => {});
      client.release();
    }
  });

  // ── C1: RLS enabled on the previously-exposed Drizzle table ───────────────
  it('has RLS enabled on module_content_chunks', async () => {
    const { rows } = await h.pool.query(
      `select relrowsecurity from pg_class where relname = 'module_content_chunks'`,
    );
    expect(rows[0]?.relrowsecurity).toBe(true);
  });

  // ── C2: own-row policy is scoped TO authenticated and returns only own rows ─
  it('scopes own-row SELECT to the current user when SELECT is restored (defense-in-depth)', async () => {
    // Provision two users via the trigger: user A is the "current" user (supabase_id = auth.uid()).
    await h.pool.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [
      ZERO_UUID,
      'me@test.dev',
    ]);
    await h.pool.query(`insert into auth.users (email, is_anonymous) values ($1, false)`, [
      'other@test.dev',
    ]);

    const client = await h.pool.connect();
    try {
      await client.query('begin');
      // Simulate "if grants were ever restored": RLS must still scope to the JWT user.
      await client.query('grant select on public.users to authenticated');
      await client.query('set local role authenticated');
      const { rows } = await client.query('select email from public.users');
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe('me@test.dev');
    } finally {
      await client.query('rollback').catch(() => {}); // undoes the grant + role
      client.release();
    }
  });

  it('every app-table policy is scoped to the authenticated role (no TO public)', async () => {
    const { rows } = await h.pool.query(
      `select tablename, policyname, roles from pg_policies where schemaname = 'public'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const p of rows) {
      // node-pg returns a name[] column as its Postgres array literal string.
      expect(p.roles).toBe('{authenticated}');
    }
  });

  it('no policy still references the deprecated auth.role()', async () => {
    const { rows } = await h.pool.query(
      `select policyname from pg_policies where schemaname = 'public'
         and (coalesce(qual,'') ilike '%auth.role()%' or coalesce(with_check,'') ilike '%auth.role()%')`,
    );
    expect(rows).toHaveLength(0);
  });
});
