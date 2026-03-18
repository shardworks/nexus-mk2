#!/usr/bin/env bash
# bin/herald.sh
# Invoke the Herald agent to produce outward-facing narratives from session docs.
#
# Usage:
#   ./bin/herald.sh "Write a weekly recap for the week of March 17, 2026"
#   ./bin/herald.sh "Deep-dive on the agent architecture"

set -euo pipefail

PROMPT="${1:-}"

if [[ -z "$PROMPT" ]]; then
  echo "Usage: $0 <prompt>" >&2
  echo "Example: $0 \"Write a weekly recap for the week of March 17, 2026\"" >&2
  exit 1
fi

claude -p --agent herald "$PROMPT"
