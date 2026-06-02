/**
 * Graph composition tests for the module-chat graph.
 *
 * These tests verify the WIRING (edges, conditional routing) of the
 * buildModuleChatGraph() function, not the logic of individual nodes
 * (which is covered in module-chat.nodes.test.ts).
 *
 * The real graph is built with a scripted mock LLM provider and a real
 * MemorySaver checkpointer so no real model calls are made.
 */

import { describe, it, expect, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import type { ICheckpointerProvider } from '@autodidact/providers';
import { buildModuleChatGraph } from '../graphs/module-chat/graph.js';

// ────────────────────────────────────────────────────────────────────────────
// Mock LLM provider factory (mirrors module-chat.nodes.test.ts pattern)
// ────────────────────────────────────────────────────────────────────────────

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

// Inline MemoryCheckpointerProvider — avoids the dist/source boundary issue
function makeMemoryCheckpointerProvider(): ICheckpointerProvider {
  const saver = new MemorySaver();
  return { getCheckpointer: () => saver };
}

// ────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ────────────────────────────────────────────────────────────────────────────

const sampleModule = {
  id: 'mod-1',
  position: 0,
  title: 'Variables',
  description: 'Learn Python variables.',
  objectives: ['Declare variables', 'Use basic types'],
  contentOutline: [{ title: 'Basics', points: ['Assignment'] }],
  estimatedMinutes: 30,
};

const courseProgress = {
  courseTitle: 'Python',
  completedModuleCount: 0,
  totalModuleCount: 3,
};

function baseInputState(extra?: Record<string, unknown>) {
  return {
    messages: [new HumanMessage('Hello')],
    moduleBlueprint: sampleModule,
    courseProgress,
    completionSignaled: false,
    completionScore: null,
    teachingPhase: 'teaching' as const,
    ...extra,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('buildModuleChatGraph() — graph composition / edge wiring', () => {

  // ── No completion signal: teacher → END (evaluator NOT run) ─────────────

  describe('teacher → END path (no completion signal)', () => {
    it('reaches END after teacher when no completion signal is present', async () => {
      const provider = makeMockProvider('Keep studying — good question!');
      const graph = buildModuleChatGraph(provider as never, makeMemoryCheckpointerProvider());

      const config = { configurable: { thread_id: 'thread-no-completion' } };
      const result = await graph.invoke(baseInputState(), config);

      // completionSignaled stays false → evaluator was NOT called
      expect(result.completionSignaled).toBe(false);
      // teacher was called exactly once
      expect(provider._mockModel.invoke).toHaveBeenCalledTimes(1);
    });

    it('does not set completionScore when no signal is present', async () => {
      const provider = makeMockProvider('Keep studying!');
      const graph = buildModuleChatGraph(provider as never, makeMemoryCheckpointerProvider());

      const result = await graph.invoke(baseInputState(), {
        configurable: { thread_id: 'thread-no-score' },
      });

      // completionScore should remain null (teacher does not set it without the signal)
      expect(result.completionScore).toBeNull();
    });

    it('appends an AIMessage to the messages array', async () => {
      const provider = makeMockProvider('Great question!');
      const graph = buildModuleChatGraph(provider as never, makeMemoryCheckpointerProvider());

      const result = await graph.invoke(baseInputState(), {
        configurable: { thread_id: 'thread-messages' },
      });

      // The human message + the AI response should both be present
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Completion signal: teacher → evaluator → END ─────────────────────────

  describe('teacher → evaluator → END path (completion signal present)', () => {
    it('routes through evaluator when [MODULE_COMPLETE:score=85] is in teacher output', async () => {
      // First call (teacher): returns the completion signal
      // Second call (evaluator): returns a JSON score
      const mockModel = {
        invoke: vi
          .fn()
          .mockResolvedValueOnce({ content: 'Great work! [MODULE_COMPLETE:score=85]' })
          .mockResolvedValueOnce({
            content: JSON.stringify({ completed: true, score: 90, feedback: 'Excellent' }),
          }),
      };
      const provider = {
        getModel: vi.fn().mockReturnValue(mockModel),
        getModelName: vi.fn().mockReturnValue('mock'),
      };

      const graph = buildModuleChatGraph(provider as never, makeMemoryCheckpointerProvider());
      const result = await graph.invoke(baseInputState(), {
        configurable: { thread_id: 'thread-completion' },
      });

      // Evaluator was run (model invoked twice)
      expect(mockModel.invoke).toHaveBeenCalledTimes(2);
      // completionSignaled was set by teacher node
      expect(result.completionSignaled).toBe(true);
      // completionScore refined by evaluator (90, not the raw 85 from teacher)
      expect(result.completionScore).toBe(90);
    });

    it('uses evaluator score over teacher preliminary score', async () => {
      const mockModel = {
        invoke: vi
          .fn()
          .mockResolvedValueOnce({ content: '[MODULE_COMPLETE:score=70]' })
          .mockResolvedValueOnce({
            content: JSON.stringify({ completed: true, score: 78, feedback: 'Good effort' }),
          }),
      };
      const provider = {
        getModel: vi.fn().mockReturnValue(mockModel),
        getModelName: vi.fn().mockReturnValue('mock'),
      };

      const graph = buildModuleChatGraph(provider as never, makeMemoryCheckpointerProvider());
      const result = await graph.invoke(baseInputState(), {
        configurable: { thread_id: 'thread-score-refinement' },
      });

      // Evaluator score (78) wins over teacher preliminary score (70)
      expect(result.completionScore).toBe(78);
    });

    it('falls back to teacher preliminary score when evaluator returns invalid JSON', async () => {
      const mockModel = {
        invoke: vi
          .fn()
          .mockResolvedValueOnce({ content: 'Done! [MODULE_COMPLETE:score=65]' })
          .mockResolvedValueOnce({ content: 'not valid json' }),
      };
      const provider = {
        getModel: vi.fn().mockReturnValue(mockModel),
        getModelName: vi.fn().mockReturnValue('mock'),
      };

      const graph = buildModuleChatGraph(provider as never, makeMemoryCheckpointerProvider());
      const result = await graph.invoke(baseInputState(), {
        configurable: { thread_id: 'thread-fallback' },
      });

      // Evaluator JSON parse fails → fallback to state.completionScore (65 from teacher)
      expect(result.completionScore).toBe(65);
    });

    it('strips the completion marker from the AI message stored in state', async () => {
      const mockModel = {
        invoke: vi
          .fn()
          .mockResolvedValueOnce({ content: 'Nice job! [MODULE_COMPLETE:score=80] You did it.' })
          .mockResolvedValueOnce({
            content: JSON.stringify({ completed: true, score: 80, feedback: 'Good' }),
          }),
      };
      const provider = {
        getModel: vi.fn().mockReturnValue(mockModel),
        getModelName: vi.fn().mockReturnValue('mock'),
      };

      const graph = buildModuleChatGraph(provider as never, makeMemoryCheckpointerProvider());
      const result = await graph.invoke(baseInputState(), {
        configurable: { thread_id: 'thread-strip-marker' },
      });

      // The [MODULE_COMPLETE:...] marker must be absent from all stored messages
      for (const msg of result.messages) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        expect(content).not.toContain('[MODULE_COMPLETE:');
      }
    });
  });

  // ── Checkpointer / multi-turn continuity ─────────────────────────────────

  describe('checkpointer continuity', () => {
    it('accumulates messages across two turns on the same thread_id', async () => {
      const provider = makeMockProvider('Good point!');
      const checkpointerProvider = makeMemoryCheckpointerProvider();
      const graph = buildModuleChatGraph(provider as never, checkpointerProvider);
      const config = { configurable: { thread_id: 'thread-multi-turn' } };

      // First turn
      await graph.invoke(baseInputState(), config);

      // Second turn — same thread, new human message
      const turn2State = await graph.invoke(
        { messages: [new HumanMessage('Follow-up question')] },
        config,
      );

      // Messages from both turns should be present (checkpointer replayed turn 1)
      expect(turn2State.messages.length).toBeGreaterThanOrEqual(3);
    });
  });
});
