// One-shot Haiku call through the Claude Code CLI — the only Claude credential this repo
// has, both locally (the user's login) and in CI (CLAUDE_CODE_OAUTH_TOKEN, shared with the
// review workflows). ISSUES_SYNC_NESTED stops the repo's own hooks re-triggering, and
// CLAUDE_GM_RELAY_DISABLED is the machine-wide contract every hook-spawned nested
// `claude -p` honours so ~/Automation's gm relay does not adopt it as a worker session;
// running from the tmpdir keeps project config, hooks and MCP servers out of the call.
import { tmpdir } from "node:os";
import { sh } from "./gh.mjs";

export function askHaiku(prompt) {
  try {
    return sh("claude", ["-p", "--model", "claude-haiku-4-5", prompt],
      { cwd: tmpdir(), env: { ...process.env, ISSUES_SYNC_NESTED: "1", CLAUDE_GM_RELAY_DISABLED: "1" } });
  } catch { return ""; }
}
