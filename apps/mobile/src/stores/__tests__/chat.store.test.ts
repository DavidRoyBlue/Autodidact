import { useChatStore } from '../chat.store';

const reset = () =>
  useChatStore.setState({ messages: [], streamingContent: '', isStreaming: false });

describe('useChatStore', () => {
  beforeEach(reset);

  it('addUserMessage appends a user message and starts streaming', () => {
    useChatStore.getState().addUserMessage('Hello');
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(s.isStreaming).toBe(true);
    expect(s.streamingContent).toBe('');
  });

  it('appendStreamToken accumulates streaming content', () => {
    const { appendStreamToken } = useChatStore.getState();
    appendStreamToken('Hel');
    appendStreamToken('lo');
    expect(useChatStore.getState().streamingContent).toBe('Hello');
  });

  it('finalizeStreamMessage commits the streamed content as an assistant message', () => {
    const store = useChatStore.getState();
    store.addUserMessage('Q');
    store.appendStreamToken('An');
    store.appendStreamToken('swer');
    store.finalizeStreamMessage();
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(2);
    expect(s.messages[1]).toMatchObject({ role: 'assistant', content: 'Answer' });
    expect(s.isStreaming).toBe(false);
    expect(s.streamingContent).toBe('');
  });

  it('finalizeStreamMessage with no streamed content adds no message and stops streaming', () => {
    const store = useChatStore.getState();
    store.addUserMessage('Q'); // isStreaming = true, streamingContent = ''
    store.finalizeStreamMessage();
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(1); // only the user message
    expect(s.isStreaming).toBe(false);
  });

  it('setMessages replaces the message list', () => {
    useChatStore.getState().setMessages([
      { id: 'a', role: 'assistant', content: 'hi', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0].id).toBe('a');
  });

  it('clearMessages resets messages and streaming state', () => {
    const store = useChatStore.getState();
    store.addUserMessage('Q');
    store.appendStreamToken('partial');
    store.clearMessages();
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.streamingContent).toBe('');
    expect(s.isStreaming).toBe(false);
  });
});
