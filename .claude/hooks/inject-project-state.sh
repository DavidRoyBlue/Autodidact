#!/usr/bin/env bash
# .claude/hooks/inject-project-state.sh — SessionStart: inject PROJECT_STATE.md into context.
# Fires on every session start. Why: PROJECT_STATE.md is the living "current objective /
# blockers / next steps" doc; injecting it mechanically keeps it out of CLAUDE.md
# (single source of truth) while guaranteeing every session sees it.
# Plain stdout from a SessionStart hook is added to Claude's context.
set -euo pipefail

STATE="${CLAUDE_PROJECT_DIR:-$(pwd)}/PROJECT_STATE.md"
[[ -f "$STATE" ]] || exit 0

echo "## PROJECT_STATE.md (auto-injected at session start — the living status doc; update it when system state changes)"
cat "$STATE"
