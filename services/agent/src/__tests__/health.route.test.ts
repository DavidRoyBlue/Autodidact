import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    await registerHealthRoutes(app, {
      isReady: () => false,
      checkpointerProvider: {},
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'agent' });
  });

  it('GET /ready returns 503 before startup completes', async () => {
    await registerHealthRoutes(app, {
      isReady: () => false,
      checkpointerProvider: { ping: vi.fn() },
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'not_ready' });
  });

  it('GET /ready returns 200 when ready and the checkpointer probe succeeds', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    await registerHealthRoutes(app, {
      isReady: () => true,
      checkpointerProvider: { ping },
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready' });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('GET /ready returns 503 when the checkpointer probe rejects', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('db unreachable'));
    await registerHealthRoutes(app, {
      isReady: () => true,
      checkpointerProvider: { ping },
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'not_ready' });
  });

  it('GET /ready returns 200 when ready and no ping is implemented (memory)', async () => {
    await registerHealthRoutes(app, {
      isReady: () => true,
      checkpointerProvider: {},
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready' });
  });
});
