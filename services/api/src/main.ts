import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createLogger, initTracer } from '@autodidact/observability';
import { loadApiEnv } from '@autodidact/env';

const logger = createLogger('api');

async function bootstrap() {
  const env = loadApiEnv();
  initTracer('autodidact-api');

  // Keep Nest's framework logger at error/warn only (service code logs via pino).
  // `logger: false` silences Nest's ExceptionHandler, which turns a provider-factory
  // boot failure (e.g. a bad QUEUE_PROVIDER) into a misleading "Maximum call stack
  // size exceeded" instead of the real cause — so a misconfig becomes undebuggable.
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('v1');

  await app.listen(env.API_PORT, '0.0.0.0');
  logger.info({ port: env.API_PORT }, 'API service started');
}

bootstrap().catch((err: unknown) => {
  // Last-resort boot handler. pino's async transport (pino-pretty in dev) loses its
  // buffer on process.exit, so write the failure synchronously to stderr too —
  // otherwise a failed boot exits silently. Covers pre-Nest errors (env/tracer)
  // that never reach Nest's logger.
  process.stderr.write(
    `API service failed to start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  logger.error(err, 'API service failed to start');
  process.exit(1);
});
