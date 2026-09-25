import { cloudRunAuthHeaders } from '@autodidact/providers';

export class AgentClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const authHeaders = await cloudRunAuthHeaders(this.baseUrl);
    const res = await fetch(`${this.baseUrl}/embeddings/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      throw new Error(`Agent /embeddings/text failed: ${res.status}`);
    }
    // Agent /embeddings/text returns { embedding } (see agent embeddings route).
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }
}
