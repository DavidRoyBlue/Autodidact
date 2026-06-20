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

import SignInScreen from '../sign-in';
import { useAuthStore } from '@/stores/auth.store';

beforeEach(() => {
  mockSignInAnonymously.mockReset();
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
