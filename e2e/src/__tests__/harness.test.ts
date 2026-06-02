import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startCrossServiceHarness, type CrossServiceHarness } from '../harness.js';

let harness: CrossServiceHarness;

beforeAll(async () => {
  harness = await startCrossServiceHarness();
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

describe('cross-service harness', () => {
  it('boots the agent with a healthy /health', async () => {
    const res = await fetch(`${harness.agentUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('boots the api with /v1/health reporting db=ok', async () => {
    const res = await fetch(`${harness.apiUrl}/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; services: { db: string } };
    expect(body.services.db).toBe('ok');
  });
});
