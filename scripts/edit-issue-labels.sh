#!/usr/bin/env bash
# Add/remove labels on the issue from the triggering workflow event. The issue
# number is read from the event payload ($GITHUB_EVENT_PATH -> .issue.number), so
# the auto-triage workflow (.github/workflows/claude-auto-issue-triage.yml) does
# not have to pass it. Auth comes from GH_TOKEN/GITHUB_TOKEN.
# Usage: ./scripts/edit-issue-labels.sh --add-label "bug" [--add-label "high"] [--remove-label "x"]
set -euo pipefail

if [[ -z "${GITHUB_EVENT_PATH:-}" || ! -f "${GITHUB_EVENT_PATH}" ]]; then
  echo "edit-issue-labels: GITHUB_EVENT_PATH unset or missing — must run inside a workflow." >&2
  exit 1
fi

ISSUE_NUMBER="$(jq -r '.issue.number' "$GITHUB_EVENT_PATH")"
if [[ -z "$ISSUE_NUMBER" || "$ISSUE_NUMBER" == "null" ]]; then
  echo "edit-issue-labels: could not read .issue.number from the event payload." >&2
  exit 1
fi

exec gh issue edit "$ISSUE_NUMBER" "$@"
