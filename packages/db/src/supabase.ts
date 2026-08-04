import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/**
 * Server-side Supabase admin client (service-secret auth).
 *
 * Constructed lazily on first call — never at module import. `createClient`
 * throws synchronously when `SUPABASE_URL` is empty, so an eager top-level
 * construction would crash before a service's boot-time env validation
 * (`@autodidact/env`) could report the missing variable. This mirrors the lazy
 * `getDb()` pattern; see AGENTS.md.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env['SUPABASE_URL'] ?? '',
      process.env['SUPABASE_SECRET_KEY'] ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return client;
}
