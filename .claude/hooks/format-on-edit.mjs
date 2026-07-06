#!/usr/bin/env node
// .claude/hooks/format-on-edit.mjs — PostToolUse(Edit|Write): prettier --write the edited file.
// Fires after every Edit/Write. Why: deterministic formatting instead of trusting prose
// instructions; single-file prettier is fast enough to run per edit.
// Typecheck/tests deliberately live in stop-gate.mjs — turbo typecheck builds dependencies
// first, which is too slow to run on every edit.
// Never blocks: always exits 0; a formatting failure is not an edit failure.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname } from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let file = "";
try {
  file = JSON.parse(raw).tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}

const FORMATTABLE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".yml", ".yaml"]);
if (!file || !existsSync(file) || !FORMATTABLE.has(extname(file))) process.exit(0);
if (/\/(node_modules|dist|build|\.expo)\//.test(file)) process.exit(0);

try {
  execFileSync("pnpm", ["exec", "prettier", "--write", "--ignore-unknown", file], {
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    stdio: "ignore",
    timeout: 20_000,
  });
} catch {
  // prettier missing or file unparsable — never fail the edit over formatting
}
process.exit(0);
