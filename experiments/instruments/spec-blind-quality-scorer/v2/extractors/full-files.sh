#!/usr/bin/env bash
# full-files.sh — Extract full contents of each file modified in the commission.
set -euo pipefail

REPO="$INSTRUMENT_REPO"
CTX="$INSTRUMENT_CONTEXT_DIR"
HEAD=$(cat "$CTX/head_commit")

while IFS= read -r file; do
  if git -C "$REPO" show "${HEAD}:${file}" &>/dev/null; then
    echo "=== FILE: ${file} ==="
    git -C "$REPO" show "${HEAD}:${file}"
    echo ""
  fi
done < "$CTX/changed_files"
