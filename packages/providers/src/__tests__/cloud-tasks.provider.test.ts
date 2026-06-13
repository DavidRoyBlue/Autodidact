import { describe, it, expect, vi, afterEach } from 'vitest';

const { createTaskMock, closeMock, queuePathMock } = vi.hoisted(() => ({
  createTaskMock: vi.fn().mockResolvedValue([
    { name: 'projects/p/locations/l/queues/q/tasks/task-123' },
  ]),
  closeMock: vi.fn().mockResolvedValue(undefined),
  queuePathMock: vi.fn(
    (project: string, location: string, queue: string) =>
      `projects/${project}/locations/${location}/queues/${queue}`,
  ),
}));

vi.mock('@google-cloud/tasks', () => ({
  CloudTasksClient: vi.fn().mockImplementation(() => ({
    createTask: createTaskMock,
    close: closeMock,
    queuePath: queuePathMock,
  })),
}));

import { CloudTasksQueueProvider } from '../implementations/queue/cloud-tasks.provider.js';

const config = {
  projectId: 'proj',
  location: 'us-central1',
  workerBaseUrl: 'https://worker.run.app',
  invokerServiceAccount: 'sa@proj.iam.gserviceaccount.com',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('CloudTasksQueueProvider', () => {
  it('creates an OIDC-authenticated HTTP task targeting the worker endpoint', async () => {
    const provider = new CloudTasksQueueProvider(config);
    const data = { courseId: 'c1', topic: 'rust' };

    const id = await provider.enqueue('course-generation', 'generate-course', data);

    expect(queuePathMock).toHaveBeenCalledWith(
      'proj',
      'us-central1',
      'autodidact-course-generation',
    );
    expect(createTaskMock).toHaveBeenCalledWith({
      parent: 'projects/proj/locations/us-central1/queues/autodidact-course-generation',
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: 'https://worker.run.app/tasks/generate-course',
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(data)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
            audience: 'https://worker.run.app',
          },
        },
      },
    });
    expect(id).toBe('projects/p/locations/l/queues/q/tasks/task-123');
  });

  it('honours a custom queue prefix', async () => {
    const provider = new CloudTasksQueueProvider({ ...config, queuePrefix: 'custom-' });
    await provider.enqueue('embedding', 'generate-embedding', {});
    expect(queuePathMock).toHaveBeenCalledWith('proj', 'us-central1', 'custom-embedding');
  });

  it('ignores legacy retry options (queue-level config owns retries)', async () => {
    const provider = new CloudTasksQueueProvider(config);
    await provider.enqueue(
      'embedding',
      'generate-embedding',
      {},
      { attempts: 99, backoff: { type: 'exponential', delay: 1 } },
    );
    const arg = createTaskMock.mock.calls[0][0];
    expect(JSON.stringify(arg)).not.toContain('99');
  });

  it('close() closes the client', async () => {
    const provider = new CloudTasksQueueProvider(config);
    await provider.close();
    expect(closeMock).toHaveBeenCalled();
  });
});
