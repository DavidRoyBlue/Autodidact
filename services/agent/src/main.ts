import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  createLLMProvider,
  createEmbeddingProvider,
  createCheckpointer,
} from '@autodidact/providers';
import {
  createLogger,
  initTracer,
  shutdownTracer,
  isLangSmithTracingEnabled,
} from '@autodidact/observability';
import { getPool } from '@autodidact/db';
import { loadAgentEnv } from '@autodidact/env';
import { registerGenerateCourseRoute } from './routes/generate-course.js';
import { registerModuleChatRoute } from './routes/module-chat.js';
import { registerEmbeddingsRoute } from './routes/embeddings.js';
import { registerHealthRoutes } from './routes/health.js';
import { PgVectorContentRetriever, type ContentRetriever } from './rag/retriever.js';

const logger = createLogger('agent');

async function start() {
  // OTEL traces export only when OTEL_EXPORTER_OTLP_ENDPOINT is set (no-op otherwise).
  initTracer('agent');

  const env = loadAgentEnv();
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  // Initialize providers
  const llmProvider = createLLMProvider({});
  const embeddingProvider = createEmbeddingProvider({});
  const checkpointerProvider = createCheckpointer({});
  // Prepare the checkpointer before any graph uses it. For CHECKPOINTER=postgres this
  // runs PostgresSaver.setup(); without it getCheckpointer() throws "not initialized".
  await checkpointerProvider.init();

  // Readiness flips true only once providers are initialized. /ready reports this
  // plus a live checkpointer probe so orchestrators don't route traffic early.
  let isReady = true;

  logger.info(
    { langsmith: isLangSmithTracingEnabled() ? 'enabled' : 'disabled' },
    'agent tracing posture',
  );

  // RAG-grounded tutoring (Phase 1 / ADR-024): opt-in via RAG_ENABLED. When off,
  // the teacher behaves exactly as before. Requires DATABASE_URL (pgvector chunks)
  // and an embedding key.
  const ragEnabled = process.env['RAG_ENABLED'] === 'true';
  const retriever: ContentRetriever | undefined = ragEnabled
    ? new PgVectorContentRetriever(embeddingProvider, () => getPool() as never)
    : undefined;
  logger.info({ rag: ragEnabled ? 'enabled' : 'disabled' }, 'agent RAG posture');

  // Register routes (logger threaded so graph nodes emit structured spans + logs)
  await registerGenerateCourseRoute(app, llmProvider, logger);
  await registerModuleChatRoute(app, llmProvider, checkpointerProvider, logger, retriever);
  await registerEmbeddingsRoute(app, embeddingProvider);

  // Liveness (/health) + readiness (/ready, probes the checkpoint store).
  await registerHealthRoutes(app, {
    isReady: () => isReady,
    checkpointerProvider,
    logger,
  });

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
