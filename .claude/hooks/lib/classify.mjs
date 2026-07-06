import { execFileSync } from "node:child_process";

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

// Ask claude -p (Haiku) which open issue `text` is closest to. Returns the issue
// number as a string, or null when there are no open issues / no good fit / the
// call fails. Sets ISSUES_SYNC_NESTED so the nested call can't re-trigger hooks.
export function closestOpenIssue(header, text, question) {
  const openIssues = sh("gh", ["issue", "list", "--state", "open", "--json", "number,title",
    "--jq", '.[] | "\\(.number): \\(.title)"']);
  if (!openIssues) return null;

  const prompt =
    `${header}:\n${text}\n\nOpen issues:\n${openIssues}\n\n${question} ` +
    `Return ONLY that issue's number, or the word null if none is a good fit.`;
  let answer = "null";
  try {
    answer = sh("claude", ["-p", "--model", "claude-haiku-4-5", prompt],
      { env: { ...process.env, ISSUES_SYNC_NESTED: "1" } });
  } catch { /* treat as no match */ }

  const m = answer.match(/^\s*(\d+)\s*$/);
  return m ? m[1] : null;
}
