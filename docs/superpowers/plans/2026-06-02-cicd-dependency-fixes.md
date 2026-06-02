# CI/CD & Dependency Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close public-repo security holes, fix CI correctness/duplication, and add dependency automation across the Autodidact monorepo, delivered as three reviewable PRs.

**Architecture:** Three sequential phases, each its own PR/branch off `master`. Phase 1 (security) is independent; Phase 2 (CI mechanics) and Phase 3 (deps) can follow in any order but are written to land after Phase 1. Workflow changes are YAML; dependency changes touch `package.json` + lockfile; one new vitest smoke test is added for mobile.

**Tech Stack:** GitHub Actions, pnpm 9 + Turborepo, anthropics/claude-code-action@v1, Renovate, Vitest 2.

**Conventions for this plan:**
- Workflow YAML is validated with `python3 -c "import yaml; yaml.safe_load(open('<file>'))"` (syntax) after each edit. If `actionlint` is installed, also run `actionlint <file>` for semantic checks.
- "Allowed set" for author association = `["OWNER","MEMBER","COLLABORATOR"]`.
- Commit after each task. Branch per phase: `chore/ci-security`, `chore/ci-hardening`, `chore/deps-hygiene`.

---

## Context (from brainstorming + cold review)

The repo `DavidRoyBlue/Autodidact` is **public**. A review of 10 workflows + dependency manifests found ~20 issues. A cold-context plan review corrected three things, reflected below:

- **`master` is NOT branch-protected** (verified: `gh api .../branches/master/protection` → 404). So validation must NOT be stripped from `deploy.yml`; instead `ci.yml` drops its `push: master` trigger.
- **`@claude` gate must be per-event** — `author_association` lives on a different payload field for each of the four trigger events.
- **Two dependency findings were wrong** and are dropped: `@types/node` is already `^22` everywhere (no downgrade), and api's `drizzle-orm`/`pg` are test-only devDeps with `ioredis` as bullmq's peer (no SSOT manifest surgery). Real TS drift is only `5.5 → 5.6`.

**Decisions:** add a minimal mobile vitest smoke test; use Renovate for dependency automation.

**Out of scope (deferred until deploy goes live):** Cloud Run smoke tests, canary traffic-splitting, rollback, Docker layer caching.

---

# PHASE 1 — Security & correctness (branch `chore/ci-security`)

### Task 1: Gate `@claude` per-event by author association

**Files:**
- Modify: `.github/workflows/claude.yml` (the `if:` block, ~lines 16-21)

- [ ] **Step 1: Replace the `if:` block** so each event clause also checks association.

Replace:

```yaml
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
```

with:

```yaml
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude') && contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude') && contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude') && contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.review.author_association)) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')) && contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.issue.author_association))
```

- [ ] **Step 2: Validate YAML.**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/claude.yml
git commit -m "fix(ci): gate @claude bot on author association per event"
```

---

### Task 2: Narrow `claude.yml` tool scope (drop `gh pr *`)

**Files:**
- Modify: `.github/workflows/claude.yml` (the `claude_args` line, near end)

- [ ] **Step 1: Replace the broad `gh pr *` grant** with specific read/comment subcommands.

Replace:

```yaml
          claude_args: '--allowed-tools "Write(.claude/**)" "Bash(gh pr *)"'
```

with:

```yaml
          claude_args: '--allowed-tools "Write(.claude/**)" "Bash(gh pr comment:*)" "Bash(gh pr view:*)" "Bash(gh pr diff:*)"'
```

- [ ] **Step 2: Validate YAML.**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/claude.yml
git commit -m "fix(ci): restrict @claude gh pr tools to comment/view/diff"
```

---

### Task 3: Repair `claude-api-sync-documentation.yml` (paths + prompt + self-trigger guard)

**Files:**
- Modify: `.github/workflows/claude-api-sync-documentation.yml`

- [ ] **Step 1: Fix the dead path filter.** Replace:

```yaml
    paths:
      - "src/api/**/*.ts"
      - "src/routes/**/*.ts"
```

with:

```yaml
    paths:
      - "services/api/**/*.ts"
```

- [ ] **Step 2: Add a self-trigger guard** so the workflow's own doc commit does not re-fire it. Add this `if:` to the `doc-sync` job (immediately under `runs-on: ubuntu-latest`):

```yaml
    if: github.actor != 'github-actions[bot]'
```

