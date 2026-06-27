#!/usr/bin/env node
// .claude/hooks/session-issues.mjs — Stop: record each freeform session as a born-closed issue,
// nested as a sub-issue under the closest related open issue when one exists (parent stays open),
// otherwise standalone. Never closes an existing open issue.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { parseTranscript, hasSuperpowersWrite, extractSummary } from "./lib/transcript.mjs";

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

function run() {
  // Recursion guard: the claude -p call below sets this; bail if we are that nested call.
  if (process.env.ISSUES_SYNC_NESTED) return;

  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.stop_hook_active) return;

  const tpath = input.transcript_path;
  if (!tpath || !existsSync(tpath)) return;
  const entries = parseTranscript(readFileSync(tpath, "utf8"));

  // Structured work already handled by the PostToolUse hook → do nothing.
  if (hasSuperpowersWrite(entries)) return;

  const summary = extractSummary(entries);
  if (!summary) return;

  const openIssues = sh("gh", ["issue", "list", "--state", "open", "--json", "number,title",
    "--jq", '.[] | "\\(.number): \\(.title)"']);

  // Ask claude -p (Haiku) which open issue this session's work most naturally belongs UNDER.
  const prompt =
    `Session output:\n${summary}\n\nOpen issues:\n${openIssues || "(none)"}\n\n` +
    `Which ONE open issue does this session's work most naturally belong under as a sub-task? ` +
    `Return ONLY that issue's number, or the word null if none is a good fit.`;
  let answer = "null";
  try {
    answer = sh("claude", ["-p", "--model", "claude-haiku-4-5", prompt],
      { env: { ...process.env, ISSUES_SYNC_NESTED: "1" } });
  } catch { /* fall through to create-and-close */ }

  const match = /^\s*(\d+)\s*$/.test(answer) ? answer.trim() : null;

  // Always record the freeform session as its own born-closed issue.
  const firstLine = summary.split("\n").find((l) => l.trim()) ?? "Session";
  const url = sh("gh", ["issue", "create", "--title", `Session: ${firstLine.slice(0, 70)}`,
    "--body", summary, "--label", "ready"]);
  const n = (url.trim().match(/\/issues\/(\d+)/) || [])[1];
  if (!n) { process.stderr.write(`[session-issues] could not parse issue number from: ${url}\n`); return; }
  sh("gh", ["issue", "close", n, "-c", "Session record — completed."]);

  // If a related open issue exists, nest the record under it (the parent stays open).
  if (match) {
    try {
      linkSubIssue(match, n);
      process.stderr.write(`[session-issues] Recorded #${n} as sub-issue of #${match}\n`);
    } catch {
      process.stderr.write(`[session-issues] Recorded #${n} (could not nest under #${match})\n`);
    }
  } else {
    process.stderr.write(`[session-issues] Recorded standalone #${n}\n`);
  }
}

try { run(); } catch (e) { process.stderr.write(`[session-issues] ${e.message}\n`); }
process.exit(0);
