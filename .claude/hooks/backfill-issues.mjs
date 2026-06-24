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
