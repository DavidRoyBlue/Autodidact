#!/usr/bin/env node
// .claude/hooks/stop-gate.mjs — Stop: the regression gate.
// Fires when Claude tries to end its turn. Finds workspace packages touched by
// uncommitted and unpushed changes and runs `turbo run typecheck test` scoped to
// them (turbo handles ^build and caches, so clean re-runs are cheap). On failure
// it exits 2 with the output, which bounces Claude back to fix before finishing.
// Why Stop and not per-edit: turbo typecheck/test build dependencies first —
// acceptable once per turn, painful per edit.
// Guards: honors stop_hook_active (no infinite loop); no-ops when nothing relevant
// changed or when node_modules isn't installed.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

// Changed files: staged + unstaged, untracked, and committed-but-unpushed.
const changed = new Set(
  [
    ...git("diff --name-only HEAD").split("\n"),
    ...git("ls-files --others --exclude-standard").split("\n"),
    ...(git("rev-parse --abbrev-ref @{u} 2>/dev/null") ? git("diff --name-only @{u}...HEAD").split("\n") : []),
  ].filter(Boolean),
);

// Map files to workspace packages. Docs/markdown don't trigger the gate.
const pkgDirs = new Set();
for (const f of changed) {
  if (f.endsWith(".md")) continue;
  const m = f.match(/^(services\/[^/]+|packages\/[^/]+|apps\/mobile|e2e)\//);
  if (m) pkgDirs.add(m[1]);
}
if (pkgDirs.size === 0) process.exit(0);

const filters = [];
for (const dir of pkgDirs) {
  const pkgJson = join(root, dir, "package.json");
  if (!existsSync(pkgJson)) continue;
  try {
    const name = JSON.parse(readFileSync(pkgJson, "utf8")).name;
    if (name) filters.push("--filter", name);
  } catch {}
}
if (filters.length === 0) process.exit(0);

try {
  execFileSync(turbo, ["run", "typecheck", "test", ...filters, "--output-logs=errors-only"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1" },
  });
  process.exit(0);
} catch (err) {
  const out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim();
  const tail = out.split("\n").slice(-120).join("\n"); // cap so context isn't flooded
  console.error(
    `Stop gate failed — typecheck/tests are red for changed packages (${[...pkgDirs].join(", ")}). Fix before finishing:\n\n${tail}`,
  );
  process.exit(2);
}
