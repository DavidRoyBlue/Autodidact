import type { ILLMProvider } from './interfaces/llm.js';
import type { IEmbeddingProvider } from './interfaces/embedding.js';
import type { IQueueProvider } from './interfaces/queue.js';
import type { IAuthProvider } from './interfaces/auth.js';
import type { ICheckpointerProvider } from './interfaces/checkpointer.js';
import { OpenAILLMProvider } from './implementations/llm/openai.provider.js';
import { AnthropicLLMProvider } from './implementations/llm/anthropic.provider.js';
import { MockLLMProvider } from './implementations/llm/mock.provider.js';
import { OpenAIEmbeddingProvider } from './implementations/embedding/openai-embedding.provider.js';
import { MockEmbeddingProvider } from './implementations/embedding/mock-embedding.provider.js';
import { BullMQQueueProvider } from './implementations/queue/bullmq.provider.js';
import { SupabaseAuthProvider } from './implementations/auth/supabase-auth.provider.js';
import { MockAuthProvider } from './implementations/auth/mock-auth.provider.js';
import { MemoryCheckpointerProvider } from './implementations/checkpointer/memory.provider.js';
import { PostgresCheckpointerProvider } from './implementations/checkpointer/postgres.provider.js';

export interface ProviderConfig {
  llmProvider?: string;
  embeddingProvider?: string;
  queueProvider?: string;
  authProvider?: string;
  checkpointer?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  redisUrl?: string;
  supabaseUrl?: string;
  databaseUrl?: string;
}

export function createLLMProvider(config: ProviderConfig = {}): ILLMProvider {
  const provider = config.llmProvider ?? process.env['LLM_PROVIDER'] ?? 'openai';
  if (provider === 'mock') {
    return new MockLLMProvider();
  }
  if (provider === 'anthropic') {
    return new AnthropicLLMProvider({
      apiKey: config.anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '',
    });
  }
  return new OpenAILLMProvider({
    apiKey: config.openaiApiKey ?? process.env['OPENAI_API_KEY'] ?? '',
  });
}

export function createEmbeddingProvider(config: ProviderConfig = {}): IEmbeddingProvider {
  const provider = config.embeddingProvider ?? process.env['EMBEDDING_PROVIDER'] ?? 'openai';
  if (provider === 'mock') {
    return new MockEmbeddingProvider();
  }
  return new OpenAIEmbeddingProvider({
    apiKey: config.openaiApiKey ?? process.env['OPENAI_API_KEY'] ?? '',
  });
}

export function createQueueProvider(config: ProviderConfig = {}): IQueueProvider {
  return new BullMQQueueProvider({
    redisUrl: config.redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  });
}

export function createAuthProvider(config: ProviderConfig = {}): IAuthProvider {
  const provider = config.authProvider ?? process.env['AUTH_PROVIDER'] ?? 'supabase';
  if (provider === 'mock') {
    return new MockAuthProvider();
  }
  return new SupabaseAuthProvider({
    supabaseUrl: config.supabaseUrl ?? process.env['SUPABASE_URL'] ?? '',
  });
}

export function createCheckpointer(config: ProviderConfig = {}): ICheckpointerProvider {
  const checkpointer = config.checkpointer ?? process.env['CHECKPOINTER'] ?? 'memory';
  if (checkpointer === 'postgres') {
    return new PostgresCheckpointerProvider({
      connectionString: config.databaseUrl ?? process.env['DATABASE_URL'] ?? '',
    });
  }
  return new MemoryCheckpointerProvider();
}
