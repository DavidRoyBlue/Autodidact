import { MemorySaver } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { ICheckpointerProvider } from '../../interfaces/checkpointer.js';

export class MemoryCheckpointerProvider implements ICheckpointerProvider {
  private readonly saver = new MemorySaver();

  // MemorySaver is ready on construction; init exists only to satisfy the contract.
  async init(): Promise<void> {}

  getCheckpointer(): BaseCheckpointSaver {
    return this.saver;
  }
}
