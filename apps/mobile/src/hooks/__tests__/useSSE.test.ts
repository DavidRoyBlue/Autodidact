import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useSSE } from '../useSSE';
import { useChatStore } from '../../stores/chat.store';
import { useToastStore } from '../../stores/toast.store';

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { refreshSession: jest.fn() } } }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// The API's SSE body: one `data:` line per event, closed after `complete`.
function serverReplies(events: object[], status = 200) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  mockFetch.mockResolvedValue({ ok: status < 400, status, text: async () => body });
}

function render() {
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => useSSE('session-1', 'course-1'), { wrapper }), invalidate };
}

beforeEach(() => {
  useChatStore.getState().clearMessages();
  useToastStore.setState({ toasts: [] });
});

describe('useSSE event mapping (services/api chat.service contract)', () => {
  it('token + complete: appends the reply, ends streaming, no module toast', async () => {
    serverReplies([{ type: 'token', content: 'Welcome!' }, { type: 'complete' }]);
    const { result } = render();
    await act(() => result.current.send('hi'));

    const { messages, isStreaming } = useChatStore.getState();
    expect(messages.map((m) => [m.role, m.content])).toEqual([['user', 'hi'], ['assistant', 'Welcome!']]);
    expect(isStreaming).toBe(false);
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/chat\/sessions\/session-1\/stream$/);
  });

  it('module_complete: toasts and refreshes progress', async () => {
    serverReplies([{ type: 'token', content: 'Done.' }, { type: 'module_complete', score: 0.9 }, { type: 'complete' }]);
    const { result, invalidate } = render();
    await act(() => result.current.send('answer'));

    expect(useToastStore.getState().toasts.map((t) => t.variant)).toEqual(['success']);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['progress', 'course-1'] });
  });

  it('server error event: error toast, streaming ends, no assistant message', async () => {
    serverReplies([{ type: 'error', error: 'boom' }]);
    const { result } = render();
    await act(() => result.current.send('hi'));

    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useToastStore.getState().toasts).toMatchObject([{ message: 'boom', variant: 'error' }]);
  });

  it('HTTP failure: error toast with the status, streaming ends', async () => {
    serverReplies([], 502);
    const { result } = render();
    await act(() => result.current.send('hi'));

    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ variant: 'error' });
    expect(useToastStore.getState().toasts[0].message).toContain('502');
  });
});
