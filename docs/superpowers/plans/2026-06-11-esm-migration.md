# ESM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 8 shared `dist`-emitting packages emit ESM so the `agent` service (run via `tsx watch` against TS source) starts cleanly under `pnpm dev`, and bump the Node floor so the CommonJS `api` can `require()` those ESM packages.

**Architecture:** Add `"type": "module"` to the 8 packages — because tsconfig already uses `module: NodeNext` and sources already import with `.js` extensions, `tsc` flips from CJS to ESM output with no source edits. `agent`/`worker` are already `type: module`; `api` stays CommonJS and relies on Node ≥ 22.12 `require(esm)`. Node floor is raised in `engines`, `.nvmrc`, CI, and the setup preflight.

**Tech Stack:** pnpm + Turborepo monorepo, TypeScript (`NodeNext`), tsx, NestJS (api), Fastify+LangGraph (agent), BullMQ (worker), Expo/Metro (mobile), Vitest, drizzle-kit.

**Spec:** `docs/superpowers/specs/2026-06-11-esm-migration-design.md`

**Discipline:** Stop at every gate and verify before proceeding. Do NOT fix a failure silently — stop and report the full output.

**The 8 packages (exact list):** `db`, `env`, `observability`, `prompts`, `providers`, `schemas`, `types`, `test-support`.
**Do NOT touch:** `packages/config`, anything under `services/`, anything under `apps/` (except the Metro config in Task 6).

---

### Task 1: Node floor bump

**Files:**
- Modify: `package.json` (root) — `engines.node`
- Create: `.nvmrc`
- Modify: `.github/workflows/nightly.yml` — `node-version`
- Modify: `.github/actions/setup/action.yml` — `node-version`
- Modify: `scripts/setup.sh:25-27` — preflight Node check

- [ ] **Step 1: Verify the gate is satisfiable**

Run: `node -v`
Expected: a version `≥ v22.12.0` (e.g. `v24.0.1`). If lower, STOP and report — the rest of the plan assumes a Node that can `require(esm)`.

- [ ] **Step 2: Bump `engines.node` in root `package.json`**

Change:
```json
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
```
to:
```json
  "engines": {
    "node": ">=22.12.0",
    "pnpm": ">=9.0.0"
  },
```

- [ ] **Step 3: Create `.nvmrc`**

Create `.nvmrc` with exactly:
```
22
```

- [ ] **Step 4: Bump CI Node version (workflow + composite action)**

In `.github/workflows/nightly.yml`, change `node-version: 20` → `node-version: 22`.
In `.github/actions/setup/action.yml`, change `node-version: 20` → `node-version: 22`.

- [ ] **Step 5: Update the setup preflight to enforce 22.12**

In `scripts/setup.sh`, replace the major-only check at lines 25-26:
```bash
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
[[ "$NODE_VERSION" -ge 20 ]] || die "Node.js >= 20 required (found: $(node --version 2>/dev/null || echo 'not installed')). Install from https://nodejs.org"
```
with a major+minor check:
```bash
NODE_RAW=$(node --version 2>/dev/null | sed 's/v//' || echo "0.0")
NODE_MAJOR=$(echo "$NODE_RAW" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_RAW" | cut -d. -f2)
{ [[ "$NODE_MAJOR" -gt 22 ]] || { [[ "$NODE_MAJOR" -eq 22 ]] && [[ "$NODE_MINOR" -ge 12 ]]; }; } \
  || die "Node.js >= 22.12 required (found: $(node --version 2>/dev/null || echo 'not installed')). Install from https://nodejs.org"
```
(Leave the `ok "Node.js $(node --version)"` line on the next line unchanged.)

- [ ] **Step 6: Verify no Node-20 pins remain**

