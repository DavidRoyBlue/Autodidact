import { describe, it, expect } from 'vitest';
import { buildModuleSystemPrompt } from '../module-teacher.js';

const module = {
  id: 'm1',
  position: 0,
  title: 'Closures',
  description: 'Learn closures.',
  objectives: ['Understand closures'],
  contentOutline: [{ title: 'Scope', points: ['Lexical scope'] }],
  estimatedMinutes: 30,
};

const ctx = { courseTitle: 'JS', completedModuleCount: 0, totalModuleCount: 3 };

describe('buildModuleSystemPrompt() grounding', () => {
  it('omits the reference-material section when no retrieved context is given', () => {
    const prompt = buildModuleSystemPrompt(module, ctx);
    expect(prompt).not.toMatch(/Retrieved Reference Material/i);
  });

  it('includes retrieved context and a grounding instruction when provided', () => {
    const prompt = buildModuleSystemPrompt(
      module,
      ctx,
      'A closure is a function bundled with its lexical environment.',
    );
    expect(prompt).toMatch(/Retrieved Reference Material/i);
    expect(prompt).toContain('A closure is a function bundled with its lexical environment.');
    expect(prompt).toMatch(/ground|prefer|cite|reference material/i);
  });

  it('omits the section for empty/whitespace retrieved context', () => {
    const prompt = buildModuleSystemPrompt(module, ctx, '   ');
    expect(prompt).not.toMatch(/Retrieved Reference Material/i);
  });
});
