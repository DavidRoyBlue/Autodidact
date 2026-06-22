const mockLinkIdentity = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockOpenAuthSessionAsync = jest.fn();
const mockCreateURL = jest.fn(() => 'autodidact://auth-callback');
const mockParse = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: {
    linkIdentity: (...a: unknown[]) => mockLinkIdentity(...a),
    exchangeCodeForSession: (...a: unknown[]) => mockExchangeCodeForSession(...a),
  } },
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSessionAsync(...a) }));
jest.mock('expo-linking', () => ({
  // @ts-expect-error - mock type mismatch
  createURL: (...a: unknown[]) => mockCreateURL(...a),
  parse: (...a: unknown[]) => mockParse(...a),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {}, isSuccessResponse: jest.fn() }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));

import { linkWithGoogle, linkWithFacebook } from '../social-auth';

beforeEach(() => { jest.clearAllMocks(); mockCreateURL.mockReturnValue('autodidact://auth-callback'); });

test('linkWithGoogle runs linkIdentity then exchanges the code from result.url', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: 'https://supabase/oauth?p=google' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'autodidact://auth-callback?code=abc' });
  mockParse.mockReturnValue({ queryParams: { code: 'abc' } });
  mockExchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null });

  const result = await linkWithGoogle();
  expect(mockLinkIdentity).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'autodidact://auth-callback', skipBrowserRedirect: true } });
  expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
  expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
});

test('linkWithFacebook calls linkIdentity with the facebook provider', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: 'https://supabase/oauth?p=fb' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'autodidact://auth-callback?code=xyz' });
  mockParse.mockReturnValue({ queryParams: { code: 'xyz' } });
  mockExchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: 'a2', refresh_token: 'r2' } }, error: null });
  const result = await linkWithFacebook();
  expect(mockLinkIdentity).toHaveBeenCalledWith({ provider: 'facebook', options: { redirectTo: 'autodidact://auth-callback', skipBrowserRedirect: true } });
  expect(result).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
});

test('linkWithGoogle returns null when the user dismisses', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: 'https://supabase/oauth' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });
  await expect(linkWithGoogle()).resolves.toBeNull();
  expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
});

test('linkWithGoogle throws when linkIdentity errors', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: null }, error: { message: 'manual linking disabled' } });
  await expect(linkWithGoogle()).rejects.toThrow('manual linking disabled');
});
