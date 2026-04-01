#!/usr/bin/env bash
# bin/scriptorium.sh — Interim dispatch script for codex-based agent sessions
#
# Orchestrates the full Scriptorium lifecycle for an agent session:
#   1. open  — open a draft binding (worktree) on a codex
#   2. session — run an agent session inside the draft's worktree
#   3. seal  — seal the draft back into the codex (ff-only or rebase)
#   4. push  — push the sealed binding to the remote
#
# This is an interim script. Once Clockworks standing orders are wired
# up, this lifecycle will be event-driven rather than scripted.
#
# Usage:
#   ./bin/scriptorium.sh <codex> <agent> [branch] [-- <agent-args...>]
#
# Arguments:
#   codex       — name of a registered codex (must already be added via codex-add)
#   agent       — agent name to dispatch (e.g. builder-mk1, auditor)
#   branch      — optional branch name for the draft (default: auto-generated)
#   agent-args  — additional arguments passed to the agent (after --)
#
# Environment:
#   NSG_GUILD_HOME — guild root (default: /workspace/shardworks)
#   NSG_DRY_RUN    — if set, print commands without executing
#
# Examples:
#   ./bin/scriptorium.sh nexus builder-mk1
#   ./bin/scriptorium.sh nexus builder-mk1 fix/issue-42
#   ./bin/scriptorium.sh nexus auditor -- -p "evaluate requirement X"
#
# Exit codes:
#   0 — full cycle completed (open → session → seal → push)
#   1 — usage error
#   2 — draft open failed
#   3 — agent session failed (draft left open for inspection)
#   4 — seal failed (draft left open; may need manual reconciliation)
#   5 — push failed (sealed locally but not pushed)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GUILD_HOME="${NSG_GUILD_HOME:-/workspace/shardworks}"

# ── Helpers ───────────────────────────────────────────────────

log() { echo "[scriptorium] $*"; }
err() { echo "[scriptorium] ERROR: $*" >&2; }

run_tool() {
  local tool_name="$1"
  shift
  # Build the JSON input for the tool invocation via the CLI.
  # For now, we call the scriptorium API through a lightweight node script
  # that loads the guild and invokes the apparatus directly.
  #
  # Interim approach: use `claude` CLI to invoke tools.
  # This is expedient but will be replaced by direct API calls once
  # the session funnel supports programmatic tool invocation.
  if [[ -n "${NSG_DRY_RUN:-}" ]]; then
    log "[dry-run] tool: $tool_name $*"
    return 0
  fi

  node --disable-warning=ExperimentalWarning --experimental-transform-types \
    -e "
    import { initGuild } from '@shardworks/nexus-core';
    const guild = await initGuild('$GUILD_HOME');
    const api = guild.apparatus('codexes');
    const result = await api.${tool_name}($(echo "$1"));
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
    " 2>&1
}

# ── Parse arguments ───────────────────────────────────────────

show_help() {
  cat <<'HELP'
Scriptorium — interim dispatch script for codex-based agent sessions

Usage:
  scriptorium.sh <codex> <agent> [branch] [-- <agent-args...>]

Arguments:
  codex     Name of a registered codex
  agent     Agent to dispatch (e.g. builder-mk1)
  branch    Optional draft branch name (default: auto-generated)

Options after --:
  Additional arguments passed through to the agent

Lifecycle:
  1. Opens a draft binding (git worktree) on the codex
  2. Runs the agent session in the draft's working directory
  3. Seals the draft (ff-only merge, with rebase retry on contention)
  4. Pushes the sealed binding to the remote

Environment:
  NSG_GUILD_HOME  Guild root directory (default: /workspace/shardworks)
  NSG_DRY_RUN     Print commands without executing
HELP
}

CODEX="${1:-}"
AGENT="${2:-}"
BRANCH=""
AGENT_ARGS=()

if [[ -z "$CODEX" || "$CODEX" == "help" || "$CODEX" == "--help" || "$CODEX" == "-h" ]]; then
  show_help
  exit 0
