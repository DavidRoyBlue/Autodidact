import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderWithProviders } from '@/test-utils/render';

const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => mockUpdateUser(...a) } },
}));

const mockLinkWithGoogle = jest.fn();
const mockLinkWithFacebook = jest.fn();
jest.mock('@/lib/social-auth', () => ({
  linkWithGoogle: (...a: unknown[]) => mockLinkWithGoogle(...a),
  linkWithFacebook: (...a: unknown[]) => mockLinkWithFacebook(...a),
}));

import { UpgradeAccountCard } from '../UpgradeAccountCard';
import { useAuthStore } from '@/stores/auth.store';

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().clearSession();
});

test('renders nothing for a non-anonymous user', () => {
  useAuthStore.getState().setSession('at', 'rt', false);
  const { queryByText } = renderWithProviders(<UpgradeAccountCard />);
  expect(queryByText('Save your account')).toBeNull();
});

test('confirmation OFF: server returns non-anonymous → clears guest state', async () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  mockUpdateUser.mockResolvedValue({ data: { user: { id: 'u1', is_anonymous: false } }, error: null });
  const { getByText, getByPlaceholderText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.changeText(getByPlaceholderText('you@example.com'), 'new@user.dev');
  fireEvent.changeText(getByPlaceholderText('Choose a password'), 'Secret123!');
  fireEvent.press(getByText('Save your account'));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@user.dev', password: 'Secret123!' }));
  await waitFor(() => expect(useAuthStore.getState().isAnonymous).toBe(false));
});

test('confirmation PENDING: server still anonymous w/ new_email → stays a guest', async () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  // Email confirmation required: email is pending, user is still anonymous server-side.
  mockUpdateUser.mockResolvedValue({
    data: { user: { id: 'u1', is_anonymous: true, new_email: 'new@user.dev' } },
    error: null,
  });
  const { getByText, getByPlaceholderText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.changeText(getByPlaceholderText('you@example.com'), 'new@user.dev');
  fireEvent.changeText(getByPlaceholderText('Choose a password'), 'Secret123!');
  fireEvent.press(getByText('Save your account'));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
  // Must NOT optimistically clear guest state — the upgrade isn't complete until confirmed.
  await waitFor(() => expect(useAuthStore.getState().isAnonymous).toBe(true));
});

test('shows Google/Facebook upgrade buttons for an anonymous user', () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  const { getByText } = renderWithProviders(<UpgradeAccountCard />);
  expect(getByText('Continue with Google')).toBeTruthy();
  expect(getByText('Continue with Facebook')).toBeTruthy();
});

test('Continue with Google links the identity and records the session', async () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  mockLinkWithGoogle.mockResolvedValue({ accessToken: 'nat', refreshToken: 'nrt' });
  const { getByText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.press(getByText('Continue with Google'));
  await waitFor(() => expect(mockLinkWithGoogle).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('nat'));
});

test('Continue with Facebook links the identity and records the session', async () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  mockLinkWithFacebook.mockResolvedValue({ accessToken: 'fnat', refreshToken: 'fnrt' });
  const { getByText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.press(getByText('Continue with Facebook'));
  await waitFor(() => expect(mockLinkWithFacebook).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('fnat'));
});

test('Google link null (dismissed) → no session change', async () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  mockLinkWithGoogle.mockResolvedValue(null);
  const { getByText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.press(getByText('Continue with Google'));
  await waitFor(() => expect(mockLinkWithGoogle).toHaveBeenCalledTimes(1));
  expect(useAuthStore.getState().accessToken).toBe('at');
});

test('renders nothing for a non-anonymous user (social buttons absent)', () => {
  useAuthStore.getState().setSession('at', 'rt', false);
  const { queryByText } = renderWithProviders(<UpgradeAccountCard />);
  expect(queryByText('Continue with Google')).toBeNull();
  expect(queryByText('Continue with Facebook')).toBeNull();
});

test('Google link error → shows Alert, session unchanged', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');

  useAuthStore.getState().setSession('at', 'rt', true);
  mockLinkWithGoogle.mockRejectedValue(new Error('link failed'));
  const { getByText } = renderWithProviders(<UpgradeAccountCard />);

  fireEvent.press(getByText('Continue with Google'));

  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Google link failed', 'link failed'));
  expect(useAuthStore.getState().accessToken).toBe('at');

  alertSpy.mockRestore();
});
