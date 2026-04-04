#!/usr/bin/env bash
# referenced-files.sh — Resolve files referenced by the spec.
#
# Scans the spec file for paths that look like repo files, then extracts
# them from the base commit (pre-commission state, since the agent worked
# from that state). False positives fail silently.
set -euo pipefail

REPO="$INSTRUMENT_REPO"
CTX="$INSTRUMENT_CONTEXT_DIR"
BASE=$(cat "$CTX/base_commit")
MAX_FILES=10

SPEC_FILE="${INSTRUMENT_SPEC_FILE:-}"
if [[ -z "$SPEC_FILE" || ! -f "$SPEC_FILE" ]]; then
  exit 0
fi

# Scan for file-like paths in the spec
candidate_paths=$(grep -oE '[a-zA-Z0-9_./-]+\.[a-zA-Z]{1,5}' "$SPEC_FILE" \
  | grep '/' \
  | sort -u || true)

[[ -z "$candidate_paths" ]] && exit 0

# Read changed files to skip (already in FULL_FILES)
CHANGED_FILES="$CTX/changed_files"

resolved=0
while IFS= read -r ref_path; do
  [[ $resolved -ge $MAX_FILES ]] && break

  # Skip files the commission modified
  if [[ -f "$CHANGED_FILES" ]] && grep -qx "$ref_path" "$CHANGED_FILES"; then
    continue
  fi

  # Try to extract from base commit
  content=$(git -C "$REPO" show "${BASE}:${ref_path}" 2>/dev/null) || continue

  echo "=== REFERENCED FILE: ${ref_path} (pre-commission state) ==="
  echo "$content"
  echo ""
  resolved=$((resolved + 1))
done <<< "$candidate_paths"

if [[ $resolved -gt 0 ]]; then
  echo "Resolved $resolved referenced file(s) from ${BASE:0:8}" >&2
fi
