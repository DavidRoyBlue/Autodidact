import { createBaseConfig } from '../../packages/config/vitest.base.ts';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// The API-level e2e boots the real AppModule, whose QUEUE_PROVIDER factory calls
// the real createQueueProvider from @autodidact/providers. tsconfigPaths would
// resolve that to the package SOURCE, dragging factory.ts's static imports of
// every LLM/embedding SDK (@langchain/*, @anthropic-ai/sdk, …) into vite-node.
// Resolve the bare specifier to the built dist instead so the real provider
// loads via Node's normal node_modules resolution. Type-only imports are erased,
// so this only affects the e2e's runtime provider import.
const here = dirname(fileURLToPath(import.meta.url));
const providersDist = resolve(here, '../../packages/providers/dist/index.js');
const realProvidersDistPlugin = {
  name: 'autodidact-providers-dist',
  enforce: 'pre' as const,
  resolveId(id: string) {
    if (id === '@autodidact/providers') return providersDist;
  },
};

export default createBaseConfig({
  // createBaseConfig replaces (does not merge) plugins, so re-include
  // tsconfigPaths here alongside the providers-dist resolver. unplugin-swc
  // transforms TS with emitDecoratorMetadata (from tsconfig.base.json) so NestJS
  // reflected constructor injection works when the e2e boots the real AppModule;
  // esbuild (vitest's default) cannot emit decorator metadata, which silently
  // leaves constructor-injected providers undefined.
  plugins: [realProvidersDistPlugin, tsconfigPaths(), swc.vite()],
  test: {
    name: 'api',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['reflect-metadata'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // @autodidact/test-support's CJS dist requires @autodidact/db synchronously at module
    // load time, which triggers packages/db/src/supabase.ts to call createClient() before
    // vi.mock('@autodidact/db') can intercept it. These stubs satisfy the Supabase URL
    // validator; the actual client is never used (vi.mock returns supabaseAdmin: null).
    env: {
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SECRET_KEY: 'placeholder',
    },
  },
});
