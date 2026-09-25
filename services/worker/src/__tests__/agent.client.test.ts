import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentClient } from '../services/agent.client.js';

const BASE_URL = 'http://agent:3001';

function makeFetchResponse(ok: boolean, body: unknown, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('AgentClient', () => {
  let client: AgentClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new AgentClient(BASE_URL);
  });

  describe('generateEmbedding()', () => {
    const vector = [0.1, 0.2, 0.3];

    it('POSTs to /embeddings/text with the text payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeFetchResponse(true, { embedding: vector }));
      vi.stubGlobal('fetch', mockFetch);
      await client.generateEmbedding('Hello World');
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/embeddings/text`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'Hello World' }),
        }),
      );
    });

    it('returns data.embedding on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(true, { embedding: vector })));
      const result = await client.generateEmbedding('Python');
      expect(result).toEqual(vector);
    });

    it('throws with status when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(false, 'Error', 503)));
      await expect(client.generateEmbedding('Python')).rejects.toThrow('503');
    });

    it('throws a message containing the endpoint name on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(false, 'Error', 422)));
      await expect(client.generateEmbedding('Python')).rejects.toThrow(/embeddings\/text failed/);
    });
  });
});
