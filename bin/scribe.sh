#!/usr/bin/env bash
# bin/scribe.sh
# Invoke the Scribe agent to synthesize session transcript(s) into a session doc.
#
# Usage:
#   ./bin/scribe.sh <transcript.jsonl> [<precompact.jsonl> ...]
#
# The first argument is the primary transcript. Additional arguments are
# pre-compaction snapshots associated with the same session.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <transcript.jsonl> [<precompact.jsonl> ...]" >&2
  exit 1
fi

# Validate all provided files exist
for f in "$@"; do
  if [[ ! -f "$f" ]]; then
    echo "Error: file not found: $f" >&2
    exit 1
  fi
done

claude -p --agent scribe "Synthesize session transcripts from the following files: $*"
