import { View } from 'react-native';
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

function InlineContent({ segments, textClass }: { segments: Segment[]; textClass?: string }) {
  return (
    <AppText variant="body" className={textClass}>
      {segments.map((seg, i) => {
        if (seg.type === 'bold') {
          return <AppText key={i} weight="bold" className={textClass}>{seg.content}</AppText>;
        }
        if (seg.type === 'code') {
          return (
            <AppText key={i} className="font-mono rounded-sm bg-muted px-1">
              {` ${seg.content} `}
            </AppText>
          );
        }
        return <AppText key={i} className={textClass}>{seg.content}</AppText>;
      })}
    </AppText>
  );
}

function MarkdownContent({ content, textClass }: { content: string; textClass?: string }) {
  const segments = parseMarkdown(content);

  if (!segments.some((s) => s.type === 'codeblock')) {
    return <InlineContent segments={segments} textClass={textClass} />;
  }

  const nodes: React.ReactNode[] = [];
  let buf: Segment[] = [];
  let k = 0;

  const flush = () => {
    if (buf.length > 0) {
      nodes.push(<InlineContent key={k++} segments={buf} textClass={textClass} />);
      buf = [];
    }
  };

  for (const seg of segments) {
    if (seg.type === 'codeblock') {
      flush();
      nodes.push(
        <View key={k++} className="mt-2 rounded-sm bg-muted p-3">
          <AppText variant="body" size="sm" className="font-mono">{seg.content.trim()}</AppText>
        </View>,
      );
    } else {
      buf.push(seg);
    }
  }
  flush();

  return <View className="gap-1">{nodes}</View>;
}

export function ChatBubble({ message, isStreaming = false }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const timeLabel = !isStreaming && message.createdAt ? formatTime(message.createdAt) : '';
  const bubbleTextClass = isUser ? 'text-primary-foreground' : 'text-foreground';

  return (
    <View className={`max-w-[85%] gap-1 ${isUser ? 'self-end' : 'self-start'}`}>
      <View
        className={[
          'rounded-lg p-3',
          isUser ? 'bg-user-bubble rounded-br-sm' : 'bg-assistant-bubble rounded-bl-sm border border-border',
        ].join(' ')}
      >
        <MarkdownContent content={message.content} textClass={bubbleTextClass} />
        {isStreaming && <AppText variant="body" className="text-primary">▋</AppText>}
      </View>
      {timeLabel ? (
        <AppText variant="caption" className={`px-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {timeLabel}
        </AppText>
      ) : null}
    </View>
  );
}
