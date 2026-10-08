import { useMutation } from '@tanstack/react-query';
import type { ChatMessage } from '@autodidact/types';
import { apiFetch } from './client';

/** Opens the learner's chat on a module, resuming their latest session. */
export function useStartChatSession() {
  return useMutation({
    mutationFn: async ({ courseId, moduleId }: { courseId: string; moduleId: string }) => {
      const res = await apiFetch('/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ moduleId, courseId }),
      });
      if (!res.ok) throw new Error('Failed to open the lesson');
      return res.json() as Promise<{ id: string; messages: ChatMessage[] }>;
    },
  });
}
