import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export interface TestRedis {
  /** redis:// connection URL for ioredis / BullMQ. */
  url: string;
  /** The running Redis container. */
  container: StartedRedisContainer;
  /** Stop the container. Call in afterAll. */
  close: () => Promise<void>;
}

/** Boot a Redis container for BullMQ integration tests. */
export async function withTestRedis(): Promise<TestRedis> {
  const container = await new RedisContainer('redis:7-alpine').start();
  const url = container.getConnectionUrl();
  const close = async () => {
    await container.stop();
  };
  return { url, container, close };
}
