import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import type { ILLMProvider, ICheckpointerProvider } from '@autodidact/providers';
import { buildModuleChatGraph } from '../graphs/module-chat/graph.js';
import type { ModuleBlueprint } from '@autodidact/types';
import type { CourseProgressContext } from '../graphs/module-chat/state.js';

const ModuleChatBodySchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  moduleBlueprint: z.unknown(),
  courseProgress: z.object({
    courseTitle: z.string(),
    completedModuleCount: z.number(),
    totalModuleCount: z.number(),
  }),
  isFirstMessage: z.boolean().optional().default(false),
});

export async function registerModuleChatRoute(
  app: FastifyInstance,
  llmProvider: ILLMProvider,
  checkpointerProvider: ICheckpointerProvider,
) {
  const graph = buildModuleChatGraph(llmProvider, checkpointerProvider);

  app.post('/module-chat/stream', async (request, reply) => {
    const body = ModuleChatBodySchema.parse(request.body);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const sendEvent = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const config = { configurable: { thread_id: body.sessionId } };

      const inputState: Record<string, unknown> = {
        messages: [new HumanMessage(body.message)],
        moduleBlueprint: body.moduleBlueprint as ModuleBlueprint,
        courseProgress: body.courseProgress as CourseProgressContext,
        completionSignaled: false,
        completionScore: null,
        teachingPhase: 'teaching',
      };

      // Stream using LangGraph's stream method
      const stream = await graph.stream(inputState, {
        ...config,
        streamMode: 'messages',
      });

      // streamMode: 'messages' emits tokens from EVERY LLM call in the graph,
      // including the evaluator node (which produces raw scoring JSON). Only the
      // teacher node's tokens are user-facing — filter on langgraph_node so the
      // evaluator's JSON never reaches the client.
      for await (const [message, meta] of stream) {
        if (meta?.langgraph_node !== 'teacher') continue;
        if (message?.content) {
          const content = typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);
          sendEvent({ type: 'token', content });
        }
      }

      // Get final state to check for completion
      const finalState = await graph.getState(config);
      if (finalState.values.completionSignaled) {
        sendEvent({
          type: 'module_complete',
          score: finalState.values.completionScore,
        });
      }

      sendEvent({ type: 'complete' });
    } catch (error) {
      sendEvent({ type: 'error', error: String(error) });
    } finally {
      reply.raw.end();
    }
  });
}
