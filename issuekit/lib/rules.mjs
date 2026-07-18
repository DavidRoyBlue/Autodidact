import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

let cached = null;

export function loadRules() {
  if (!cached) {
    const here = dirname(fileURLToPath(import.meta.url));
    cached = JSON.parse(readFileSync(join(here, "..", "rules.json"), "utf8"));
  }
  return cached;
}
