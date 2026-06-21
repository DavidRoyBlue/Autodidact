import type { z } from 'zod';
import { apiEnvSchema, agentEnvSchema, workerEnvSchema } from './schema.js';

/**
 * Thrown when `process.env` fails a service's schema. The message lists every
 * offending variable at once so a misconfigured boot is fixed in one pass
 * instead of one 401/empty-connection-string error at a time.
 */
export class EnvValidationError extends Error {
  constructor(service: string, issues: z.ZodIssue[]) {
    const details = issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    super(
      `Invalid environment for the "${service}" service:\n${details}\n\n` +
        `Set the missing variables in .env.dev for local dev (see .env.example); ` +
        `in production they are injected by Cloud Run from GCP Secret Manager.\n` +
        `If you are running a single service directly, make sure the env is loaded ` +
        `first (run "direnv allow" once, or use the "dotenv -e" wrapper scripts).`,
    );
    this.name = 'EnvValidationError';
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, service: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new EnvValidationError(service, result.error.issues);
  }
  return result.data;
}

/**
 * Validate and return the typed environment for a service. Call once at the top
 * of `main.ts`, before constructing the app — a failure throws and the existing
 * boot `.catch` logs the named-variable message and exits.
 */
export const loadApiEnv = (): z.infer<typeof apiEnvSchema> => parse(apiEnvSchema, 'api');
export const loadAgentEnv = (): z.infer<typeof agentEnvSchema> => parse(agentEnvSchema, 'agent');
export const loadWorkerEnv = (): z.infer<typeof workerEnvSchema> => parse(workerEnvSchema, 'worker');
