import { apiFetch, API_BASE_URL } from '../client';
import { useAuthStore } from '../../stores/auth.store';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { refreshSession: jest.fn() } },
}));

const refreshSession = supabase.auth.refreshSession as jest.Mock;

function mockResponse(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
    refreshSession.mockReset();
    global.fetch = jest.fn().mockResolvedValue(mockResponse(200)) as unknown as typeof fetch;
  });

  it('attaches the Bearer token from the auth store', async () => {
    useAuthStore.setState({ accessToken: 'tok-123' });
    await apiFetch('/courses');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/courses`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('omits the Authorization header when there is no token', async () => {
    await apiFetch('/courses');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('on 401 refreshes the session, persists it, and retries with the new token', async () => {
    useAuthStore.setState({ accessToken: 'stale' });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(200));
    refreshSession.mockResolvedValue({
      data: { session: { access_token: 'fresh', refresh_token: 'fresh-refresh' } },
      error: null,
    });

    const res = await apiFetch('/courses');

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('fresh');
    expect(useAuthStore.getState().refreshToken).toBe('fresh-refresh');
    const retryInit = (global.fetch as jest.Mock).mock.calls[1][1];
    expect((retryInit.headers as Record<string, string>)['Authorization']).toBe('Bearer fresh');
    expect(res.status).toBe(200);
  });

  it('on 401 with a failed refresh clears the session', async () => {
    useAuthStore.setState({ accessToken: 'stale', refreshToken: 'r' });
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse(401));
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } });

    await apiFetch('/courses');

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
