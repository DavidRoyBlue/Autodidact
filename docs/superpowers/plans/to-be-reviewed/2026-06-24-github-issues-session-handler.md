# GitHub Issues — Session Handler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-06-24
**Parent:** GitHub-Issues-Lifecycle.md
**Spec:** [`../../specs/to-be-reviewed/GitHub-Issues-Lifecycle.md`](../../specs/to-be-reviewed/GitHub-Issues-Lifecycle.md)
**Depends on:** `2026-06-24-github-issues-structured-sync.md` (reuses `lib/issues.mjs#isSuperpowersFile`). Execute that plan first.

**Goal:** At the end of every session, record unstructured work as a GitHub issue — match-and-close an existing open issue the session addressed, or create-and-close a session-record issue — while skipping sessions where the structured PostToolUse hook already created an issue.

**Architecture:** A pure transcript helper module (`.claude/hooks/lib/transcript.mjs`) parses the JSONL transcript: detects whether any superpowers-tree `Write` happened (structured signal) and extracts a short summary. A thin Stop hook (`.claude/hooks/session-issues.mjs`) orchestrates it with `gh` and a `claude -p` subprocess for issue matching. A sentinel env var prevents the nested `claude -p` from recursing into this hook.

**Tech Stack:** Node 24 ESM (`.mjs`), built-in `node:test` + `node:assert`, `gh` CLI, `claude -p` (Claude Code CLI — no `ANTHROPIC_API_KEY`). Implements Phase 4 of the spec.

## Global Constraints

- The hook **must exit 0 always** — never block CC.
- **No `ANTHROPIC_API_KEY`** anywhere — all model calls go through `claude -p --model claude-haiku-4-5`.
- **Recursion guard:** the hook exits immediately if `process.env.ISSUES_SYNC_NESTED` is set, and sets `ISSUES_SYNC_NESTED=1` on the `claude -p` subprocess it spawns.
- **Structured detection precedence:** if the transcript shows any `Write` whose `file_path` is a superpowers file, the PostToolUse hook already handled it → exit without acting.
- Born-closed issues are **intentional** (session records) — create then immediately close (spec C3).
- Superpowers classification reuses `isSuperpowersFile` from `lib/issues.mjs` (sibling plan) — do not reimplement.

---

## File Map

**Created:**
- `.claude/hooks/lib/transcript.mjs` — pure transcript parsing (tested)
- `.claude/hooks/lib/transcript.test.mjs` — `node:test` unit tests
- `.claude/hooks/session-issues.mjs` — Stop hook (orchestration)

**Modified:**
- `.claude/settings.json` — add a `Stop` hook entry (none exists today)

---

### Task 1: Transcript helper module (`lib/transcript.mjs`)

**Files:**
- Create: `.claude/hooks/lib/transcript.mjs`
- Test: `.claude/hooks/lib/transcript.test.mjs`

**Interfaces:**
- Consumes: `isSuperpowersFile(filePath)` from `./issues.mjs` (sibling plan).
- Produces:
  - `parseTranscript(jsonlText: string): object[]` — one parsed object per non-blank line (bad lines skipped)
  - `hasSuperpowersWrite(entries: object[]): boolean`
  - `extractSummary(entries: object[], maxMessages = 4): string`

**Transcript shape (Claude Code JSONL):** each line is `{ type, message: { role, content } }`. Assistant tool calls appear as `content` array items `{ type: "tool_use", name, input }`. Assistant text appears as `{ type: "text", text }` (or `content` may be a plain string).

- [ ] **Step 1: Write the failing test**

