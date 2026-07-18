#!/usr/bin/env node
// .claude/hooks/first-prompt-issue.mjs — UserPromptSubmit: on a session's first substantive
// prompt, tie the session to a GitHub issue:
//   1. an open issue explicitly referenced in the prompt, else
//   2. a new sub-issue under the closest related open issue (picked by claude -p), else
//   3. a new standalone issue.
// The tie is stored in the OS tmpdir (lib/session-tie.mjs) and consumed by
// session-issues.mjs (Stop) to nest the session record without a second LLM call.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as T from "./lib/session-tie.mjs";
import { classifyFirstPrompt } from "./lib/classify.mjs";

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

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

function tie(sessionId, issue, note) {
  T.writeTie(sessionId, { issue: Number(issue) });
  // stdout from a UserPromptSubmit hook is added to Claude's context.
  process.stdout.write(`[first-prompt-issue] Session tied to issue #${issue} (${note}).\n`);
}

function run() {
  // Recursion guard: the claude -p call below sets this; bail if we are that nested call.
  if (process.env.ISSUES_SYNC_NESTED) return;

  const input = JSON.parse(readFileSync(0, "utf8"));
  const sessionId = input.session_id;
  const prompt = input.prompt;
  if (!sessionId || typeof prompt !== "string") return;
  if (T.readTie(sessionId)) return; // already tied — only the first prompt counts
  if (!T.isSubstantivePrompt(prompt)) return;

  // 1. Prompt flags an issue → tie to it if it's open.
  const ref = T.extractIssueRef(prompt);
  if (ref) {
    try {
      const state = sh("gh", ["issue", "view", String(ref), "--json", "state", "-q", ".state"]);
      if (state === "OPEN") {
        try { sh("gh", ["issue", "edit", String(ref), "--add-label", "in-progress"]); } catch { /* label is best-effort */ }
        tie(sessionId, ref, "referenced in prompt");
        return;
      }
    } catch { /* unknown issue number — fall through */ }
  }

  // 2. One Haiku call: closest open issue + a publicly-safe title and summary.
  // The raw prompt never reaches GitHub (it may contain secrets or stack traces);
  // if the call fails we fall back to the prompt's first 70 chars + a stock body.
  const { parent, title, summary } = classifyFirstPrompt(prompt.slice(0, 2000));

  // 3. Create the session's issue — nested under the match when there is one.
  const url = sh("gh", ["issue", "create", "--title", title ?? T.titleFromPrompt(prompt),
    "--body", summary ?? "Opened automatically from a Claude Code session's first prompt.",
    "--label", "in-progress"]);
  const n = (url.match(/\/issues\/(\d+)/) || [])[1];
  if (!n) { process.stderr.write(`[first-prompt-issue] could not parse issue number from: ${url}\n`); return; }

  if (parent) {
    try {
      linkSubIssue(parent, n);
      tie(sessionId, n, `new sub-issue of #${parent}`);
      return;
    } catch { /* nest failed — tie standalone */ }
  }
  tie(sessionId, n, "new issue");
}

try { run(); } catch (e) { process.stderr.write(`[first-prompt-issue] ${e.message}\n`); }
process.exit(0);
