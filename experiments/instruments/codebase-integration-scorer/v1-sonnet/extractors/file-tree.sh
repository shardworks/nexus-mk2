#!/usr/bin/env bash
# file-tree.sh — Extract directory listings around changed files.
set -euo pipefail

REPO="$INSTRUMENT_REPO"
CTX="$INSTRUMENT_CONTEXT_DIR"
HEAD=$(cat "$CTX/head_commit")

TREE_DIRS=$(cat "$CTX/changed_files" | xargs -I{} dirname {} | sort -u)

for dir in $TREE_DIRS; do
  tree_listing=$(git -C "$REPO" ls-tree --name-only "${HEAD}" "$dir/" 2>/dev/null | xargs -I{} basename {})
  if [[ -n "$tree_listing" ]]; then
    echo "=== TREE: ${dir}/ ==="
    echo "$tree_listing"
    echo ""
  fi
done
