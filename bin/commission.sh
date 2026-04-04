#!/usr/bin/env bash
# bin/commission.sh — Post a commission to the Clerk
#
# Posts a commission writ. The Spider picks it up and dispatches to an
# anima automatically. Data collection (commission artifacts, session
# records, commission log, quality scoring) is handled by the
# Laboratory apparatus running in the guild.
#
# What this script does:
#   1. Post commission to the Clerk → writ ID
#   2. Patch complexity into the commission log (if provided)
#   3. Report outcome
#
# What the Laboratory handles (via CDC, triggered automatically):
#   - Commission data dir, commission.md, review.md template
#   - Commission log skeleton entry
#   - Session records (timing, cost, tokens)
#   - Quality scoring on writ completion
#   - Auto-commits of all data artifacts
#
# What the Spider handles:
#   - Picking up ready writs and dispatching to an anima
#   - Full session lifecycle (accept → draft → summon → seal → push → complete/fail)
#
# Usage:
#   ./bin/commission.sh --codex <codex> [options] -- 'commission body'
#   ./bin/commission.sh --codex <codex> [options] -- @file.md
#
# Arguments:
#   --codex       Name of a registered codex (must be added via codex-add)
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
#   Guild must have clerk and laboratory plugins configured.
#
# Exit codes:
#   0 — commission posted successfully
#   1 — usage error or missing arguments
#   2 — commission post failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$PROJECT_ROOT/experiments/data/commission-log.yaml"

# nsg CLI invocation (TypeScript source, needs experimental flags)
NSG_CMD=(node --disable-warning=ExperimentalWarning --experimental-transform-types
  /workspace/nexus/packages/framework/cli/src/cli.ts)

# ── Parse arguments ───────────────────────────────────────────

CODEX=""
COMPLEXITY=""
GUILD_PATH="/workspace/vibers"
BODY=""

show_help() {
  cat <<'HELP'
commission — post a commission to the Clerk

Usage:
  commission.sh --codex <codex> [options] -- 'commission body'
  commission.sh --codex <codex> [options] -- @file.md

Required:
  --codex <name>       Registered codex name
  -- 'body'            Commission body text, or @<path> to read from file

Options:
  --complexity <n>       Patron complexity estimate (Fibonacci: 1 2 3 5 8 13 21)
  --guild-path <path>    Guild root directory (default: /workspace/vibers)
  -h, --help             Show this help

The Spider picks up ready writs automatically. Data collection
(commission artifacts, session records, commission log, quality
scoring) is handled by the Laboratory apparatus in the guild.
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
      echo "Run 'commission.sh --help' for usage." >&2
      exit 1
      ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────

if [[ -z "$CODEX" ]]; then
  echo "Error: --codex is required" >&2
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

# Strip YAML frontmatter (--- ... ---) and leading whitespace, then grab
# the first non-empty line. Strip markdown header prefixes (# ## ### etc.)
# Truncate to 100 chars to keep commission log and writ titles readable.
BODY_NO_FM=$(echo "$BODY" | sed '/^---$/,/^---$/d' | sed '/^[[:space:]]*$/d')
TITLE=$(echo "$BODY_NO_FM" | head -1 | sed 's/^#\+ *//')
if [[ ${#TITLE} -gt 100 ]]; then
  TITLE="${TITLE:0:100}…"
fi

if [[ -z "$TITLE" ]]; then
  echo "Error: could not extract title from commission body (first line is empty after stripping frontmatter)" >&2
  exit 1
fi

# ── Helpers ──────────────────────────────────────────────────

log() {
  echo "[commission] $*"
}

err() {
  echo "[commission] ERROR: $*" >&2
}

nsg() {
  "${NSG_CMD[@]}" --guild-root "$GUILD_PATH" "$@"
}

# ── Execute ──────────────────────────────────────────────────

log "Posting commission..."
log "  guild=$GUILD_PATH codex=$CODEX"
log "  title=$TITLE"

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

# ── Summary ──────────────────────────────────────────────────

log ""
log "✓ Commission posted"
log "  writ=$WRIT_ID"
log "  codex=$CODEX"
[[ -n "$COMPLEXITY" ]] && log "  complexity=$COMPLEXITY"
log ""
log "The Spider will pick this up automatically."
log "The Laboratory handles: commission log, session records, quality scoring."
