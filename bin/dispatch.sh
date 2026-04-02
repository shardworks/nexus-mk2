#!/usr/bin/env bash
# bin/dispatch.sh — Post a commission and dispatch to an anima
#
# Posts a commission to the Clerk, then dispatches via the Dispatch
# apparatus. Data collection (commission artifacts, session records,
# commission log, quality scoring) is handled by the Laboratory
# apparatus running in the guild — this script does NOT duplicate
# any of that.
#
# What this script does:
#   1. Post commission to the Clerk → writ ID
#   2. Dispatch via dispatch-next (full session lifecycle)
#   3. Capture a dispatch log (anima stderr, timestamped)
#   4. Report outcome
#
# What the Laboratory handles (via CDC, triggered automatically):
#   - Commission data dir, commission.md, review.md template
#   - Commission log skeleton entry
#   - Session records (timing, cost, tokens)
#   - Quality scoring on writ completion
#   - Auto-commits of all data artifacts
#
# Usage:
#   ./bin/dispatch.sh --codex <codex> --role <role> [options] -- 'commission body'
#   ./bin/dispatch.sh --codex <codex> --role <role> [options] -- @file.md
#
# Arguments:
#   --codex       Name of a registered codex (must be added via codex-add)
#   --role        Anima role to summon (e.g. artificer, scribe)
#   --complexity  Patron complexity estimate (Fibonacci: 1 2 3 5 8 13 21).
#                 If provided, updates the Laboratory's commission log entry.
#   --guild-path  Guild root directory (default: /workspace/vibers)
#   -- 'body'     Commission body text, or @<path> to read from file
#
# Title Extraction:
#   The title is extracted from the first line of the commission body.
#   Markdown header prefixes (# ## ### etc.) are stripped automatically.
#
# Prerequisites:
#   Guild must have clerk, dispatch, and laboratory plugins configured.
#
# Exit codes:
#   0 — dispatch completed successfully
#   1 — usage error or missing arguments
#   2 — commission post failed
#   3 — dispatch failed (writ marked failed in Clerk)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/experiments/data/commissions"
LOG_FILE="$PROJECT_ROOT/experiments/data/commission-log.yaml"

# nsg CLI invocation (TypeScript source, needs experimental flags)
NSG_CMD=(node --disable-warning=ExperimentalWarning --experimental-transform-types
  /workspace/nexus/packages/framework/cli/src/cli.ts)

# ── Parse arguments ───────────────────────────────────────────

CODEX=""
ROLE=""
COMPLEXITY=""
GUILD_PATH="/workspace/vibers"
BODY=""

show_help() {
  cat <<'HELP'
dispatch — post a commission and dispatch to an anima

Usage:
  dispatch.sh --codex <codex> --role <role> [options] -- 'commission body'
  dispatch.sh --codex <codex> --role <role> [options] -- @file.md

Required:
  --codex <name>       Registered codex name
  --role <role>        Anima role to summon (e.g. artificer, scribe)
  -- 'body'            Commission body text, or @<path> to read from file

Options:
  --complexity <n>       Patron complexity estimate (Fibonacci: 1 2 3 5 8 13 21)
  --guild-path <path>    Guild root directory (default: /workspace/vibers)
  -h, --help             Show this help

Data collection (commission artifacts, session records, commission log,
quality scoring) is handled by the Laboratory apparatus in the guild.
HELP
}

if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --codex)
      CODEX="${2:-}"
      [[ -z "$CODEX" ]] && { echo "Error: --codex requires a value" >&2; exit 1; }
      shift 2
      ;;
    --role)
      ROLE="${2:-}"
      [[ -z "$ROLE" ]] && { echo "Error: --role requires a value" >&2; exit 1; }
      shift 2
      ;;
    --complexity)
      COMPLEXITY="${2:-}"
      [[ -z "$COMPLEXITY" ]] && { echo "Error: --complexity requires a value" >&2; exit 1; }
      shift 2
      ;;
    --guild-path)
      GUILD_PATH="${2:-}"
      [[ -z "$GUILD_PATH" ]] && { echo "Error: --guild-path requires a value" >&2; exit 1; }
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    --)
      shift
      BODY="$*"
      break
      ;;
    *)
      echo "Error: unknown option '$1'" >&2
      echo "Run 'dispatch.sh --help' for usage." >&2
      exit 1
      ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────

if [[ -z "$CODEX" ]]; then
  echo "Error: --codex is required" >&2
  exit 1
fi

if [[ -z "$ROLE" ]]; then
  echo "Error: --role is required" >&2
  exit 1
fi

if [[ -z "$BODY" ]]; then
  echo "Error: commission body is required (pass after --)" >&2
  exit 1
fi

# ── Resolve body ─────────────────────────────────────────────

# If body starts with @, read from file
if [[ "$BODY" == @* ]]; then
  BODY_FILE="${BODY:1}"
  if [[ ! -f "$BODY_FILE" ]]; then
    echo "Error: commission body file not found: $BODY_FILE" >&2
    exit 1
  fi
  BODY=$(cat "$BODY_FILE")
fi

if [[ -z "$BODY" ]]; then
  echo "Error: commission body is empty" >&2
  exit 1
fi

# ── Extract title ────────────────────────────────────────────

# First line of body, strip markdown header prefixes (# ## ### etc.)
TITLE=$(echo "$BODY" | head -1 | sed 's/^#\+ *//')

