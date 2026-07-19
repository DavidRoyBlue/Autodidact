#!/usr/bin/env bash
# Idempotent dev workspace launcher — creates, repairs, and attaches to the
# tmux session described by workspace.yml, and starts the Supabase stack.
#
#   pnpm workspace              # create / repair / attach
#   pnpm workspace --no-attach  # create / repair only (agents, CI)
#
# Safe to run repeatedly: reuses healthy services, restarts dead ones in their
# designated pane, never duplicates processes, never starts on alternate ports,
# never touches windows marked `preserve: true` (the claude window).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

NO_ATTACH=0
[[ "${1:-}" == "--no-attach" ]] && NO_ATTACH=1

# ── Pre-flight ───────────────────────────────────────────────────────────────
step "Pre-flight checks"
for tool in tmux docker pnpm node ss; do
  command -v "$tool" &>/dev/null || die "$tool not found — install it first"
done
docker info &>/dev/null || die "Docker is not running. Start Docker Desktop."
[[ -f "$ROOT/workspace.yml" ]] || die "workspace.yml not found in $ROOT"
node -e "require('yaml')" 2>/dev/null || die "yaml parser missing — run: pnpm install"
ok "tmux, docker, pnpm, node, ss available"

# ── Parse workspace.yml → tab-separated records ──────────────────────────────
# SESSION\t<name>
# INFRA\tsupabase
# WINDOW\t<name>\tmanaged|preserve\t<layout>
# PANE\t<window>\t<id>\t<cwd>\t<match>\t<health_port>\t<cmd>
CONFIG="$(node - "$ROOT/workspace.yml" <<'EOF'
const fs = require('fs');
const YAML = require('yaml');
const c = YAML.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = [];
if (!c.session) throw new Error('workspace.yml: session is required');
out.push(['SESSION', c.session].join('\t'));
if (c.infra && c.infra.supabase) out.push(['INFRA', 'supabase'].join('\t'));
for (const [name, w] of Object.entries(c.windows || {})) {
  if (w && w.preserve) { out.push(['WINDOW', name, 'preserve', ''].join('\t')); continue; }
  out.push(['WINDOW', name, 'managed', (w && w.layout) || ''].join('\t'));
  for (const p of (w && w.panes) || []) {
    if (!p.id || !p.cmd) throw new Error(`workspace.yml: pane in window "${name}" needs id and cmd`);
    const port = p.health && p.health.type === 'port' ? String(p.health.value) : '';
    out.push(['PANE', name, p.id, p.cwd || '.', p.match || '', port, p.cmd].join('\t'));
  }
}
process.stdout.write(out.join('\n') + '\n');
EOF
)" || die "Failed to parse workspace.yml"

SESSION="$(awk -F'\t' '$1=="SESSION"{print $2}' <<<"$CONFIG")"

# ── Infra: Supabase stack (idempotent; supabase start reuses running stack) ──
if grep -q $'^INFRA\tsupabase$' <<<"$CONFIG"; then
  if pnpm exec supabase status &>/dev/null; then
    ok "Supabase stack already running (API :55321, DB :55322, Studio :55323)"
  else
    step "Starting local Supabase stack"
    pnpm exec supabase start
    ok "Supabase stack running"
  fi
fi

# ── Process-tree helpers ─────────────────────────────────────────────────────
descendants() { # pid → all descendant pids
  local kids; kids="$(ps -o pid= --ppid "$1" 2>/dev/null | tr -d ' ')"
  local k; for k in $kids; do echo "$k"; descendants "$k"; done
}

tree_matches() { # pids... — does any cmdline match regex $MATCH_RE?
  local p; for p in "$@"; do
    tr '\0' ' ' <"/proc/$p/cmdline" 2>/dev/null | grep -qE "$MATCH_RE" && return 0
  done
  return 1
}

port_listening() { ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN; }

port_owned_by() { # port pids... — is the listener one of these pids?
  local port="$1"; shift
  local owners; owners="$(ss -ltnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)"
  [[ -n "$owners" ]] || return 1
  local o p; for o in $owners; do for p in "$@"; do [[ "$o" == "$p" ]] && return 0; done; done
  return 1
}

# ── tmux session / windows ───────────────────────────────────────────────────
FIRST_WINDOW="$(awk -F'\t' '$1=="WINDOW"{print $2; exit}' <<<"$CONFIG")"
declare -A BOOTSTRAP=()   # window → fresh pane we created, claimable by the first pane config
if ! tmux has-session -t "=$SESSION" 2>/dev/null; then
  step "Creating tmux session '$SESSION'"
  tmux new-session -d -s "$SESSION" -n "$FIRST_WINDOW" -c "$ROOT"
  BOOTSTRAP[$FIRST_WINDOW]="$(tmux list-panes -t "=$SESSION:$FIRST_WINDOW" -F '#{pane_id}')"
  ok "Session created"
else
  ok "tmux session '$SESSION' exists"
fi

window_exists() { tmux list-windows -t "=$SESSION" -F '#{window_name}' | grep -Fxq "$1"; }

while IFS=$'\t' read -r _ WNAME WMODE _; do
  if ! window_exists "$WNAME"; then
    BOOTSTRAP[$WNAME]="$(tmux new-window -d -t "=$SESSION" -n "$WNAME" -c "$ROOT" -P -F '#{pane_id}')"
    ok "Created window '$WNAME'"
  fi
  [[ "$WMODE" == "preserve" ]] && ok "Window '$WNAME' preserved (never managed)"
done < <(awk -F'\t' '$1=="WINDOW"' <<<"$CONFIG")

