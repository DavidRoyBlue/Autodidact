// The sidecar issue map: durable filename → { issue, parent } link (spec D1).
// Format is stable — other tooling reads this file; do not change the shape.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadRules } from "./rules.mjs";

export function mapPath(repoRoot, rules = loadRules()) {
  return join(repoRoot, rules.map);
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
