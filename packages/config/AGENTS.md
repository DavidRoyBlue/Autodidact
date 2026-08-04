# Subtree Instructions — packages/config/

> These rules apply only within `packages/config/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

Shared tooling configuration (TypeScript, ESLint, Prettier, Vitest) consumed by all packages and services via `extends`. No application logic lives here.

---

## Invariants (must not be broken)

- Shared tooling configuration only. No application runtime logic, no database access, no provider code.
- Changes here affect ALL packages and services in the monorepo. Always run `pnpm typecheck` and `pnpm lint` from the root before committing a change to this package.
- `tsconfig.base.json` enables `strict: true`, `experimentalDecorators: true`, and `emitDecoratorMetadata: true` — these settings are required by NestJS and must not be removed.
- `tsconfig.react-native.json` extends `tsconfig.base.json` and overrides `module`/`moduleResolution` for bundler resolution and adds `jsx: react-native`. Mobile app uses this variant; Node services use `tsconfig.base.json`.
- `src/test-utils/mock-factories.ts` exports canonical mock implementations for all provider interfaces (`makeMockLLMProvider`, `makeMockQueueProvider`, `makeMockAuthProvider`, `makeMockEmbeddingProvider`). Use these in unit tests rather than creating ad-hoc mocks.

---

## Library / tooling rules

- ESLint config uses flat config format (`eslint.config.base.mjs`) — do not convert to `.eslintrc` format.
- Prettier config enforces: single quotes, semicolons, 100-char print width, 2-space indent, trailing commas.
- Vitest base config (`vitest.base.ts`) exports `createBaseConfig()` — services extend this with `overrides` rather than writing their own full Vitest config.

---

## Source of truth

- `tsconfig.base.json` — baseline TypeScript compiler options for all Node packages and services.
- `tsconfig.react-native.json` — TypeScript options for the mobile app.
- `eslint.config.base.mjs` — baseline ESLint flat config.
- `prettier.config.mjs` — canonical Prettier settings.
- `vitest.base.ts` — base Vitest configuration factory.
- `src/test-utils/` — shared test fixtures and mock factories.

---

## Key patterns to follow

- Consumers reference shared configs via the package exports defined in `package.json`:
  - TypeScript: `"extends": "@autodidact/config/tsconfig.base.json"`
  - Vitest: `import { createBaseConfig } from '@autodidact/config/vitest.base'`
  - Test utils: `import { makeMockLLMProvider } from '@autodidact/config/test-utils'`
- ESLint does not have a named export — consumers import and spread the base config array in their own `eslint.config.mjs`.

---

## Anti-patterns to avoid

- Do not add application code, database utilities, or environment variable reads to this package.
- Do not write custom mock implementations in service test files when a canonical mock factory already exists in `src/test-utils/mock-factories.ts`.
