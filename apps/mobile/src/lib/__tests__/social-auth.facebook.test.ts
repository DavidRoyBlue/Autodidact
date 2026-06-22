const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockOpenAuthSessionAsync = jest.fn();
const mockCreateURL = jest.fn(() => 'autodidact://auth-callback');
const mockParse = jest.fn();
const mockConfigure = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...a: unknown[]) => mockConfigure(...a),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
  isSuccessResponse: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      exchangeCodeForSession: (...a: unknown[]) => mockExchangeCodeForSession(...a),
    },
  },
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSessionAsync(...a),
}));
jest.mock('expo-linking', () => ({
  // @ts-ignore - mock type mismatch
  createURL: (...a: unknown[]) => mockCreateURL(...a),
  // @ts-ignore - mock type mismatch
  parse: (...a: unknown[]) => mockParse(...a),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));

import { signInWithFacebook } from '../social-auth';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateURL.mockReturnValue('autodidact://auth-callback');
});

test('signInWithFacebook opens the browser, exchanges the code from result.url, returns the session', async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://fb/oauth?x=1' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'autodidact://auth-callback?code=abc' });
  mockParse.mockReturnValue({ queryParams: { code: 'abc' } });
  mockExchangeCodeForSession.mockResolvedValue({
    data: { session: { access_token: 'at', refresh_token: 'rt' } },
    error: null,
  });

  const result = await signInWithFacebook();

  expect(mockSignInWithOAuth).toHaveBeenCalledWith({
    provider: 'facebook',
    options: { redirectTo: 'autodidact://auth-callback', skipBrowserRedirect: true },
  });
  expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith('https://fb/oauth?x=1', 'autodidact://auth-callback');
  expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
  expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
});

test('signInWithFacebook returns null when the user dismisses the browser', async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://fb/oauth' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
  await expect(signInWithFacebook()).resolves.toBeNull();
  expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
});

test('signInWithFacebook throws when signInWithOAuth errors', async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'oauth init failed' } });
  await expect(signInWithFacebook()).rejects.toThrow('oauth init failed');
});
