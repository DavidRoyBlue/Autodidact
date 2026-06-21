import '@/global.css';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import config from '@/design/config';
import { ErrorBoundary, ToastProvider } from '@/components';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const { accessToken, refreshToken, setSession, clearSession } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // On app launch, restore the Supabase in-memory session from our persisted tokens
  // so that autoRefreshToken can kick in without requiring a full sign-in.
  useEffect(() => {
    if (accessToken && refreshToken) {
      void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  }, []);

  // Keep our store in sync with Supabase's session events (token refresh, sign-out).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && session?.refresh_token) {
        setSession(session.access_token, session.refresh_token, session.user?.is_anonymous ?? false);
      } else {
        clearSession();
      }
    });
    return () => subscription.unsubscribe();
  }, [setSession, clearSession]);

  // Canonical auth-flow precedence (Spec 2, D8 — this file is the single owner):
  //   1. Persisted session restored above → autoRefresh keeps it alive.
  //   2. Session present (real OR anonymous) → route into (app).
  //   3. No session + __DEV__ + extra.devAutoLogin → DEV_AUTO_LOGIN slot (Spec 4).
  //      Spec 4 implements this slot; it takes precedence over the guest path in
  //      dev so the two never both fire. Intentionally NOT implemented in B1.
  //   4. Otherwise → auth UI ((auth) group), which offers real sign-in/up AND
  //      "Continue as guest" (signInAnonymously).
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!accessToken && !inAuthGroup) {
      // Spec 4 DEV_AUTO_LOGIN slot goes here (before the redirect to auth UI).
      router.replace('/(auth)/sign-in');
    } else if (accessToken && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [accessToken, segments, router]);

  return (
    <TamaguiProvider config={config} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <Slot />
        </ErrorBoundary>
        <ToastProvider />
      </QueryClientProvider>
    </TamaguiProvider>
  );
}