if [[ -z "$TITLE" ]]; then
  echo "Error: could not extract title from commission body (first line is empty)" >&2
  exit 1
fi

# ── Append commit instruction ────────────────────────────────
# Until role instructions handle this, ensure the anima knows to commit.
# This is appended to the writ body so it travels with the commission.

BODY="$BODY

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes."

# ── Helpers ──────────────────────────────────────────────────

DISPATCH_LOG=""

log() {
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[dispatch] $*"
  if [[ -n "$DISPATCH_LOG" ]]; then
    echo "$ts [dispatch] $*" >> "$DISPATCH_LOG"
  fi
}

err() {
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[dispatch] ERROR: $*" >&2
  if [[ -n "$DISPATCH_LOG" ]]; then
    echo "$ts [dispatch] ERROR: $*" >> "$DISPATCH_LOG"
  fi
}

nsg() {
  "${NSG_CMD[@]}" --guild-root "$GUILD_PATH" "$@"
}

# ── Execute ──────────────────────────────────────────────────

log "Starting dispatch"
log "  guild=$GUILD_PATH codex=$CODEX role=$ROLE"
log "  title=$TITLE"

# ── Phase 1: Post commission ─────────────────────────────────
# The Clerk creates the writ. The Laboratory's CDC watcher fires
# synchronously and handles: commission dir, commission.md,
# review.md, commission log skeleton, auto-commit.

log "Posting commission..."
POST_RESULT=$(nsg commission-post \
  --title "$TITLE" \
  --body "$BODY" \
  --codex "$CODEX") || {
  err "Commission post failed"
  exit 2
}

WRIT_ID=$(echo "$POST_RESULT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).id)")
log "Commission posted: $WRIT_ID"

# ── Update complexity in commission log ──────────────────────
# The Laboratory writes complexity: null. If the patron provided
# a complexity estimate, patch it in.

if [[ -n "$COMPLEXITY" ]]; then
  # The Laboratory writes complexity: null in the skeleton entry.
  # Patch it with the patron's estimate. We match the first
  # "complexity: null" that appears after this writ's ID line.
  if awk -v id="$WRIT_ID" -v val="$COMPLEXITY" '
    /id:/ && $0 ~ id { found=1 }
    found && /complexity: null/ { sub(/complexity: null/, "complexity: " val); found=0 }
    { print }
  ' "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"; then
    log "Updated complexity to $COMPLEXITY in commission log"
  else
    log "Warning: could not update complexity in commission log"
    rm -f "${LOG_FILE}.tmp"
  fi
fi

# ── Initialize dispatch log ──────────────────────────────────
# The Laboratory creates the commission dir. We add a dispatch.log
# for operational stderr capture (anima session output).

COMMISSION_DIR="$DATA_DIR/$WRIT_ID"
mkdir -p "$COMMISSION_DIR"  # no-op if Laboratory already created it
DISPATCH_LOG="$COMMISSION_DIR/dispatch.log"

# Replay buffered lines
{
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "$ts [dispatch] Starting dispatch"
  echo "$ts [dispatch]   guild=$GUILD_PATH codex=$CODEX role=$ROLE"
  echo "$ts [dispatch]   title=$TITLE"
  echo "$ts [dispatch] Commission posted: $WRIT_ID"
} > "$DISPATCH_LOG"

# ── Phase 2: Dispatch ───────────────────────────────────────
# dispatch-next picks up the ready writ, runs the full session
# lifecycle (accept → draft → summon → seal → push → complete/fail).
# The Laboratory's CDC watchers handle session records and quality
# scoring automatically.

log "Dispatching (role=$ROLE)... this may take a while."
log "--- anima session output ---"

# Capture stdout (JSON result) while teeing stderr (anima session
# output) to both the terminal and the dispatch log.
DISPATCH_RESULT=$(nsg dispatch-next --role "$ROLE" \
  2> >(tee >(awk '{print strftime("%Y-%m-%dT%H:%M:%SZ") " [anima] " $0; fflush()}' \
    >> "$DISPATCH_LOG") >&2) \
) || {
  err "Dispatch command failed"
  exit 3
}

log "--- end session output ---"

# Parse dispatch result
OUTCOME=$(echo "$DISPATCH_RESULT" | node -e "
  const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  process.stdout.write(r.outcome ?? r.status ?? 'unknown')
")
SESSION_ID=$(echo "$DISPATCH_RESULT" | node -e "
  const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  process.stdout.write(r.sessionId ?? '')
")
RESOLUTION=$(echo "$DISPATCH_RESULT" | node -e "
  const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  process.stdout.write(r.resolution ?? '')
")

log "Dispatch complete: outcome=$OUTCOME session=${SESSION_ID:-none}"

# ── Check outcome ────────────────────────────────────────────

if [[ "$OUTCOME" == "failed" ]]; then
  err "Dispatch failed: $RESOLUTION"
  err "Writ $WRIT_ID marked as failed in the Clerk."
  exit 3
fi

# ── Summary ──────────────────────────────────────────────────

log ""
log "✓ Dispatch complete"
log "  writ=$WRIT_ID"
log "  session=${SESSION_ID:-none}"
log "  outcome=${OUTCOME:-unknown}"
log "  artifacts=$COMMISSION_DIR"
log ""
log "The Laboratory handles: commission log, session records, quality scoring."
log "Dispatch log: $DISPATCH_LOG"
