import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

export interface SocialSession {
  accessToken: string;
  refreshToken: string;
}

/** Call once at app startup (app/_layout.tsx), before any sign-in. */
export function configureGoogleSignin(): void {
  GoogleSignin.configure({ webClientId: extra?.['googleWebClientId'] ?? '' });
}

/** Native Google sign-in. Returns null if the user cancels; throws on failure. */
export async function signInWithGoogle(): Promise<SocialSession | null> {
  await GoogleSignin.hasPlayServices(); // Android guard — clean error on no-Play-Services
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null; // cancelled / dismissed
  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google sign-in returned no ID token');
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token || !session?.refresh_token) throw new Error('No session from Google sign-in');
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

/** Facebook web OAuth (PKCE). Returns null if the user dismisses; throws on failure. */
export async function signInWithFacebook(): Promise<SocialSession | null> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Facebook sign-in returned no authorization URL');

  // openAuthSessionAsync RETURNS the redirect to its caller (result.url on success).
  // Do NOT use Linking.addEventListener / getInitialURL — no global listener is involved.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // cancel / dismiss

  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== 'string') throw new Error('Facebook callback returned no code');

  const { data: sess, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw new Error(exErr.message);
  const session = sess.session;
  if (!session?.access_token || !session?.refresh_token) throw new Error('No session from Facebook sign-in');
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}
