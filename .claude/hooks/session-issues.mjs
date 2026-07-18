#!/usr/bin/env node
// .claude/hooks/session-issues.mjs — Stop: record each freeform session as a born-closed issue,
// nested as a sub-issue under the closest related open issue when one exists (parent stays open),
// otherwise standalone. Never closes an existing open issue.
import { readFileSync, existsSync } from "node:fs";
import { parseTranscript, hasSuperpowersWrite, extractSummary } from "./lib/transcript.mjs";
import { readTie } from "./lib/session-tie.mjs";
import { closestOpenIssue } from "./lib/classify.mjs";
import { sh, linkSubIssue } from "../../issuekit/lib/gh.mjs";

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

  // Session already tied to an issue at first prompt (first-prompt-issue.mjs) → nest there.
  const tie = readTie(input.session_id);
  let match = tie?.issue ? String(tie.issue) : null;

  if (!match) {
    match = closestOpenIssue("Session output", summary,
      "Which ONE open issue does this session's work most naturally belong under as a sub-task?");
  }

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
