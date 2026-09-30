import { create } from 'zustand';
import type { ChatMessage } from '@autodidact/types';
import { randomUUID } from 'expo-crypto';

interface ChatState {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  addUserMessage: (content: string) => void;
  appendStreamToken: (token: string) => void;
  finalizeStreamMessage: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streamingContent: '',
  isStreaming: false,

  addUserMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: randomUUID(),
          role: 'user' as const,
          content,
          createdAt: new Date().toISOString(),
        },
      ],
      isStreaming: true,
      streamingContent: '',
    })),

  appendStreamToken: (token) =>
    set((state) => ({ streamingContent: state.streamingContent + token })),

  finalizeStreamMessage: () => {
    const { streamingContent, messages } = get();
    if (!streamingContent) {
      set({ isStreaming: false });
      return;
    }
    set({
      messages: [
        ...messages,
        {
          id: randomUUID(),
          role: 'assistant' as const,
          content: streamingContent,
          createdAt: new Date().toISOString(),
        },
      ],
      streamingContent: '',
      isStreaming: false,
    });
  },

  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [], streamingContent: '', isStreaming: false }),
}));
