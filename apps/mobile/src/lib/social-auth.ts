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

// Shared: complete a web OAuth/link flow opened in the in-app browser. The redirect
// (with ?code=) is RETURNED as result.url on success — NOT delivered via a Linking listener.
async function exchangeViaWebBrowser(authUrl: string, redirectTo: string): Promise<SocialSession | null> {
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== 'success') return null; // cancel / dismiss
  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== 'string') throw new Error('OAuth callback returned no code');
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token || !session?.refresh_token) throw new Error('No session from OAuth flow');
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
  return exchangeViaWebBrowser(data.url, redirectTo);
}

/** Link a Google identity to the current account (web OAuth). Returns null if dismissed; throws on failure. */
export async function linkWithGoogle(): Promise<SocialSession | null> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Google link returned no authorization URL');
  return exchangeViaWebBrowser(data.url, redirectTo);
}

/** Link a Facebook identity to the current account (web OAuth). Returns null if dismissed; throws on failure. */
export async function linkWithFacebook(): Promise<SocialSession | null> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'facebook',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Facebook link returned no authorization URL');
  return exchangeViaWebBrowser(data.url, redirectTo);
}