> Note: if the action commits under a different identity (check a prior run's commit author), update this login accordingly.

- [ ] **Step 3: Rewrite the prompt body** so it matches the real code location. Replace the prompt block's steps 1-2:

```yaml
            1. Review the API changes in src/api and src/routes
            2. Update API.md to document any new or changed endpoints
```

with:

```yaml
            1. Review the API changes in services/api (the NestJS public HTTP API)
            2. Update services/api/README.md (and API.md if present) to document any new or changed endpoints
```

- [ ] **Step 4: Validate YAML.**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude-api-sync-documentation.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit.**

```bash
git add .github/workflows/claude-api-sync-documentation.yml
git commit -m "fix(ci): point api-doc-sync at services/api; guard self-trigger"
```

---

### Task 4: Standardize `actions/checkout` to v4

**Files:**
- Modify: `.github/workflows/claude-pr-review.yml`, `claude-api-sync-documentation.yml`, `claude-weekly-maintenance.yml`, `doc-sync-check.yml` (each uses `actions/checkout@v6`)

- [ ] **Step 1: Replace every `actions/checkout@v6` with `@v4`.**

Run:
```bash
grep -rl 'actions/checkout@v6' .github/workflows | xargs sed -i 's#actions/checkout@v6#actions/checkout@v4#g'
```

- [ ] **Step 2: Verify none remain.**

Run: `grep -rn 'actions/checkout@v6' .github/workflows || echo "none remain"`
Expected: `none remain`

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows
git commit -m "chore(ci): standardize actions/checkout on v4"
```

---

### Task 5: Add `concurrency` groups to Claude/PR workflows

**Files:**
- Modify: `.github/workflows/claude.yml`, `claude-code-review.yml`, `claude-pr-review.yml`, `claude-api-sync-documentation.yml`, `doc-sync-check.yml`, `claude-auto-issue-triage.yml`, `adr-review.yml`

(`ci.yml` and `deploy.yml` already have concurrency — skip them.)

- [ ] **Step 1: For each PR-triggered workflow** (`claude-code-review`, `claude-pr-review`, `claude-api-sync-documentation`, `doc-sync-check`, `adr-review`), add a top-level block after the `on:` section and before `jobs:`:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

- [ ] **Step 2: For `claude.yml`** (comment/issue triggered), add:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.issue.number || github.event.pull_request.number || github.run_id }}
  cancel-in-progress: false
```

(`cancel-in-progress: false` — don't cut off an in-flight bot reply mid-write.)

- [ ] **Step 3: For `claude-auto-issue-triage.yml`**, add:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.issue.number }}
  cancel-in-progress: true
