import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { ICheckpointerProvider } from '../../interfaces/checkpointer.js';

// The tables PostgresSaver.setup() creates at runtime. Single source of truth for
// the Data-API lockdown loop below (Spec 2 C1).
const CHECKPOINT_TABLES = [
  'checkpoints',
  'checkpoint_writes',
  'checkpoint_blobs',
  'checkpoint_migrations',
] as const;

// Lazy import to avoid requiring the package when not used
export class PostgresCheckpointerProvider implements ICheckpointerProvider {
  private saver: BaseCheckpointSaver | null = null;
  private readonly connectionString: string;

  constructor(config: { connectionString: string }) {
    this.connectionString = config.connectionString;
  }

  getCheckpointer(): BaseCheckpointSaver {
    if (!this.saver) {
      throw new Error(
        'PostgresCheckpointerProvider not initialized. Call init() first.',
      );
    }
    return this.saver;
  }

  async init(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@langchain/langgraph-checkpoint-postgres' as any);
    const PostgresSaver = mod.PostgresSaver ?? mod.default?.PostgresSaver;
    this.saver = PostgresSaver.fromConnString(this.connectionString);
    await (this.saver as unknown as { setup(): Promise<void> }).setup();

    // Data-API lockdown (Spec 2 C1): setup() just created the checkpoint tables
    // without RLS. Enable RLS on each so the publishable key (anon/authenticated)
    // cannot reach them via PostgREST. The backend connects as postgres (BYPASSRLS,
    // and the tables' owner), so this never blocks the agent. Idempotent on every
    // boot; mirrors migration 0009's conditional enablement for fresh DBs where these
    // tables did not exist at migrate time. Fixed whitelist -> safe to interpolate.
    const pool = (this.saver as unknown as {
      pool?: { query(sql: string): Promise<unknown> };
    }).pool;
    if (pool?.query) {
      for (const t of CHECKPOINT_TABLES) {
        await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
      }
    }
  }

  async ping(): Promise<void> {
    if (!this.saver) {
      throw new Error(
        'PostgresCheckpointerProvider not initialized. Call init() first.',
      );
    }
    // PostgresSaver wraps a node-postgres Pool; a trivial round-trip confirms the
    // database is reachable without touching checkpoint data.
    const pool = (this.saver as unknown as {
      pool?: { query(sql: string): Promise<unknown> };
    }).pool;
    if (pool?.query) {
      await pool.query('SELECT 1');
    }
  }
}
