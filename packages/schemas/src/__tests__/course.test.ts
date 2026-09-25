import { describe, it, expect } from 'vitest';
import { CreateCourseRequestSchema, GeneratedCourseSchema } from '../course.js';

describe('CreateCourseRequestSchema', () => {
  it('accepts topic of 3 characters', () => {
    expect(() => CreateCourseRequestSchema.parse({ topic: 'SQL' })).not.toThrow();
  });

  it('accepts topic of 200 characters', () => {
    expect(() => CreateCourseRequestSchema.parse({ topic: 'A'.repeat(200) })).not.toThrow();
  });

  it('rejects topic shorter than 3 characters', () => {
    const result = CreateCourseRequestSchema.safeParse({ topic: 'AB' });
    expect(result.success).toBe(false);
  });

  it('rejects topic longer than 200 characters', () => {
    const result = CreateCourseRequestSchema.safeParse({ topic: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('defaults difficulty to "beginner" and timeBudget to "1h" when omitted', () => {
    const result = CreateCourseRequestSchema.parse({ topic: 'Python' });
    expect(result.difficulty).toBe('beginner');
    expect(result.timeBudget).toBe('1h');
  });

  it('rejects a timeBudget outside the presets', () => {
    const result = CreateCourseRequestSchema.safeParse({ topic: 'Python', timeBudget: '2h' });
    expect(result.success).toBe(false);
  });

  it('accepts every preset', () => {
    for (const timeBudget of ['30min', '1h', '4h', 'unrestricted']) {
      expect(() => CreateCourseRequestSchema.parse({ topic: 'Python', timeBudget })).not.toThrow();
    }
  });
});

const generated = {
  title: 'Python Basics',
  description: 'Learn Python.',
  difficulty: 'beginner',
  budget: { preset: '1h', words: 9000, measured_words: 8800, estimated_minutes: 59 },
  modules: [
    {
      position: 1,
      title: 'Intro',
      description: 'Getting started',
      objectives: ['Understand Python'],
      content: '## Setup\nInstall Python.',
      words: 8800,
      estimated_minutes: 59,
      resources: [{ url: 'https://docs.python.org/3/', title: 'Docs', why: 'reference' }],
    },
  ],
  review: { passed: true, rewrite_rounds: 0 },
};

describe('GeneratedCourseSchema', () => {
  it('keeps only what the app persists from the workflow output', () => {
    const parsed = GeneratedCourseSchema.parse(generated);
    expect(parsed).not.toHaveProperty('review');
    expect(parsed.budget).toEqual({ estimated_minutes: 59 });
    expect(parsed.modules[0]).not.toHaveProperty('words');
  });

  it('rejects a course with no modules', () => {
    expect(GeneratedCourseSchema.safeParse({ ...generated, modules: [] }).success).toBe(false);
  });

  it('rejects a module without a lesson', () => {
    const modules = [{ ...generated.modules[0], content: '' }];
    expect(GeneratedCourseSchema.safeParse({ ...generated, modules }).success).toBe(false);
  });
});
