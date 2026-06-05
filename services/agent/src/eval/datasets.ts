/**
 * Seed eval datasets for the agent. Small and hand-authored: enough to catch
 * regressions in the behaviors the capability phases will change, cheap enough
 * to run on every PR. Grow these alongside new behaviors.
 */

export interface CourseGenCase {
  id: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  moduleCount: number;
}

export interface TutoringCase {
  id: string;
  objectives: string[];
  /** A single learner turn to drive the teacher node. */
  message: string;
  /** When set, the case also exercises completion-score calibration. */
  expectedCompletionScore?: number;
}

export const COURSE_GEN_CASES: CourseGenCase[] = [
  { id: 'python-beginner', topic: 'Python programming', difficulty: 'beginner', moduleCount: 5 },
  { id: 'react-intermediate', topic: 'React and hooks', difficulty: 'intermediate', moduleCount: 4 },
  { id: 'ml-advanced', topic: 'Transformer architectures', difficulty: 'advanced', moduleCount: 6 },
];

export const TUTORING_CASES: TutoringCase[] = [
  {
    id: 'closures-question',
    objectives: ['Understand closures', 'Explain variable scope'],
    message: 'Can you explain what a closure is in JavaScript?',
  },
  {
    id: 'recursion-question',
    objectives: ['Understand recursion', 'Identify base cases'],
    message: 'How does recursion work and why do I need a base case?',
  },
];
