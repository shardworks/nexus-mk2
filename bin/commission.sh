#!/usr/bin/env bash
# bin/commission.sh — Send a commission to an autonomous agent
#
# Bootstrap-phase script for running commissions manually.
# Automates the recipe in docs/bootstrap-agent-spawn.md.
#
# Usage:
#   ./bin/commission.sh <commission-name> [<repo-url>] [--model <model>]
#
# If repo-url is omitted, defaults to the pre-provisioned system repo.
#
# Example:
#   ./bin/commission.sh session-launcher
#   ./bin/commission.sh session-launcher https://github.com/shardworks/some-other-repo
#   ./bin/commission.sh session-launcher --model haiku

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Args ──────────────────────────────────────────────────────

DEFAULT_REPO="https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680"

COMMISSION_NAME="${1:-}"
MODEL=""

if [[ -z "$COMMISSION_NAME" ]]; then
  echo "Usage: commission.sh <commission-name> [<repo-url>] [--model <model>]" >&2
  echo "" >&2
  echo "Available commissions:" >&2
  for f in "$PROJECT_ROOT"/commissions/ready/*.md "$PROJECT_ROOT"/commissions/draft/*.md; do
    [[ -f "$f" ]] && basename "$f" .md >&2
  done
  exit 1
fi

shift

# Second positional arg is repo URL (if it doesn't start with --)
REPO_URL="$DEFAULT_REPO"
if [[ "${1:-}" != "" && "${1:-}" != --* ]]; then
  REPO_URL="$1"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

COMMISSION_FILE=""
for dir in ready draft; do
  candidate="$PROJECT_ROOT/commissions/$dir/$COMMISSION_NAME.md"
  if [[ -f "$candidate" ]]; then
    COMMISSION_FILE="$candidate"
    break
  fi
done

if [[ -z "$COMMISSION_FILE" ]]; then
  echo "Error: commission not found: $COMMISSION_NAME" >&2
  exit 1
fi

# ── Clean room setup ─────────────────────────────────────────

WORKDIR=$(mktemp -d)
echo "Clean room: $WORKDIR" >&2

# Clone the target repo
git clone "$REPO_URL" "$WORKDIR/work" 2>&1 | sed 's/^/  [git] /' >&2

# Note: --dangerously-skip-permissions flag handles permissions at the CLI level.
# No need for .claude/settings.json — the flag is more comprehensive.

# ── Run the agent ─────────────────────────────────────────────

LOGFILE="$WORKDIR/session.jsonl"
echo "Session log: $LOGFILE" >&2
echo "Commission: $COMMISSION_NAME" >&2
echo "---" >&2

MODEL_FLAG=""
if [[ -n "$MODEL" ]]; then
  MODEL_FLAG="--model $MODEL"
fi

cd "$WORKDIR/work"
cat "$COMMISSION_FILE" | claude -p \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  $MODEL_FLAG \
  | tee "$LOGFILE" >&2

EXIT_CODE=${PIPESTATUS[1]}

echo "---" >&2
echo "Agent exited with code: $EXIT_CODE" >&2
echo "Session log saved: $LOGFILE" >&2
echo "Work directory: $WORKDIR/work" >&2
