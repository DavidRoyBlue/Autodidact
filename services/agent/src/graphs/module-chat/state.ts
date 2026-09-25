import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import type { CourseModule } from '@autodidact/types';

export interface CourseProgressContext {
  courseTitle: string;
  completedModuleCount: number;
  totalModuleCount: number;
}

export const ModuleChatState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  moduleBlueprint: Annotation<CourseModule>(),
  courseProgress: Annotation<CourseProgressContext>(),
  completionSignaled: Annotation<boolean>(),
  completionScore: Annotation<number | null>(),
  teachingPhase: Annotation<'introduction' | 'teaching' | 'evaluation'>(),
});

export type ModuleChatStateType = typeof ModuleChatState.State;
