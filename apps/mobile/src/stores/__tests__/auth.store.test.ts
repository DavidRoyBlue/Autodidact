jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { useAuthStore } from '../auth.store';

const reset = () =>
  useAuthStore.setState({ accessToken: null, refreshToken: null, email: null, isAnonymous: false });

describe('useAuthStore', () => {
  beforeEach(reset);

  it('initialises with a null session', () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.email).toBeNull();
  });

  it('setSession stores both tokens', () => {
    useAuthStore.getState().setSession('access-1', 'refresh-1');
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('access-1');
    expect(s.refreshToken).toBe('refresh-1');
  });

  it('setEmail stores the email without touching tokens', () => {
    useAuthStore.getState().setSession('a', 'r');
    useAuthStore.getState().setEmail('u@test.com');
    const s = useAuthStore.getState();
    expect(s.email).toBe('u@test.com');
    expect(s.accessToken).toBe('a');
  });

  it('clearSession wipes tokens and email', () => {
    const store = useAuthStore.getState();
    store.setSession('a', 'r');
    store.setEmail('u@test.com');
    store.clearSession();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.email).toBeNull();
  });

  it('setSession defaults isAnonymous to false', () => {
    useAuthStore.getState().setSession('a', 'r');
    expect(useAuthStore.getState().isAnonymous).toBe(false);
    expect(useAuthStore.getState().accessToken).toBe('a');
  });

  it('setSession records an anonymous session', () => {
    useAuthStore.getState().setSession('a', 'r', true);
    expect(useAuthStore.getState().isAnonymous).toBe(true);
  });

  it('clearSession resets isAnonymous', () => {
    useAuthStore.getState().setSession('a', 'r', true);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().isAnonymous).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});

describe('auth.store — hasSeenOnboarding', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok', refreshToken: 'ref', email: null, isAnonymous: false, hasSeenOnboarding: false,
    });
  });

  it('defaults to false', () => {
    expect(useAuthStore.getState().hasSeenOnboarding).toBe(false);
  });

  it('setHasSeenOnboarding flips the flag', () => {
    useAuthStore.getState().setHasSeenOnboarding(true);
    expect(useAuthStore.getState().hasSeenOnboarding).toBe(true);
  });

  it('clearSession does NOT reset hasSeenOnboarding (device-local UX, not session state)', () => {
    useAuthStore.getState().setHasSeenOnboarding(true);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().hasSeenOnboarding).toBe(true);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
