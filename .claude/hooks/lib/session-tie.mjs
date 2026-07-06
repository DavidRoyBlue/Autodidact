import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Session→issue ties live outside the repo so they never show up in git.
const TIE_DIR = join(tmpdir(), "claude-session-issues");

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
  writeFileSync(tiePath(sessionId), JSON.stringify(data));
}

// Matches "#123", "issue 123", "issue #123", and GitHub issue URLs (".../issues/123").
export function extractIssueRef(prompt) {
  const m = prompt.match(/(?:#|\bissues?\s*[#/]?\s*)(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

// Slash commands and near-empty prompts don't describe work — wait for a real one.
export function isSubstantivePrompt(prompt) {
  const t = (prompt ?? "").trim();
  if (t.startsWith("/")) return false;
  return t.length >= 20;
}

export function titleFromPrompt(prompt) {
  const line = prompt.split("\n").find((l) => l.trim()) ?? "Session";
  return line.trim().replace(/\s+/g, " ").slice(0, 70);
}
