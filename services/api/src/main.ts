import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createLogger, initTracer } from '@autodidact/observability';
import { loadApiEnv } from '@autodidact/env';

const logger = createLogger('api');

async function bootstrap() {
  const env = loadApiEnv();
  initTracer('autodidact-api');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('v1');

  await app.listen(env.API_PORT, '0.0.0.0');
  logger.info({ port: env.API_PORT }, 'API service started');
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'API service failed to start');
  process.exit(1);
});
