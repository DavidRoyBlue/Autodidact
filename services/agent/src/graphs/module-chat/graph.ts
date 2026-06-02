import { StateGraph, START, END } from '@langchain/langgraph';
import type { Logger } from '@autodidact/observability';
import { ModuleChatState } from './state.js';
import { makeTeacherNode, makeEvaluationNode } from './nodes.js';
import { instrumentNode } from '../instrumentation.js';
import type { ContentRetriever } from '../../rag/retriever.js';
import type { ILLMProvider, ICheckpointerProvider } from '@autodidact/providers';

export function buildModuleChatGraph(
  llmProvider: ILLMProvider,
  checkpointerProvider: ICheckpointerProvider,
  logger?: Logger,
  retriever?: ContentRetriever,
) {
  const teacherNode = instrumentNode('teacher', makeTeacherNode(llmProvider, retriever), logger);
  const evaluationNode = instrumentNode('evaluator', makeEvaluationNode(llmProvider), logger);
  const checkpointer = checkpointerProvider.getCheckpointer();

  const graph = new StateGraph(ModuleChatState)
    .addNode('teacher', teacherNode)
    .addNode('evaluator', evaluationNode)
    .addEdge(START, 'teacher')
    .addConditionalEdges('teacher', (state) =>
      state.completionSignaled ? 'evaluator' : END,
    )
    .addEdge('evaluator', END);

  return graph.compile({ checkpointer });
}
