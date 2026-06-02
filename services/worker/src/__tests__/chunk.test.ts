import { describe, it, expect } from 'vitest';
import { chunkModuleContent } from '../rag/chunk.js';

const module = {
  title: 'Closures',
  description: 'Understanding JavaScript closures.',
  objectives: ['Define a closure', 'Use closures for encapsulation'],
  contentOutline: [
    { title: 'Lexical scope', points: ['Scope chain', 'Variable lookup'] },
    { title: 'Practical uses', points: ['Counters', 'Private state'] },
  ],
};

describe('chunkModuleContent()', () => {
  it('produces an intro chunk, an objectives chunk, and one chunk per section', () => {
    const chunks = chunkModuleContent(module);
    expect(chunks).toHaveLength(4); // intro + objectives + 2 sections
  });

  it('assigns sequential chunk indices starting at 0', () => {
    const chunks = chunkModuleContent(module);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2, 3]);
  });

  it('includes the module title and description in the intro chunk', () => {
    const [intro] = chunkModuleContent(module);
    expect(intro!.content).toContain('Closures');
    expect(intro!.content).toContain('Understanding JavaScript closures.');
  });

  it('includes section titles and points in section chunks', () => {
    const chunks = chunkModuleContent(module);
    const section = chunks.find((c) => c.content.includes('Lexical scope'));
    expect(section).toBeDefined();
    expect(section!.content).toContain('Scope chain');
  });

  it('skips the objectives chunk when there are no objectives', () => {
    const chunks = chunkModuleContent({ ...module, objectives: [] });
    expect(chunks.some((c) => c.content.includes('Learning objectives'))).toBe(false);
  });

  it('handles a module with no content outline', () => {
    const chunks = chunkModuleContent({ ...module, contentOutline: [] });
    expect(chunks).toHaveLength(2); // intro + objectives only
  });
});
