#!/usr/bin/env bash
# scripts/scribe.sh
# Invoke the Scribe agent to synthesize a session transcript into a session doc.
#
# Usage:
#   ./scripts/scribe.sh <session-id>
#   ./scripts/scribe.sh abc123ef-...
#
# The session-id corresponds to a transcript at docs/transcripts/<session-id>.jsonl

set -euo pipefail

SESSION_ID="${1:-}"

if [[ -z "$SESSION_ID" ]]; then
  echo "Usage: $0 <session-id>" >&2
  exit 1
fi

PENDING_DIR="docs/transcripts/pending"
ARCHIVED_DIR="docs/transcripts/archived"

# Look for transcript in pending first, then archived, then legacy flat dir
if [[ -f "${PENDING_DIR}/${SESSION_ID}.jsonl" ]]; then
  TRANSCRIPT="${PENDING_DIR}/${SESSION_ID}.jsonl"
elif [[ -f "${ARCHIVED_DIR}/${SESSION_ID}.jsonl" ]]; then
  TRANSCRIPT="${ARCHIVED_DIR}/${SESSION_ID}.jsonl"
elif [[ -f "docs/transcripts/${SESSION_ID}.jsonl" ]]; then
  TRANSCRIPT="docs/transcripts/${SESSION_ID}.jsonl"
else
  echo "Error: transcript not found for session ${SESSION_ID}" >&2
  exit 1
fi

claude -p --agent scribe "Synthesize session transcript for session ID: ${SESSION_ID}"

# On success, ensure transcript is in archived (move from pending if applicable)
mkdir -p "$ARCHIVED_DIR"
if [[ -f "${PENDING_DIR}/${SESSION_ID}.jsonl" ]]; then
  mv "${PENDING_DIR}/${SESSION_ID}.jsonl" "${ARCHIVED_DIR}/${SESSION_ID}.jsonl"
  echo "scribe: moved transcript to ${ARCHIVED_DIR}/${SESSION_ID}.jsonl"
fi
