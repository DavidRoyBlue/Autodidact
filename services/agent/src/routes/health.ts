import type { FastifyInstance } from 'fastify';
import type { ICheckpointerProvider } from '@autodidact/providers';
import type { Logger } from '@autodidact/observability';

export interface HealthDeps {
  /** Reports whether startup completed and the service may receive traffic. */
  isReady: () => boolean;
  /** Used by /ready to confirm the checkpoint store is reachable. */
  checkpointerProvider: Pick<ICheckpointerProvider, 'ping'>;
  logger?: Logger;
}

/**
 * Liveness (`/health`) and readiness (`/ready`) endpoints.
 *
 * - `/health` — process is up and serving. Dependency-free; used for liveness
 *   probes that should NOT restart the pod just because a dependency blips.
 * - `/ready` — safe to route traffic: startup finished and the checkpointer's
 *   backing store (Postgres in production) answers a probe. Returns 503 until
 *   ready or when the probe fails, so load balancers can drain the instance.
 */
export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: HealthDeps,
): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', service: 'agent' }));

  app.get('/ready', async (_request, reply) => {
    if (!deps.isReady()) {
      return reply.status(503).send({ status: 'not_ready', service: 'agent' });
    }
    try {
      await deps.checkpointerProvider.ping?.();
      return { status: 'ready', service: 'agent' };
    } catch (err) {
      deps.logger?.error({ err }, 'readiness probe failed');
      return reply.status(503).send({ status: 'not_ready', service: 'agent' });
    }
  });
}
