import type { CourseBlueprint, CourseGenerationJobData } from '@autodidact/types';

export class AgentClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async generateCourse(payload: CourseGenerationJobData): Promise<CourseBlueprint> {
    const res = await fetch(`${this.baseUrl}/course/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Agent /course/generate failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { blueprint: CourseBlueprint };
    return data.blueprint;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
