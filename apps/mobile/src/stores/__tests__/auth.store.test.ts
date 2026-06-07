jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { useAuthStore } from '../auth.store';

const reset = () =>
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });

describe('useAuthStore', () => {
  beforeEach(reset);

  it('initialises with a null session', () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
  });

  it('setSession stores both tokens', () => {
    useAuthStore.getState().setSession('access-1', 'refresh-1');
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('access-1');
    expect(s.refreshToken).toBe('refresh-1');
  });

  it('setUser stores the user profile without touching tokens', () => {
    useAuthStore.getState().setSession('a', 'r');
    useAuthStore.getState().setUser({ id: 'u1', email: 'u@test.com' } as never);
    const s = useAuthStore.getState();
    expect(s.user).toMatchObject({ id: 'u1' });
    expect(s.accessToken).toBe('a');
  });

  it('clearSession wipes tokens and user', () => {
    const store = useAuthStore.getState();
    store.setSession('a', 'r');
    store.setUser({ id: 'u1', email: 'u@test.com' } as never);
    store.clearSession();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
  });
});
