import { StateGraph, START, END } from '@langchain/langgraph';
import type { Logger } from '@autodidact/observability';
import { CourseGenerationState } from './state.js';
import { makeGenerateBlueprintNode } from './nodes.js';
import { instrumentNode } from '../instrumentation.js';
import type { ILLMProvider } from '@autodidact/providers';

export function buildCourseGenerationGraph(llmProvider: ILLMProvider, logger?: Logger) {
  const generateBlueprint = instrumentNode(
    'generateBlueprint',
    makeGenerateBlueprintNode(llmProvider),
    logger,
  );

  const graph = new StateGraph(CourseGenerationState)
    .addNode('generateBlueprint', generateBlueprint)
    .addEdge(START, 'generateBlueprint')
    .addConditionalEdges('generateBlueprint', (state) => {
      if (state.blueprint) return END;
      if (state.retryCount < 3) return 'generateBlueprint';
      return END;
    });

  return graph.compile();
}
