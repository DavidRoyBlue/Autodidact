import { CloudTasksClient } from '@google-cloud/tasks';
import type { EnqueueOptions, IQueueProvider } from '../../interfaces/queue.js';

export interface CloudTasksProviderConfig {
  projectId: string;
  location: string;
  /** Base URL of the worker service, e.g. https://autodidact-worker-xyz.run.app */
  workerBaseUrl: string;
  /** Service account email used for the OIDC token Cloud Run IAM verifies. */
  invokerServiceAccount: string;
  /** Prefix mapping logical queue names to Cloud Tasks queue ids. */
  queuePrefix?: string;
}

/**
 * IQueueProvider backed by GCP Cloud Tasks. Each enqueue creates an HTTP
 * task that POSTs the payload to `${workerBaseUrl}/tasks/${name}` with an
 * OIDC token; Cloud Run IAM authenticates the request before it reaches
 * the worker container.
 *
 * Retry/backoff is configured at the queue level in Terraform
 * (infra/modules/cloud-tasks) — `EnqueueOptions.attempts/backoff` are ignored.
 */
export class CloudTasksQueueProvider implements IQueueProvider {
  private readonly client: CloudTasksClient;
  private readonly config: Required<CloudTasksProviderConfig>;

  constructor(config: CloudTasksProviderConfig) {
    this.client = new CloudTasksClient();
    this.config = { queuePrefix: 'autodidact-', ...config };
  }

  async enqueue<T>(
    queue: string,
    name: string,
    data: T,
    _opts?: EnqueueOptions,
  ): Promise<string> {
    const parent = this.client.queuePath(
      this.config.projectId,
      this.config.location,
      `${this.config.queuePrefix}${queue}`,
    );

    const [task] = await this.client.createTask({
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${this.config.workerBaseUrl}/tasks/${name}`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(data)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: this.config.invokerServiceAccount,
            audience: this.config.workerBaseUrl,
          },
        },
      },
    });

    return task.name ?? '';
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
