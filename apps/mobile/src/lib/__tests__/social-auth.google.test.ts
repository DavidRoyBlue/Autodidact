const mockHasPlayServices = jest.fn();
const mockSignIn = jest.fn();
const mockConfigure = jest.fn();
const mockIsSuccessResponse = jest.fn();
const mockSignInWithIdToken = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...a: unknown[]) => mockConfigure(...a),
    hasPlayServices: (...a: unknown[]) => mockHasPlayServices(...a),
    signIn: (...a: unknown[]) => mockSignIn(...a),
  },
  isSuccessResponse: (...a: unknown[]) => mockIsSuccessResponse(...a),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a) } },
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { googleWebClientId: 'web-123' } } }));

import { configureGoogleSignin, signInWithGoogle } from '../social-auth';

beforeEach(() => {
  jest.clearAllMocks();
  mockHasPlayServices.mockResolvedValue(true);
});

test('configureGoogleSignin passes the web client id from extra', () => {
  configureGoogleSignin();
  expect(mockConfigure).toHaveBeenCalledWith({ webClientId: 'web-123' });
});

test('signInWithGoogle checks Play Services, exchanges the id token, returns the session', async () => {
  mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'idtok' } });
  mockIsSuccessResponse.mockReturnValue(true);
  mockSignInWithIdToken.mockResolvedValue({
    data: { session: { access_token: 'at', refresh_token: 'rt' } },
    error: null,
  });

  const result = await signInWithGoogle();

  expect(mockHasPlayServices).toHaveBeenCalled();
  expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'idtok' });
  expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
});

test('signInWithGoogle returns null when the user cancels', async () => {
  mockSignIn.mockResolvedValue({ type: 'cancelled' });
  mockIsSuccessResponse.mockReturnValue(false);
  await expect(signInWithGoogle()).resolves.toBeNull();
  expect(mockSignInWithIdToken).not.toHaveBeenCalled();
});

test('signInWithGoogle throws when the token exchange errors', async () => {
  mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'idtok' } });
  mockIsSuccessResponse.mockReturnValue(true);
  mockSignInWithIdToken.mockResolvedValue({ data: { session: null }, error: { message: 'bad token' } });
  await expect(signInWithGoogle()).rejects.toThrow('bad token');
});
