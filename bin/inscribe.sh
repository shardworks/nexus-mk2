#!/usr/bin/env bash
# bin/inscribe.sh — Post a commission and dispatch via guild tooling
#
# Posts a commission to the Clerk, dispatches via the Dispatch apparatus,
# captures artifacts to the sanctum, scaffolds a commission log entry,
# and runs quality scoring by default.
#
# Usage:
#   ./bin/inscribe.sh --codex <codex> --role <role> [options] -- 'commission body'
#   ./bin/inscribe.sh --codex <codex> --role <role> [options] -- @file.md
#
# Arguments:
#   --codex       Name of a registered codex (must be added via codex-add)
#   --role        Anima role to summon (e.g. artificer, scribe)
#   --complexity  Patron complexity estimate (Fibonacci: 1 2 3 5 8 13 21)
#   --guild-path  Guild root directory (default: /workspace/vibers)
#   --no-score    Skip quality scoring (scoring is on by default)
#   -- 'body'     Commission body text, or @<path> to read from file
#
# Title Extraction:
#   The title is extracted from the first line of the commission body.
#   Markdown header prefixes (# ## ### etc.) are stripped automatically.
#
# Lifecycle:
#   Phase 1 — Post: commission-post via the Clerk → writ ID
#   Phase 2 — Capture: create commission folder, write commission.md
#   Phase 3 — Dispatch: dispatch-next via the Dispatch apparatus
#             (accept writ → open draft → summon → seal → push → complete/fail)
#   Phase 4 — Record: pull session.json, scaffold commission-log entry
#   Phase 5 — Score: run quality-review-full.sh (unless --no-score)
#
# Scoring:
#   Quality scoring uses the guild's bare clone for the codex, so no
#   separate repo path is needed. The bare clone already has all commits
#   after seal. Commit range is determined by recording HEAD before and
#   after dispatch — best-effort with concurrent dispatches. Proper
#   per-writ commit tracking is a future framework improvement.
#
# Prerequisites:
#   Guild must have clerk and dispatch plugins configured.
#
# Exit codes:
#   0 — full cycle completed
#   1 — usage error or missing arguments
#   2 — commission post failed
#   3 — dispatch failed (writ marked failed in Clerk)
#   4 — artifact capture failed
#   5 — scoring failed (commission succeeded, scoring did not)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/experiments/data/commissions"
LOG_FILE="$PROJECT_ROOT/experiments/ethnography/commission-log.yaml"

# nsg CLI invocation (TypeScript source, needs experimental flags)
NSG_CMD=(node --disable-warning=ExperimentalWarning --experimental-transform-types
  /workspace/nexus/packages/framework/cli/src/cli.ts)

# ── Parse arguments ───────────────────────────────────────────

CODEX=""
ROLE=""
COMPLEXITY=""
GUILD_PATH="/workspace/vibers"
BODY=""
SCORE=true

show_help() {
  cat <<'HELP'
inscribe — post a commission and dispatch via guild tooling

Usage:
  inscribe.sh --codex <codex> --role <role> [options] -- 'commission body'
  inscribe.sh --codex <codex> --role <role> [options] -- @file.md

Required:
  --codex <name>       Registered codex name
  --role <role>        Anima role to summon (e.g. artificer, scribe)
  -- 'body'            Commission body text, or @<path> to read from file

Options:
  --complexity <n>       Patron complexity estimate (Fibonacci: 1 2 3 5 8 13 21)
  --guild-path <path>    Guild root directory (default: /workspace/vibers)
  --no-score             Skip quality scoring (on by default)
  -h, --help             Show this help

Lifecycle:
  1. Posts commission to the Clerk (creates a writ in ready status)
  2. Creates commission folder and writes commission.md
  3. Dispatches via the Dispatch apparatus (full session lifecycle)
  4. Pulls session record, scaffolds commission-log entry
  5. Runs quality scoring (unless --no-score)
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
    --no-score)
      SCORE=false
      shift
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
      echo "Run 'inscribe.sh --help' for usage." >&2
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

# ── Resolve bare clone path (for scoring) ────────────────────

BARE_CLONE="$GUILD_PATH/.nexus/codexes/$CODEX.git"

if $SCORE && ! git -C "$BARE_CLONE" rev-parse --git-dir &>/dev/null; then
  echo "Warning: bare clone not found at '$BARE_CLONE'. Scoring will be skipped." >&2
  SCORE=false
fi

# ── Helpers ──────────────────────────────────────────────────

log() { echo "[inscribe] $*"; }
err() { echo "[inscribe] ERROR: $*" >&2; }

nsg() {
  "${NSG_CMD[@]}" --guild-root "$GUILD_PATH" "$@"
}

# ── Execute ──────────────────────────────────────────────────

log "Starting inscription cycle"
log "  guild=$GUILD_PATH codex=$CODEX role=$ROLE"
log "  title=$TITLE"
log "  score=$SCORE bare-clone=$BARE_CLONE"

