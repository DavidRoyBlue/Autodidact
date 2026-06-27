#!/usr/bin/env bash
# Thin passthrough to the GitHub CLI, exposed as a single allow-listed command so
# the auto-triage workflow (.github/workflows/claude-auto-issue-triage.yml) can run
# constrained `gh` subcommands (issue view / search issues / label list) under
# --allowedTools "Bash(./scripts/gh.sh:*)". Auth comes from GH_TOKEN/GITHUB_TOKEN.
set -euo pipefail
exec gh "$@"
