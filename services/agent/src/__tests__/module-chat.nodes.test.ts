import { describe, it, expect, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { makeTeacherNode, makeEvaluationNode } from '../graphs/module-chat/nodes.js';
import type { ModuleChatStateType } from '../graphs/module-chat/state.js';

function makeMockProvider(responseContent: string) {
  const mockModel = {
    invoke: vi.fn().mockResolvedValue({ content: responseContent }),
  };
  return {
    getModel: vi.fn().mockReturnValue(mockModel),
    getModelName: vi.fn().mockReturnValue('mock'),
    _mockModel: mockModel,
  };
}

const sampleModule = {
  id: 'mod-1',
  position: 0,
  title: 'Variables',
  description: 'Learn Python variables.',
  objectives: ['Declare variables', 'Use basic types'],
  content: '## Basics\nAssignment',
  resources: [],
  estimatedMinutes: 30,
};

const baseState: ModuleChatStateType = {
  messages: [new HumanMessage('Hello')],
  moduleBlueprint: sampleModule,
  courseProgress: { courseTitle: 'Python', completedModuleCount: 0, totalModuleCount: 3 },
  completionSignaled: false,
  completionScore: null,
  teachingPhase: 'teaching',
};

describe('makeTeacherNode()', () => {
  describe('completion signal detection', () => {
    it('detects [MODULE_COMPLETE:score=85] and sets completionSignaled=true', async () => {
      const provider = makeMockProvider('Great work! [MODULE_COMPLETE:score=85]');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.completionSignaled).toBe(true);
    });

    it('extracts the score from the signal', async () => {
      const provider = makeMockProvider('Well done! [MODULE_COMPLETE:score=92]');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.completionScore).toBe(92);
    });

    it('removes the signal token from the returned message content', async () => {
      const provider = makeMockProvider('Nice work! [MODULE_COMPLETE:score=80] Keep going.');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      const messages = result.messages as import('@langchain/core/messages').AIMessage[];
      expect(messages[0]?.content).not.toContain('[MODULE_COMPLETE:');
    });

    it('sets teachingPhase to "evaluation" when signal is present', async () => {
      const provider = makeMockProvider('[MODULE_COMPLETE:score=70]');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.teachingPhase).toBe('evaluation');
    });

    it('handles score=0 correctly (not falsy-ignored)', async () => {
      const provider = makeMockProvider('[MODULE_COMPLETE:score=0]');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.completionScore).toBe(0);
      expect(result.completionSignaled).toBe(true);
    });

    it('handles signal at the start of content', async () => {
      const provider = makeMockProvider('[MODULE_COMPLETE:score=75] You did great!');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.completionSignaled).toBe(true);
    });

    it('handles signal at the end of content', async () => {
      const provider = makeMockProvider('You finished! [MODULE_COMPLETE:score=88]');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.completionScore).toBe(88);
    });
  });

  describe('no completion signal', () => {
    it('sets completionSignaled=false when no signal in response', async () => {
      const provider = makeMockProvider('Keep studying!');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.completionSignaled).toBe(false);
    });

    it('does NOT set completionScore when there is no signal', async () => {
      const provider = makeMockProvider('Keep studying!');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      expect(result.completionScore).toBeUndefined();
    });

    it('returns an AIMessage with the full content when no signal', async () => {
      const provider = makeMockProvider('Tell me more about variables.');
      const node = makeTeacherNode(provider as never);
      const result = await node(baseState);
      const messages = result.messages as import('@langchain/core/messages').AIMessage[];
      expect(messages[0]?.content).toBe('Tell me more about variables.');
    });
  });
});

describe('makeEvaluationNode()', () => {
  it('parses valid JSON and returns completionScore from result.score', async () => {
    const provider = makeMockProvider(JSON.stringify({ completed: true, score: 87, feedback: 'Well done' }));
    const node = makeEvaluationNode(provider as never);
    const result = await node({ ...baseState, completionScore: 80 });
    expect(result.completionScore).toBe(87);
  });

  it('falls back to state.completionScore ?? 75 when JSON parse fails', async () => {
    const provider = makeMockProvider('not valid json at all');
    const node = makeEvaluationNode(provider as never);
    const result = await node({ ...baseState, completionScore: 90 });
    expect(result.completionScore).toBe(90);
  });

  it('falls back to 75 when parse fails and state.completionScore is null', async () => {
    const provider = makeMockProvider('bad json');
    const node = makeEvaluationNode(provider as never);
    const result = await node({ ...baseState, completionScore: null });
    expect(result.completionScore).toBe(75);
  });
});