```js
// .claude/hooks/lib/transcript.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "./transcript.mjs";

const line = (obj) => JSON.stringify(obj);

const WRITE_SP = line({
  type: "assistant",
  message: { role: "assistant", content: [
    { type: "tool_use", name: "Write", input: { file_path: "/r/docs/superpowers/plans/to-be-reviewed/x.md", content: "# X" } },
  ] },
});
const WRITE_OTHER = line({
  type: "assistant",
  message: { role: "assistant", content: [
    { type: "tool_use", name: "Write", input: { file_path: "/r/src/index.ts", content: "x" } },
  ] },
});
const TEXT = (t) => line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: t }] } });

test("parseTranscript skips blank and malformed lines", () => {
  const txt = [WRITE_OTHER, "", "not json", TEXT("hello")].join("\n");
  assert.equal(T.parseTranscript(txt).length, 2);
});

test("hasSuperpowersWrite: true only when a superpowers Write exists", () => {
  assert.equal(T.hasSuperpowersWrite(T.parseTranscript(WRITE_SP)), true);
  assert.equal(T.hasSuperpowersWrite(T.parseTranscript(WRITE_OTHER)), false);
  assert.equal(T.hasSuperpowersWrite(T.parseTranscript(TEXT("hi"))), false);
});

test("extractSummary: last N assistant text messages, newest-last, joined", () => {
  const txt = [TEXT("first"), TEXT("second"), TEXT("third")].join("\n");
  const s = T.extractSummary(T.parseTranscript(txt), 2);
  assert.ok(s.includes("second") && s.includes("third"));
  assert.ok(!s.includes("first"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test .claude/hooks/lib/transcript.test.mjs`
Expected: FAIL — `Cannot find module './transcript.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

```js
// .claude/hooks/lib/transcript.mjs
import { isSuperpowersFile } from "./issues.mjs";

