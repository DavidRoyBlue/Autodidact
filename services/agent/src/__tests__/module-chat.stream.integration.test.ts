import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { createLLMProvider, createCheckpointer } from '@autodidact/providers';
import { registerModuleChatRoute } from '../routes/module-chat.js';

// Real-HTTP test (NOT app.inject): the bug is that `request.raw.on('close')`
// fires as soon as a POST body is read, which only happens over a real socket.
// inject() short-circuits the HTTP layer and cannot reproduce it.

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => frame.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => Boolean(l))
    .map((l) => JSON.parse(l.slice(6)) as SseEvent);
}

const validBody = {
  sessionId: '00000000-0000-0000-0000-000000000123',
  message: 'I understand this module now.',
  moduleBlueprint: {
    id: 'mod-1',
    position: 0,
    title: 'Variables',
    description: 'Learn Python variables.',
    objectives: ['Declare variables'],
    contentOutline: [{ title: 'Basics', points: ['Assignment'] }],
    estimatedMinutes: 30,
  },
  courseProgress: { courseTitle: 'Python', completedModuleCount: 0, totalModuleCount: 3 },
  isFirstMessage: true,
};

describe('POST /module-chat/stream over a real socket (mock LLM)', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = Fastify();
    const llm = createLLMProvider({ llmProvider: 'mock' });
    const checkpointer = createCheckpointer({ checkpointer: 'memory' });
    await registerModuleChatRoute(app, llm, checkpointer);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('streams token + module_complete + complete events (does not false-abort on the POST body close)', async () => {
    const res = await fetch(`${baseUrl}/module-chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);

    const events = parseSse(await res.text());

    // The mock teacher replies with [MODULE_COMPLETE:score=85].
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'token')).toBe(true);
    expect(events.some((e) => e.type === 'module_complete')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'complete' });
  });
});
