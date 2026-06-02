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

  describe('generateCourse()', () => {
    const payload = { courseId: 'c-1', userId: 'u-1', topic: 'Python', difficulty: 'beginner' as const, moduleCount: 5 };
    const blueprint = {
      title: 'Python Basics',
      description: 'Learn Python.',
      difficulty: 'beginner',
      estimatedHours: 10,
      modules: [],
    };

    it('POSTs to /course/generate with the correct body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeFetchResponse(true, { blueprint }));
      vi.stubGlobal('fetch', mockFetch);
      await client.generateCourse(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/course/generate`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    });

    it('returns data.blueprint on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(true, { blueprint })));
      const result = await client.generateCourse(payload);
      expect(result).toEqual(blueprint);
    });

    it('throws with status when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(false, 'Internal error', 500)));
      await expect(client.generateCourse(payload)).rejects.toThrow('500');
    });

    it('throws with a message containing the error body on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(false, 'Bad Request', 400)));
      await expect(client.generateCourse(payload)).rejects.toThrow(/course\/generate failed/);
    });
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
