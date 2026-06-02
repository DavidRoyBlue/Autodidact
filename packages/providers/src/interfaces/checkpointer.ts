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
}
