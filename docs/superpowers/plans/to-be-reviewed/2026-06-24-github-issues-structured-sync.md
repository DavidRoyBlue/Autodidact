# GitHub Issues — Structured Sync Implementation Plan

> **Superseded (2026-07-18):** the hook + helper described here were consolidated into
> `issuekit/` (`cli.mjs sync`, rules in `issuekit/rules.json`). This plan is kept as the
> historical record of what was built; see `issuekit/README.md` for the current system.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-06-24
**Parent:** GitHub-Issues-Lifecycle.md
**Spec:** [`../../specs/to-be-reviewed/GitHub-Issues-Lifecycle.md`](../../specs/to-be-reviewed/GitHub-Issues-Lifecycle.md)

**Goal:** When CC writes a new spec/plan under `docs/superpowers/`, a GitHub issue is created automatically, linked to the file via a sidecar map, labelled from the folder, and (if the file declares a parent) attached as a sub-issue — with no file mutation and no duplicates.

**Architecture:** A pure helper module (`.claude/hooks/lib/issues.mjs`) holds all testable logic (path classification, title/body/parent extraction, map read/write). A thin PostToolUse hook (`.claude/hooks/issues-sync.mjs`) orchestrates it with `gh`/`git` subprocess calls. The file→issue link lives in `.claude/issue-map.json` (tracked); the hook never edits the source `.md`. Issue creation is idempotent (adopt-by-title) so a lost map can never duplicate.

**Tech Stack:** Node 24 ESM (`.mjs`), built-in `node:test` + `node:assert` (no test deps), `gh` CLI, `git`. This implements Phases 1–3 and 5 of the spec.

## Global Constraints

- Superpowers tree root is `docs/superpowers/` (Phase 0 verified). Only `*.md` files under it are in scope.
- The hook **must exit 0 always** — never block CC, even on error.
- The hook writes only two things: `.claude/issue-map.json` (content) and its git index entry (`git add`). It **never** edits a source `.md` file and **never** creates a commit.
- Map is keyed by **filename (basename)**, stable across folder moves. Values: `{ issue: <number>, parent: <filename|null> }`.
- Labels: `ready` (folder `to-be-reviewed/`, or default), `in-progress` (folder `in-progress/` or `plan-in-action/`). No `in-review`.
- All paths in commands are repo-relative unless noted; the hook resolves the repo root via `git rev-parse --show-toplevel`.

---

## File Map

**Created:**
- `.claude/hooks/lib/issues.mjs` — pure helpers (tested)
- `.claude/hooks/lib/issues.test.mjs` — `node:test` unit tests
- `.claude/hooks/issues-sync.mjs` — PostToolUse hook (orchestration)
- `.claude/hooks/backfill-issues.mjs` — one-time backfill runner
- `.claude/issue-map.json` — sidecar, initialised to `{}`

**Modified:**
- `.claude/settings.json` — add `issues-sync.mjs` under the existing PostToolUse `Write` matcher
- `CLAUDE.md` — add `## GitHub Issues` section (two CC instructions only)

---

### Task 1: Pure helper module (`lib/issues.mjs`)

**Files:**
- Create: `.claude/hooks/lib/issues.mjs`
- Test: `.claude/hooks/lib/issues.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isSuperpowersFile(filePath: string): boolean`
  - `labelForPath(filePath: string): "ready" | "in-progress"`
  - `isDonePath(filePath: string): boolean`
  - `titleFromContent(content: string, fallbackBasename: string): string`
  - `bodyFromContent(content: string, title: string): string`
  - `parentFromContent(content: string): string | null`
  - `readMap(repoRoot: string): object` / `writeMap(repoRoot: string, map: object): void`
  - `mapPath(repoRoot: string): string`

- [ ] **Step 1: Write the failing test**

