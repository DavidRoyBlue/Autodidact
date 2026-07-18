import { loadRules } from "./rules.mjs";
import { existingLabels, createLabel } from "./gh.mjs";

// Create any labels declared in rules.json that don't exist on the repo yet.
export function ensureLabels() {
  const have = existingLabels();
  const created = [];
  for (const [name, def] of Object.entries(loadRules().labels)) {
    if (!have.includes(name)) { createLabel(name, def); created.push(name); }
  }
  return created;
}
