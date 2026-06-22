import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
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
