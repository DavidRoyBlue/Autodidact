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
