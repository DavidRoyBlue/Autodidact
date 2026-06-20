import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils/render';

const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => mockUpdateUser(...a) } },
}));

import { UpgradeAccountCard } from '../UpgradeAccountCard';
import { useAuthStore } from '@/stores/auth.store';

beforeEach(() => {
  mockUpdateUser.mockReset();
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
