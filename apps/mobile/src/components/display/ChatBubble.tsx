import { YStack } from 'tamagui';
import { AppText } from '../typography/AppText';
import { parseMarkdown, type Segment } from '../../lib/markdown';
import type { ChatMessage } from '@autodidact/types';

type ChatBubbleProps = {
  message: ChatMessage;
  isStreaming?: boolean;
};

function formatTime(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function InlineContent({ segments }: { segments: Segment[] }) {
  return (
    <AppText variant="body">
      {segments.map((seg, i) => {
        if (seg.type === 'bold') {
          return <AppText key={i} weight="bold">{seg.content}</AppText>;
        }
        if (seg.type === 'code') {
          return (
            <AppText key={i} style={{ fontFamily: 'monospace' }} backgroundColor="$surfaceHover" borderRadius="$sm" paddingHorizontal="$1">
              {` ${seg.content} `}
            </AppText>
          );
        }
        return <AppText key={i}>{seg.content}</AppText>;
      })}
    </AppText>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const segments = parseMarkdown(content);

  // Fast path: no code blocks — render as a single inline block.
  if (!segments.some((s) => s.type === 'codeblock')) {
    return <InlineContent segments={segments} />;
  }

  // Mixed: group runs of inline segments, interleave with code block containers.
  const nodes: React.ReactNode[] = [];
  let buf: Segment[] = [];
  let k = 0;

  const flush = () => {
    if (buf.length > 0) {
      nodes.push(<InlineContent key={k++} segments={buf} />);
      buf = [];
    }
  };

  for (const seg of segments) {
    if (seg.type === 'codeblock') {
      flush();
      nodes.push(
        <YStack key={k++} backgroundColor="$surfaceHover" borderRadius="$sm" padding="$3" marginTop="$2">
          <AppText style={{ fontFamily: 'monospace' }} variant="body" size="sm">{seg.content.trim()}</AppText>
        </YStack>,
      );
    } else {
      buf.push(seg);
    }
  }
  flush();

  return <YStack gap="$1">{nodes}</YStack>;
}

export function ChatBubble({ message, isStreaming = false }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const timeLabel = !isStreaming && message.createdAt ? formatTime(message.createdAt) : '';

  return (
    <YStack alignSelf={isUser ? 'flex-end' : 'flex-start'} maxWidth="85%" gap="$1">
      <YStack
        backgroundColor={isUser ? '$userBubble' : '$assistantBubble'}
        borderRadius="$lg"
        borderBottomRightRadius={isUser ? '$sm' : '$lg'}
        borderBottomLeftRadius={isUser ? '$lg' : '$sm'}
        borderWidth={isUser ? 0 : 1}
        borderColor="$border"
        padding="$3"
      >
        <MarkdownContent content={message.content} />
        {isStreaming && (
          <AppText variant="body" color="$primary">▋</AppText>
        )}
      </YStack>
      {timeLabel ? (
        <AppText variant="caption" textAlign={isUser ? 'right' : 'left'} paddingHorizontal="$1">
          {timeLabel}
        </AppText>
      ) : null}
    </YStack>
  );
}
