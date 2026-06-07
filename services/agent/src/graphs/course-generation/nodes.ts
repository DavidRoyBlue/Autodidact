import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { CourseBlueprintSchema } from '@autodidact/schemas';
import {
  COURSE_GENERATION_SYSTEM_PROMPT,
  buildCourseGenerationPrompt,
} from '@autodidact/prompts';
import type { ILLMProvider } from '@autodidact/providers';
import type { CourseBlueprint } from '@autodidact/types';
import { invokeModel } from '../../llm/resilient-invoke.js';
import type { CourseGenerationStateType } from './state.js';

export function makeGenerateBlueprintNode(llmProvider: ILLMProvider) {
  return async (
    state: CourseGenerationStateType,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<CourseGenerationStateType>> => {
    const model = llmProvider.getModel();

    const messages = [
      new SystemMessage(COURSE_GENERATION_SYSTEM_PROMPT),
      new HumanMessage(
        buildCourseGenerationPrompt({
          topic: state.topic,
          difficulty: state.difficulty,
          moduleCount: state.moduleCount,
        }),
      ),
    ];

    const response = await invokeModel(model, messages, {
      signal: config?.signal,
      modelName: llmProvider.getModelName(),
      node: 'generateBlueprint',
    });
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      ?? content.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] ?? content : content;

    const parsed = CourseBlueprintSchema.safeParse(JSON.parse(jsonStr.trim()));

    if (parsed.success) {
      const blueprint: CourseBlueprint = {
        ...parsed.data,
        modules: parsed.data.modules.map(m => ({ ...m, id: m.id ?? crypto.randomUUID() })),
      };
      return { blueprint, retryCount: state.retryCount };
    }

    return {
      blueprint: null,
      retryCount: state.retryCount + 1,
      error: parsed.error.message,
    };
  };
}
