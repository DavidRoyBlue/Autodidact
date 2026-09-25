import type { CourseModule } from '@autodidact/types';

export interface ContentChunk {
  chunkIndex: number;
  content: string;
}

export type ModuleContent = Pick<CourseModule, 'title' | 'description' | 'objectives' | 'content'>;

/**
 * Split a module into retrievable chunks for the RAG corpus (ADR-024).
 * Deterministic and pure so the chunk contract is testable: an intro chunk
 * (title + description), an objectives chunk, then one chunk per `##` section
 * of the lesson markdown (text before the first heading is its own chunk).
 * Empty chunks are skipped. Chunk indices are sequential.
 */
export function chunkModuleContent(module: ModuleContent): ContentChunk[] {
  const texts = [`# ${module.title}\n${module.description}`.trim()];

  if (module.objectives?.length) {
    texts.push(`Learning objectives:\n${module.objectives.map((o) => `- ${o}`).join('\n')}`);
  }

  texts.push(...module.content.split(/^(?=## )/m).map((s) => s.trim()));

  return texts
    .filter((content) => content.length > 0)
    .map((content, chunkIndex) => ({ chunkIndex, content }));
}
