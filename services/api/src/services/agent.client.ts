import { Injectable } from '@nestjs/common';
import { cloudRunAuthHeaders } from '@autodidact/providers';

@Injectable()
export class ApiAgentClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env['AGENT_SERVICE_URL'] ?? 'http://localhost:3001';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const authHeaders = await cloudRunAuthHeaders(this.baseUrl);
    const res = await fetch(`${this.baseUrl}/embeddings/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Embedding request failed: ${res.status}`);
    // Agent /embeddings/text returns { embedding } (see agent embeddings route).
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }

  /**
   * Liveness probe for the (private) Agent service, used by the health endpoint.
   * Returns false on any failure — unreachable, non-2xx, or token-mint error — so
   * callers report degraded health without throwing.
   */
  async isAgentHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: await cloudRunAuthHeaders(this.baseUrl),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
