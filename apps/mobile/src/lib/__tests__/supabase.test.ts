jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: 'https://test.supabase.co',
        supabasePublishableKey: 'test-key',
      },
    },
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));

import * as SecureStore from 'expo-secure-store';
import { pkceStorage } from '../supabase';

describe('pkceStorage adapter (supabase-js PKCE/flow state)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getItem delegates to SecureStore.getItemAsync', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('v');
    await expect(pkceStorage.getItem('k')).resolves.toBe('v');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('k');
  });

  it('setItem delegates to SecureStore.setItemAsync', async () => {
    await pkceStorage.setItem('k', 'v');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('k', 'v');
  });

  it('removeItem delegates to SecureStore.deleteItemAsync', async () => {
    await pkceStorage.removeItem('k');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('k');
  });
});
