# Spec: Migrate shared packages to ESM

**Date:** 2026-06-11
**Status:** Approved — ready for implementation

## Context

The `agent` service (`services/agent`, internal LLM runtime on port 3001) fails to
start under `pnpm dev`:

```
SyntaxError: The requested module '@autodidact/observability'
does not provide an export named 'setSpanAttributes'
```

Root cause: `agent` is `"type": "module"` and runs via `tsx watch src/main.ts`. Its
`tsconfig.json` `paths` resolve `@autodidact/*` to each package's **TypeScript
source**. Because the shared packages have **no `"type": "module"`** field, `tsx`
transpiles their `.ts` source as **CommonJS**, so named exports collapse to
`['default', 'module.exports']` and ESM named imports fail. Under Node 24 this is
fatal at module-link time. `api` and `worker` run from compiled `dist` and are
unaffected today (Node's native CJS↔ESM interop handles the CJS `dist`).

This affects **every** shared package the agent imports, not just `observability`.

The fix: make the shared packages emit ESM so `tsx` loads their source as ESM.

## Goal / success criteria

- `pnpm dev` boots **all four** services, including `agent` on :3001 (no `SyntaxError`)
  and `api` on :3000 (no `ERR_REQUIRE_ESM`).
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all green.
- `apps/mobile` still bundles; `pnpm migrate:dev` still runs.

## Why this is low-friction

The source is already ESM-shaped: tsconfig base uses `module: NodeNext` /
`moduleResolution: NodeNext`, and relative imports already carry `.js` extensions
(e.g. `export { … } from './tracer.js'`). Adding `"type": "module"` flips `tsc`
output from CJS to ESM **with no source edits**. There is no production top-level
`await` in the package sources (all `await`s are inside functions/tests), so the
CJS `api` can `require()` the ESM packages on Node ≥ 22.12.

## Decision: how the CJS `api` consumes ESM packages

Chosen: **bump the Node floor to ≥ 22.12** so the CommonJS NestJS `api` can
`require()` the ESM packages natively. Smallest blast radius — `api`/`worker`/`agent`
source and module types stay as they are. (Rejected: converting `api` to ESM —
NestJS + decorators + ESM is the riskiest path; dual-build — adds build tooling to
every package.)

## Changes

### Packages → ESM (add `"type": "module"`, nothing else)

`db`, `env`, `observability`, `prompts`, `providers`, `schemas`, `types`,
`test-support`.

Existing `main` / `exports` (`./dist/index.js`) stay valid; no `tsconfig` changes;
no source changes. **`packages/config` is excluded** — it ships `.mjs`/`.ts`/`.json`
directly (no `dist`).

### Node floor bump (enables `api` require-of-ESM)

- root `package.json`: `engines.node` → `">=22.12.0"`
- `.nvmrc`: `22` (create/update)
- `.github/workflows/`: every `node-version: 20` → `22`
- `scripts/`: update any preflight Node check pinning 20

### Mobile

- `apps/mobile/metro.config.js`: ensure `resolver.unstable_enablePackageExports: true`
  so Metro honors the packages' `exports`/ESM entry when bundling `@autodidact/types`.

### Docs

- Update the Node prerequisite wherever stated (`README.md`, `CONTRIBUTING.md`,
  `docs/`): `Node 20` / `>=20` → the new floor.

## Not changing

`api`/`worker`/`agent` source and `package.json` module type; tsconfig files;
package `exports` maps; `packages/config`.

## Risks (verification points)

- **`api` + `require(esm)`** — primary risk; covered by api booting + api tests.
- **Metro** bundling `@autodidact/types` as ESM.
- **drizzle-kit** loading `db`'s now-ESM `drizzle.config.ts` + migrations.
- **vitest** per-package suites under `type: module` (vitest is ESM-native).
- **ESM hazards** — pre-check for `__dirname`/`__filename` in package sources
  (none expected); abort if any are found.

## Testing

No new unit tests (packaging change). Safety net = existing per-package and
per-service suites + end-to-end smoke: `build` / `typecheck` / `lint` / `test`
green → `pnpm dev` boots all four services → mobile bundles → `pnpm migrate:dev`.

## Implementation order (gated)

1. Node floor bump (engines / `.nvmrc` / CI / preflight). Gate: `node -v` ≥ 22.12.
2. Safety pre-check: `grep -r "__dirname\|__filename" packages/*/src` → expect empty.
3. Add `"type": "module"` to the 8 packages.
4. Build gate: `pnpm build` → `typecheck` → `lint` → `test`, stop on first failure.
5. Dev smoke: agent :3001 (no SyntaxError), api :3000 (no ERR_REQUIRE_ESM).
6. Metro config: confirm/add `unstable_enablePackageExports`.
7. Docs: update Node-version references.
