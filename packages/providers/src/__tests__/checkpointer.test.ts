import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock @langchain/langgraph to avoid needing the real LangGraph runtime.
// MemorySaver is constructed at class-field initialisation time in
// MemoryCheckpointerProvider, so the mock must be in place before the import.
// ────────────────────────────────────────────────────────────────────────────

const { MockMemorySaver } = vi.hoisted(() => {
  const MockMemorySaver = vi.fn().mockImplementation(() => ({
    _tag: 'MockMemorySaver',
  }));
  return { MockMemorySaver };
});

vi.mock('@langchain/langgraph', () => ({
  MemorySaver: MockMemorySaver,
}));

// ────────────────────────────────────────────────────────────────────────────
// Mock the dynamic import used by PostgresCheckpointerProvider.init().
// vi.mock with a factory replaces the module for both static and dynamic
// imports in vitest.
// ────────────────────────────────────────────────────────────────────────────

const { mockFromConnString, mockSetup, mockQuery } = vi.hoisted(() => {
  const mockSetup = vi.fn().mockResolvedValue(undefined);
  const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
  const mockSaverInstance = {
    _tag: 'MockPostgresSaver',
    setup: mockSetup,
    pool: { query: mockQuery },
  };
  const mockFromConnString = vi.fn().mockReturnValue(mockSaverInstance);

  return { mockFromConnString, mockSetup, mockQuery, mockSaverInstance };
});

vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: mockFromConnString,
  },
}));

// ────────────────────────────────────────────────────────────────────────────

import { MemoryCheckpointerProvider } from '../implementations/checkpointer/memory.provider.js';
import { PostgresCheckpointerProvider } from '../implementations/checkpointer/postgres.provider.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSetup.mockResolvedValue(undefined);
  mockQuery.mockResolvedValue({ rows: [] });
  mockFromConnString.mockReturnValue({
    _tag: 'MockPostgresSaver',
    setup: mockSetup,
    pool: { query: mockQuery },
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('MemoryCheckpointerProvider', () => {
  it('constructs a MemorySaver during instantiation', () => {
    new MemoryCheckpointerProvider();
    expect(MockMemorySaver).toHaveBeenCalledTimes(1);
  });

  it('getCheckpointer() returns the MemorySaver instance', () => {
    const provider = new MemoryCheckpointerProvider();
    const saver = provider.getCheckpointer();
    expect(saver).toBeDefined();
    expect((saver as unknown as { _tag: string })._tag).toBe('MockMemorySaver');
  });

  it('getCheckpointer() returns the same instance on every call', () => {
    const provider = new MemoryCheckpointerProvider();
    expect(provider.getCheckpointer()).toBe(provider.getCheckpointer());
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('PostgresCheckpointerProvider', () => {
  describe('before init()', () => {
    it('getCheckpointer() throws because init() has not been called', () => {
      const provider = new PostgresCheckpointerProvider({
        connectionString: 'postgresql://localhost/test',
      });
      expect(() => provider.getCheckpointer()).toThrow();
    });

    it('getCheckpointer() throws with a message mentioning init()', () => {
      const provider = new PostgresCheckpointerProvider({
        connectionString: 'postgresql://localhost/test',
      });
      expect(() => provider.getCheckpointer()).toThrow(/init/i);
    });
  });

  describe('after init()', () => {
    it('calls PostgresSaver.fromConnString with the configured connection string', async () => {
      const connString = 'postgresql://user:pass@localhost:5432/mydb';
      const provider = new PostgresCheckpointerProvider({ connectionString: connString });
      await provider.init();
      expect(mockFromConnString).toHaveBeenCalledWith(connString);
    });

    it('calls setup() on the newly created saver', async () => {
      const provider = new PostgresCheckpointerProvider({
        connectionString: 'postgresql://localhost/test',
      });
      await provider.init();
      expect(mockSetup).toHaveBeenCalledTimes(1);
    });

    it('getCheckpointer() returns the saver after init() completes', async () => {
      const provider = new PostgresCheckpointerProvider({
        connectionString: 'postgresql://localhost/test',
      });
      await provider.init();
      const saver = provider.getCheckpointer();
      expect(saver).toBeDefined();
      expect((saver as unknown as { _tag: string })._tag).toBe('MockPostgresSaver');
    });

    it('getCheckpointer() does not throw after init()', async () => {
      const provider = new PostgresCheckpointerProvider({
        connectionString: 'postgresql://localhost/test',
      });
      await provider.init();
      expect(() => provider.getCheckpointer()).not.toThrow();
    });

    // Data-API lockdown (Spec 2 C1): the library's setup() creates the checkpoint
    // tables without RLS. init() must enable RLS on each so the publishable key
    // cannot reach them via PostgREST (the backend connects as postgres/BYPASSRLS).
    it('enables RLS on all four checkpoint tables after setup()', async () => {
      const provider = new PostgresCheckpointerProvider({
        connectionString: 'postgresql://localhost/test',
      });
      await provider.init();

      const expected = [
        'checkpoints',
        'checkpoint_writes',
        'checkpoint_blobs',
        'checkpoint_migrations',
      ];
      for (const t of expected) {
        expect(mockQuery).toHaveBeenCalledWith(
          `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`,
        );
      }
    });

    it('runs setup() before enabling RLS (tables must exist first)', async () => {
      const provider = new PostgresCheckpointerProvider({
        connectionString: 'postgresql://localhost/test',
      });
      await provider.init();
      const setupOrder = mockSetup.mock.invocationCallOrder[0];
      const firstAlterOrder = mockQuery.mock.invocationCallOrder[0];
      expect(setupOrder).toBeLessThan(firstAlterOrder);
    });
  });
});
