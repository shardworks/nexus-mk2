#!/usr/bin/env bash
# resolve-commits.sh — Setup script: resolve commit range for a commission.
#
# Discovers commits by author email convention ({commission}@nexus.local),
# or uses explicit overrides from INSTRUMENT_BASE_COMMIT / INSTRUMENT_COMMIT.
#
# Writes shared state to INSTRUMENT_CONTEXT_DIR for sibling extractors:
#   base_commit   — start of range (parent of first writ commit)
#   head_commit   — end of range (last writ commit)
#   changed_files — list of files modified in the range
#   commits.resolved — sentinel indicating resolution is complete

set -euo pipefail

REPO="$INSTRUMENT_REPO"
COMMISSION="$INSTRUMENT_COMMISSION"
CTX="$INSTRUMENT_CONTEXT_DIR"

# Already resolved (idempotent)
[[ -f "$CTX/commits.resolved" ]] && exit 0

# Explicit override
if [[ -n "${INSTRUMENT_BASE_COMMIT:-}" && -n "${INSTRUMENT_COMMIT:-}" ]]; then
  echo "$INSTRUMENT_BASE_COMMIT" > "$CTX/base_commit"
  echo "$INSTRUMENT_COMMIT" > "$CTX/head_commit"
else
  # Author-email discovery
  AUTHOR_EMAIL="${COMMISSION}@nexus.local"

  WRIT_COMMITS=$(git -C "$REPO" log --author="$AUTHOR_EMAIL" \
    --format="%H" --reverse main 2>/dev/null || true)

  if [[ -z "$WRIT_COMMITS" ]]; then
    echo "Error: no commits found for author $AUTHOR_EMAIL" >&2
    echo "Pass base_commit and commit parameters for pre-identity commissions." >&2
    exit 1
  fi

  FIRST_COMMIT=$(echo "$WRIT_COMMITS" | head -1)
  LAST_COMMIT=$(echo "$WRIT_COMMITS" | tail -1)

  BASE_COMMIT=$(git -C "$REPO" rev-parse "${FIRST_COMMIT}~1" 2>/dev/null || true)
  if [[ -z "$BASE_COMMIT" ]]; then
    echo "Error: could not resolve parent of first commit ${FIRST_COMMIT:0:12}" >&2
    exit 1
  fi

  echo "$BASE_COMMIT" > "$CTX/base_commit"
  echo "$LAST_COMMIT" > "$CTX/head_commit"

  COMMIT_COUNT=$(echo "$WRIT_COMMITS" | wc -l | tr -d ' ')
  echo "Found $COMMIT_COUNT commit(s) by $AUTHOR_EMAIL" >&2
fi

# Cache changed files list
BASE=$(cat "$CTX/base_commit")
HEAD=$(cat "$CTX/head_commit")
git -C "$REPO" diff --name-only "${BASE}..${HEAD}" > "$CTX/changed_files"

echo "Range: ${BASE:0:12}..${HEAD:0:12}" >&2
touch "$CTX/commits.resolved"
