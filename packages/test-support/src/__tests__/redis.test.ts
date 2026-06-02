import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { withTestRedis, type TestRedis } from '../redis.js';

let r: TestRedis;

beforeAll(async () => {
  r = await withTestRedis();
}, 60_000);

afterAll(async () => {
  await r?.close();
});

describe('withTestRedis', () => {
  it('exposes a connection url BullMQ can use', async () => {
    expect(r.url).toMatch(/^redis:\/\//);
    // BullMQ requires maxRetriesPerRequest: null on the connection.
    const queue = new Queue('test-support-probe', {
      connection: { url: r.url, maxRetriesPerRequest: null },
    });
    const job = await queue.add('probe', { hello: 'world' });
    expect(job.id).toBeTruthy();
    await queue.close();
  });
});
