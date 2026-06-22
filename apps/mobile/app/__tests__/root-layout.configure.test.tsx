const mockConfigureGoogleSignin = jest.fn();
jest.mock('@/lib/social-auth', () => ({ configureGoogleSignin: () => mockConfigureGoogleSignin() }));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { setSession: jest.fn(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) } },
}));
jest.mock('expo-router', () => ({
  Slot: () => null,
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => [],
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

import { renderWithProviders } from '@/test-utils/render';
import RootLayout from '../_layout';

test('configures Google Sign-In once at startup', () => {
  renderWithProviders(<RootLayout />);
  expect(mockConfigureGoogleSignin).toHaveBeenCalledTimes(1);
});
