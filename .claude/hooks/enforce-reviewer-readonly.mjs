#!/usr/bin/env node
// .claude/hooks/enforce-reviewer-readonly.mjs — PreToolUse, scoped to the code-reviewer
// subagent via its frontmatter (fires only while that agent is active).
// Why: enabling agent memory auto-enables Write/Edit so the agent can maintain its
// memory files. This hook pins those writes to the agent's own memory directory and
// restricts Bash to un-chained read-only git commands, so the reviewer provably
// cannot modify the codebase (enforcement at the tool layer, not prompt trust).
import { resolve, sep } from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? "";
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
  const file = resolve(
    input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "",
  );
  const memDir =
    resolve(root, ".claude", "agent-memory", "code-reviewer") + sep;
  if (!file.startsWith(memDir)) {
    console.error(
      `code-reviewer is read-only: writes are allowed only under ${memDir}`,
    );
    process.exit(2);
  }
  process.exit(0);
}

if (tool === "Bash") {
  const cmd = (input.tool_input?.command ?? "").trim();
  // Read-only git subcommands only; no chaining, piping, or redirection.
  const READONLY =
    /^git (diff|show|log|status|blame|rev-parse|ls-files)\b[^;&|>`$]*$/;
  if (!READONLY.test(cmd)) {
    console.error(
      "code-reviewer Bash is limited to read-only git commands (diff/show/log/status/blame/rev-parse/ls-files) without chaining or redirection.",
    );
    process.exit(2);
  }
}
process.exit(0);
