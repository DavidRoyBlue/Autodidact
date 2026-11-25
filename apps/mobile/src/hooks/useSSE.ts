import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../stores/chat.store';
import { apiFetch } from '../api/client';
import { useToastStore } from '../stores/toast.store';

type StreamEvent = { type: string; content?: string; score?: number; error?: string };

// The reply arrives as SSE (`data: {...}` lines) that the API closes after
// `complete`. React Native's fetch has no streaming body and no `document`,
// which is what broke @microsoft/fetch-event-source here — so the body is
// read whole once the server closes it and the events are replayed in order.
function parseEvents(body: string): StreamEvent[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5)) as StreamEvent);
}

export function useSSE(sessionId: string, courseId: string) {
  const queryClient = useQueryClient();
  const { addUserMessage, appendStreamToken, finalizeStreamMessage } = useChatStore();

  const send = useCallback(
    async (content: string) => {
      const toast = useToastStore.getState().addToast;
      addUserMessage(content);
      try {
        const res = await apiFetch(`/chat/sessions/${sessionId}/stream`, {
          method: 'POST',
          body: JSON.stringify({ content, sessionId }),
        });
        if (!res.ok) throw new Error(`The teacher did not answer (HTTP ${res.status})`);
        for (const event of parseEvents(await res.text())) {
          if (event.type === 'token' && event.content) {
            appendStreamToken(event.content);
          } else if (event.type === 'module_complete') {
            // Progress drives the chat's completion card and every course list.
            void queryClient.invalidateQueries({ queryKey: ['progress', courseId] });
            void queryClient.invalidateQueries({ queryKey: ['courses'] });
          } else if (event.type === 'error') {
            toast(event.error ?? 'The teacher did not answer', 'error');
          }
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : 'The teacher did not answer', 'error');
      } finally {
        finalizeStreamMessage();
      }
    },
    [sessionId, courseId, addUserMessage, appendStreamToken, finalizeStreamMessage, queryClient],
  );

  return { send };
}
