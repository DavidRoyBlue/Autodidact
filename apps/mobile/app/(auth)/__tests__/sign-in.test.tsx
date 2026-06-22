import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils/render';

const mockSignInAnonymously = jest.fn();
const mockSignInWithPassword = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInAnonymously: (...a: unknown[]) => mockSignInAnonymously(...a),
      signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
    },
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

const mockSignInWithGoogle = jest.fn();
const mockSignInWithFacebook = jest.fn();
jest.mock('@/lib/social-auth', () => ({
  signInWithGoogle: (...a: unknown[]) => mockSignInWithGoogle(...a),
  signInWithFacebook: (...a: unknown[]) => mockSignInWithFacebook(...a),
}));

import SignInScreen from '../sign-in';
import { useAuthStore } from '@/stores/auth.store';

beforeEach(() => {
  mockSignInAnonymously.mockReset();
  mockSignInWithGoogle.mockReset();
  mockSignInWithFacebook.mockReset();
  useAuthStore.getState().clearSession();
});

test('Continue as guest signs in anonymously and records an anonymous session', async () => {
  mockSignInAnonymously.mockResolvedValue({
    data: { session: { access_token: 'at', refresh_token: 'rt', user: { is_anonymous: true } } },
    error: null,
  });
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue as guest'));
  await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().isAnonymous).toBe(true));
  expect(useAuthStore.getState().accessToken).toBe('at');
});

test('Continue with Google signs in and records a non-anonymous session', async () => {
  mockSignInWithGoogle.mockResolvedValue({ accessToken: 'gat', refreshToken: 'grt' });
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue with Google'));
  await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('gat'));
  expect(useAuthStore.getState().isAnonymous).toBe(false);
});

test('Continue with Facebook signs in', async () => {
  mockSignInWithFacebook.mockResolvedValue({ accessToken: 'fat', refreshToken: 'frt' });
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue with Facebook'));
  await waitFor(() => expect(mockSignInWithFacebook).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('fat'));
});

test('a cancelled Google sign-in (null) does not set a session and does not crash', async () => {
  mockSignInWithGoogle.mockResolvedValue(null);
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue with Google'));
  await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled());
  expect(useAuthStore.getState().accessToken).toBeNull();
});

test('email/password is hidden until "Use email instead" is pressed', () => {
  const { queryByPlaceholderText, getByText } = renderWithProviders(<SignInScreen />);
  expect(queryByPlaceholderText('you@example.com')).toBeNull();
  fireEvent.press(getByText('Use email instead'));
  expect(queryByPlaceholderText('you@example.com')).not.toBeNull();
});