# ── Phase 1: Post commission ─────────────────────────────────

log "Posting commission..."
POST_RESULT=$(nsg commission post \
  --title "$TITLE" \
  --body "$BODY" \
  --codex "$CODEX") || {
  err "Commission post failed"
  exit 2
}

WRIT_ID=$(echo "$POST_RESULT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).id)")
log "Commission posted: $WRIT_ID"

# ── Phase 2: Create commission folder ────────────────────────

COMMISSION_DIR="$DATA_DIR/$WRIT_ID"
mkdir -p "$COMMISSION_DIR"

echo "$BODY" > "$COMMISSION_DIR/commission.md"
log "Wrote $COMMISSION_DIR/commission.md"

# ── Record base commit for scoring ───────────────────────────
# Records the bare clone's main ref before dispatch. With concurrent
# dispatches this may include unrelated commits in the range. Proper
# per-writ commit tracking is a future framework improvement.

BASE_COMMIT=""
if $SCORE; then
  BASE_COMMIT=$(git -C "$BARE_CLONE" rev-parse main 2>/dev/null || true)
  if [[ -n "$BASE_COMMIT" ]]; then
    log "Base commit: ${BASE_COMMIT:0:12}"
  else
    log "Warning: could not record base commit from bare clone"
  fi
fi

# ── Phase 3: Dispatch ───────────────────────────────────────

log "Dispatching (role=$ROLE)... this may take a while."
DISPATCH_RESULT=$(nsg dispatch next --role "$ROLE") || {
  err "Dispatch command failed"
  exit 3
}

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

# ── Phase 4: Record artifacts ────────────────────────────────

# Pull session record from guild stacks
if [[ -n "$SESSION_ID" ]]; then
  SESSION_JSON=$(nsg session show --id "$SESSION_ID" 2>/dev/null || true)
  if [[ -n "$SESSION_JSON" ]]; then
    echo "$SESSION_JSON" > "$COMMISSION_DIR/session.json"
    log "Wrote $COMMISSION_DIR/session.json"
  else
    log "Warning: could not retrieve session record for $SESSION_ID"
  fi
fi

# Scaffold commission-log entry
COMPLEXITY_YAML="${COMPLEXITY:-null}"

cat >> "$LOG_FILE" <<EOF

  - id: $WRIT_ID
    title: "$TITLE"
    codex: $CODEX
    complexity: $COMPLEXITY_YAML
    spec_quality_pre: null
    outcome: null
    revision_required: null
    spec_quality_post: null
    failure_mode: null
EOF

log "Scaffolded commission-log entry for $WRIT_ID"

# ── Check dispatch outcome ───────────────────────────────────

if [[ "$OUTCOME" == "failed" ]]; then
  err "Dispatch failed: $RESOLUTION"
  err "Writ $WRIT_ID marked as failed in the Clerk."
  err "Commission folder: $COMMISSION_DIR"
  exit 3
fi

# ── Phase 5: Quality scoring ────────────────────────────────

if $SCORE; then
  # Resolve head commit after dispatch. The bare clone already has
  # the sealed commits — no fetch needed.
  HEAD_COMMIT=""
  if [[ -n "$BASE_COMMIT" ]]; then
    HEAD_COMMIT=$(git -C "$BARE_CLONE" rev-parse main 2>/dev/null || true)
    if [[ -n "$HEAD_COMMIT" ]]; then
      log "Head commit: ${HEAD_COMMIT:0:12}"
    fi
  fi

  if [[ -z "$BASE_COMMIT" || -z "$HEAD_COMMIT" ]]; then
    log "Warning: missing commit range — skipping quality scoring"
  elif [[ "$BASE_COMMIT" == "$HEAD_COMMIT" ]]; then
    log "Warning: no new commits detected — skipping quality scoring"
  else
    log "Running quality scoring..."
    if "$SCRIPT_DIR/quality-review-full.sh" \
        --commission "$WRIT_ID" \
        --repo "$BARE_CLONE" \
        --spec-file "$COMMISSION_DIR/commission.md" \
        --base-commit "$BASE_COMMIT" \
        --commit "$HEAD_COMMIT" \
        --output-dir "$DATA_DIR"; then
      log "Quality scoring complete"
    else
      log "Warning: quality scoring failed (commission itself succeeded)"
    fi
  fi
fi

# ── Summary ──────────────────────────────────────────────────

log ""
log "✓ Inscription cycle complete"
log "  writ=$WRIT_ID"
log "  session=${SESSION_ID:-none}"
log "  outcome=${OUTCOME:-unknown}"
log "  artifacts=$COMMISSION_DIR"
if [[ -n "${BASE_COMMIT:-}" && -n "${HEAD_COMMIT:-}" && "$BASE_COMMIT" != "$HEAD_COMMIT" ]]; then
  log "  commits=${BASE_COMMIT:0:12}..${HEAD_COMMIT:0:12}"
fi
