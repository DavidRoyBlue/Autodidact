import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  isAnonymous: boolean;
  hasSeenOnboarding: boolean;
  setSession: (accessToken: string, refreshToken: string, isAnonymous?: boolean) => void;
  setEmail: (email: string | null) => void;
  setHasSeenOnboarding: (seen: boolean) => void;
  clearSession: () => void;
}

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      email: null,
      isAnonymous: false,
      hasSeenOnboarding: false,
      setSession: (accessToken, refreshToken, isAnonymous = false) =>
        set({ accessToken, refreshToken, isAnonymous }),
      setEmail: (email) => set({ email }),
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
      // hasSeenOnboarding intentionally survives sign-out — it is device-local UX, not session state.
      clearSession: () => set({ accessToken: null, refreshToken: null, email: null, isAnonymous: false }),
    }),
    {
      name: 'autodidact-auth',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
