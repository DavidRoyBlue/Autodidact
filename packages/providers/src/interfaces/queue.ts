export interface EnqueueOptions {
  /**
   * Advisory only. Retry behaviour is owned by the queue infrastructure
   * (Cloud Tasks queue retry_config in Terraform); providers may ignore
   * these fields. Kept for source compatibility at call sites.
   */
  attempts?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  delay?: number;
  jobId?: string;
}

export interface IQueueProvider {
  enqueue<T>(queue: string, name: string, data: T, opts?: EnqueueOptions): Promise<string>;
  close(): Promise<void>;
}
