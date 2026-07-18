import { sh } from "../../../issuekit/lib/gh.mjs";

function listOpenIssues() {
  return sh("gh", ["issue", "list", "--state", "open", "--json", "number,title",
    "--jq", '.[] | "\\(.number): \\(.title)"']);
}

// Nested claude -p call; ISSUES_SYNC_NESTED stops it re-triggering hooks.
function ask(prompt) {
  try {
    return sh("claude", ["-p", "--model", "claude-haiku-4-5", prompt],
      { env: { ...process.env, ISSUES_SYNC_NESTED: "1" } });
  } catch { return ""; }
}

// Parses a three-line classification answer: issue number (or "null"), title, summary.
// Missing/garbled parts come back null so callers can fall back.
export function parseClassification(answer) {
  const lines = String(answer ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const m = (lines[0] ?? "").match(/^(\d+)$/);
  return {
    parent: m ? m[1] : null,
    title: (lines[1] ?? "").slice(0, 70) || null,
    summary: lines.slice(2).join(" ").slice(0, 500) || null,
  };
}

// Ask claude -p (Haiku) which open issue `text` is closest to. Returns the issue
// number as a string, or null when there are no open issues / no good fit / the
// call fails.
export function closestOpenIssue(header, text, question) {
  const openIssues = listOpenIssues();
  if (!openIssues) return null;
  const answer = ask(
    `${header}:\n${text}\n\nOpen issues:\n${openIssues}\n\n${question} ` +
    `Return ONLY that issue's number, or the word null if none is a good fit.`);
  return parseClassification(answer).parent;
}

// One call for the first-prompt hook: closest open issue + a title and summary
// safe to post publicly. Raw prompt text must never reach GitHub — first prompts
// routinely contain stack traces, env dumps, or pasted secrets.
export function classifyFirstPrompt(text) {
  const q =
    `First prompt of a coding session:\n${text}\n\nOpen issues:\n${listOpenIssues() || "(none)"}\n\n` +
    `Reply with EXACTLY three lines:\n` +
    `1. The number of the ONE open issue this work is most closely related to, or the word null.\n` +
    `2. A short GitHub issue title (max 70 characters) for the requested work.\n` +
    `3. A one-or-two sentence summary of the requested work. Do not quote the prompt verbatim; ` +
    `never repeat secrets, tokens, URLs, or stack traces.`;
  return parseClassification(ask(q));
}
