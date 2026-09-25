import type { IEmbeddingProvider } from './interfaces/embedding.js';
import type { IQueueProvider } from './interfaces/queue.js';
import type { IAuthProvider } from './interfaces/auth.js';
import { OpenAIEmbeddingProvider } from './implementations/embedding/openai-embedding.provider.js';
import { MockEmbeddingProvider } from './implementations/embedding/mock-embedding.provider.js';
import { CloudTasksQueueProvider } from './implementations/queue/cloud-tasks.provider.js';
import { LoopbackQueueProvider } from './implementations/queue/loopback.provider.js';
import { SupabaseAuthProvider } from './implementations/auth/supabase-auth.provider.js';
import { MockAuthProvider } from './implementations/auth/mock-auth.provider.js';

export interface ProviderConfig {
  embeddingProvider?: string;
  queueProvider?: string;
  authProvider?: string;
  openaiApiKey?: string;
  supabaseUrl?: string;
  workerBaseUrl?: string;
  gcpProjectId?: string;
  cloudTasksLocation?: string;
  cloudTasksInvokerSa?: string;
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
  const provider = config.queueProvider ?? process.env['QUEUE_PROVIDER'] ?? 'loopback';
  if (provider === 'cloudtasks') {
    const projectId = config.gcpProjectId ?? process.env['GCP_PROJECT_ID'] ?? '';
    const workerBaseUrl = config.workerBaseUrl ?? process.env['WORKER_TASK_BASE_URL'] ?? '';
    const invokerServiceAccount =
      config.cloudTasksInvokerSa ?? process.env['CLOUD_TASKS_INVOKER_SA'] ?? '';
    const missing = [
      !projectId && 'GCP_PROJECT_ID',
      !workerBaseUrl && 'WORKER_TASK_BASE_URL',
      !invokerServiceAccount && 'CLOUD_TASKS_INVOKER_SA',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`QUEUE_PROVIDER=cloudtasks requires ${missing.join(', ')}`);
    }
    return new CloudTasksQueueProvider({
      projectId,
      location: config.cloudTasksLocation ?? process.env['CLOUD_TASKS_LOCATION'] ?? 'us-central1',
      workerBaseUrl,
      invokerServiceAccount,
    });
  }
  // Fail fast on anything else (e.g. a stale 'bullmq' secret) — a silent loopback
  // fallback in production would fire-and-forget unauthenticated POSTs into IAM 403s.
  if (provider !== 'loopback') {
    throw new Error(
      `Unknown QUEUE_PROVIDER '${provider}' — expected 'cloudtasks' or 'loopback'`,
    );
  }
  return new LoopbackQueueProvider({
    workerBaseUrl:
      config.workerBaseUrl ?? process.env['WORKER_TASK_BASE_URL'] ?? 'http://localhost:3002',
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
