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

TRANSCRIPT="docs/transcripts/${SESSION_ID}.jsonl"

if [[ ! -f "$TRANSCRIPT" ]]; then
  echo "Error: transcript not found at $TRANSCRIPT" >&2
  exit 1
fi

claude -p --agent scribe "Synthesize session transcript for session ID: ${SESSION_ID}"
