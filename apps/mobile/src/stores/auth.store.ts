import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '@autodidact/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAnonymous: boolean;
  setSession: (accessToken: string, refreshToken: string, isAnonymous?: boolean) => void;
  setUser: (user: UserProfile) => void;
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
      user: null,
      isAnonymous: false,
      setSession: (accessToken, refreshToken, isAnonymous = false) =>
        set({ accessToken, refreshToken, isAnonymous }),
      setUser: (user) => set({ user }),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null, isAnonymous: false }),
    }),
    {
      name: 'autodidact-auth',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
