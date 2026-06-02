import type { IAuthProvider } from '../../interfaces/auth.js';
import type { AuthUser } from '@autodidact/types';

/**
 * Network-free auth provider for cross-service e2e tests.
 *
 * Cross-service tests can't mint real Supabase JWTs, so this is the single auth
 * seam: a `Bearer test-<userId>` token resolves to an AuthUser whose `id` is
 * `<userId>` (seed that user first so FK columns line up). Any other token is
 * rejected exactly like the real provider (`'Invalid token'`).
 */
export class MockAuthProvider implements IAuthProvider {
  async verifyToken(token: string): Promise<AuthUser> {
    const id = token.startsWith('test-') ? token.slice('test-'.length) : '';
    if (!id) {
      throw new Error('Invalid token');
    }
    return {
      id,
      supabaseId: `sb-${id}`,
      email: 'e2e@test.com',
    };
  }
}
