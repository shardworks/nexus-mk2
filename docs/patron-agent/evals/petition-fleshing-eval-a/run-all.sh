#!/usr/bin/env bash
# Run both fleshing agents across every input brief.
#
# Usage: run-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

shopt -s nullglob
INPUTS=("$ROOT"/inputs/*.md)
shopt -u nullglob

if [[ ${#INPUTS[@]} -eq 0 ]]; then
  echo "no inputs/*.md files found under $ROOT" >&2
  exit 1
fi

AGENTS=(patron-flesh patron-baseline)

TOTAL=$(( ${#INPUTS[@]} * ${#AGENTS[@]} ))
echo "running ${#AGENTS[@]} agents across ${#INPUTS[@]} briefs ($TOTAL invocations)..."

for AGENT in "${AGENTS[@]}"; do
  for IN in "${INPUTS[@]}"; do
    SLUG="$(basename "$IN" .md)"
    echo "=== $AGENT / $SLUG ==="
    "$ROOT/run-flesh.sh" "$SLUG" "$AGENT" || echo "  (run-flesh.sh exited non-zero for $AGENT/$SLUG)"
  done
done

echo "done. log: $ROOT/runs.log"
