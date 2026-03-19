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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <transcript.jsonl> [<precompact.jsonl> ...]" >&2
  exit 1
fi

exec "$SCRIPT_DIR/dispatch.sh" scribe "$@"
