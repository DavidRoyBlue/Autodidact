import { z } from 'zod';

/**
 * Per-service environment schemas.
 *
 * These encode the *runtime* contract — exactly which variables each backend
 * service needs to boot, and under what conditions. They are the single source
 * of truth for required configuration; `.env.example` documents the same set
 * for humans.
 *
 * Validation runs once, explicitly, at service boot (see ./load.ts) — never at
 * module import. This preserves the lazy-`getDb()` invariant in `@autodidact/db`
 * (a top-level read of an unloaded env would otherwise silently produce an empty
 * connection string). The `pg.Pool` constructed at import time is inert until the
 * first query, so a boot-time `loadEnv()` gates before any real DB access.
 */

const Port = z.coerce.number().int().min(1).max(65535);

const nonEmpty = (name: string) => z.string().min(1, `${name} must not be empty`);

/** Shared by every service. All optional with safe defaults. */
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Blank disables OTLP export (traces are silently dropped). See @autodidact/observability.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

/** services/api — NestJS public HTTP. Needs DB, Supabase auth, and the task queue. */
export const apiEnvSchema = baseSchema.extend({
  DATABASE_URL: nonEmpty('DATABASE_URL'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: nonEmpty('SUPABASE_SECRET_KEY'),
  AGENT_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  // AgentPlatform runs the module teacher (ADR-031); reachable from dev only until it is hosted
  AGENT_PLATFORM_URL: z.string().url().default('http://localhost:8400'),
  API_PORT: Port.default(3000),
});

/**
 * services/agent — Fastify. Serves embeddings; the module teacher itself runs
 * on AgentPlatform (ADR-031).
 */
export const agentEnvSchema = baseSchema.extend({
  // Used by the embedding provider (@autodidact/providers), openai by default.
  // 'mock' is used only by the cross-service e2e (@autodidact/e2e) via EMBEDDING_PROVIDER.
  OPENAI_API_KEY: z.string().optional(),
  AGENT_PORT: Port.default(3001),
});

/**
 * services/worker — HTTP task handler (invoked by Cloud Tasks in production,
 * the loopback queue provider locally). Needs DB (writes), the agent URL and the AgentPlatform URL.
 */
export const workerEnvSchema = baseSchema.extend({
  DATABASE_URL: nonEmpty('DATABASE_URL'),
  AGENT_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  // AgentPlatform runs course generation (ADR-030); reachable from dev only until it is hosted
  AGENT_PLATFORM_URL: z.string().url().default('http://localhost:8400'),
  WORKER_PORT: Port.default(3002),
  // Mirrors max_attempts in the Cloud Tasks queue retry_config (infra/modules/cloud-tasks).
  TASK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type AgentEnv = z.infer<typeof agentEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
