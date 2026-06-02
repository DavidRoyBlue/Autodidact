import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  createLLMProvider,
  createEmbeddingProvider,
  createCheckpointer,
} from '@autodidact/providers';
import { createLogger } from '@autodidact/observability';
import { registerGenerateCourseRoute } from './routes/generate-course.js';
import { registerModuleChatRoute } from './routes/module-chat.js';
import { registerEmbeddingsRoute } from './routes/embeddings.js';

const logger = createLogger('agent');
const port = parseInt(process.env['AGENT_PORT'] ?? '3001', 10);

async function start() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  // Initialize providers
  const llmProvider = createLLMProvider({});
  const embeddingProvider = createEmbeddingProvider({});
  const checkpointerProvider = createCheckpointer({});
  // Prepare the checkpointer before any graph uses it. For CHECKPOINTER=postgres this
  // runs PostgresSaver.setup(); without it getCheckpointer() throws "not initialized".
  await checkpointerProvider.init();

  // Register routes
  await registerGenerateCourseRoute(app, llmProvider);
  await registerModuleChatRoute(app, llmProvider, checkpointerProvider);
  await registerEmbeddingsRoute(app, embeddingProvider);

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'agent' }));

  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'Agent service started');
}

start().catch((err) => {
  logger.error(err, 'Failed to start agent service');
  process.exit(1);
});
