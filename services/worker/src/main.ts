import { createLogger, initTracer } from '@autodidact/observability';
import { createQueueProvider } from '@autodidact/providers';
import { loadWorkerEnv } from '@autodidact/env';
import { AgentClient } from './services/agent.client.js';
import { buildApp } from './app.js';

const logger = createLogger('worker');

async function start() {
  const env = loadWorkerEnv();
  initTracer('autodidact-worker');

  const agentClient = new AgentClient(env.AGENT_SERVICE_URL);
  const queueProvider = createQueueProvider();

  const app = buildApp({
    agentClient,
    queueProvider,
    logger,
    maxAttempts: env.TASK_MAX_ATTEMPTS,
  });

  const shutdown = async () => {
    logger.info('Shutting down worker...');
    await app.close();
    await queueProvider.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: env.WORKER_PORT, host: '0.0.0.0' });
  logger.info({ port: env.WORKER_PORT }, 'Worker task handler listening');
}

start().catch((err) => {
  logger.error(err, 'Worker failed to start');
  process.exit(1);
});
