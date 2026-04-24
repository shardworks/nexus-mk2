#!/usr/bin/env bash
# patron-anima-gap-extract.sh — Extract decisions for writs affected by the
# patron-anima silent-bypass bug.
#
# Background: between c653e59 (2026-04-22 16:44 UTC) and d12b6e5 (2026-04-23
# 23:19 UTC), patron-anima was silently no-oping under attended mode because
# a leftover `reviewableDecisions()` filter (decisions with
# `selected === undefined`) returned empty against primer-pre-filled
# decisions. Every Astrolabe rig in that window shipped without patron
# principle-check.
#
# This script pulls the Decision[] for every affected plan out of the
# Astrolabe plans book and stores them locally so they can be re-run
# through patron-anima after the fact.
#
# Filter heuristic: status=completed, plan.updatedAt in the hard window,
# zero decisions carrying a `patron` emission. Clean bug signature — plans
# from after the fix show N/N coverage, so this identifies the affected
# population without false positives.
#
# Output: experiments/data/patron-anima-gap/gap-decisions.json
#
# Re-runnable: overwrites the output file each run. Idempotent given the
# same underlying plan store.

set -euo pipefail

WINDOW_START="2026-04-22T16:44:00Z"
WINDOW_END="2026-04-23T23:19:00Z"
FIX_COMMIT="d12b6e5"
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/experiments/data/patron-anima-gap"
OUTPUT_FILE="$OUTPUT_DIR/gap-decisions.json"

mkdir -p "$OUTPUT_DIR"

echo "Patron-anima gap extraction"
echo "  window: $WINDOW_START → $WINDOW_END"
echo "  fix commit: $FIX_COMMIT"
echo "  output: $OUTPUT_FILE"
echo

# Enumerate plans completed in the window with zero patron-reviewed decisions.
mapfile -t WRIT_IDS < <(
  nsg plan list --status completed --limit 1000 \
    | jq -r --arg winStart "$WINDOW_START" --arg winEnd "$WINDOW_END" '
      .[]
      | select(.updatedAt >= $winStart and .updatedAt <= $winEnd)
      | select(((.decisions // []) | map(select(.patron != null)) | length) == 0)
      | .id
    '
)

echo "Found ${#WRIT_IDS[@]} affected writs:"
for id in "${WRIT_IDS[@]}"; do echo "  $id"; done
echo

# Pull full plan detail for each writ; capture writ title from the clerk.
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

echo "[]" > "$TMP"
for id in "${WRIT_IDS[@]}"; do
  plan=$(nsg plan show "$id")
  title=$(nsg writ show "$id" | jq -r '.title')
  entry=$(jq -n \
    --arg writId "$id" \
    --arg title "$title" \
    --argjson plan "$plan" \
    '{
      writId: $writId,
      title: $title,
      planUpdatedAt: $plan.updatedAt,
      decisions: ($plan.decisions // [])
    }')
  jq --argjson entry "$entry" '. + [$entry]' "$TMP" > "$TMP.new"
  mv "$TMP.new" "$TMP"
  echo "  captured $id ($(echo "$entry" | jq '.decisions | length') decisions)"
done

jq -n \
  --arg winStart "$WINDOW_START" \
  --arg winEnd "$WINDOW_END" \
  --arg fixCommit "$FIX_COMMIT" \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --slurpfile writs "$TMP" \
  '{
    window: { start: $winStart, end: $winEnd },
    bugFixCommit: $fixCommit,
    generatedAt: $generatedAt,
    writCount: ($writs[0] | length),
    decisionCount: ($writs[0] | map(.decisions | length) | add),
    writs: $writs[0]
  }' > "$OUTPUT_FILE"

echo
echo "Wrote $OUTPUT_FILE"
jq '{window, writCount, decisionCount}' "$OUTPUT_FILE"
