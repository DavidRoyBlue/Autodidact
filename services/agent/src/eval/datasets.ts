/**
 * Seed eval datasets for the agent. Small and hand-authored: enough to catch
 * regressions in the behaviors the capability phases will change, cheap enough
 * to run on every PR. Grow these alongside new behaviors.
 */

export interface TutoringCase {
  id: string;
  objectives: string[];
  /** A single learner turn to drive the teacher node. */
  message: string;
  /** When set, the case also exercises completion-score calibration. */
  expectedCompletionScore?: number;
}

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
