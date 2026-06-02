import {
  SimpleChatModel,
  type BaseChatModel,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { ILLMProvider } from '../../interfaces/llm.js';

/**
 * Deterministic, network-free chat model for cross-service e2e tests.
 *
 * The agent's graphs reuse one model for three distinct jobs, so the mock
 * branches on stable substrings of the system prompt (decoupled from
 * `@autodidact/prompts`):
 *   - "curriculum designer" → a valid CourseBlueprintSchema JSON (3 modules,
 *     so a module-unlock transition is observable).
 *   - "assessment AI"       → the completion-evaluator JSON contract.
 *   - otherwise (teacher)   → a teaching reply that signals completion via the
 *     `[MODULE_COMPLETE:score=N]` marker the teacher node parses.
 */
const MOCK_BLUEPRINT = {
  title: 'Mock Course',
  description: 'A deterministic course produced by the mock LLM provider.',
  difficulty: 'beginner',
  estimatedHours: 3,
  modules: [0, 1, 2].map((position) => ({
    position,
    title: `Module ${position + 1}`,
    description: `Deterministic module ${position + 1} for e2e.`,
    objectives: [`Understand concept ${position + 1}`],
    contentOutline: [{ title: `Section ${position + 1}`, points: ['Point A', 'Point B'] }],
    estimatedMinutes: 30,
  })),
};

const MOCK_EVALUATION = {
  completed: true,
  score: 85,
  feedback: 'Demonstrated sufficient understanding of the objectives.',
};

const MOCK_TEACHER_REPLY =
  'Great — you have grasped the key ideas of this module. [MODULE_COMPLETE:score=85]';

class MockChatModel extends SimpleChatModel {
  _llmType(): string {
    return 'mock';
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    const text = messages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n');

    if (text.includes('curriculum designer')) {
      return JSON.stringify(MOCK_BLUEPRINT);
    }
    if (text.includes('assessment AI') || text.includes('evaluate whether')) {
      return JSON.stringify(MOCK_EVALUATION);
    }
    return MOCK_TEACHER_REPLY;
  }
}

export class MockLLMProvider implements ILLMProvider {
  private readonly model = new MockChatModel({});

  getModel(): BaseChatModel {
    return this.model as unknown as BaseChatModel;
  }

  getModelName(): string {
    return 'mock';
  }
}