Run: `grep -rn "node-version: *20\|>=20\|>= 20\|-ge 20\b" .github/ scripts/ package.json`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add package.json .nvmrc .github/workflows/nightly.yml .github/actions/setup/action.yml scripts/setup.sh
git commit -m "chore: bump Node floor to 22.12 for ESM require() support"
```

---

### Task 2: ESM safety pre-check + flip the 8 packages

**Files:**
- Modify: `packages/db/package.json`, `packages/env/package.json`, `packages/observability/package.json`, `packages/prompts/package.json`, `packages/providers/package.json`, `packages/schemas/package.json`, `packages/types/package.json`, `packages/test-support/package.json` — add `"type": "module"`

- [ ] **Step 1: ESM hazard pre-check (`__dirname` / `__filename`)**

Run: `grep -rn "__dirname\|__filename" packages/*/src`
Expected: no output. If there are hits, STOP and report — those globals don't exist in ESM and must be addressed before flipping (`import.meta.url` + `fileURLToPath`).

- [ ] **Step 2: Add `"type": "module"` to each of the 8 packages**

In each `package.json`, add a top-level `"type": "module"` key (conventionally right after `"private": true` / `"version"`). Example for `packages/observability/package.json`:
```json
{
  "name": "@autodidact/observability",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  ...
}
```
Do this for all 8: `db`, `env`, `observability`, `prompts`, `providers`, `schemas`, `types`, `test-support`. **Touch nothing else** in those files. Do NOT add it to `packages/config`.

- [ ] **Step 3: Verify all 8 (and only those 8) are flipped**

Run:
```bash
for p in db env observability prompts providers schemas types test-support config; do
  echo -n "$p: "; node -e "console.log(require('./packages/'+process.argv[1]+'/package.json').type||'cjs')" "$p"
done
```
Expected: the first 8 print `module`; `config` prints `cjs`.

- [ ] **Step 4: Commit**

```bash
git add packages/*/package.json
git commit -m "feat: emit ESM from shared packages (add type:module)"
```

---

### Task 3: Build gate

No file changes — this is a verification gate. Run each command; stop on the FIRST failure and report its full output.

- [ ] **Step 1: Clean build from scratch**

Run: `pnpm clean && pnpm build`
Expected: `Tasks: N successful, N total`, exit 0. (A clean build avoids replaying stale `dist`.)

- [ ] **Step 2: Confirm a package now emits ESM**

Run: `head -5 packages/observability/dist/index.js`
Expected: ESM syntax — `export { ... } from './tracer.js';` (NOT `"use strict"; Object.defineProperty(exports, ...)`).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0, no TS errors.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 5: Test**

Run: `pnpm test`
Expected: all suites pass, exit 0. (Vitest is ESM-native; watch for any package whose tests assumed CJS.)

- [ ] **Step 6: (No commit — verification only.)** If all four passed, proceed. If any failed, STOP and report.

---

### Task 4: Dev smoke — the critical gate

No file changes — boot the stack and confirm the agent and api start. Infra (Postgres/Redis) must be up (`pnpm setup` already ran this session).

- [ ] **Step 1: Start the full backend in the background**

Run (background, capture log):
```bash
nohup pnpm dev > /tmp/esm-dev-smoke.log 2>&1 &
```

- [ ] **Step 2: Wait for services and check the agent (:3001)**

Wait until `:3001` responds, then confirm no SyntaxError:
```bash
until curl -s -o /dev/null --max-time 2 http://localhost:3001/ready 2>/dev/null; do sleep 2; done
grep -iE "setSpanAttributes|SyntaxError" /tmp/esm-dev-smoke.log && echo "AGENT FAILED" || echo "AGENT OK (no SyntaxError)"
curl -s --max-time 3 http://localhost:3001/ready; echo
```
Expected: `AGENT OK (no SyntaxError)` and a `/ready` response. The original `SyntaxError: ... does not provide an export named 'setSpanAttributes'` must be ABSENT.

- [ ] **Step 3: Check the api (:3000)**

```bash
grep -iE "ERR_REQUIRE_ESM" /tmp/esm-dev-smoke.log && echo "API FAILED (require-esm)" || echo "API OK (no ERR_REQUIRE_ESM)"
curl -s -o /dev/null -w "api :3000 -> HTTP %{http_code}\n" --max-time 3 http://localhost:3000/v1
```
Expected: `API OK (no ERR_REQUIRE_ESM)` and an HTTP status (not a connection failure).

- [ ] **Step 4: Capture startup output for the report**

Run: `grep -iE "service started|listening|ready|error|SyntaxError|ERR_REQUIRE" /tmp/esm-dev-smoke.log | tail -30`
Record this verbatim for the final report. If either service failed, STOP and report.

---

### Task 5: Metro config (mobile)

**Files:**
- Modify (if needed): `apps/mobile/metro.config.js`

- [ ] **Step 1: Inspect the Metro resolver config**

Run: `cat apps/mobile/metro.config.js`
Look for `resolver.unstable_enablePackageExports`.

- [ ] **Step 2: Ensure package-exports resolution is enabled**

If `resolver.unstable_enablePackageExports: true` is absent, add it to the resolver config so Metro honors the packages' `exports`/ESM entry when bundling `@autodidact/types`. Match the file's existing structure (it returns/extends a config object). Example shape:
```js
config.resolver = config.resolver || {};
config.resolver.unstable_enablePackageExports = true;
```
If it's already set to `true`, change nothing.

- [ ] **Step 3: Verify bundling (best-effort) and note the result**

Attempt a bundle check:
```bash
pnpm --filter @autodidact/mobile exec expo start --no-dev --max-workers 1 &
sleep 25; curl -s -o /dev/null -w "metro bundle status: %{http_code}\n" "http://localhost:8081/index.bundle?platform=android&dev=false" --max-time 120
```
Record whether the bundle returned `200`. If `expo start` can't run headless in this environment, note that explicitly in the report instead of claiming success.

- [ ] **Step 4: Commit (only if the file changed)**

```bash
git add apps/mobile/metro.config.js
git commit -m "chore(mobile): enable Metro package exports for ESM packages"
```

---

### Task 6: Docs — update Node-version references

**Files:**
- Modify: every doc that pins the old Node floor (discovered in Step 1)

- [ ] **Step 1: Find all stale Node-version references**

Run: `grep -rniE "node[ ._]*(>=? *)?20" README.md CONTRIBUTING.md docs/ 2>/dev/null | grep -iv "node_modules"`
Record every hit. (Ignore false positives like ports or unrelated "20".)

- [ ] **Step 2: Update each real reference**

For each file that states the Node prerequisite as 20 / `>=20`, change it to `>=22.12` (matching `engines`). List every file changed.

- [ ] **Step 3: Verify nothing stale remains**

Run: `grep -rniE "node[ ._]*(>=? *)?20\b" README.md CONTRIBUTING.md docs/ 2>/dev/null | grep -iv "node_modules"`
Expected: only legitimate non-prerequisite matches remain (if any), and no "Node 20 required"-type lines.

- [ ] **Step 4: Commit (only if docs changed)**

```bash
git add README.md CONTRIBUTING.md docs/
git commit -m "docs: update Node prerequisite to 22.12"
```

---

### Task 7: Final report

- [ ] **Step 1: Summarize for the user**

Report:
- Every file changed (from `git diff --stat <first-commit>^..HEAD` or `git log --oneline`).
- Full output of the Task 3 suite (build / typecheck / lint / test).
- Startup output from Task 4 (agent :3001 + api :3000), proving the original `SyntaxError` and `ERR_REQUIRE_ESM` are both absent.
- Metro result from Task 5 (bundled, or why it couldn't be verified here).
- Doc files updated in Task 6.
