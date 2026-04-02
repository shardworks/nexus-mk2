#!/usr/bin/env bash
# quality-review-full.sh — Run both blind and aware quality reviews in parallel
#
# Convenience harness that launches quality-review.sh in both modes
# simultaneously. With the default 3 runs per mode, this fires 6
# independent review calls in parallel and writes both artifacts.
#
# Usage:
#   ./bin/quality-review-full.sh --commission <id> --repo <path> \
#       --spec-file <path> [options]
#
# Required:
#   --commission <id>    Commission ID (e.g. C003)
#   --repo <path>        Path to the git repo
#   --spec-file <path>   Path to the commission spec (needed for aware mode)
#
# Options:
#   --commit <sha>       End commit (passed through to both runs)
#   --base-commit <sha>  Start of commit range (passed through to both runs)
#   --runs <n>           Runs per mode (default: 3). Total API calls = 2 × n.
#   --prompt-version <v> Prompt version (default: v1)
#   --instrument-dir <p> Instrument dir (passed through)
#   --output-dir <path>  Artifact output dir (passed through)
#   --dry-run            Print plan, don't execute
#
# Output:
#   <output-dir>/<commission-id>/quality-blind.yaml  (blind mode)
#   <output-dir>/<commission-id>/quality-aware.yaml  (aware mode)
#
# Exit codes:
#   0 — both reviews completed
#   1 — usage error
#   2 — one or both reviews failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVIEW_SCRIPT="$SCRIPT_DIR/quality-review.sh"

if [[ ! -x "$REVIEW_SCRIPT" ]]; then
  echo "Error: quality-review.sh not found at $REVIEW_SCRIPT" >&2
  exit 1
fi

# ── Parse arguments ──────────────────────────────────────────

COMMISSION=""
REPO=""
SPEC_FILE=""
COMMIT=""
BASE_COMMIT=""
RUNS=""
PROMPT_VERSION=""
INSTRUMENT_DIR=""
OUTPUT_DIR=""
DRY_RUN=false

show_help() {
  cat <<'HELP'
quality-review-full — run blind + aware quality reviews in parallel

Usage:
  quality-review-full.sh --commission <id> --repo <path> --spec-file <path> [options]

Required:
  --commission <id>    Commission ID (e.g. C003)
  --repo <path>        Git repo path
  --spec-file <path>   Commission spec (required for aware mode)

Options:
  --commit <sha>       Commit to review (auto-detected if omitted)
  --base-commit <sha>  Start of commit range (parent of first commission commit)
  --runs <n>           Runs per mode (default: 3, total = 2×n)
  --prompt-version <v> Prompt version (default: v1)
  --instrument-dir <p> Instrument dir
  --output-dir <path>  Artifact output dir
  --dry-run            Print plan, don't execute
  --help               Show this help
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commission)     COMMISSION="$2"; shift 2 ;;
    --repo)           REPO="$2"; shift 2 ;;
    --spec-file)      SPEC_FILE="$2"; shift 2 ;;
    --commit)         COMMIT="$2"; shift 2 ;;
    --base-commit)    BASE_COMMIT="$2"; shift 2 ;;
    --runs)           RUNS="$2"; shift 2 ;;
    --prompt-version) PROMPT_VERSION="$2"; shift 2 ;;
    --instrument-dir) INSTRUMENT_DIR="$2"; shift 2 ;;
    --output-dir)     OUTPUT_DIR="$2"; shift 2 ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --help)           show_help; exit 0 ;;
    *)                echo "Unknown argument: $1" >&2; show_help; exit 1 ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────

if [[ -z "$COMMISSION" ]]; then
  echo "Error: --commission is required" >&2
  exit 1
fi

if [[ -z "$REPO" ]]; then
  echo "Error: --repo is required" >&2
  exit 1
fi

if [[ -z "$SPEC_FILE" ]]; then
  echo "Error: --spec-file is required (needed for aware mode)" >&2
  exit 1
fi

# ── Build common args ────────────────────────────────────────

COMMON_ARGS=(--commission "$COMMISSION" --repo "$REPO")
[[ -n "$COMMIT" ]]         && COMMON_ARGS+=(--commit "$COMMIT")
[[ -n "$BASE_COMMIT" ]]    && COMMON_ARGS+=(--base-commit "$BASE_COMMIT")
[[ -n "$RUNS" ]]           && COMMON_ARGS+=(--runs "$RUNS")
[[ -n "$PROMPT_VERSION" ]] && COMMON_ARGS+=(--prompt-version "$PROMPT_VERSION")
[[ -n "$INSTRUMENT_DIR" ]] && COMMON_ARGS+=(--instrument-dir "$INSTRUMENT_DIR")
[[ -n "$OUTPUT_DIR" ]]     && COMMON_ARGS+=(--output-dir "$OUTPUT_DIR")
$DRY_RUN                   && COMMON_ARGS+=(--dry-run)

# ── Launch both modes ────────────────────────────────────────

RUN_COUNT="${RUNS:-3}"
TOTAL=$((RUN_COUNT * 2))

echo "═══ Full Quality Review: $COMMISSION ═══"
echo "  Launching blind + aware modes in parallel"
echo "  $RUN_COUNT runs × 2 modes = $TOTAL total API calls"
echo ""

# Blind mode
"$REVIEW_SCRIPT" "${COMMON_ARGS[@]}" --mode blind &
PID_BLIND=$!

# Aware mode
"$REVIEW_SCRIPT" "${COMMON_ARGS[@]}" --mode aware --spec-file "$SPEC_FILE" &
PID_AWARE=$!

# ── Wait and report ──────────────────────────────────────────

FAILURES=0

if wait $PID_BLIND; then
  echo ""
  echo "  ✓ Blind review complete"
else
  echo ""
  echo "  ✗ Blind review failed" >&2
  FAILURES=$((FAILURES + 1))
fi

if wait $PID_AWARE; then
  echo "  ✓ Aware review complete"
else
  echo "  ✗ Aware review failed" >&2
  FAILURES=$((FAILURES + 1))
fi

echo ""

if [[ $FAILURES -gt 0 ]]; then
  echo "═══ $FAILURES of 2 reviews failed ═══"
  exit 2
else
  echo "═══ Both reviews complete ═══"
fi
