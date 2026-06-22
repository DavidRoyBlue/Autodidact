import { useEffect, type ReactNode } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { useUserCourses } from '@/api/courses';
import { supabase } from '@/lib/supabase';
import { configureGoogleSignin } from '@/lib/social-auth';
import config from '@/design/config';
import { ErrorBoundary, ToastProvider } from '@/components';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const { accessToken, refreshToken, setSession, clearSession } = useAuthStore();

  // Configure the native Google Sign-In SDK once at startup (before any sign-in).
  useEffect(() => {
    configureGoogleSignin();
  }, []);

  // On app launch, restore the Supabase in-memory session from our persisted tokens.
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

  return (
    <TamaguiProvider config={config} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AuthGate>
            <Slot />
          </AuthGate>
        </ErrorBoundary>
        <ToastProvider />
      </QueryClientProvider>
    </TamaguiProvider>
  );
}

// AuthGate owns the canonical auth-flow precedence (Spec 2, D8) AND the Spec 3 (D10)
// first-launch onboarding deep-link. It lives inside QueryClientProvider so it can read
// the courses query; keeping it in this file preserves the single-redirect-owner invariant
// (apps/mobile/CLAUDE.md).
function AuthGate({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasSeenOnboarding = useAuthStore((s) => s.hasSeenOnboarding);
  const setHasSeenOnboarding = useAuthStore((s) => s.setHasSeenOnboarding);
  const router = useRouter();
  const segments = useSegments();
  const { data: courses } = useUserCourses();

  // 1. Canonical auth-flow precedence (Spec 2, D8 — this file is the single owner):
  //   a. Persisted session restored in RootLayout → autoRefresh keeps it alive.
  //   b. Session present (real OR anonymous) → route into (app).
  //   c. No session + __DEV__ + extra.devAutoLogin → DEV_AUTO_LOGIN slot (Spec 4).
  //      Spec 4 implements this slot; it takes precedence over the guest path in
  //      dev so the two never both fire. Intentionally NOT implemented yet.
  //   d. Otherwise → auth UI ((auth) group), which offers real sign-in/up AND
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

  // 2. First-launch deep-link (D10): once authenticated and inside (app), if onboarding has
  // never been shown, jump straight into the onboarding course's detail screen.
  useEffect(() => {
    if (!accessToken || hasSeenOnboarding) return;
    if (segments[0] === '(auth)') return;
    if (!courses) return; // wait for GET /courses (auto-enroll runs server-side on that request)
    const onboarding = courses.find((c) => c.isOnboarding);
    if (!onboarding) return; // no onboarding course found (e.g. seed missing) — retry on the next launch
    setHasSeenOnboarding(true);
    router.replace(`/(app)/courses/${onboarding.id}`);
  }, [accessToken, hasSeenOnboarding, courses, segments, router, setHasSeenOnboarding]);

  return <>{children}</>;
}
