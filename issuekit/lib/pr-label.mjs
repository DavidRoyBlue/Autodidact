// pr-label: a PR opened with no labels gets exactly one kind label (rules.pr.kinds).
// Pure decision helpers are exported for tests; the check wires them to GitHub.
import { loadRules } from "./rules.mjs";
import { prJson, labelPr } from "./gh.mjs";
import { askHaiku } from "./llm.mjs";

export const kindLabels = (rules = loadRules()) => [...new Set(Object.values(rules.pr.kinds))];

// Conventional-commit prefix ("feat(api)!: …") → label, or null when there is no known type.
export function labelFromTitle(title, rules = loadRules()) {
  const m = /^(\w+)(\([^)]*\))?!?:/.exec(String(title ?? "").trim());
  return (m && rules.pr.kinds[m[1].toLowerCase()]) ?? null;
}

// The model's answer → one of the kind labels, or null if it didn't reply with one.
export function parseLabelAnswer(answer, rules = loadRules()) {
  const word = String(answer ?? "").trim().split(/\s+/)[0]?.replace(/[^\w-]/g, "").toLowerCase();
  return kindLabels(rules).includes(word) ? word : null;
}

// Skip rule + title fast path + model fallback. `ask` is injected so the logic is testable.
export function pickLabel({ title, body, labels }, ask = askHaiku, rules = loadRules()) {
  if (labels.length) return null;
  const fromTitle = labelFromTitle(title, rules);
  if (fromTitle) return fromTitle;
  const answer = ask(
    `Pull request title: ${title}\n\nDescription:\n${(body || "(none)").slice(0, 4000)}\n\n` +
    `Which ONE label best describes this PR: ${kindLabels(rules).join(", ")}? Reply with ONLY the label.`);
  return parseLabelAnswer(answer, rules);
}

// Never blocks a PR: every failure path is a pass with a message.
export function checkPrLabel(prNumber, { fix = false } = {}) {
  try {
    const pr = prJson(prNumber, "title,body,labels");
    const labels = pr.labels.map((l) => l.name);
    if (labels.length) return { ok: true, message: `#${prNumber} already labelled (${labels.join(", ")}) — skipping.` };
    const label = pickLabel({ ...pr, labels });
    if (!label) return { ok: true, message: `#${prNumber}: no label could be determined — leaving unlabelled.` };
    if (!fix) return { ok: false, message: `#${prNumber} is unlabelled; would apply '${label}'.` };
    labelPr(prNumber, label);
    return { ok: true, message: `#${prNumber} → '${label}'.` };
  } catch (e) {
    return { ok: true, message: `#${prNumber}: pr-label failed (${e.message.split("\n")[0]}) — leaving unlabelled.` };
  }
}
