import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock @langchain/anthropic before importing the provider under test.
// ────────────────────────────────────────────────────────────────────────────

const { MockChatAnthropic } = vi.hoisted(() => {
  const MockChatAnthropic = vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    model: config['model'] ?? 'claude-opus-4-7',
    _config: config,
  }));
  return { MockChatAnthropic };
});

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: MockChatAnthropic,
}));

// ────────────────────────────────────────────────────────────────────────────

import { AnthropicLLMProvider } from '../implementations/llm/anthropic.provider.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AnthropicLLMProvider construction', () => {
  it('passes apiKey to ChatAnthropic constructor', () => {
    new AnthropicLLMProvider({ apiKey: 'ant-test-key' });
    expect(MockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'ant-test-key' }),
    );
  });

  it('uses default model "claude-opus-4-7" when model is not provided', () => {
    new AnthropicLLMProvider({ apiKey: 'ant-test-key' });
    expect(MockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-7' }),
    );
  });

  it('passes custom model to ChatAnthropic constructor', () => {
    new AnthropicLLMProvider({ apiKey: 'ant-test-key', model: 'claude-3-5-sonnet' });
    expect(MockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-3-5-sonnet' }),
    );
  });

  it('uses default temperature 0.7 when temperature is not provided', () => {
    new AnthropicLLMProvider({ apiKey: 'ant-test-key' });
    expect(MockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
    );
  });

  it('passes custom temperature to ChatAnthropic constructor', () => {
    new AnthropicLLMProvider({ apiKey: 'ant-test-key', temperature: 0 });
    expect(MockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
    );
  });
});

describe('AnthropicLLMProvider.getModel()', () => {
  it('returns the ChatAnthropic instance created during construction', () => {
    const provider = new AnthropicLLMProvider({ apiKey: 'ant-test-key' });
    const model = provider.getModel();
    expect(model).toBeDefined();
    expect((model as unknown as { model: string }).model).toBe('claude-opus-4-7');
  });
});

describe('AnthropicLLMProvider.getModelName()', () => {
  it('returns the default model name "claude-opus-4-7"', () => {
    const provider = new AnthropicLLMProvider({ apiKey: 'ant-test-key' });
    expect(provider.getModelName()).toBe('claude-opus-4-7');
  });

  it('returns the configured custom model name', () => {
    const provider = new AnthropicLLMProvider({ apiKey: 'ant-test-key', model: 'claude-3-haiku' });
    expect(provider.getModelName()).toBe('claude-3-haiku');
  });

  it('getModel() and getModelName() are consistent', () => {
    const provider = new AnthropicLLMProvider({ apiKey: 'ant-test-key', model: 'claude-3-5-sonnet' });
    const modelInstance = provider.getModel() as unknown as { model: string };
    expect(provider.getModelName()).toBe(modelInstance.model);
  });
});