```

- [ ] **Step 4: Validate all YAML.**

Run:
```bash
for f in .github/workflows/*.yml; do python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK $f"; done
```
Expected: `OK` for every file.

- [ ] **Step 5: Commit.**

```bash
git add .github/workflows
git commit -m "chore(ci): add concurrency groups to Claude/PR workflows"
```

---

### Task 6: Open Phase 1 PR

- [ ] **Step 1: Push and open PR.**

```bash
git push -u origin chore/ci-security
gh pr create --title "chore(ci): security & correctness hardening (phase 1)" \
  --body "Per-event @claude author gating, narrowed gh pr tools, api-doc-sync repair, checkout@v4, concurrency groups. See docs/superpowers/plans/2026-06-02-cicd-dependency-fixes.md."
```
Expected: PR URL printed.

---

# PHASE 2 — CI hardening (branch `chore/ci-hardening`, off `master` after Phase 1 merges)

### Task 7: De-duplicate master-push validation (drop `ci.yml` master trigger)

**Files:**
- Modify: `.github/workflows/ci.yml` (the `on:` block)

- [ ] **Step 1: Remove the `push: master` trigger** so CI runs on PRs only. Replace:

```yaml
on:
  pull_request:
  push:
    branches:
      - master
```

with:

```yaml
on:
  pull_request:
```

> `deploy.yml` keeps its own lint/typecheck/test, so master pushes stay validated even though `master` is unprotected.

- [ ] **Step 2: Validate YAML.**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/ci.yml
git commit -m "fix(ci): run CI on pull_request only; deploy stays self-validating"
```

---

### Task 8: Create a composite setup action (pnpm + Node + install)

**Files:**
- Create: `.github/actions/setup/action.yml`

- [ ] **Step 1: Create the composite action.**

```yaml
name: Setup workspace
description: Install pnpm, Node 20, and project dependencies (frozen lockfile)
runs:
  using: composite
  steps:
    - name: Setup pnpm
      uses: pnpm/action-setup@v4
      with:
        version: 9.12.3
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: pnpm
    - name: Install dependencies
      shell: bash
      run: pnpm install --frozen-lockfile
```

- [ ] **Step 2: Validate YAML.**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/actions/setup/action.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Use it in `ci.yml`.** Replace the three steps (Setup pnpm / Setup Node / Install dependencies) in the `validate` job with:

```yaml
      - name: Setup workspace
        uses: ./.github/actions/setup
```

(Keep the `Checkout` step before it.)

- [ ] **Step 4: Use it in `deploy.yml`.** Replace the same three steps in the `deploy` job with:

```yaml
      - name: Setup workspace
        uses: ./.github/actions/setup
```

- [ ] **Step 5: Validate both YAML files.**

Run:
```bash
for f in .github/workflows/ci.yml .github/workflows/deploy.yml; do python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK $f"; done
```
Expected: `OK` for both.

- [ ] **Step 6: Commit.**

```bash
git add .github/actions/setup/action.yml .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "chore(ci): extract composite setup action for ci + deploy"
```

---

### Task 9: Add timeouts, turbo cache, and pnpm audit to CI

**Files:**
- Modify: `.github/workflows/ci.yml` (the `validate` job)

- [ ] **Step 1: Add `timeout-minutes`** to the `validate` job, directly under `runs-on: ubuntu-latest`:

```yaml
    timeout-minutes: 20
```

- [ ] **Step 2: Add a turbo cache step** after the `Setup workspace` step and before `Lint`:

```yaml
      - name: Restore turbo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-
```

- [ ] **Step 3: Add a non-blocking pnpm audit step** after `Test`:

```yaml
      - name: Audit dependencies
        run: pnpm audit --audit-level high || true
```

- [ ] **Step 4: Add `timeout-minutes: 30` to the `deploy` job** in `deploy.yml` (under `environment: production`).

- [ ] **Step 5: Validate YAML.**

Run:
```bash
for f in .github/workflows/ci.yml .github/workflows/deploy.yml; do python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK $f"; done
```
Expected: `OK` for both.

- [ ] **Step 6: Commit.**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "chore(ci): add job timeouts, turbo cache, and pnpm audit"
```

---

### Task 10: Add `timeout-minutes` to all remaining jobs

**Files:**
- Modify: every `.github/workflows/*.yml` job lacking a timeout (the Claude workflows + adr-review's two jobs)

- [ ] **Step 1: For each job in** `claude.yml`, `claude-code-review.yml`, `claude-pr-review.yml`, `claude-api-sync-documentation.yml`, `doc-sync-check.yml`, `claude-auto-issue-triage.yml`, `claude-weekly-maintenance.yml`, and both jobs in `adr-review.yml`, add under `runs-on: ubuntu-latest`:

```yaml
    timeout-minutes: 15
```

(Use `30` for `adr-review.yml`'s `review-all-adrs` job, which can process many ADRs.)

- [ ] **Step 2: Verify every job has a timeout.**

Run:
```bash
grep -L 'timeout-minutes' .github/workflows/*.yml || echo "all jobs have timeouts"
```
Expected: no file paths listed for files with jobs (a path means a file still lacks one — re-check it).

- [ ] **Step 3: Validate + commit.**

```bash
for f in .github/workflows/*.yml; do python3 -c "import yaml; yaml.safe_load(open('$f'))"; done && echo OK
git add .github/workflows
git commit -m "chore(ci): add timeout-minutes to all workflow jobs"
```

---

### Task 11: Reconcile the "80% coverage" checklist claim

**Files:**
- Modify: `.github/workflows/claude-pr-review.yml` (the checklist prompt)

- [ ] **Step 1: Soften the unenforced absolute.** Replace:

```yaml
            - [ ] Test coverage > 80%
```

with:

```yaml
            - [ ] Adequate test coverage for new/changed code
```

- [ ] **Step 2: Validate YAML + commit.**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude-pr-review.yml'))" && echo OK
git add .github/workflows/claude-pr-review.yml
git commit -m "docs(ci): drop unenforced 80% coverage line from PR checklist"
```

---

### Task 12: Open Phase 2 PR

- [ ] **Step 1: Push and open PR.**

```bash
git push -u origin chore/ci-hardening
gh pr create --title "chore(ci): CI hardening (phase 2)" \
  --body "De-dup master validation, composite setup action, timeouts, turbo cache, pnpm audit, coverage-checklist fix. See plan doc."
```
Expected: PR URL printed.

---

# PHASE 3 — Dependency hygiene & automation (branch `chore/deps-hygiene`)

### Task 13: Add Renovate configuration

**Files:**
- Create: `renovate.json` (repo root)

- [ ] **Step 1: Create `renovate.json`.**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":dependencyDashboard",
    "group:monorepos"
  ],
  "packageRules": [
    {
      "matchManagers": ["npm"],
      "matchDepTypes": ["devDependencies"],
      "groupName": "dev dependencies"
    },
    {
      "matchPackagePatterns": ["^@langchain/"],
      "groupName": "langchain"
    },
    {
      "matchPackagePatterns": ["^expo", "^react-native", "^@tamagui/"],
      "groupName": "mobile",
      "enabled": false
    }
  ],
  "vulnerabilityAlerts": { "labels": ["security"] },
  "schedule": ["before 6am on monday"]
}
```

> The mobile group is disabled because Expo/RN/Tamagui versions are coupled (Tamagui is on an RC) — bump those manually. Renovate requires the GitHub App installed on the repo (one-time owner action).

- [ ] **Step 2: Validate JSON.**

Run: `python3 -c "import json; json.load(open('renovate.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit.**

```bash
git add renovate.json
git commit -m "chore(deps): add Renovate config with monorepo grouping"
```

---

### Task 14: Fix `claude-weekly-maintenance.yml` npm → pnpm

**Files:**
- Modify: `.github/workflows/claude-weekly-maintenance.yml`

- [ ] **Step 1: Fix the audit instruction.** In the prompt, replace:

```yaml
            2. Scan for security vulnerabilities using `npm audit`
```

with:

```yaml
            2. Scan for security vulnerabilities using `pnpm audit`
```

- [ ] **Step 2: Fix the allowed tools.** Replace:

```yaml
            --allowedTools "Read,Bash(npm:*),Bash(gh issue:*),Bash(git:*)"
```

with:

```yaml
            --allowedTools "Read,Bash(pnpm:*),Bash(gh issue:*),Bash(git:*)"
```

- [ ] **Step 3: Validate YAML + commit.**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude-weekly-maintenance.yml'))" && echo OK
git add .github/workflows/claude-weekly-maintenance.yml
git commit -m "fix(ci): use pnpm audit in weekly maintenance (repo is pnpm)"
```

---

### Task 15: Align lagging dependency versions

**Files:**
- Modify: `services/api/package.json`, `services/worker/package.json` (typescript `^5.5.4` → `^5.6.3`)
- Modify: `apps/mobile/package.json` (`@supabase/supabase-js` `^2.45.0` → `^2.46.0`)
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Bump TypeScript in the two laggards.** In `services/api/package.json` and `services/worker/package.json`, change the `devDependencies` entry:

```json
    "typescript": "^5.6.3",
```

- [ ] **Step 2: Bump supabase-js in mobile.** In `apps/mobile/package.json` `dependencies`:

```json
    "@supabase/supabase-js": "^2.46.0",
```

- [ ] **Step 3: Update the lockfile.**

Run: `pnpm install --lockfile-only`
Expected: lockfile updates, no errors.

- [ ] **Step 4: Verify typecheck still passes.**

Run: `pnpm typecheck`
Expected: all packages pass.

- [ ] **Step 5: Commit.**

```bash
git add services/api/package.json services/worker/package.json apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(deps): align typescript to 5.6.x; bump supabase-js to 2.46"
```

---

### Task 16: Add a minimal mobile vitest smoke test

**Files:**
- Modify: `apps/mobile/package.json` (add `test` script + `vitest` devDep)
- Create: `apps/mobile/vitest.config.ts`
- Create: `apps/mobile/src/lib/__tests__/markdown.test.ts`

This adds the first mobile test, targeting the pure `parseMarkdown` function (no React Native renderer needed), mirroring the existing `@autodidact/config` vitest pattern.

- [ ] **Step 1: Add the `test` script and `vitest` devDep** to `apps/mobile/package.json`. Add to `scripts`:

```json
    "test": "vitest run",
```

Add to `devDependencies`:

```json
    "@autodidact/config": "workspace:*",
    "vitest": "^2.1.0",
```

(`@autodidact/config` is already present — keep one entry. Just add `vitest`.)

- [ ] **Step 2: Create `apps/mobile/vitest.config.ts`.**

```typescript
import { createBaseConfig } from '../../packages/config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'mobile',
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Install the new devDep.**

Run: `pnpm install`
Expected: `vitest` added to `apps/mobile`; lockfile updates.

- [ ] **Step 4: Write the smoke test** at `apps/mobile/src/lib/__tests__/markdown.test.ts`.

```typescript
import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../markdown';

describe('parseMarkdown', () => {
  it('returns a single text segment for plain text', () => {
    expect(parseMarkdown('hello world')).toEqual([
      { type: 'text', content: 'hello world' },
    ]);
  });

  it('parses inline bold and code', () => {
    expect(parseMarkdown('a **b** `c`')).toEqual([
      { type: 'text', content: 'a ' },
      { type: 'bold', content: 'b' },
      { type: 'text', content: ' ' },
      { type: 'code', content: 'c' },
    ]);
  });

  it('parses a fenced code block with language', () => {
    expect(parseMarkdown('```ts\nconst x = 1;\n```')).toEqual([
      { type: 'codeblock', lang: 'ts', content: 'const x = 1;\n' },
    ]);
  });
});
```

- [ ] **Step 5: Run the test (existing code — expect PASS).**

Run: `pnpm --filter @autodidact/mobile test`
Expected: 3 tests PASS. If the inline/codeblock assertions mismatch the real output, adjust the expected segments to match `parseMarkdown`'s actual behavior (it's a characterization test for existing code, not new behavior).

- [ ] **Step 6: Confirm it runs under the root test command.**

Run: `pnpm test mobile`
Expected: the mobile suite runs and passes.

- [ ] **Step 7: Commit.**

```bash
git add apps/mobile/package.json apps/mobile/vitest.config.ts apps/mobile/src/lib/__tests__/markdown.test.ts pnpm-lock.yaml
git commit -m "test(mobile): add vitest setup and parseMarkdown smoke test"
```

---

### Task 17: Document the Tamagui RC tracking note

**Files:**
- Modify: `apps/mobile/README.md` (append a short note)

- [ ] **Step 1: Append a "Known dependency risk" note** to `apps/mobile/README.md`:

```markdown
## Known dependency risk

`tamagui` and `@tamagui/*` are pinned to `2.0.0-rc.41` (a release candidate).
Renovate's `mobile` group is disabled for these — bump them manually, and move
off the RC to the GA `2.0.0` release once it ships.
```

(If `apps/mobile/README.md` does not exist, create it with a top-level `# @autodidact/mobile` heading followed by this section.)

- [ ] **Step 2: Commit.**

```bash
git add apps/mobile/README.md
git commit -m "docs(mobile): note Tamagui RC pin and manual-bump policy"
```

---

### Task 18: Open Phase 3 PR

- [ ] **Step 1: Push and open PR.**

```bash
git push -u origin chore/deps-hygiene
gh pr create --title "chore(deps): dependency hygiene & automation (phase 3)" \
  --body "Renovate config, pnpm-audit fix in weekly job, TS 5.6 alignment, supabase-js bump, mobile vitest smoke test, Tamagui RC note. See plan doc."
```
Expected: PR URL printed.

---

## Manual follow-ups (owner actions, not code)

- [ ] Enable **branch protection** on `master` requiring the `CI` status check. After this, a follow-up can gate `deploy.yml` on CI (`workflow_run`) and remove deploy's inline validation.
- [ ] Install the **Renovate GitHub App** on `DavidRoyBlue/Autodidact`.
- [ ] (Optional, security best practice) SHA-pin third-party actions (`anthropics/claude-code-action`, `google-github-actions/*`, `pnpm/action-setup`).

---

## Self-review notes

- **Spec coverage:** every finding in the plan doc's three phases maps to a task above; dropped items (`@types/node`, SSOT dedup) are explicitly excluded per the cold review. Deferred deploy items are listed as out of scope. Branch protection + Renovate-app install are owner actions (can't be done in code) and are tracked under Manual follow-ups.
- **No placeholders:** every code/YAML step shows exact content; every verify step has a command + expected output.
- **Consistency:** the allowed-association set `["OWNER","MEMBER","COLLABORATOR"]` is identical across Task 1's four clauses; `parseMarkdown`/`Segment` names match `apps/mobile/src/lib/markdown.ts`; the composite action path `./.github/actions/setup` is used identically in Tasks 8 (ci + deploy).
