import { describe, it, expect } from 'vitest';
import { buildModuleSystemPrompt } from '../module-teacher.js';
import type { CourseModule } from '@autodidact/types';

const sampleModule: CourseModule = {
  id: 'mod-1',
  position: 0,
  title: 'Variables and Types',
  description: 'Learn Python variables and basic data types.',
  objectives: ['Declare variables', 'Use strings and numbers', 'Understand type coercion'],
  content: '## Variable Basics\nAssignment syntax and naming conventions.\n\n## Data Types\nint, str, float.',
  resources: [],
  estimatedMinutes: 45,
};

const sampleContext = {
  courseTitle: 'Python for Beginners',
  completedModuleCount: 0,
  totalModuleCount: 5,
};

describe('buildModuleSystemPrompt()', () => {
  it('includes the module title', () => {
    const result = buildModuleSystemPrompt(sampleModule, sampleContext);
    expect(result).toContain('Variables and Types');
  });

  it('includes the course title', () => {
    const result = buildModuleSystemPrompt(sampleModule, sampleContext);
    expect(result).toContain('Python for Beginners');
  });

  it('formats objectives as bullet list with "- " prefix', () => {
    const result = buildModuleSystemPrompt(sampleModule, sampleContext);
    expect(result).toContain('- Declare variables');
    expect(result).toContain('- Use strings and numbers');
    expect(result).toContain('- Understand type coercion');
  });

  it('includes the lesson under a Lesson heading', () => {
    const result = buildModuleSystemPrompt(sampleModule, sampleContext);
    expect(result).toContain('## Lesson\n## Variable Basics');
    expect(result).toContain('int, str, float.');
  });

  it('displays module position as 1-indexed (position+1)', () => {
    const result = buildModuleSystemPrompt(sampleModule, sampleContext);
    expect(result).toContain('Module 1/');
  });

  it('includes completion progress context', () => {
    const result = buildModuleSystemPrompt(sampleModule, { ...sampleContext, completedModuleCount: 2, totalModuleCount: 6 });
    expect(result).toContain('2/6');
  });

  it('includes the [MODULE_COMPLETE:score=<N>] marker instruction', () => {
    const result = buildModuleSystemPrompt(sampleModule, sampleContext);
    expect(result).toContain('[MODULE_COMPLETE:score=');
  });

  it('handles module at a non-zero position', () => {
    const result = buildModuleSystemPrompt({ ...sampleModule, position: 2 }, { ...sampleContext, totalModuleCount: 5 });
    expect(result).toContain('Module 3/');
  });
});
