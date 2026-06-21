import { useEffect, useRef, useState, useCallback } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useSSE } from '@/hooks/useSSE';
import { useChatStore } from '@/stores/chat.store';
import { Screen, AppText, Input, IconButton, ChatBubble } from '@/components';
import type { ChatMessage } from '@autodidact/types';

function UpArrow() {
  return <AppText variant="body" weight="bold" className="text-foreground">↑</AppText>;
}

export default function ModuleChatScreen() {
  const { id: courseId, moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const { messages, streamingContent, isStreaming, setMessages, clearMessages } = useChatStore();
  const { send } = useSSE(sessionId ?? '', courseId);

  const { mutateAsync: createSession, isPending: creatingSession } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ moduleId, courseId }),
      });
      if (!res.ok) throw new Error('Failed to create session');
      return res.json() as Promise<{ id: string; messages: ChatMessage[] }>;
    },
  });

  useEffect(() => {
    clearMessages();
    void (async () => {
      const session = await createSession();
      setSessionId(session.id);
      if (session.messages?.length) setMessages(session.messages);
    })();
    return () => clearMessages();
  }, [moduleId]);

  useEffect(() => {
    if (messages.length || streamingContent) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, streamingContent]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !sessionId) return;
    const text = input.trim();
    setInput('');
    await send(text);
  }, [input, isStreaming, sessionId, send]);

  const allItems = [
    ...messages,
    ...(streamingContent
      ? [{ id: '__streaming__', role: 'assistant' as const, content: streamingContent, createdAt: '' }]
      : []),
  ];

  if (creatingSession) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color="#6366f1" />
          <AppText variant="muted">Starting session...</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View className="flex-1 bg-background">
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          data={allItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatBubble message={item} isStreaming={item.id === '__streaming__'} />
          )}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        <View className="flex-row items-end gap-2 border-t border-border bg-card p-3">
          <Input
            className="flex-1"
            placeholder="Ask a question or respond..."
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={4000}
            editable={!isStreaming}
          />
          <IconButton
            icon={<UpArrow />}
            variant="primary"
            loading={isStreaming}
            disabled={!input.trim()}
            onPress={handleSend}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
