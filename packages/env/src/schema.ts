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

/** services/api — NestJS public HTTP. Needs DB, Redis (job enqueue), and Supabase auth. */
export const apiEnvSchema = baseSchema.extend({
  DATABASE_URL: nonEmpty('DATABASE_URL'),
  REDIS_URL: nonEmpty('REDIS_URL'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: nonEmpty('SUPABASE_SECRET_KEY'),
  AGENT_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  API_PORT: Port.default(3000),
});

/**
 * services/agent — Fastify + LangGraph. Needs an LLM key; DATABASE_URL only when
 * the postgres checkpointer is selected (default is the in-memory checkpointer).
 */
export const agentEnvSchema = baseSchema
  .extend({
    OPENAI_API_KEY: nonEmpty('OPENAI_API_KEY'),
    ANTHROPIC_API_KEY: z.string().optional(),
    LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
    CHECKPOINTER: z.enum(['memory', 'postgres']).default('memory'),
    // Required only when CHECKPOINTER=postgres (enforced in the refinement below).
    DATABASE_URL: z.string().optional(),
    AGENT_PORT: Port.default(3001),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic',
      });
    }
    if (env.CHECKPOINTER === 'postgres' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when CHECKPOINTER=postgres',
      });
    }
  });

/** services/worker — BullMQ jobs. Needs DB (writes), Redis (queue), and the agent URL. */
export const workerEnvSchema = baseSchema.extend({
  DATABASE_URL: nonEmpty('DATABASE_URL'),
  REDIS_URL: nonEmpty('REDIS_URL'),
  AGENT_SERVICE_URL: z.string().url().default('http://localhost:3001'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type AgentEnv = z.infer<typeof agentEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
