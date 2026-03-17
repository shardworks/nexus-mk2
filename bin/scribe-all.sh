#!/usr/bin/env bash
# bin/scribe-all.sh
# Run scribe.sh for every pending transcript that hasn't been processed yet.
#
# Usage:
#   ./bin/scribe-all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PENDING_DIR="docs/transcripts/pending"

if [[ ! -d "$PENDING_DIR" ]]; then
  echo "No pending directory found at $PENDING_DIR — nothing to process."
  exit 0
fi

# Collect only primary transcripts (skip .precompact. snapshots)
PENDING_FILES=()
for f in "$PENDING_DIR"/*.jsonl; do
  [[ -f "$f" ]] || continue
  [[ "$(basename "$f")" == *.precompact.* ]] && continue
  PENDING_FILES+=("$f")
done

if [[ ${#PENDING_FILES[@]} -eq 0 ]]; then
  echo "No pending transcripts to process."
  exit 0
fi

echo "Found ${#PENDING_FILES[@]} pending transcript(s)."

FAILED=0
for f in "${PENDING_FILES[@]}"; do
  SESSION_ID="$(basename "$f" .jsonl)"
  echo ""
  echo "=== Processing: ${SESSION_ID} ==="
  if "${SCRIPT_DIR}/scribe.sh" "$SESSION_ID"; then
    echo "=== Done: ${SESSION_ID} ==="
  else
    echo "=== FAILED: ${SESSION_ID} ===" >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Processed ${#PENDING_FILES[@]} transcript(s), ${FAILED} failure(s)."
[[ $FAILED -eq 0 ]]
