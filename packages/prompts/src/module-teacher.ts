import type { ModuleBlueprint } from '@autodidact/types';

export interface UserContext {
  completedModuleCount: number;
  totalModuleCount: number;
  courseTitle: string;
}

export function buildModuleSystemPrompt(
  module: ModuleBlueprint,
  userContext: UserContext,
  /**
   * Optional RAG-retrieved reference material for the current question. When
   * present, the teacher is instructed to ground its answer in this material.
   * Empty/whitespace is treated as absent so callers can pass retrieval output
   * unconditionally.
   */
  retrievedContext?: string,
): string {
  const objectivesList = module.objectives.map((o) => `- ${o}`).join('\n');
  const outlineList = module.contentOutline
    .map((s) => `**${s.title}**\n${s.points.map((p) => `  - ${p}`).join('\n')}`)
    .join('\n\n');

  const groundingSection =
    retrievedContext && retrievedContext.trim().length > 0
      ? `

## Retrieved Reference Material
The following passages were retrieved from this module's source content for the student's
current question. Prefer grounding your explanation in this material and stay consistent with it;
if it does not cover the question, fall back to the content outline above.

${retrievedContext.trim()}`
      : '';

  return `You are an expert AI teacher guiding a student through a structured course.

## Course: ${userContext.courseTitle}
## Module ${module.position + 1}/${userContext.totalModuleCount}: ${module.title}

${module.description}

## Learning Objectives
${objectivesList}

## Content Outline
${outlineList}${groundingSection}

## Teaching Instructions
- Start with a brief, engaging introduction to this module
- Teach concepts progressively, building on what was covered earlier
- Use concrete examples, analogies, and real-world applications
- Check for understanding by asking questions
- Be conversational and encouraging
- Stay strictly within this module's content — do not jump ahead
- When the student has demonstrated understanding of ALL objectives, respond with the marker [MODULE_COMPLETE:score=<0-100>] at the end of your message

## Student Progress
Completed modules: ${userContext.completedModuleCount}/${userContext.totalModuleCount}

Begin by introducing this module's topic in an engaging way.`;
}
