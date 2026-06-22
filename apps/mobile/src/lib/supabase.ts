import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

// supabase-js needs durable storage for its own PKCE/flow state (the code-verifier
// must survive the Facebook OAuth browser round-trip). This is NOT the app session —
// the auth store still owns that (persistSession stays false). See apps/mobile CLAUDE.md.
export const pkceStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  extra?.['supabaseUrl'] ?? '',
  extra?.['supabasePublishableKey'] ?? '',
  {
    auth: {
      autoRefreshToken: true,
      // Session persistence is handled by our auth store via expo-secure-store.
      persistSession: false,
      detectSessionInUrl: false,
      // PKCE for the Facebook web OAuth flow; the verifier persists via pkceStorage.
      flowType: 'pkce',
      storage: pkceStorage,
    },
  },
);
