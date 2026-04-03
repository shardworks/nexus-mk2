#!/usr/bin/env bash
# instrument-review.sh — Run instrument suite against a commission.
#
# Runs quality scorers (blind + aware) and optionally the codebase
# integration scorer via the generic instrument runner.
#
# Usage:
#   ./bin/instrument-review.sh --commission <id> --repo <path> [options]
#
# Options:
#   --commission <id>    Commission/writ ID (required)
#   --repo <path>        Path to git repo (required)
#   --spec-file <path>   Commission spec (enables aware + integration scoring)
#   --base-commit <sha>  Override: start of commit range
#   --commit <sha>       Override: end of commit range
#   --output-dir <path>  Where to write artifacts
#   --dry-run            Print plan without executing
#   --blind-only         Only run spec-blind quality scorer
#   --aware-only         Only run spec-aware quality scorer
#   --integration-only   Only run codebase integration scorer
#   --quality-only       Run both quality scorers, skip integration
#   --no-integration     Skip integration scorer (default: run if spec provided)

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
INTEGRATION_ONLY=false
QUALITY_ONLY=false
NO_INTEGRATION=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commission)        COMMISSION="$2"; shift 2 ;;
    --repo)              REPO="$2"; shift 2 ;;
    --spec-file)         SPEC_FILE="$2"; shift 2 ;;
    --base-commit)       BASE_COMMIT="$2"; shift 2 ;;
    --commit)            COMMIT="$2"; shift 2 ;;
    --output-dir)        OUTPUT_DIR="$2"; shift 2 ;;
    --dry-run)           DRY_RUN="--dry-run"; shift ;;
    --blind-only)        BLIND_ONLY=true; shift ;;
    --aware-only)        AWARE_ONLY=true; shift ;;
    --integration-only)  INTEGRATION_ONLY=true; shift ;;
    --quality-only)      QUALITY_ONLY=true; shift ;;
    --no-integration)    NO_INTEGRATION=true; shift ;;
    *)                   echo "Unknown argument: $1" >&2; exit 1 ;;
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

# ── Determine which instruments to run ───────────────────────

RUN_BLIND=true
RUN_AWARE=true
RUN_INTEGRATION=true

if [[ "$BLIND_ONLY" == true ]]; then
  RUN_AWARE=false; RUN_INTEGRATION=false
elif [[ "$AWARE_ONLY" == true ]]; then
  RUN_BLIND=false; RUN_INTEGRATION=false
elif [[ "$INTEGRATION_ONLY" == true ]]; then
  RUN_BLIND=false; RUN_AWARE=false
elif [[ "$QUALITY_ONLY" == true ]]; then
  RUN_INTEGRATION=false
fi

if [[ "$NO_INTEGRATION" == true ]]; then
  RUN_INTEGRATION=false
fi

# Aware and integration require spec
if [[ -z "$SPEC_FILE" ]]; then
  if [[ "$RUN_AWARE" == true && "$AWARE_ONLY" != true && "$INTEGRATION_ONLY" != true ]]; then
    RUN_AWARE=false
  elif [[ "$AWARE_ONLY" == true || "$INTEGRATION_ONLY" == true ]]; then
    echo "Error: --aware-only and --integration-only require --spec-file" >&2
    exit 1
  fi
  RUN_INTEGRATION=false
fi

# ── Run blind ────────────────────────────────────────────────

if [[ "$RUN_BLIND" == true ]]; then
  echo "═══ Spec-Blind Quality Review ═══"
  echo ""
  "${NODE_CMD[@]}" "$RUNNER" \
    --instrument-name spec-blind-quality-scorer \
    "${COMMON_ARGS[@]}" \
    "${PARAMS[@]}" \
    $DRY_RUN
  echo ""
fi

# ── Run aware ────────────────────────────────────────────────

if [[ "$RUN_AWARE" == true ]]; then
  echo "═══ Spec-Aware Quality Review ═══"
  echo ""
  "${NODE_CMD[@]}" "$RUNNER" \
    --instrument-name spec-aware-quality-scorer \
    "${COMMON_ARGS[@]}" \
    "${PARAMS[@]}" \
    --param "spec_file=$SPEC_FILE" \
    $DRY_RUN
  echo ""
fi

# ── Run integration ──────────────────────────────────────────

if [[ "$RUN_INTEGRATION" == true ]]; then
  echo "═══ Codebase Integration Review ═══"
  echo ""
  "${NODE_CMD[@]}" "$RUNNER" \
    --instrument-name codebase-integration-scorer \
    "${COMMON_ARGS[@]}" \
    "${PARAMS[@]}" \
    --param "spec_file=$SPEC_FILE" \
    $DRY_RUN
  echo ""
fi
