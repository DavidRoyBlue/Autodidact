import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { buildModuleSystemPrompt, COMPLETION_EVALUATOR_SYSTEM_PROMPT, buildCompletionEvaluatorPrompt } from '@autodidact/prompts';
import type { ILLMProvider } from '@autodidact/providers';
import { invokeModel } from '../../llm/resilient-invoke.js';
import type { ModuleChatStateType } from './state.js';

export function makeTeacherNode(llmProvider: ILLMProvider) {
  return async (
    state: ModuleChatStateType,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<ModuleChatStateType>> => {
    const model = llmProvider.getModel();
    const systemPrompt = buildModuleSystemPrompt(state.moduleBlueprint, state.courseProgress);

    const response = await invokeModel(
      model,
      [new SystemMessage(systemPrompt), ...state.messages],
      { signal: config?.signal, modelName: llmProvider.getModelName(), node: 'teacher' },
    );

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    // Check for completion signal
    const completionMatch = content.match(/\[MODULE_COMPLETE:score=(\d+)\]/);
    if (completionMatch) {
      const score = parseInt(completionMatch[1] ?? '0', 10);
      const cleanContent = content.replace(/\[MODULE_COMPLETE:score=\d+\]/, '').trim();
      return {
        messages: [new AIMessage(cleanContent)],
        completionSignaled: true,
        completionScore: score,
        teachingPhase: 'evaluation',
      };
    }

    return {
      messages: [new AIMessage(content)],
      completionSignaled: false,
    };
  };
}

export function makeEvaluationNode(llmProvider: ILLMProvider) {
  return async (
    state: ModuleChatStateType,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<ModuleChatStateType>> => {
    const model = llmProvider.getModel();

    const response = await invokeModel(
      model,
      [
        new SystemMessage(COMPLETION_EVALUATOR_SYSTEM_PROMPT),
        ...state.messages,
        new HumanMessage(buildCompletionEvaluatorPrompt(state.moduleBlueprint.objectives)),
      ],
      { signal: config?.signal, modelName: llmProvider.getModelName(), node: 'evaluator' },
    );

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    try {
      const result = JSON.parse(content) as { completed: boolean; score: number; feedback: string };
      return { completionScore: result.score };
    } catch {
      return { completionScore: state.completionScore ?? 75 };
    }
  };
}