export function parseTranscript(jsonlText) {
  const out = [];
  for (const raw of jsonlText.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

function contentItems(entry) {
  const c = entry?.message?.content;
  if (Array.isArray(c)) return c;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return [];
}

export function hasSuperpowersWrite(entries) {
  for (const e of entries) {
    for (const item of contentItems(e)) {
      if (item.type === "tool_use" && item.name === "Write" &&
          typeof item.input?.file_path === "string" &&
          isSuperpowersFile(item.input.file_path)) {
        return true;
      }
    }
  }
  return false;
}

export function extractSummary(entries, maxMessages = 4) {
  const texts = [];
  for (const e of entries) {
    if (e?.message?.role !== "assistant") continue;
    const t = contentItems(e).filter((i) => i.type === "text").map((i) => i.text).join(" ").trim();
    if (t) texts.push(t);
  }
  return texts.slice(-maxMessages).join("\n\n").slice(0, 2000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test .claude/hooks/lib/transcript.test.mjs`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/lib/transcript.mjs .claude/hooks/lib/transcript.test.mjs
git commit -m "feat(hooks): pure transcript helpers for session issue handler"
```

---

### Task 2: Stop hook + wiring

**Files:**
- Create: `.claude/hooks/session-issues.mjs`
- Modify: `.claude/settings.json` (add `Stop` block)

**Interfaces:**
- Consumes: `parseTranscript`, `hasSuperpowersWrite`, `extractSummary` from `lib/transcript.mjs` (Task 1).
- Produces: a runnable hook; no JS exports.

- [ ] **Step 1: Write the hook**

```js
#!/usr/bin/env node
// .claude/hooks/session-issues.mjs — Stop: record freeform/standalone sessions as (born-closed) issues.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { parseTranscript, hasSuperpowersWrite, extractSummary } from "./lib/transcript.mjs";

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

function run() {
  // Recursion guard: the claude -p call below sets this; bail if we are that nested call.
  if (process.env.ISSUES_SYNC_NESTED) return;

  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.stop_hook_active) return;

  const tpath = input.transcript_path;
  if (!tpath || !existsSync(tpath)) return;
  const entries = parseTranscript(readFileSync(tpath, "utf8"));

  // Structured work already handled by the PostToolUse hook → do nothing.
  if (hasSuperpowersWrite(entries)) return;

  const summary = extractSummary(entries);
  if (!summary) return;

  const openIssues = sh("gh", ["issue", "list", "--state", "open", "--json", "number,title",
    "--jq", '.[] | "\\(.number): \\(.title)"']);

  // Ask claude -p (Haiku) which open issue, if any, this session addressed.
  const prompt =
    `Session output:\n${summary}\n\nOpen issues:\n${openIssues || "(none)"}\n\n` +
    `Return ONLY the number of the single open issue most clearly addressed by this session, ` +
    `or the word null if none matches well.`;
  let answer = "null";
  try {
    answer = sh("claude", ["-p", "--model", "claude-haiku-4-5", prompt],
      { env: { ...process.env, ISSUES_SYNC_NESTED: "1" } });
  } catch { /* fall through to create-and-close */ }

  const match = (answer.match(/\d+/) || [])[0];
  if (match && /^\d+$/.test(answer.trim())) {
    sh("gh", ["issue", "comment", match, "--body", `Addressed in a session:\n\n${summary}`]);
    sh("gh", ["issue", "close", match]);
    process.stderr.write(`[session-issues] Closed matched #${match}\n`);
  } else {
    const firstLine = summary.split("\n").find((l) => l.trim()) ?? "Session";
    const url = sh("gh", ["issue", "create", "--title", `Session: ${firstLine.slice(0, 70)}`,
      "--body", summary, "--label", "ready"]);
    const n = url.split("/").pop();
    sh("gh", ["issue", "close", n, "-c", "Session record — completed."]);
    process.stderr.write(`[session-issues] Recorded #${n}\n`);
  }
}

try { run(); } catch (e) { process.stderr.write(`[session-issues] ${e.message}\n`); }
process.exit(0);
```

- [ ] **Step 2: Wire the Stop hook into settings.json**

Add a top-level `Stop` key to `.claude/settings.json` (none exists). Use the **absolute** path from `echo "$(git rev-parse --show-toplevel)/.claude/hooks/session-issues.mjs"`:

```json
"Stop": [
  {
    "matcher": "",
    "hooks": [
      { "type": "command", "command": "node /home/bkd/Projects/Autodidact/.claude/hooks/session-issues.mjs" }
    ]
  }
]
```

Verify the JSON parses:

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Verify structured-session skip (no GitHub calls)**

Build a fake transcript containing a superpowers Write and confirm the hook exits silently:

```bash
TF=$(mktemp)
printf '%s\n' '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Write","input":{"file_path":"/r/docs/superpowers/plans/to-be-reviewed/x.md","content":"# X"}}]}}' > "$TF"
echo '{"stop_hook_active":false,"transcript_path":"'"$TF"'"}' | node .claude/hooks/session-issues.mjs
echo "exit=$?"
```

Expected: no stderr output, `exit=0`, and **no new issue** on GitHub (`gh issue list --state all --search "in:title Session:" --limit 1` unchanged).

- [ ] **Step 4: Verify recursion guard**

```bash
echo '{"stop_hook_active":false,"transcript_path":"/nonexistent"}' \
  | ISSUES_SYNC_NESTED=1 node .claude/hooks/session-issues.mjs
echo "exit=$?"
```

Expected: immediate `exit=0`, no output (guard tripped before reading the transcript).

- [ ] **Step 5: Verify freeform create-and-close (real, throwaway)**

Build a fake freeform transcript (assistant text only, no superpowers Write) and run the hook:

```bash
TF=$(mktemp)
printf '%s\n' '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Refactored the logging helper and added a retry."}]}}' > "$TF"
echo '{"stop_hook_active":false,"transcript_path":"'"$TF"'"}' | node .claude/hooks/session-issues.mjs
```

Expected: stderr prints `[session-issues] Closed matched #<N>` (if Haiku matched an open issue) **or** `[session-issues] Recorded #<N>`; that issue is **closed** (`gh issue view <N> --json state` → `CLOSED`). Then clean up a stray record:

```bash
# if it created a "Session: …" record, delete it
gh issue list --state all --search 'in:title "Session: Refactored"' --json number --jq '.[].number' \
  | xargs -r -I{} gh issue delete {} --yes
```

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/session-issues.mjs .claude/settings.json
git commit -m "feat(hooks): Stop hook records freeform sessions as github issues"
```

---

## Self-Review

- **Spec coverage:** Phase 4 detection logic → Task 1 (`hasSuperpowersWrite`, `extractSummary`) + Task 2 hook. D6 (structured-detection by transcript `file_path`, match-or-create-and-close) → Task 2 Steps 1, 3, 5. D7 (`claude -p`, no API key, `ISSUES_SYNC_NESTED` recursion guard) → Global Constraints + Task 2 Steps 1, 4. C3 (born-closed session records) → Task 2 Step 1 else-branch. The Stop hook reuses `isSuperpowersFile` rather than redefining the tree root (DRY with the sibling plan).
- **Placeholders:** none — every step has runnable code or an exact command with expected output.
- **Type consistency:** `parseTranscript` → `object[]`; `hasSuperpowersWrite` consumes that array and returns boolean; `extractSummary` consumes it and returns string. The Stop hook passes `entries` (the parsed array) to both, matching the signatures defined in Task 1.
