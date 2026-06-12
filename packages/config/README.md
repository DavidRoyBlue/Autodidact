# @autodidact/config

## Purpose

Shared tooling configuration for the monorepo: TypeScript compiler options, ESLint rules, Prettier formatting, Vitest base config, and shared test utilities. All packages and services extend these instead of defining their own.

## Consumers

All packages and services in the monorepo consume at least one export from this package.

| Consumer | Configs Used |
|----------|-------------|
| All Node packages/services | `tsconfig.base.json` |
| `apps/mobile` | `tsconfig.react-native.json` |
| All packages/services | `eslint.config.base.mjs` (spread into local flat config) |
| All packages/services | `prettier.config.mjs` |
| All packages/services (tests) | `vitest.base.ts` (`createBaseConfig`) |
| Services with unit tests | `src/test-utils` (mock factories, fixtures) |

## Public API

The package exports via named paths defined in `package.json`:

| Export path | File | Description |
|-------------|------|-------------|
| `@autodidact/config/tsconfig.base.json` | `tsconfig.base.json` | Node/server TypeScript base (ES2022, NodeNext, strict) |
| `@autodidact/config/tsconfig.react-native.json` | `tsconfig.react-native.json` | React Native / Expo TypeScript (bundler resolution, jsx: react-native) |
| `@autodidact/config/prettier` | `prettier.config.mjs` | Prettier rules (single quotes, semi, 100-char width) |
| `@autodidact/config/vitest.base` | `vitest.base.ts` | Vitest `createBaseConfig()` factory |
| `@autodidact/config/test-utils` | `src/test-utils/index.ts` | Mock factories and sample fixtures |

### Test utilities (`src/test-utils/mock-factories.ts`)

```typescript
import {
  makeMockLLMProvider,        // ILLMProvider mock (invoke, stream, getModel, getModelName)
  makeMockQueueProvider,      // IQueueProvider mock (enqueue, close)
  makeMockAuthProvider,       // IAuthProvider mock (verifyToken)
  makeMockEmbeddingProvider,  // IEmbeddingProvider mock (embed, embedBatch, getEmbeddings)
  makeMockAgentClient,        // Mock for the internal agent HTTP client
  makeMockLogger,             // Logger mock (info, warn, error, debug, child)
  sampleUser,                 // Reusable test user fixture
  sampleBlueprint,            // Reusable CourseBlueprint fixture
} from '@autodidact/config/test-utils';
```

## Usage Example

**tsconfig.json in a Node service:**
```json
{
  "extends": "@autodidact/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

**vitest.config.ts in a package:**
```typescript
import { createBaseConfig } from '@autodidact/config/vitest.base';
export default createBaseConfig();
```

**vitest.config.ts with overrides:**
```typescript
import { createBaseConfig } from '@autodidact/config/vitest.base';
export default createBaseConfig({
  test: { setupFiles: ['./src/__tests__/setup.ts'] },
});
```

**eslint.config.mjs in a package:**
```javascript
import baseConfig from '@autodidact/config/eslint';  // spread base array
export default [...baseConfig];
```

## Internal Structure

```
packages/config/
├── tsconfig.base.json          # Node/server TS compiler options
├── tsconfig.react-native.json  # Mobile app TS compiler options
├── eslint.config.base.mjs      # ESLint flat config (typescript-eslint recommended)
├── prettier.config.mjs         # Prettier options
├── vitest.base.ts              # createBaseConfig() factory
└── src/test-utils/
    ├── index.ts                # Re-exports
    └── mock-factories.ts       # Provider mocks, logger mock, sample fixtures
```

## Gotchas

- Changes to `tsconfig.base.json` or `eslint.config.base.mjs` affect every package and service. Run `pnpm typecheck` and `pnpm lint` from the monorepo root after any change here.
- `tsconfig.base.json` sets `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` — imports in Node packages must use explicit `.js` extensions on relative imports (e.g., `import { x } from './x.js'`).
- `tsconfig.react-native.json` overrides to `"moduleResolution": "bundler"` for Metro/Expo compatibility — do not use this base for Node services.