```js
// .claude/hooks/lib/issues.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as L from "./issues.mjs";

test("isSuperpowersFile: only .md under docs/superpowers", () => {
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/specs/to-be-reviewed/a.md"), true);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/plans/in-progress/b.md"), true);
  assert.equal(L.isSuperpowersFile("/r/docs/architecture/x.md"), false);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/specs/a.txt"), false);
});

test("labelForPath: folder → label", () => {
  assert.equal(L.labelForPath("/r/docs/superpowers/specs/to-be-reviewed/a.md"), "ready");
  assert.equal(L.labelForPath("/r/docs/superpowers/plans/in-progress/a.md"), "in-progress");
  assert.equal(L.labelForPath("/r/docs/superpowers/specs/plan-in-action/a.md"), "in-progress");
  assert.equal(L.labelForPath("/r/docs/superpowers/specs/_done/a.md"), "ready");
});

test("isDonePath", () => {
  assert.equal(L.isDonePath("/r/docs/superpowers/specs/_done/a.md"), true);
  assert.equal(L.isDonePath("/r/docs/superpowers/specs/to-be-reviewed/a.md"), false);
});

test("titleFromContent: H1 else basename", () => {
  assert.equal(L.titleFromContent("# My Spec — Title\n\nbody", "x.md"), "My Spec — Title");
  assert.equal(L.titleFromContent("no heading here", "2026-06-24-thing.md"), "2026-06-24-thing");
});

test("bodyFromContent: first prose paragraph, skips headings/metadata/callouts", () => {
  const content = "# Title\n\n**Date:** 2026-06-24\n**Parent:** p.md\n\n> a callout\n\nThe real first paragraph.\n\nSecond.";
  assert.equal(L.bodyFromContent(content, "Title"), "The real first paragraph.");
  assert.equal(L.bodyFromContent("# Only Title", "Only Title"), "Only Title");
});

test("parentFromContent: filename or null", () => {
  assert.equal(L.parentFromContent("**Parent:** 2026-06-20-foo.md\n"), "2026-06-20-foo.md");
  assert.equal(L.parentFromContent("no parent field"), null);
});

test("readMap/writeMap round-trip with sorted keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "imap-"));
  try {
    const { mkdirSync } = require("node:fs"); // placeholder — replaced in Step 3 note
  } catch {}
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test .claude/hooks/lib/issues.test.mjs`
Expected: FAIL — `Cannot find module './issues.mjs'` (or export-not-found).

- [ ] **Step 3: Write the minimal implementation**

```js
// .claude/hooks/lib/issues.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export const SUPERPOWERS_ROOT = "docs/superpowers";

export function isSuperpowersFile(filePath) {
  return filePath.includes(`${SUPERPOWERS_ROOT}/`) && filePath.endsWith(".md");
}

export function labelForPath(filePath) {
  if (filePath.includes("/in-progress/") || filePath.includes("/plan-in-action/")) {
    return "in-progress";
  }
  return "ready";
}

export function isDonePath(filePath) {
  return filePath.includes("/_done/");
}

export function titleFromContent(content, fallbackBasename) {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : fallbackBasename.replace(/\.md$/, "");
}

export function bodyFromContent(content, title) {
  const paras = [];
  let cur = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      if (cur.length) { paras.push(cur.join(" ").trim()); cur = []; }
      continue;
    }
    cur.push(line);
  }
  if (cur.length) paras.push(cur.join(" ").trim());
  const skip = (p) => p.startsWith("#") || p.startsWith("**") || p.startsWith(">") || p.startsWith("---");
  for (const p of paras) {
    if (!skip(p)) return p.slice(0, 500);
  }
  return title;
}

export function parentFromContent(content) {
  const m = content.match(/^\*\*Parent:\*\*\s*(\S+)/m);
  return m ? m[1].trim() : null;
}

export function mapPath(repoRoot) {
  return join(repoRoot, ".claude", "issue-map.json");
}

export function readMap(repoRoot) {
  const p = mapPath(repoRoot);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; }
}

export function writeMap(repoRoot, map) {
  const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
  const p = mapPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n");
}
```

- [ ] **Step 4: Replace the placeholder round-trip test with a real one**

Replace the last `test(...)` block in `issues.test.mjs` with:

```js
test("readMap returns {} when absent; writeMap persists sorted, readMap reads it back", () => {
  const dir = mkdtempSync(join(tmpdir(), "imap-"));
  try {
    assert.deepEqual(L.readMap(dir), {});
    L.writeMap(dir, { "b.md": { issue: 2, parent: null }, "a.md": { issue: 1, parent: "b.md" } });
    const back = L.readMap(dir);
    assert.deepEqual(Object.keys(back), ["a.md", "b.md"]); // sorted
    assert.deepEqual(back["a.md"], { issue: 1, parent: "b.md" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test .claude/hooks/lib/issues.test.mjs`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/lib/issues.mjs .claude/hooks/lib/issues.test.mjs
