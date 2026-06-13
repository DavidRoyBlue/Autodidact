import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTestDatabase, type TestDatabase } from '@autodidact/test-support';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface CrossServiceHarness {
  apiUrl: string;
  agentUrl: string;
  db: TestDatabase['db'];
  pool: TestDatabase['pool'];
  truncate: () => Promise<void>;
  stop: () => Promise<void>;
}

interface SpawnedService {
  name: string;
  child: ChildProcess;
  output: () => string;
}

/** Ask the OS for a free TCP port. */
function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

function distEntry(service: 'api' | 'agent' | 'worker'): string {
  const entry = resolve(REPO_ROOT, 'services', service, 'dist', 'main.js');
  if (!existsSync(entry)) {
    throw new Error(
      `Cannot start the cross-service e2e: ${entry} is missing. ` +
        `Build the services first (\`pnpm build\`).`,
    );
  }
  return entry;
}

function spawnService(
  service: 'api' | 'agent' | 'worker',
  env: NodeJS.ProcessEnv,
): SpawnedService {
  const entry = distEntry(service);
  const child = spawn(process.execPath, [entry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  const capture = (chunk: Buffer) => {
    buf += chunk.toString();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  return { name: service, child, output: () => buf };
}

/** Poll an HTTP endpoint until `isReady(json)` is true or the deadline passes. */
async function waitForHttp(
  url: string,
  isReady: (json: unknown) => boolean,
  timeoutMs: number,
  diagnostics: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      const json: unknown = await res.json();
      if (res.ok && isReady(json)) return;
      lastErr = `status ${res.status}, body ${JSON.stringify(json)}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url} (last: ${lastErr})\n${diagnostics()}`);
}

async function killService(svc: SpawnedService): Promise<void> {
  if (svc.child.exitCode !== null || svc.child.signalCode !== null) return;
  await new Promise<void>((resolveKill) => {
    const onExit = () => resolveKill();
    svc.child.once('exit', onExit);
    svc.child.kill('SIGTERM');
    // Force-kill if SIGTERM is ignored.
    setTimeout(() => {
      if (svc.child.exitCode === null) svc.child.kill('SIGKILL');
    }, 5_000).unref();
  });
}

/**
 * Boot Postgres (Testcontainers) and the real agent/worker/api services as
 * child processes, wired to the container with the mock LLM/embedding/auth
 * providers and the loopback queue (enqueue POSTs straight to the worker's
 * task endpoints — same HTTP contract Cloud Tasks uses in production).
 * Returns service URLs, a container-backed Drizzle client for assertions,
 * and a `stop()` teardown.
 */
export async function startCrossServiceHarness(): Promise<CrossServiceHarness> {
  const database: TestDatabase = await withTestDatabase();

  const services: SpawnedService[] = [];
  const stop = async (): Promise<void> => {
    // Reverse boot order, then containers.
    for (const svc of [...services].reverse()) await killService(svc);
    await database.close();
  };

  try {
    const apiPort = await freePort();
    const agentPort = await freePort();
    const workerPort = await freePort();
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const agentUrl = `http://127.0.0.1:${agentPort}`;
    const workerUrl = `http://127.0.0.1:${workerPort}`;
    const databaseUrl = database.container.getConnectionUri();

    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      AGENT_SERVICE_URL: agentUrl,
      LLM_PROVIDER: 'mock',
      EMBEDDING_PROVIDER: 'mock',
      AUTH_PROVIDER: 'mock',
      CHECKPOINTER: 'memory',
      QUEUE_PROVIDER: 'loopback',
      WORKER_TASK_BASE_URL: workerUrl,
      // @autodidact/db builds a Supabase admin client at import; stub the env so
      // the URL validator passes. The mock auth provider means it's never used.
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SECRET_KEY: 'placeholder',
      SUPABASE_PUBLISHABLE_KEY: 'placeholder',
    };

    // Agent first (api + worker call it), then worker, then api.
    services.push(spawnService('agent', { ...baseEnv, AGENT_PORT: String(agentPort) }));
    services.push(spawnService('worker', { ...baseEnv, WORKER_PORT: String(workerPort) }));
    services.push(spawnService('api', { ...baseEnv, API_PORT: String(apiPort) }));

    const agent = services[0]!;
    const worker = services[1]!;
    const api = services[2]!;

    await waitForHttp(
      `${agentUrl}/health`,
      (j) => (j as { status?: string }).status === 'ok',
      30_000,
      () => `agent output:\n${agent.output()}`,
    );
    await waitForHttp(
      `${workerUrl}/health`,
      (j) => (j as { status?: string }).status === 'ok',
      30_000,
      () => `worker output:\n${worker.output()}`,
    );
    await waitForHttp(
      `${apiUrl}/v1/health`,
      (j) => {
        const s = (j as { status?: string }).status;
        return s === 'ok' || s === 'degraded';
      },
      30_000,
      () => `api output:\n${api.output()}`,
    );

    return {
      apiUrl,
      agentUrl,
      db: database.db,
      pool: database.pool,
      truncate: database.truncate,
      stop,
    };
  } catch (err) {
    await stop();
    throw err;
  }
}
