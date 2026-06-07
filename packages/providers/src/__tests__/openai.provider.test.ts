import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock @langchain/openai before importing the provider under test.
// vi.hoisted ensures the mock factory variables are available when vi.mock()
// runs (both are hoisted to the top of the compiled module).
// ────────────────────────────────────────────────────────────────────────────

const { MockChatOpenAI } = vi.hoisted(() => {
  const MockChatOpenAI = vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    // Mimic how ChatOpenAI exposes the model name
    model: config['model'] ?? 'gpt-4o',
    _config: config,
  }));
  return { MockChatOpenAI };
});

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: MockChatOpenAI,
  // Keep OpenAIEmbeddings available in case other modules pull it from the same mock
  OpenAIEmbeddings: vi.fn(),
}));

// ────────────────────────────────────────────────────────────────────────────

import { OpenAILLMProvider } from '../implementations/llm/openai.provider.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OpenAILLMProvider construction', () => {
  it('passes apiKey to ChatOpenAI constructor', () => {
    new OpenAILLMProvider({ apiKey: 'sk-test-123' });
    expect(MockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-test-123' }),
    );
  });

  it('uses default model "gpt-4o" when model is not provided', () => {
    new OpenAILLMProvider({ apiKey: 'sk-test' });
    expect(MockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o' }),
    );
  });

  it('passes custom model to ChatOpenAI constructor', () => {
    new OpenAILLMProvider({ apiKey: 'sk-test', model: 'gpt-4-turbo' });
    expect(MockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4-turbo' }),
    );
  });

  it('uses default temperature 0.7 when temperature is not provided', () => {
    new OpenAILLMProvider({ apiKey: 'sk-test' });
    expect(MockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
    );
  });

  it('passes custom temperature to ChatOpenAI constructor', () => {
    new OpenAILLMProvider({ apiKey: 'sk-test', temperature: 0 });
    expect(MockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
    );
  });
});

describe('OpenAILLMProvider.getModel()', () => {
  it('returns the ChatOpenAI instance created during construction', () => {
    const provider = new OpenAILLMProvider({ apiKey: 'sk-test' });
    const model = provider.getModel();
    expect(model).toBeDefined();
    // The mock instance should have the model property we set
    expect((model as unknown as { model: string }).model).toBe('gpt-4o');
  });
});

describe('OpenAILLMProvider.getModelName()', () => {
  it('returns the default model name "gpt-4o"', () => {
    const provider = new OpenAILLMProvider({ apiKey: 'sk-test' });
    expect(provider.getModelName()).toBe('gpt-4o');
  });

  it('returns the configured custom model name', () => {
    const provider = new OpenAILLMProvider({ apiKey: 'sk-test', model: 'gpt-4-turbo' });
    expect(provider.getModelName()).toBe('gpt-4-turbo');
  });

  it('getModel() and getModelName() are consistent', () => {
    const provider = new OpenAILLMProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini' });
    const modelInstance = provider.getModel() as unknown as { model: string };
    expect(provider.getModelName()).toBe(modelInstance.model);
  });
});
