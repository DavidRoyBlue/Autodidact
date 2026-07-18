#!/usr/bin/env node
// issuekit — single entrypoint for the repo's issue system.
// All rules live in issuekit/rules.json; see issuekit/README.md.
import { readFileSync } from "node:fs";
import { repoRoot } from "./lib/gh.mjs";
import { isSuperpowersFile } from "./lib/files.mjs";
import { syncFile, syncTree } from "./lib/sync.mjs";
import { CHECKS } from "./lib/checks.mjs";
import { ensureLabels } from "./lib/labels.mjs";

const USAGE = `issuekit — the repo's GitHub issue system. Rules live in issuekit/rules.json.

Usage:
  node issuekit/cli.mjs sync [--dry-run]
      Mirror plan/spec files under docs/superpowers/ to GitHub issues.
      As a Claude Code Write hook (payload on stdin) it syncs the written file;
      standalone it scans the whole plans tree (idempotent backfill).

  node issuekit/cli.mjs check <rule> --issue <n> [--fix]
      Run one enforcement rule against one issue. Rules: ${Object.keys(CHECKS).join(", ")}.
      Detects by default; --fix applies the remedy. Exit 0 = pass/fixed, 1 = violation, 2 = usage.

  node issuekit/cli.mjs labels --ensure
      Create any labels declared in rules.json that are missing on the repo.
`;

const flag = (args, name) => args.includes(name);
const opt = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

async function main([cmd, ...args]) {
  switch (cmd) {
    case "sync": {
      // Hook mode: Claude Code pipes the PostToolUse payload on stdin.
      let hook = null;
      if (!process.stdin.isTTY) {
        try { hook = JSON.parse(readFileSync(0, "utf8")); } catch { /* no payload → tree mode */ }
      }
      if (hook?.tool_name) {
        try {
          if (hook.tool_name !== "Write") return 0;
          const filePath = hook.tool_input?.file_path ?? "";
          if (!isSuperpowersFile(filePath)) return 0;
          syncFile(filePath, repoRoot());
        } catch (e) { process.stderr.write(`[issuekit] ${e.message}\n`); }
        return 0; // hook mode never blocks the session
      }
      await syncTree(repoRoot(), { dryRun: flag(args, "--dry-run") });
      return 0;
    }
    case "check": {
      const run = CHECKS[args[0]];
      const issue = Number(opt(args, "--issue"));
      if (!run || !issue) { process.stderr.write(USAGE); return 2; }
      const res = run(issue, { fix: flag(args, "--fix") });
      console.log(res.message);
      return res.ok ? 0 : 1;
    }
    case "labels": {
      if (!flag(args, "--ensure")) { process.stderr.write(USAGE); return 2; }
      const created = ensureLabels();
      console.log(created.length ? `created: ${created.join(", ")}` : "all labels present");
      return 0;
    }
    case undefined:
    case "--help":
    case "help": {
      process.stdout.write(USAGE);
      return 0;
    }
    default: {
      process.stderr.write(USAGE);
      return 2;
    }
  }
}

process.exit(await main(process.argv.slice(2)));
