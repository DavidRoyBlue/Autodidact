import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCourse } from '@/api/courses';
import { useProgress } from '@/api/progress';
import { useStartChatSession } from '@/api/chat';
import { useSSE } from '@/hooks/useSSE';
import { useChatStore } from '@/stores/chat.store';
import {
  AppText, Input, IconButton, Button, Chip, ChatBubble, ModuleIntro, TypingIndicator, Icon, EmptyState,
} from '@/components';

const KICKOFF = "I'm ready. Let's start the lesson.";
// One tap for what a learner most often wants from a teacher mid-lesson.
const QUICK_REPLIES = ['Give me an example', 'Explain it another way', 'Quiz me'];

export default function ModuleChatScreen() {
  const { id: courseId, moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const { data: course } = useCourse(courseId);
  const { data: progress } = useProgress(courseId);
  const { messages, streamingContent, isStreaming, setMessages, clearMessages } = useChatStore();
  const { send } = useSSE(sessionId ?? '', courseId);
  const session = useStartChatSession();

  const open = () =>
    session.mutate(
      moduleId,
      {
        onSuccess: (s) => {
          setSessionId(s.id);
          setMessages(s.messages ?? []);
        },
      },
    );

  useEffect(() => {
    clearMessages();
    open();
    return () => clearMessages();
  }, [moduleId]);

  // A new reply opens at its first line; the learner's own message keeps the end in view.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const t = setTimeout(() => {
      if (last.role === 'assistant') {
        listRef.current?.scrollToIndex({ index: messages.length - 1, viewPosition: 0, viewOffset: 8 });
      } else {
        listRef.current?.scrollToEnd({ animated: true });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  const mod = course?.modules.find((m) => m.id === moduleId);
  const next = course?.modules.find((m) => m.position === (mod?.position ?? -2) + 1);
  const mine = progress?.find((p) => p.moduleId === moduleId);
  const done = mine?.status === 'completed';

  const submit = (text: string) => {
    if (!text.trim() || isStreaming || !sessionId) return;
    setInput('');
    void send(text.trim());
  };

  const items = [
    ...messages,
    ...(streamingContent
      ? [{ id: '__streaming__', role: 'assistant' as const, content: streamingContent, createdAt: '' }]
      : []),
  ];

  if (session.isError) {
    return (
      <View className="flex-1 bg-background p-4">
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't open this lesson"
          message="Check your connection, then try again."
          action={{ label: 'Try again', onPress: open }}
        />
      </View>
    );
  }

  return (
    // Android resizes the window for the keyboard itself (softwareKeyboardLayoutMode
    // "resize"); compensating again with "height" pushed the composer off screen.
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ headerTitle: mod ? `Module ${mod.position + 1} of ${course?.modules.length}` : '' }} />
      <View className="flex-1 bg-background">
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          data={items}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={mod ? <ModuleIntro module={mod} /> : null}
          renderItem={({ item }) => <ChatBubble message={item} isStreaming={item.id === '__streaming__'} />}
          ListFooterComponent={isStreaming && !streamingContent ? <TypingIndicator /> : null}
          onScrollToIndexFailed={({ index }) =>
            setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0 }), 200)
          }
        />

        {done && !isStreaming && (
          <View className="mx-4 mb-3 gap-3 rounded-lg border border-success bg-success/15 p-4">
            <View className="flex-row items-center gap-2">
              <Icon name="trophy" color="success" />
              <AppText weight="semibold" className="flex-1 text-success">
                Module complete{mine?.completionScore != null ? ` · score ${mine.completionScore}` : ''}
              </AppText>
            </View>
            {next ? (
              <Button icon="arrow-forward" onPress={() => router.replace(`/(app)/courses/${courseId}/modules/${next.id}/chat`)}>
                Next: {next.title}
              </Button>
            ) : (
              <Button variant="secondary" onPress={() => router.back()}>Back to the course</Button>
            )}
          </View>
        )}

        {!messages.length && !isStreaming && sessionId && (
          <View className="px-4 pb-3">
            <Button size="lg" icon="play" onPress={() => submit(KICKOFF)}>Start the lesson</Button>
          </View>
        )}

        {messages.length > 0 && !isStreaming && !input && (
          <ScrollView horizontal className="grow-0" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
            {QUICK_REPLIES.map((q) => (
              <Chip key={q} label={q} onPress={() => submit(q)} />
            ))}
          </ScrollView>
        )}

        <View className="flex-row items-end gap-2 border-t border-border bg-card p-3">
          {/* flex-1 on the wrapper: Input's own View sizes to its text and would push the send button off screen. */}
          <View className="flex-1">
            <Input
              className="max-h-32"
              placeholder={session.isPending ? 'Opening the lesson…' : 'Ask a question or answer your teacher'}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={4000}
              editable={!isStreaming && !!sessionId}
            />
          </View>
          <IconButton
            label="Send"
            icon={<Icon name="arrow-up" color="primaryForeground" />}
            loading={isStreaming}
            disabled={!input.trim() || !sessionId}
            onPress={() => submit(input)}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
