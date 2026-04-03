#!/usr/bin/env bash
# quality-review-v2.sh — Convenience wrapper for the instrument runner.
#
# Runs the quality scorer (blind and/or aware) via the generic
# instrument runner. Translates legacy CLI conventions to the new
# --instrument-name / --param interface.
#
# Usage:
#   ./bin/quality-review-v2.sh --commission <id> --repo <path> [options]
#
# Options:
#   --commission <id>    Commission/writ ID (required)
#   --repo <path>        Path to git repo (required)
#   --spec-file <path>   Commission spec (enables aware scoring)
#   --base-commit <sha>  Override: start of commit range
#   --commit <sha>       Override: end of commit range
#   --output-dir <path>  Where to write artifacts
#   --dry-run            Print plan without executing
#   --blind-only         Skip aware scoring (default: run both if spec provided)
#   --aware-only         Skip blind scoring

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="$PROJECT_ROOT/packages/instruments/src/cli.ts"

# ── Parse arguments ──────────────────────────────────────────

COMMISSION=""
REPO=""
SPEC_FILE=""
BASE_COMMIT=""
COMMIT=""
OUTPUT_DIR=""
DRY_RUN=""
BLIND_ONLY=false
AWARE_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commission)   COMMISSION="$2"; shift 2 ;;
    --repo)         REPO="$2"; shift 2 ;;
    --spec-file)    SPEC_FILE="$2"; shift 2 ;;
    --base-commit)  BASE_COMMIT="$2"; shift 2 ;;
    --commit)       COMMIT="$2"; shift 2 ;;
    --output-dir)   OUTPUT_DIR="$2"; shift 2 ;;
    --dry-run)      DRY_RUN="--dry-run"; shift ;;
    --blind-only)   BLIND_ONLY=true; shift ;;
    --aware-only)   AWARE_ONLY=true; shift ;;
    *)              echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$COMMISSION" || -z "$REPO" ]]; then
  echo "Error: --commission and --repo are required" >&2
  exit 1
fi

OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/experiments/data/commissions/${COMMISSION}}"

# Build common params
PARAMS=(--param "commission=$COMMISSION" --param "repo=$REPO")
[[ -n "$BASE_COMMIT" ]] && PARAMS+=(--param "base_commit=$BASE_COMMIT")
[[ -n "$COMMIT" ]] && PARAMS+=(--param "commit=$COMMIT")

NODE_CMD=(node --disable-warning=ExperimentalWarning --experimental-transform-types)
COMMON_ARGS=(--instrument-root "$PROJECT_ROOT/experiments/instruments" --output-dir "$OUTPUT_DIR")

# ── Run blind ────────────────────────────────────────────────

if [[ "$AWARE_ONLY" != true ]]; then
  echo "═══ Blind Review ═══"
  echo ""
  "${NODE_CMD[@]}" "$RUNNER" \
    --instrument-name spec-blind-quality-scorer \
    "${COMMON_ARGS[@]}" \
    "${PARAMS[@]}" \
    $DRY_RUN
  echo ""
fi

# ── Run aware (if spec provided) ─────────────────────────────

if [[ "$BLIND_ONLY" != true && -n "$SPEC_FILE" ]]; then
  echo "═══ Aware Review ═══"
  echo ""
  "${NODE_CMD[@]}" "$RUNNER" \
    --instrument-name spec-aware-quality-scorer \
    "${COMMON_ARGS[@]}" \
    "${PARAMS[@]}" \
    --param "spec_file=$SPEC_FILE" \
    $DRY_RUN
  echo ""
elif [[ "$BLIND_ONLY" != true && -z "$SPEC_FILE" && "$AWARE_ONLY" == true ]]; then
  echo "Error: --aware-only requires --spec-file" >&2
  exit 1
fi
