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
  const skip = (p) => p.startsWith("#") || (p.startsWith("**") && p.includes(":**")) || p.startsWith(">") || p.startsWith("---");
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
