#!/usr/bin/env node
// .claude/hooks/stop-gate.mjs — Stop: the regression gate.
// Fires when Claude tries to end its turn. Runs `turbo run typecheck test --affected`
// (changed packages AND their dependents, committed + uncommitted vs TURBO_SCM_BASE;
// turbo handles ^build and caches, so clean re-runs are cheap). On failure it exits 2
// with the output, which bounces Claude back to fix before finishing.
// Why Stop and not per-edit: turbo typecheck/test build dependencies first —
// acceptable once per turn, painful per edit.
// Guards: honors stop_hook_active (no infinite loop); no-ops on docs-only changes
// or when node_modules isn't installed.
import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
try {
  if (JSON.parse(raw).stop_hook_active) process.exit(0);
} catch {}

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const turbo = join(root, "node_modules", ".bin", "turbo");
if (!existsSync(turbo)) process.exit(0); // deps not installed — can't gate

const git = (args) => {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

// Base for "affected": origin/master when available, else fall back to HEAD
// (working-tree-only gating, e.g. before the first fetch).
const base = git("rev-parse --verify -q origin/master")
  ? "origin/master"
  : "HEAD";

// Cheap early exit: docs-only turns don't gate. Everything else (including root
// config changes) is left to turbo --affected, which also pulls in dependents.
const changed = [
  ...git(`diff --name-only ${base}`).split("\n"),
  ...git("ls-files --others --exclude-standard").split("\n"),
].filter((f) => f && !f.endsWith(".md"));
if (changed.length === 0) process.exit(0);

try {
  execFileSync(
    turbo,
    ["run", "typecheck", "test", "--affected", "--output-logs=errors-only"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1", TURBO_SCM_BASE: base },
    },
  );
  process.exit(0);
} catch (err) {
  const out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim();
  const tail = out.split("\n").slice(-120).join("\n"); // cap so context isn't flooded
  console.error(
    `Stop gate failed — typecheck/tests are red for affected packages (base: ${base}). Fix before finishing:\n\n${tail}`,
  );
  process.exit(2);
}
