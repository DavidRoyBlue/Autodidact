import { describe, it, expect } from 'vitest';
import { MemoryCheckpointerProvider } from '../implementations/checkpointer/memory.provider.js';

describe('MemoryCheckpointerProvider', () => {
  it('init() resolves as a no-op and getCheckpointer() returns a saver afterwards', async () => {
    const provider = new MemoryCheckpointerProvider();
    await expect(provider.init()).resolves.toBeUndefined();
    expect(provider.getCheckpointer()).toBeDefined();
  });
});
