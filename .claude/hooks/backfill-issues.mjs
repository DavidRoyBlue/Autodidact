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
  return out.split("\n").filter((p) => L.isSuperpowersFile(p))
    .sort((a, b) => (a.includes("/specs/") ? 0 : 1) - (b.includes("/specs/") ? 0 : 1));
}
function adoptByTitle(title) {
  const out = sh("gh", ["issue", "list", "--state", "all", "--search", `in:title "${title}"`, "--json", "number,title"]);
  const f = JSON.parse(out).find((i) => i.title === title);
  return f ? String(f.number) : null;
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

const repoRoot = sh("git", ["rev-parse", "--show-toplevel"]);
const map = L.readMap(repoRoot);
let created = 0, adopted = 0, skipped = 0, linked = 0;
const toLink = []; // basenames processed this run that declare a parent

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
    n = (url.trim().match(/\/issues\/(\d+)/) || [])[1];
    if (!n) { console.log(`backfill: could not parse issue number from ${url}, skipping ${base}`); continue; }
    if (L.isDonePath(file)) sh("gh", ["issue", "close", n, "-c", "Created already complete."]);
    created++;
    await sleep(1000); // rate-limit politeness
  }
  map[base] = { issue: Number(n), parent: parent || null };
  L.writeMap(repoRoot, map);
  if (parent) toLink.push(base);
}

// Second pass: link sub-issues now that every issue this run exists in the map.
// Only links files touched this run, so idempotent re-runs don't re-attempt existing links.
for (const base of toLink) {
  const parentEntry = map[map[base].parent];
  if (!parentEntry?.issue) {
    console.log(`backfill: parent ${map[base].parent} of ${base} not in map, skipping link`);
    continue;
  }
  try {
    linkSubIssue(parentEntry.issue, map[base].issue);
    linked++;
  } catch (e) {
    console.log(`backfill: link ${base} → ${map[base].parent} failed (${e.message.split("\n")[0]})`);
  }
}

if (!DRY) sh("git", ["add", ".claude/issue-map.json"], { cwd: repoRoot });
console.log(`backfill: ${created} created, ${adopted} adopted, ${skipped} skipped, ${linked} linked`);
