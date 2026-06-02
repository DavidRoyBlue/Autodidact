import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { buildModuleSystemPrompt, COMPLETION_EVALUATOR_SYSTEM_PROMPT, buildCompletionEvaluatorPrompt } from '@autodidact/prompts';
import type { ILLMProvider } from '@autodidact/providers';
import { invokeModel } from '../../llm/resilient-invoke.js';
import { formatRetrievedContext, type ContentRetriever } from '../../rag/retriever.js';
import type { ModuleChatStateType } from './state.js';

const RETRIEVAL_TOP_K = 4;

/** Latest learner message — the retrieval query for RAG grounding. */
function latestUserText(messages: ModuleChatStateType['messages']): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m instanceof HumanMessage) {
      return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    }
  }
  return undefined;
}

/**
 * @param retriever Optional RAG retriever. When provided (and the module has an
 * id + a learner query), the teacher's prompt is grounded in retrieved source
 * content. Omitted (default) → identical behavior to the pre-RAG teacher.
 */
export function makeTeacherNode(llmProvider: ILLMProvider, retriever?: ContentRetriever) {
  return async (
    state: ModuleChatStateType,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<ModuleChatStateType>> => {
    const model = llmProvider.getModel();

    let retrievedContext: string | undefined;
    const moduleId = state.moduleBlueprint.id;
    const query = latestUserText(state.messages);
    if (retriever && moduleId && query) {
      try {
        const chunks = await retriever.retrieve(moduleId, query, RETRIEVAL_TOP_K);
        if (chunks.length > 0) retrievedContext = formatRetrievedContext(chunks);
      } catch {
        // Retrieval is best-effort grounding; never fail the turn on a RAG error.
        retrievedContext = undefined;
      }
    }

    const systemPrompt = buildModuleSystemPrompt(
      state.moduleBlueprint,
      state.courseProgress,
      retrievedContext,
    );

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