# ── Managed panes ────────────────────────────────────────────────────────────
find_pane() { # window ws_id → pane_id or empty
  tmux list-panes -t "=$SESSION:$1" -F $'#{pane_id}\t#{@ws_id}' 2>/dev/null \
    | awk -F'\t' -v id="$2" '$2==id{print $1; exit}'
}

claim_idle_pane() { # window → untagged pane running a bare shell, or empty
  local pid ws cmd
  while IFS=$'\t' read -r pid ws cmd; do
    if [[ -z "$ws" && "$cmd" =~ ^(bash|zsh|sh|fish)$ ]]; then
      local shell_pid; shell_pid="$(tmux display -p -t "$pid" '#{pane_pid}')"
      [[ -z "$(descendants "$shell_pid")" ]] && { echo "$pid"; return; }
    fi
  done < <(tmux list-panes -t "=$SESSION:$1" -F $'#{pane_id}\t#{@ws_id}\t#{pane_current_command}')
}

start_cmd_in_pane() { # pane_id cwd cmd
  tmux send-keys -t "$1" "cd $(printf '%q' "$ROOT/$2") && $3" Enter
}

step "Reconciling managed panes"
while IFS=$'\t' read -r _ WNAME PANE_ID_NAME CWD MATCH_RE HEALTH_PORT CMD; do
  PANE="$(find_pane "$WNAME" "$PANE_ID_NAME")"

  if [[ -z "$PANE" ]]; then
    # Pane missing: claim the fresh pane we created, else an idle untagged
    # pane in the window, else split a new one.
    PANE="${BOOTSTRAP[$WNAME]:-}"
    if [[ -n "$PANE" ]] && [[ -n "$(tmux display -p -t "$PANE" '#{@ws_id}' 2>/dev/null)" ]]; then
      PANE=""   # bootstrap pane already claimed by an earlier pane config
    fi
    [[ -z "$PANE" ]] && PANE="$(claim_idle_pane "$WNAME")"
    if [[ -z "$PANE" ]]; then
      PANE="$(tmux split-window -d -t "=$SESSION:$WNAME" -c "$ROOT" -P -F '#{pane_id}')"
    fi
    tmux set-option -p -t "$PANE" @ws_id "$PANE_ID_NAME"
    tmux select-pane -t "$PANE" -T "$PANE_ID_NAME"
    if [[ -n "$HEALTH_PORT" ]] && port_listening "$HEALTH_PORT"; then
      warn "[$PANE_ID_NAME] port $HEALTH_PORT already in use by a process outside this workspace — NOT starting '$CMD' (no alternate ports). Stop the other process, then re-run."
      continue
    fi
    start_cmd_in_pane "$PANE" "$CWD" "$CMD"
    ok "[$PANE_ID_NAME] pane created, started: $CMD"
    continue
  fi

  # Pane exists — assess what's running in it.
  PANE_PID="$(tmux display -p -t "$PANE" '#{pane_pid}')"
  DESC=($(descendants "$PANE_PID"))

  if [[ ${#DESC[@]} -eq 0 ]]; then
    # Bare shell: the service exited. Restart unless the port is held elsewhere.
    if [[ -n "$HEALTH_PORT" ]] && port_listening "$HEALTH_PORT"; then
      warn "[$PANE_ID_NAME] service not running here, but port $HEALTH_PORT is in use by another process — NOT starting '$CMD'. Stop the other process, then re-run."
      continue
    fi
    start_cmd_in_pane "$PANE" "$CWD" "$CMD"
    ok "[$PANE_ID_NAME] was idle — restarted: $CMD"
  elif tree_matches "${DESC[@]}"; then
    if [[ -z "$HEALTH_PORT" ]]; then
      ok "[$PANE_ID_NAME] running"
    elif port_owned_by "$HEALTH_PORT" "${DESC[@]}"; then
      ok "[$PANE_ID_NAME] healthy (port $HEALTH_PORT owned by pane process)"
    elif port_listening "$HEALTH_PORT"; then
      warn "[$PANE_ID_NAME] running, but port $HEALTH_PORT is owned by a different process — investigate"
    else
      ok "[$PANE_ID_NAME] process running, port $HEALTH_PORT not up yet (starting or building) — leaving it alone"
    fi
  else
    warn "[$PANE_ID_NAME] pane is running an unexpected process (doesn't match /$MATCH_RE/) — not touching it. Inspect: tmux capture-pane -pt '$SESSION:$WNAME' (pane title '$PANE_ID_NAME')"
  fi
done < <(awk -F'\t' '$1=="PANE"' <<<"$CONFIG")

# ── Layouts ──────────────────────────────────────────────────────────────────
while IFS=$'\t' read -r _ WNAME _ LAYOUT; do
  [[ -n "$LAYOUT" ]] || continue
  NPANES="$(tmux list-panes -t "=$SESSION:$WNAME" -F x | wc -l)"
  [[ "$NPANES" -gt 1 ]] && tmux select-layout -t "=$SESSION:$WNAME" "$LAYOUT" >/dev/null || true
done < <(awk -F'\t' '$1=="WINDOW" && $3=="managed"' <<<"$CONFIG")

# ── Attach ───────────────────────────────────────────────────────────────────
echo
if [[ "$NO_ATTACH" == 1 ]]; then
  ok "Workspace ready (not attaching). Attach with: tmux attach -t $SESSION"
elif [[ -z "${TMUX:-}" ]]; then
  if [[ -t 0 ]]; then
    exec tmux attach -t "=$SESSION"
  else
    ok "Workspace ready. Attach with: tmux attach -t $SESSION"
  fi
else
  if [[ -t 0 ]]; then
    exec tmux switch-client -t "=$SESSION"
  else
    ok "Workspace ready. You're inside tmux — switch with: tmux switch-client -t $SESSION"
  fi
fi
