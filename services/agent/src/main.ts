import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  createLLMProvider,
  createEmbeddingProvider,
  createCheckpointer,
} from '@autodidact/providers';
import { createLogger } from '@autodidact/observability';
import { loadAgentEnv } from '@autodidact/env';
import { registerGenerateCourseRoute } from './routes/generate-course.js';
import { registerModuleChatRoute } from './routes/module-chat.js';
import { registerEmbeddingsRoute } from './routes/embeddings.js';

const logger = createLogger('agent');

async function start() {
  const env = loadAgentEnv();
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  // Initialize providers
  const llmProvider = createLLMProvider({});
  const embeddingProvider = createEmbeddingProvider({});
  const checkpointerProvider = createCheckpointer({});

  // Register routes
  await registerGenerateCourseRoute(app, llmProvider);
  await registerModuleChatRoute(app, llmProvider, checkpointerProvider);
  await registerEmbeddingsRoute(app, embeddingProvider);

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'agent' }));

  await app.listen({ port: env.AGENT_PORT, host: '0.0.0.0' });
  logger.info({ port: env.AGENT_PORT }, 'Agent service started');
}

start().catch((err) => {
  logger.error(err, 'Failed to start agent service');
  process.exit(1);
});
