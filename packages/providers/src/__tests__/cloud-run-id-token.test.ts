import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getIdTokenClient, fetchIdToken } = vi.hoisted(() => ({
  getIdTokenClient: vi.fn(),
  fetchIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => ({ getIdTokenClient })),
}));

import { cloudRunAuthHeaders } from '../implementations/auth/cloud-run-id-token.js';

describe('cloudRunAuthHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchIdToken.mockResolvedValue('id-token-xyz');
    getIdTokenClient.mockResolvedValue({ idTokenProvider: { fetchIdToken } });
  });

  it('returns no auth header for http / loopback targets (no metadata server)', async () => {
    expect(await cloudRunAuthHeaders('http://localhost:3001')).toEqual({});
    expect(getIdTokenClient).not.toHaveBeenCalled();
  });

  it('attaches a Bearer ID token (audience = origin) for https Cloud Run targets', async () => {
    const headers = await cloudRunAuthHeaders(
      'https://autodidact-agent-abc-nn.a.run.app/embeddings/text',
    );
    expect(headers).toEqual({ Authorization: 'Bearer id-token-xyz' });
    expect(getIdTokenClient).toHaveBeenCalledWith(
      'https://autodidact-agent-abc-nn.a.run.app',
    );
    expect(fetchIdToken).toHaveBeenCalledWith(
      'https://autodidact-agent-abc-nn.a.run.app',
    );
  });
});
