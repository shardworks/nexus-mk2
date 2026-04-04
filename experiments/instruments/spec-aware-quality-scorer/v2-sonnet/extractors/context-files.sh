#!/usr/bin/env bash
# context-files.sh — Extract sibling files for convention reference.
#
# Picks up to 3 files per directory that the commission did NOT modify,
# preferring the largest (most representative). These give the reviewer
# a sense of local conventions.
set -euo pipefail

REPO="$INSTRUMENT_REPO"
CTX="$INSTRUMENT_CONTEXT_DIR"
HEAD=$(cat "$CTX/head_commit")
MAX_PER_DIR=3

# Get unique directories from changed files
TREE_DIRS=$(cat "$CTX/changed_files" | xargs -I{} dirname {} | sort -u)

for dir in $TREE_DIRS; do
  # List files in dir at the commit, find siblings not in the changed set
  sibling_files=$(git -C "$REPO" ls-tree --name-only "${HEAD}" "$dir/" 2>/dev/null | while read -r f; do
    if ! grep -qx "$f" "$CTX/changed_files"; then
      size=$(git -C "$REPO" cat-file -s "${HEAD}:${f}" 2>/dev/null || echo 0)
      echo "$size $f"
    fi
  done | sort -rn | head -"$MAX_PER_DIR" | awk '{print $2}')

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    content=$(git -C "$REPO" show "${HEAD}:${file}" 2>/dev/null) || continue
    echo "=== CONTEXT FILE: ${file} ==="
    echo "$content"
    echo ""
  done <<< "$sibling_files"
done
