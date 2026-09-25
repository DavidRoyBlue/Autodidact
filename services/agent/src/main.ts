import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createEmbeddingProvider } from '@autodidact/providers';
import { createLogger, initTracer, shutdownTracer } from '@autodidact/observability';
import { loadAgentEnv } from '@autodidact/env';
import { registerEmbeddingsRoute } from './routes/embeddings.js';
import { registerHealthRoutes } from './routes/health.js';

const logger = createLogger('agent');

async function start() {
  // OTEL traces export only when OTEL_EXPORTER_OTLP_ENDPOINT is set (no-op otherwise).
  initTracer('agent');

  const env = loadAgentEnv();
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  await registerEmbeddingsRoute(app, createEmbeddingProvider({}));

  let isReady = true;
  await registerHealthRoutes(app, { isReady: () => isReady });

  const shutdown = async () => {
    isReady = false;
    await app.close();
    await shutdownTracer();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: env.AGENT_PORT, host: '0.0.0.0' });
  logger.info({ port: env.AGENT_PORT }, 'Agent service started');
}

start().catch((err) => {
  logger.error(err, 'Failed to start agent service');
  process.exit(1);
});
