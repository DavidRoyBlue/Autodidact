#!/usr/bin/env node
// .claude/hooks/session-issues.mjs — Stop: record freeform/standalone sessions as (born-closed) issues.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { parseTranscript, hasSuperpowersWrite, extractSummary } from "./lib/transcript.mjs";

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

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

  // Ask claude -p (Haiku) which open issue, if any, this session addressed.
  const prompt =
    `Session output:\n${summary}\n\nOpen issues:\n${openIssues || "(none)"}\n\n` +
    `Return ONLY the number of the single open issue most clearly addressed by this session, ` +
    `or the word null if none matches well.`;
  let answer = "null";
  try {
    answer = sh("claude", ["-p", "--model", "claude-haiku-4-5", prompt],
      { env: { ...process.env, ISSUES_SYNC_NESTED: "1" } });
  } catch { /* fall through to create-and-close */ }

  const match = (answer.match(/\d+/) || [])[0];
  if (match && /^\d+$/.test(answer.trim())) {
    sh("gh", ["issue", "comment", match, "--body", `Addressed in a session:\n\n${summary}`]);
    sh("gh", ["issue", "close", match]);
    process.stderr.write(`[session-issues] Closed matched #${match}\n`);
  } else {
    const firstLine = summary.split("\n").find((l) => l.trim()) ?? "Session";
    const url = sh("gh", ["issue", "create", "--title", `Session: ${firstLine.slice(0, 70)}`,
      "--body", summary, "--label", "ready"]);
    const n = url.split("/").pop();
    sh("gh", ["issue", "close", n, "-c", "Session record — completed."]);
    process.stderr.write(`[session-issues] Recorded #${n}\n`);
  }
}

try { run(); } catch (e) { process.stderr.write(`[session-issues] ${e.message}\n`); }
process.exit(0);
