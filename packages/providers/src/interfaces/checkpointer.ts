import type { BaseCheckpointSaver } from '@langchain/langgraph';

export interface ICheckpointerProvider {
  /**
   * Prepare the checkpointer for use. Must be awaited before `getCheckpointer()`.
   * Memory-backed providers are a no-op; the Postgres provider runs `PostgresSaver.setup()`
   * (creates checkpoint tables). Making this a required part of the contract means a new
   * provider cannot be wired in without an explicit init step in the service bootstrap.
   */
  init(): Promise<void>;
  getCheckpointer(): BaseCheckpointSaver;

  /**
   * Liveness probe for readiness checks. Resolves if the backing store is
   * reachable, rejects otherwise. Optional: in-memory providers have no external
   * dependency and may omit it. The Postgres provider issues a `SELECT 1`.
   * A service `/ready` endpoint should call `provider.ping?.()`.
   */
  ping?(): Promise<void>;
}
