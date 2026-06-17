import { GoogleAuth } from 'google-auth-library';

// One GoogleAuth instance for the process; ID-token clients are cached per
// audience so each agent call doesn't re-mint a client.
const auth = new GoogleAuth();
const clientCache = new Map<string, Promise<{ idTokenProvider: { fetchIdToken(aud: string): Promise<string> } }>>();

/**
 * Build an `Authorization` header carrying a Google-signed OIDC ID token for a
 * private Cloud Run service, so an IAM-authorised caller (granted
 * `roles/run.invoker`) can invoke it. Cloud Run validates the token at the
 * infrastructure layer before the request reaches the container — the receiving
 * service needs no token-verification code.
 *
 * Returns `{}` for non-HTTPS targets (local dev / loopback `http://localhost`),
 * where there is no metadata server and the target service is unauthenticated.
 * The audience is the target's origin, as Cloud Run expects.
 */
export async function cloudRunAuthHeaders(
  targetUrl: string,
): Promise<Record<string, string>> {
  if (!targetUrl.startsWith('https://')) return {};

  const audience = new URL(targetUrl).origin;
  let clientPromise = clientCache.get(audience);
  if (!clientPromise) {
    clientPromise = auth.getIdTokenClient(audience);
    clientCache.set(audience, clientPromise);
  }
  const client = await clientPromise;
  const token = await client.idTokenProvider.fetchIdToken(audience);
  return { Authorization: `Bearer ${token}` };
}