git commit -m "feat(hooks): pure helpers for github issue sync"
```

---

### Task 2: PostToolUse hook + wiring + labels

**Files:**
- Create: `.claude/hooks/issues-sync.mjs`
- Create: `.claude/issue-map.json` (content `{}`)
- Modify: `.claude/settings.json` (add hook under the existing `Write` matcher)

**Interfaces:**
- Consumes: all exports of `lib/issues.mjs` (Task 1).
- Produces: a runnable hook; no JS exports.

- [ ] **Step 1: Create GitHub labels (idempotent setup)**

Run (each is safe to re-run; ignore "already exists"):

```bash
gh label create "ready"       --color "0075ca" --description "Created in to-be-reviewed/" || true
gh label create "in-progress" --color "e4e669" --description "Created in in-progress/ or plan-in-action/" || true
```

Expected: labels exist (`gh label list` shows both).

- [ ] **Step 2: Initialise the sidecar**

```bash
printf '{}\n' > .claude/issue-map.json
```

Expected: `cat .claude/issue-map.json` prints `{}`.

- [ ] **Step 3: Write the hook**

```js
#!/usr/bin/env node
// .claude/hooks/issues-sync.mjs — PostToolUse(Write): create+link a GitHub issue for new superpowers files.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./lib/issues.mjs";

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

function adoptByTitle(title) {
  // exact-title match across all states → idempotent (spec D10)
  const out = sh("gh", ["issue", "list", "--state", "all", "--search", `in:title "${title}"`,
    "--json", "number,title"]);
  const found = JSON.parse(out).find((i) => i.title === title);
  return found ? String(found.number) : null;
}

function nodeId(issueNumber) {
  return sh("gh", ["issue", "view", String(issueNumber), "--json", "id", "-q", ".id"]);
}

function linkSubIssue(parentNumber, childNumber) {
  sh("gh", ["api", "graphql", "-f", `query=
    mutation($parentId: ID!, $childId: ID!) {
      addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) { issue { number } }
    }`,
    "-f", `parentId=${nodeId(parentNumber)}`,
    "-f", `childId=${nodeId(childNumber)}`]);
}

function run() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.tool_name !== "Write") return;
  const filePath = input.tool_input?.file_path ?? "";
  if (!L.isSuperpowersFile(filePath)) return;

  const repoRoot = sh("git", ["rev-parse", "--show-toplevel"]);
  const base = basename(filePath);
  const map = L.readMap(repoRoot);
  if (map[base]) return; // already linked — safe on rewrite

  const content = readFileSync(filePath, "utf8");
  const title = L.titleFromContent(content, base);
  const label = L.labelForPath(filePath);
  const body = L.bodyFromContent(content, title);

  let n = adoptByTitle(title);
  if (!n) {
    const url = sh("gh", ["issue", "create", "--title", title, "--body", body, "--label", label]);
    n = url.split("/").pop();
    if (L.isDonePath(filePath)) {
      sh("gh", ["issue", "close", n, "-c", "Created already complete."]);
    }
  }

  const parent = L.parentFromContent(content);
  if (parent && map[parent]?.issue) {
    try { linkSubIssue(map[parent].issue, n); }
    catch { process.stderr.write(`[issues-sync] sub-issue link failed for ${base}\n`); }
  } else if (parent) {
    process.stderr.write(`[issues-sync] parent ${parent} not yet linked, skipping\n`);
  }

  map[base] = { issue: Number(n), parent: parent || null };
  L.writeMap(repoRoot, map);
  sh("git", ["add", ".claude/issue-map.json"], { cwd: repoRoot });
  process.stderr.write(`[issues-sync] Linked #${n}: ${title}\n`);
}

try { run(); } catch (e) { process.stderr.write(`[issues-sync] ${e.message}\n`); }
process.exit(0);
```

- [ ] **Step 4: Wire the hook into settings.json**

Add a new entry to the existing `PostToolUse` array (do NOT remove the existing `Edit|Write|Bash` and `Write` entries). Use the **absolute** path printed by `echo "$(git rev-parse --show-toplevel)/.claude/hooks/issues-sync.mjs"`:

```json
{
  "matcher": "Write",
  "hooks": [
    { "type": "command", "command": "node /home/bkd/Projects/Autodidact/.claude/hooks/issues-sync.mjs" }
  ]
}
```

Verify the JSON parses:

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Manual end-to-end verification**

Create a throwaway spec to trigger the hook, then assert outcomes:

```bash
cat > docs/superpowers/specs/to-be-reviewed/2026-06-24-hook-smoke-test.md <<'EOF'
# Hook Smoke Test

