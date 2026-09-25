import type { FastifyInstance } from 'fastify';

export interface HealthDeps {
  /** Reports whether startup completed and the service may receive traffic. */
  isReady: () => boolean;
}

/**
 * Liveness (`/health`) and readiness (`/ready`) endpoints.
 *
 * - `/health` — process is up and serving. Dependency-free; used for liveness
 *   probes that should NOT restart the pod just because a dependency blips.
 * - `/ready` — safe to route traffic: startup finished. Returns 503 until then
 *   and again once shutdown starts, so load balancers can drain the instance.
 */
export async function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', service: 'agent' }));

  app.get('/ready', async (_request, reply) =>
    deps.isReady()
      ? { status: 'ready', service: 'agent' }
      : reply.status(503).send({ status: 'not_ready', service: 'agent' }),
  );
}
