import type { ModuleBlueprint } from '@autodidact/types';

export interface ContentChunk {
  chunkIndex: number;
  content: string;
}

export type ModuleContent = Pick<
  ModuleBlueprint,
  'title' | 'description' | 'objectives' | 'contentOutline'
>;

/**
 * Split a module's source content into retrievable chunks for the RAG corpus
 * (ADR-024). Deterministic and pure so the chunk contract is testable: an intro
 * chunk (title + description), an objectives chunk, then one chunk per content
 * outline section. Empty sections are skipped. Chunk indices are sequential.
 */
export function chunkModuleContent(
  module: Pick<ModuleBlueprint, 'title' | 'description' | 'objectives' | 'contentOutline'>,
): ContentChunk[] {
  const texts: string[] = [];

  texts.push(`# ${module.title}\n${module.description}`.trim());

  if (module.objectives?.length) {
    texts.push(`Learning objectives:\n${module.objectives.map((o) => `- ${o}`).join('\n')}`);
  }

  for (const section of module.contentOutline ?? []) {
    const points = (section.points ?? []).map((p) => `- ${p}`).join('\n');
    texts.push(`## ${section.title}\n${points}`.trim());
  }

  return texts
    .filter((content) => content.length > 0)
    .map((content, chunkIndex) => ({ chunkIndex, content }));
}
