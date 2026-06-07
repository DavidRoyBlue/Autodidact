import { describe, it, expect, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { makeTeacherNode } from '../graphs/module-chat/nodes.js';
import { formatRetrievedContext, type ContentRetriever } from '../rag/retriever.js';
import type { ModuleChatStateType } from '../graphs/module-chat/state.js';

function providerCapturingSystemPrompt(capture: (text: string) => void) {
  const model = {
    invoke: vi.fn(async (messages: Array<{ content: string }>) => {
      capture(messages[0]!.content); // SystemMessage is first
      return { content: 'Here is an explanation.' };
    }),
  };
  return {
    getModel: vi.fn().mockReturnValue(model),
    getModelName: vi.fn().mockReturnValue('mock'),
  };
}

const stateWith = (overrides: Partial<ModuleChatStateType> = {}): ModuleChatStateType => ({
  messages: [new HumanMessage('What is a closure?')],
  moduleBlueprint: {
    id: 'mod-1',
    position: 0,
    title: 'Closures',
    description: 'Learn closures.',
    objectives: ['Understand closures'],
    contentOutline: [{ title: 'Scope', points: ['Lexical scope'] }],
    estimatedMinutes: 30,
  },
  courseProgress: { courseTitle: 'JS', completedModuleCount: 0, totalModuleCount: 3 },
  completionSignaled: false,
  completionScore: null,
  teachingPhase: 'teaching',
  ...overrides,
});

describe('formatRetrievedContext()', () => {
  it('numbers each chunk', () => {
    const text = formatRetrievedContext([
      { chunkIndex: 0, content: 'A', similarity: 0.9 },
      { chunkIndex: 1, content: 'B', similarity: 0.8 },
    ]);
    expect(text).toContain('[1] A');
    expect(text).toContain('[2] B');
  });
});

describe('makeTeacherNode() RAG grounding', () => {
  it('injects retrieved context into the system prompt when a retriever is provided', async () => {
    let systemPrompt = '';
    const provider = providerCapturingSystemPrompt((t) => (systemPrompt = t));
    const retriever: ContentRetriever = {
      retrieve: vi.fn().mockResolvedValue([
        { chunkIndex: 0, content: 'A closure captures its lexical environment.', similarity: 0.95 },
      ]),
    };

    const node = makeTeacherNode(provider as never, retriever);
    await node(stateWith());

    expect(retriever.retrieve).toHaveBeenCalledWith('mod-1', 'What is a closure?', expect.any(Number));
    expect(systemPrompt).toMatch(/Retrieved Reference Material/i);
    expect(systemPrompt).toContain('A closure captures its lexical environment.');
  });

  it('does not retrieve or ground when no retriever is provided (unchanged behavior)', async () => {
    let systemPrompt = '';
    const provider = providerCapturingSystemPrompt((t) => (systemPrompt = t));
    const node = makeTeacherNode(provider as never);
    await node(stateWith());
    expect(systemPrompt).not.toMatch(/Retrieved Reference Material/i);
  });

  it('falls back gracefully (no grounding) when retrieval throws', async () => {
    let systemPrompt = '';
    const provider = providerCapturingSystemPrompt((t) => (systemPrompt = t));
    const retriever: ContentRetriever = {
      retrieve: vi.fn().mockRejectedValue(new Error('db down')),
    };
    const node = makeTeacherNode(provider as never, retriever);
    const result = await node(stateWith());
    expect(systemPrompt).not.toMatch(/Retrieved Reference Material/i);
    expect(result.messages).toBeDefined(); // turn still completes
  });

  it('skips retrieval when the module has no id', async () => {
    const provider = providerCapturingSystemPrompt(() => {});
    const retriever: ContentRetriever = { retrieve: vi.fn() };
    const node = makeTeacherNode(provider as never, retriever);
    const noId = stateWith();
    delete (noId.moduleBlueprint as { id?: string }).id;
    await node(noId);
    expect(retriever.retrieve).not.toHaveBeenCalled();
  });
});
