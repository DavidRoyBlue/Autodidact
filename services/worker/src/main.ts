import { Redis } from 'ioredis';
import { createLogger, initTracer } from '@autodidact/observability';
import { createQueueProvider } from '@autodidact/providers';
import { loadWorkerEnv } from '@autodidact/env';
import { AgentClient } from './services/agent.client.js';
import { createCourseGenerationWorker } from './processors/course-generation.processor.js';
import { createEmbeddingWorker } from './processors/embedding.processor.js';
import { createShutdownHandler } from './shutdown.js';

const logger = createLogger('worker');

async function start() {
  const env = loadWorkerEnv();
  initTracer('autodidact-worker');

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const agentClient = new AgentClient(env.AGENT_SERVICE_URL);
  const queueProvider = createQueueProvider();

  const courseWorker = createCourseGenerationWorker(redis, agentClient, queueProvider, logger);
  const embeddingWorker = createEmbeddingWorker(redis, agentClient, logger);

  courseWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Course generation job failed');
  });

  embeddingWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Embedding job failed');
  });

  const shutdownHandler = createShutdownHandler({
    workers: [courseWorker, embeddingWorker],
    queueProvider,
    redis,
  });

  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await shutdownHandler();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Worker service started');
}

start().catch((err) => {
  logger.error(err, 'Worker failed to start');
  process.exit(1);
});
