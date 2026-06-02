import { screen } from '@testing-library/react-native';
import type { ChatMessage } from '@autodidact/types';
import { renderWithProviders } from '../../../test-utils/render';
import { ChatBubble } from '../ChatBubble';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: 'Hello world',
    createdAt: '2026-01-01T10:00:00Z',
    ...overrides,
  } as ChatMessage;
}

describe('ChatBubble', () => {
  it('renders the message content', () => {
    renderWithProviders(<ChatBubble message={message({ content: 'Hello world' })} />);
    expect(screen.getByText('Hello world')).toBeOnTheScreen();
  });

  it('renders a user message', () => {
    renderWithProviders(<ChatBubble message={message({ role: 'user', content: 'My question' })} />);
    expect(screen.getByText('My question')).toBeOnTheScreen();
  });

  it('shows the streaming caret while streaming', () => {
    renderWithProviders(<ChatBubble message={message({ content: 'partial' })} isStreaming />);
    expect(screen.getByText('partial')).toBeOnTheScreen();
    expect(screen.getByText('▋')).toBeOnTheScreen();
  });
});
