import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import type { ILLMProvider } from '@autodidact/providers';
import type { Logger } from '@autodidact/observability';
import { buildCourseGenerationGraph } from '../graphs/course-generation/graph.js';
import type { DifficultyLevel } from '@autodidact/types';

const GenerateCourseBodySchema = z.object({
  courseId: z.string().uuid(),
  topic: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  moduleCount: z.number().int().min(1).max(20),
});

export async function registerGenerateCourseRoute(
  app: FastifyInstance,
  llmProvider: ILLMProvider,
  logger?: Logger,
) {
  const graph = buildCourseGenerationGraph(llmProvider, logger);

  app.post('/course/generate', async (request, reply) => {
    let body: z.infer<typeof GenerateCourseBodySchema>;
    try {
      body = GenerateCourseBodySchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Validation error', issues: err.issues });
      }
      throw err;
    }

    const result = await graph.invoke({
      topic: body.topic,
      difficulty: body.difficulty as DifficultyLevel,
      moduleCount: body.moduleCount,
      blueprint: null,
      retryCount: 0,
      error: null,
    });

    if (!result.blueprint) {
      return reply.status(500).send({ error: 'Failed to generate course blueprint', detail: result.error });
    }

    return reply.send({ blueprint: result.blueprint });
  });
}