fi

if [[ -z "$AGENT" ]]; then
  err "agent name is required"
  echo "Usage: scriptorium.sh <codex> <agent> [branch] [-- <agent-args...>]" >&2
  exit 1
fi

shift 2

# Parse optional branch and agent args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      AGENT_ARGS=("$@")
      break
      ;;
    *)
      if [[ -z "$BRANCH" ]]; then
        BRANCH="$1"
      else
        err "unexpected argument: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

# ── Phase 1: Open draft ──────────────────────────────────────

log "Opening draft on codex '$CODEX'..."

OPEN_ARGS="{\"codexName\":\"$CODEX\""
if [[ -n "$BRANCH" ]]; then
  OPEN_ARGS+=",\"branch\":\"$BRANCH\""
fi
OPEN_ARGS+="}"

DRAFT_JSON=$(run_tool openDraft "$OPEN_ARGS") || {
  err "Failed to open draft on codex '$CODEX'"
  exit 2
}

DRAFT_PATH=$(echo "$DRAFT_JSON" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).path); } catch { process.exit(1); }
  });
")
DRAFT_BRANCH=$(echo "$DRAFT_JSON" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).branch); } catch { process.exit(1); }
  });
")

log "Draft opened: branch=$DRAFT_BRANCH path=$DRAFT_PATH"

# ── Phase 2: Agent session ───────────────────────────────────

log "Dispatching agent '$AGENT' in draft worktree..."

SESSION_EXIT=0
if [[ -n "${NSG_DRY_RUN:-}" ]]; then
  log "[dry-run] claude --agent $AGENT --cwd $DRAFT_PATH ${AGENT_ARGS[*]:-}"
else
  # Run the agent inside the draft's working directory.
  # The agent sees an isolated checkout and can commit freely.
  (
    cd "$DRAFT_PATH"
    claude -p --agent "$AGENT" "Execute your instructions. You are working in a draft binding at: $DRAFT_PATH" \
      "${AGENT_ARGS[@]}" 2>&1
  ) || SESSION_EXIT=$?
fi

if [[ $SESSION_EXIT -ne 0 ]]; then
  err "Agent session failed (exit $SESSION_EXIT)"
  err "Draft left open for inspection: $DRAFT_PATH"
  err "To abandon: run draft-abandon for codex=$CODEX branch=$DRAFT_BRANCH"
  exit 3
fi

log "Agent session completed successfully"

# ── Phase 3: Seal ─────────────────────────────────────────────

log "Sealing draft '$DRAFT_BRANCH' into codex '$CODEX'..."

SEAL_ARGS="{\"codexName\":\"$CODEX\",\"sourceBranch\":\"$DRAFT_BRANCH\"}"

SEAL_JSON=$(run_tool seal "$SEAL_ARGS") || {
  err "Seal failed for codex='$CODEX' branch='$DRAFT_BRANCH'"
  err "Draft left open — may need manual reconciliation"
  err "Path: $DRAFT_PATH"
  exit 4
}

SEAL_STRATEGY=$(echo "$SEAL_JSON" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).strategy); } catch { process.exit(1); }
  });
")
SEAL_COMMIT=$(echo "$SEAL_JSON" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).sealedCommit); } catch { process.exit(1); }
  });
")

log "Sealed: strategy=$SEAL_STRATEGY commit=${SEAL_COMMIT:0:12}"

# ── Phase 4: Push ─────────────────────────────────────────────

log "Pushing sealed binding to remote..."

PUSH_ARGS="{\"codexName\":\"$CODEX\"}"

run_tool push "$PUSH_ARGS" > /dev/null || {
  err "Push failed — sealed locally but not pushed to remote"
  err "Manual push needed for codex '$CODEX'"
  exit 5
}

log "Push complete"
log "✓ Full cycle: open → session → seal → push"
log "  codex=$CODEX branch=$DRAFT_BRANCH commit=${SEAL_COMMIT:0:12}"
