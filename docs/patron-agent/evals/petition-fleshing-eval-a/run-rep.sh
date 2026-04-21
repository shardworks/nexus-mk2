#!/usr/bin/env bash
# Run both fleshing agents across every input brief, writing to reps/<N>/.
#
# Usage: run-rep.sh <rep-number>

set -euo pipefail

REP="${1:-}"
if [[ -z "$REP" ]]; then
  echo "usage: $0 <rep-number>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPDIR="$ROOT/reps/$REP"
LOG="$ROOT/runs-rep$REP.log"

shopt -s nullglob
INPUTS=("$ROOT"/inputs/*.md)
shopt -u nullglob

if [[ ${#INPUTS[@]} -eq 0 ]]; then
  echo "no inputs/*.md files found under $ROOT" >&2
  exit 1
fi

AGENTS=(patron-flesh patron-baseline)

TOTAL=$(( ${#INPUTS[@]} * ${#AGENTS[@]} ))
echo "rep $REP: running ${#AGENTS[@]} agents across ${#INPUTS[@]} briefs ($TOTAL invocations)..."

for AGENT in "${AGENTS[@]}"; do
  OUTDIR="$REPDIR/$AGENT"
  mkdir -p "$OUTDIR"
  for IN in "${INPUTS[@]}"; do
    SLUG="$(basename "$IN" .md)"
    OUT="$OUTDIR/$SLUG.md"
    META="$OUTDIR/$SLUG.meta.json"
    rm -f "$OUT" "$META"

    echo "=== rep$REP / $AGENT / $SLUG ==="
    START=$(date -u +%s)

    PROMPT="Read the thin commission brief at $IN. Flesh it out into a detailed petition per your operational mode. Write the fleshed markdown to $OUT. Do not modify the input file."

    claude -p \
      --agent "$AGENT" \
      --model opus \
      --permission-mode bypassPermissions \
      --no-session-persistence \
      --output-format json \
      "$PROMPT" \
      > "$META" || echo "  (claude exited non-zero for $AGENT/$SLUG)"

    END=$(date -u +%s)
    DUR=$((END - START))

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

    echo "rep$REP  $AGENT  $SLUG  $(date -u +%FT%TZ)  ${DUR}s  $STATUS" | tee -a "$LOG"
  done
done

echo "rep $REP done. log: $LOG"
