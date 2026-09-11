import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sh } from "../../../issuekit/lib/gh.mjs";

// Session→issue ties live outside the repo so they never show up in git.
const TIE_DIR = join(tmpdir(), "claude-session-issues");

// Ties must outlive the whole session (Stop fires per turn and first-prompt-issue
// uses the tie's existence as its "already ran" marker), so they can't be deleted
// on consumption — instead each write sweeps entries older than the TTL.
const TIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sweepStaleTies(now = Date.now()) {
  let names;
  try { names = readdirSync(TIE_DIR); } catch { return; }
  for (const f of names) {
    const p = join(TIE_DIR, f);
    try { if (statSync(p).mtimeMs < now - TIE_TTL_MS) rmSync(p); } catch { /* races are fine */ }
  }
}

export function tiePath(sessionId) {
  return join(TIE_DIR, `${sessionId}.json`);
}

export function readTie(sessionId) {
  if (!sessionId) return null;
  const p = tiePath(sessionId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

export function writeTie(sessionId, data) {
  mkdirSync(TIE_DIR, { recursive: true });
  sweepStaleTies();
  writeFileSync(tiePath(sessionId), JSON.stringify(data));
}

// GitHub numbers issues and PRs from one sequence and `gh issue view` resolves
// either, so a prompt citing a PR number would tie the session to it and land
// `in-progress` on a pull request. The REST issue payload carries `pull_request`
// only for PRs. `run` is injected so the logic is testable.
export function isOpenIssue(ref, run = sh) {
  try {
    const { state, isPr } = JSON.parse(run("gh",
      ["api", `repos/{owner}/{repo}/issues/${ref}`, "--jq", "{state, isPr: (.pull_request != null)}"]));
    return state === "open" && !isPr;
  } catch { return false; } // unknown number, or gh unavailable
}

// Matches "#123", "issue 123", "issue #123", and GitHub issue URLs (".../issues/123").
export function extractIssueRef(prompt) {
  const m = prompt.match(/(?:#|\bissues?\s*[#/]?\s*)(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

// Prompts that don't describe work — wait for a real one: slash commands,
// near-empty text, manager-session headers ("[manager pm:X · mode=patrol]"),
// CI context dumps ("REPO: owner/name"), and harness-injected markup
// ("<task-notification>").
const NOT_A_TASK = /^(\/|\[manager\b|REPO:|<[a-z][\w-]*>)/;
export function isSubstantivePrompt(prompt) {
  const t = (prompt ?? "").trim();
  if (NOT_A_TASK.test(t)) return false;
  return t.length >= 20;
}

// Headless runs (`claude -p`, the SDKs) set CLAUDE_CODE_ENTRYPOINT=sdk-*; their
// prompts are written by scripts (summarizers, CI jobs), not by someone starting
// work. Interactive sessions — including dispatched workers — report "cli".
export function isScriptedSession(env = process.env) {
  return /^sdk-/.test(env.CLAUDE_CODE_ENTRYPOINT ?? "");
}

export function titleFromPrompt(prompt) {
  const line = prompt.split("\n").find((l) => l.trim()) ?? "Session";
  return line.trim().replace(/\s+/g, " ").slice(0, 70);
}
