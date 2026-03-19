#!/usr/bin/env bash
# bin/scribe-all.sh
# Run scribe.sh for every pending transcript that hasn't been processed yet.
#
# TODO: This script bypasses the artifact CLI (artifact.sh) and directly
#   manipulates the NexusArtifactsRepository filesystem layout. It assumes
#   a transcripts/pending + transcripts/archived directory structure that
#   is an implementation detail of the current artifacts repo, not a
#   contract. Once transcripts are stored via artifact.sh (as the
#   artifact-cli/exclusive-access requirement demands), this script needs
#   to be rewritten to use the CLI for both reads and writes. The archive
#   workflow (pending → archived) may also need its own requirement or
#   become part of the scribe operator's declared effects.
#
# Usage:
#   ./bin/scribe-all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# The artifacts repo is not guaranteed locally — clone transiently.
ARTIFACTS_REPO="${NEXUS_TEMP_DIR:?NEXUS_TEMP_DIR is not set}/nexus-mk2-artifacts"
ARTIFACTS_REPO_REMOTE="${NEXUS_ARTIFACTS_REMOTE:?NEXUS_ARTIFACTS_REMOTE is not set}"
if [[ ! -d "${ARTIFACTS_REPO}/.git" ]]; then
  echo "scribe-all: cloning NexusArtifactsRepository to ${ARTIFACTS_REPO}..." >&2
  git clone "$ARTIFACTS_REPO_REMOTE" "$ARTIFACTS_REPO" >&2
fi

PENDING_DIR="${NEXUS_TEMP_DIR:?NEXUS_TEMP_DIR is not set}/transcripts/staged"
ARCHIVED_DIR="${ARTIFACTS_REPO}/transcripts/archived"

if [[ ! -d "$PENDING_DIR" ]]; then
  echo "No pending directory found at $PENDING_DIR — nothing to process."
  exit 0 
fi

# Collect only primary transcripts (skip .precompact. snapshots)
PENDING_FILES=()
for f in "$PENDING_DIR"/*.jsonl; do
  [[ -f "$f" ]] || continue
  [[ "$(basename "$f")" == *.precompact.* ]] && continue
  PENDING_FILES+=("$f")
done

if [[ ${#PENDING_FILES[@]} -eq 0 ]]; then
  echo "No pending transcripts to process."
  exit 0
fi

echo "Found ${#PENDING_FILES[@]} pending transcript(s)."

FAILED=0
for f in "${PENDING_FILES[@]}"; do
  SESSION_ID="$(basename "$f" .jsonl)"
  echo ""
  echo "=== Processing: ${SESSION_ID} ==="

  # Collect any associated precompact snapshots
  TRANSCRIPT_FILES=("$f")
  for pc in "$PENDING_DIR"/"$SESSION_ID".precompact.*.jsonl; do
    [[ -f "$pc" ]] && TRANSCRIPT_FILES+=("$pc")
  done

  if "${SCRIPT_DIR}/scribe.sh" "${TRANSCRIPT_FILES[@]}"; then
    echo "=== Done: ${SESSION_ID} ==="
    mkdir -p "$ARCHIVED_DIR"
    mv "$f" "${ARCHIVED_DIR}/${SESSION_ID}.jsonl"
    echo "scribe: moved transcript to ${ARCHIVED_DIR}/${SESSION_ID}.jsonl"
  else
    echo "=== FAILED: ${SESSION_ID} ===" >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Processed ${#PENDING_FILES[@]} transcript(s), ${FAILED} failure(s)."

# Commit and push any archived transcript moves
if git -C "$ARCHIVED_DIR" diff --quiet HEAD -- . 2>/dev/null || \
   [[ -n "$(git -C "$ARCHIVED_DIR" status --porcelain .)" ]]; then
  NOTES_REPO="$(git -C "$ARCHIVED_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$NOTES_REPO" ]]; then
    git -C "$NOTES_REPO" add "$ARCHIVED_DIR"
    if ! git -C "$NOTES_REPO" diff --cached --quiet; then
      git -C "$NOTES_REPO" commit -m "transcripts: archive processed session(s)"
      git -C "$NOTES_REPO" push
      echo "scribe: committed and pushed archived transcripts."
    fi
  fi
fi

[[ $FAILED -eq 0 ]]
