// Mirror plan/spec files → GitHub issues. Two entry points sharing one core:
//   syncFile  — one file (the Claude Code Write hook path); links its parent immediately.
//   syncTree  — every unmapped file under the plans root (backfill); links parents in a
//               second pass so ordering never matters.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import * as F from "./files.mjs";
import * as M from "./map.mjs";
import { sh, adoptByTitle, createIssue, closeIssue, linkSubIssue } from "./gh.mjs";

const log = (msg) => process.stderr.write(`[issuekit] ${msg}\n`);

// Create the issue for one file, or adopt an existing exact-title match (D10).
// Returns { n, parent, outcome: "created"|"adopted" } or null on parse failure.
function ensureIssue(filePath) {
  const content = readFileSync(filePath, "utf8");
  const title = F.titleFromContent(content, basename(filePath));
  const parent = F.parentFromContent(content);

  let n = adoptByTitle(title);
  let outcome = "adopted";
  if (!n) {
    n = createIssue({ title, body: F.bodyFromContent(content, title), label: F.labelForPath(filePath) });
    if (!n) { log(`could not parse issue number for ${basename(filePath)}`); return null; }
    if (F.isDonePath(filePath)) closeIssue(n, "Created already complete.");
    outcome = "created";
  }
  return { n, parent, title, outcome };
}

function record(repoRoot, map, base, n, parent) {
  map[base] = { issue: Number(n), parent: parent || null };
  M.writeMap(repoRoot, map);
  sh("git", ["add", M.mapPath(repoRoot)], { cwd: repoRoot });
}

export function syncFile(filePath, repoRoot) {
  const base = basename(filePath);
  const map = M.readMap(repoRoot);
  if (map[base]) return; // already linked — safe on rewrite

  const res = ensureIssue(filePath);
  if (!res) return;
  const { n, parent, title } = res;

  if (parent && map[parent]?.issue) {
    try { linkSubIssue(map[parent].issue, n); }
    catch { log(`sub-issue link failed for ${base}`); }
  } else if (parent) {
    log(`parent ${parent} not yet linked, skipping`);
  }

  record(repoRoot, map, base, n, parent);
  log(`Linked #${n}: ${title}`);
}

export async function syncTree(repoRoot, { dryRun = false } = {}) {
  const { loadRules } = await import("./rules.mjs");
  const root = loadRules().plans.root;
  const files = sh("git", ["ls-files", root], { cwd: repoRoot })
    .split("\n")
    .filter((p) => F.isSuperpowersFile(p))
    // specs before plans → parents exist before children link to them
    .sort((a, b) => (a.includes("/specs/") ? 0 : 1) - (b.includes("/specs/") ? 0 : 1));

  const map = M.readMap(repoRoot);
  let created = 0, adopted = 0, skipped = 0, linked = 0;
  const toLink = [];

  for (const file of files) {
    const base = basename(file);
    if (map[base]) { skipped++; continue; }
    if (dryRun) {
      const content = readFileSync(`${repoRoot}/${file}`, "utf8");
      console.log(`would sync: ${base} → "${F.titleFromContent(content, base)}" [${F.labelForPath(file)}]`
        + ` parent=${F.parentFromContent(content) ?? "-"}`);
      continue;
    }
    const res = ensureIssue(`${repoRoot}/${file}`);
    if (!res) continue;
    res.outcome === "created" ? created++ : adopted++;
    record(repoRoot, map, base, res.n, res.parent);
    if (res.parent) toLink.push(base);
    if (res.outcome === "created") await sleep(1000); // rate-limit politeness
  }

  // Second pass: every issue from this run is now in the map.
  for (const base of toLink) {
    const parentEntry = map[map[base].parent];
    if (!parentEntry?.issue) { log(`parent ${map[base].parent} of ${base} not in map, skipping link`); continue; }
    try { linkSubIssue(parentEntry.issue, map[base].issue); linked++; }
    catch (e) { log(`link ${base} → ${map[base].parent} failed (${e.message.split("\n")[0]})`); }
  }

  console.log(`sync: ${created} created, ${adopted} adopted, ${skipped} already mapped, ${linked} linked`);
}
