import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from '../routes/health.js';

describe('health & readiness routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns 200 liveness regardless of readiness', async () => {
    await registerHealthRoutes(app, { isReady: () => false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'agent' });
  });

  it('GET /ready returns 503 before startup completes', async () => {
    await registerHealthRoutes(app, { isReady: () => false });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not_ready', service: 'agent' });
  });

  it('GET /ready returns 200 once ready', async () => {
    await registerHealthRoutes(app, { isReady: () => true });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', service: 'agent' });
  });
});
