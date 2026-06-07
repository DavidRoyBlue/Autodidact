import { createBaseConfig } from '../config/vitest.base.ts';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';

// Resolve .js extension imports to .ts sources so vi.mock() intercepts apply
// to source modules rather than pre-built dist/*.js CJS files.
const jsToTsPlugin = {
  name: 'js-to-ts-resolver',
  enforce: 'pre' as const,
  resolveId(id: string, importer: string | undefined) {
    if (!importer || !id.startsWith('.') || !id.endsWith('.js')) return;
    const tsPath = id.slice(0, -3) + '.ts';
    const importerDir = dirname(importer.replace(/\.(js|ts)$/, '.ts'));
    const resolved = resolve(importerDir, tsPath);
    if (existsSync(resolved)) return resolved;
  },
};

export default createBaseConfig({
  plugins: [jsToTsPlugin],
  test: {
    name: 'observability',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