**Date:** 2026-06-24

A throwaway spec to verify the issues-sync hook fires.
EOF
```

Because hooks fire on the **Write tool**, re-create the file through CC's Write tool (not the heredoc above) during execution, or invoke the hook directly to simulate:

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/docs/superpowers/specs/to-be-reviewed/2026-06-24-hook-smoke-test.md"}}' \
  | node .claude/hooks/issues-sync.mjs
```

Expected, in order:
- stderr prints `[issues-sync] Linked #<N>: Hook Smoke Test`
- `gh issue view <N> --json title,labels` → title `Hook Smoke Test`, label `ready`
- `cat .claude/issue-map.json` contains `"2026-06-24-hook-smoke-test.md": { "issue": <N>, "parent": null }`
- `git diff docs/superpowers/specs/to-be-reviewed/2026-06-24-hook-smoke-test.md` → **empty** (file unmodified)
- `git status --porcelain .claude/issue-map.json` → `M ` or `A ` (staged)

- [ ] **Step 6: Verify idempotency (no duplicate)**

```bash
rm .claude/issue-map.json && printf '{}\n' > .claude/issue-map.json
echo '{"tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/docs/superpowers/specs/to-be-reviewed/2026-06-24-hook-smoke-test.md"}}' \
  | node .claude/hooks/issues-sync.mjs
```

Expected: the map is repopulated with the **same** issue number (adopted by title) — `gh issue list --search 'in:title "Hook Smoke Test"' --json number` shows exactly one issue.

- [ ] **Step 7: Clean up the smoke test**

```bash
N=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/issue-map.json'))['2026-06-24-hook-smoke-test.md'].issue)")
gh issue close "$N" -c "smoke test"
gh issue delete "$N" --yes 2>/dev/null || true
rm docs/superpowers/specs/to-be-reviewed/2026-06-24-hook-smoke-test.md
node -e "const f='.claude/issue-map.json',m=JSON.parse(require('fs').readFileSync(f));delete m['2026-06-24-hook-smoke-test.md'];require('fs').writeFileSync(f,JSON.stringify(m,null,2)+'\n')"
```

Expected: smoke issue gone, map back to `{}`, test file removed.

- [ ] **Step 8: Commit**

```bash
git add .claude/hooks/issues-sync.mjs .claude/settings.json .claude/issue-map.json
git commit -m "feat(hooks): PostToolUse issue sync for superpowers files"
```

---

### Task 3: CLAUDE.md instructions

**Files:**
- Modify: `CLAUDE.md` (append one section)

**Interfaces:**
- Consumes: nothing.
- Produces: documentation only.

- [ ] **Step 1: Append the section**

Append to the end of `CLAUDE.md`:

```markdown
## GitHub Issues

Issue creation and labelling are automated by `.claude/hooks/issues-sync.mjs`. The filename→issue
link lives in `.claude/issue-map.json` — never write an `**Issue:**` field into files.

### When creating a spec or plan that belongs to a parent
Add `**Parent:** <parent-filename.md>` to the file body alongside `**Date:**`, before writing.
The hook resolves that filename to the parent issue and sets the sub-issue relationship. Use the
parent's filename, not an issue number.

### When all checkboxes in a plan file are checked off
1. Look up the plan's issue number in `.claude/issue-map.json` (keyed by filename).
2. Close it: `gh issue close #N -c "All tasks complete."`
3. If the plan has a parent and every sibling plan under it is also closed, close the parent too.
4. Include `Closes #N` in the PR body for the deepest relevant issue (the plan, not the spec).

Do not manually create issues, edit labels, or close issues on folder moves — the hook and the
folder location handle status.
```

- [ ] **Step 2: Verify it reads cleanly**

Run: `tail -n 25 CLAUDE.md`
Expected: the section is present and well-formed.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document github issue sync behaviour for CC"
```

---

### Task 4: Backfill existing files

**Files:**
- Create: `.claude/hooks/backfill-issues.mjs`

