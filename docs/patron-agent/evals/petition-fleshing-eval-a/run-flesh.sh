#!/usr/bin/env bash
# Run a fleshing agent against a single thin-brief input.
#
# Usage: run-flesh.sh <slug> <agent>
#   <slug>   — corresponds to inputs/<slug>.md
#   <agent>  — one of: patron-flesh, patron-baseline

set -euo pipefail

SLUG="${1:-}"
AGENT="${2:-}"
if [[ -z "$SLUG" || -z "$AGENT" ]]; then
  echo "usage: $0 <slug> <agent>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
IN="$ROOT/inputs/$SLUG.md"
OUTDIR="$ROOT/outputs/$AGENT"
OUT="$OUTDIR/$SLUG.md"
META="$OUTDIR/$SLUG.meta.json"
LOG="$ROOT/runs.log"

if [[ ! -f "$IN" ]]; then
  echo "error: input not found: $IN" >&2
  exit 1
fi

mkdir -p "$OUTDIR"
rm -f "$OUT" "$META"

START=$(date -u +%s)

PROMPT="Read the thin commission brief at $IN. Flesh it out into a detailed petition per your operational mode. Write the fleshed markdown to $OUT. Do not modify the input file."

claude -p \
  --agent "$AGENT" \
  --model opus \
  --permission-mode bypassPermissions \
  --no-session-persistence \
  --output-format json \
  "$PROMPT" \
  > "$META"

END=$(date -u +%s)
DUR=$((END - START))

# Validate output exists and is non-trivial markdown.
if [[ -f "$OUT" ]]; then
  SIZE=$(wc -c < "$OUT")
  if [[ "$SIZE" -gt 200 ]]; then
    STATUS="ok(${SIZE}ch)"
  else
    STATUS="thin(${SIZE}ch)"
  fi
else
  STATUS="no-output"
fi

echo "$AGENT  $SLUG  $(date -u +%FT%TZ)  ${DUR}s  $STATUS" | tee -a "$LOG"
