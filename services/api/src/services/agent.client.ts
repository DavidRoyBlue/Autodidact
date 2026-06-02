import { Injectable } from '@nestjs/common';
import type { CourseGenerationJobData } from '@autodidact/types';

@Injectable()
export class ApiAgentClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env['AGENT_SERVICE_URL'] ?? 'http://localhost:3001';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Embedding request failed: ${res.status}`);
    // Agent /embeddings/text returns { embedding } (see agent embeddings route).
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }
}