**Interfaces:**
- Consumes: all exports of `lib/issues.mjs` (Task 1).
- Produces: a one-shot CLI script (`node .claude/hooks/backfill-issues.mjs [--dry-run]`).

- [ ] **Step 1: Write the backfill script**

```js
#!/usr/bin/env node
// .claude/hooks/backfill-issues.mjs — one-time: create/adopt issues for existing superpowers files.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import * as L from "./lib/issues.mjs";

const DRY = process.argv.includes("--dry-run");
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listFiles() {
  // specs first, then plans → parents before children
  const out = sh("git", ["ls-files", "docs/superpowers/specs", "docs/superpowers/plans"]);
  return out.split("\n").filter((p) => p.endsWith(".md"))
    .sort((a, b) => (a.includes("/specs/") ? 0 : 1) - (b.includes("/specs/") ? 0 : 1));
}
function adoptByTitle(title) {
  const out = sh("gh", ["issue", "list", "--state", "all", "--search", `in:title "${title}"`, "--json", "number,title"]);
  const f = JSON.parse(out).find((i) => i.title === title);
  return f ? String(f.number) : null;
}

const repoRoot = sh("git", ["rev-parse", "--show-toplevel"]);
const map = L.readMap(repoRoot);
let created = 0, adopted = 0, skipped = 0;

for (const file of listFiles()) {
  const base = basename(file);
  if (map[base]) { skipped++; continue; }
  const content = readFileSync(file, "utf8");
  const title = L.titleFromContent(content, base);
  const label = L.labelForPath(file);
  const body = L.bodyFromContent(content, title);
  const parent = L.parentFromContent(content);

  if (DRY) { console.log(`would create: ${base} → "${title}" [${label}] parent=${parent ?? "-"}`); continue; }

  let n = adoptByTitle(title);
  if (n) { adopted++; }
  else {
    const url = sh("gh", ["issue", "create", "--title", title, "--body", body, "--label", label]);
    n = url.split("/").pop();
    if (L.isDonePath(file)) sh("gh", ["issue", "close", n, "-c", "Created already complete."]);
    created++;
    await sleep(1000); // rate-limit politeness
  }
  map[base] = { issue: Number(n), parent: parent || null };
  L.writeMap(repoRoot, map);
}
if (!DRY) sh("git", ["add", ".claude/issue-map.json"], { cwd: repoRoot });
console.log(`backfill: ${created} created, ${adopted} adopted, ${skipped} skipped`);
```

> Note: sub-issue linking is intentionally omitted from backfill v1 — declare parents going forward via the hook. If retroactive linking is wanted, a follow-up pass can read each file's `**Parent:**` and call the same GraphQL mutation as `issues-sync.mjs`.

- [ ] **Step 2: Dry-run to preview**

Run: `node .claude/hooks/backfill-issues.mjs --dry-run`
Expected: one `would create: …` line per tracked superpowers `.md` not already in the map; no GitHub calls.

- [ ] **Step 3: Run for real**

Run: `node .claude/hooks/backfill-issues.mjs`
Expected: `backfill: <N> created, <A> adopted, 0 skipped` (first run); `.claude/issue-map.json` now has one entry per file; re-running prints `0 created, 0 adopted, <all> skipped`.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/backfill-issues.mjs .claude/issue-map.json
git commit -m "feat(hooks): one-time backfill of issues for existing superpowers files"
```

---

## Self-Review

- **Spec coverage:** Phase 1 (labels) → Task 2 Step 1. Phase 2 (CLAUDE.md) → Task 3. Phase 3 (PostToolUse hook + sidecar) → Tasks 1–2. Phase 5 (backfill) → Task 4. D1/D2 (sidecar, parent-by-filename) → Task 1 + hook. D3 (labels from folder) → `labelForPath`. D10 (idempotent adopt-by-title; hook `git add`s map) → `adoptByTitle` + Task 2 Step 6 + hook step. Phase 4 (Stop hook) is the **sibling plan** `2026-06-24-github-issues-session-handler.md`. Phase 0 (verify) is a precondition — re-confirm `docs/superpowers/` root before Task 2.
- **Placeholders:** the only deliberate `<<placeholder>>` was the round-trip test stub in Task 1 Step 1, replaced with real code in Step 4 (executor writes Step 3's module between them).
- **Type consistency:** `issue` is a number in the map (`Number(n)`), `parent` is a filename string or `null`, everywhere (`writeMap`, hook, backfill).
