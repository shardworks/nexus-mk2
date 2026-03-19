#!/usr/bin/env bash
# bin/scribe-all.sh — Scribe loop: process all staged transcripts via artifact CLI.
#
# Lists all Artifact<StagedTranscript> entries via the artifact CLI, groups them
# by sessionId, and for each session dispatches the Scribe operator with all of
# that session's staged transcripts (primary and precompact). On success, performs
# transcript ingestion: promotes each staged artifact to a durable
# Artifact<Transcript> and deletes the staged artifacts.
#
# Failure isolation: a failed Scribe invocation does not prevent processing of
# remaining sessions. Failed Artifact<StagedTranscript> entries are left in the
# store for retry (not deleted).
#
# Convention for staged-transcript artifacts:
#   - Primary artifact ID:    {sessionId}
#   - Precompact artifact ID: {sessionId}.precompact.{timestamp}
#   - Metadata JSON: .artifacts/staged-transcript/{id}.json  (via artifact CLI)
#   - Transcript JSONL: .artifacts/staged-transcript/{id}.jsonl  (companion file)
#
# Usage:
#   ./bin/scribe-all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACT_CLI="${SCRIPT_DIR}/artifact.sh"
ARTIFACT_ROOT="${PROJECT_ROOT}/.artifacts"
STAGED_STORE="${ARTIFACT_ROOT}/staged-transcript"

# ── Helper: extract a string field from artifact JSON ───────────────────────

get_json_field() {
  local file="$1" field="$2"
  grep -m1 "\"${field}\"" "$file" | sed "s/.*\"${field}\" *: *\"\([^\"]*\)\".*/\1/"
}

# ── List all Artifact<StagedTranscript> entries ──────────────────────────────

STAGED_LIST=$("${ARTIFACT_CLI}" list staged-transcript 2>/dev/null || true)

# Exit cleanly if no staged transcripts exist.
if echo "$STAGED_LIST" | grep -q "No artifacts of type"; then
  echo "No staged transcripts to process."
  exit 0
fi

# Collect artifact IDs (skip header line and blank lines).
ARTIFACT_IDS=()
while IFS= read -r line; do
  artifact_id=$(echo "$line" | awk '{print $1}')
  [[ "$artifact_id" == "ID" || -z "$artifact_id" ]] && continue
  ARTIFACT_IDS+=("$artifact_id")
done <<< "$STAGED_LIST"

if [[ ${#ARTIFACT_IDS[@]} -eq 0 ]]; then
  echo "No staged transcripts to process."
  exit 0
fi

echo "Found ${#ARTIFACT_IDS[@]} staged transcript artifact(s)."

# ── Group artifacts by sessionId ─────────────────────────────────────────────

declare -A SESSION_PRIMARY    # sessionId -> primary artifact ID
declare -A SESSION_PRECOMPACT # sessionId -> space-separated precompact artifact IDs

for artifact_id in "${ARTIFACT_IDS[@]}"; do
  json_file="${STAGED_STORE}/${artifact_id}.json"
  if [[ ! -f "$json_file" ]]; then
    echo "Warning: JSON not found for artifact '${artifact_id}' — skipping." >&2
    continue
  fi

  session_id=$(get_json_field "$json_file" "sessionId")
  capture_type=$(get_json_field "$json_file" "captureType")

  if [[ -z "$session_id" ]]; then
    echo "Warning: artifact '${artifact_id}' missing sessionId — skipping." >&2
    continue
  fi

  if [[ "$capture_type" == "primary" ]]; then
    SESSION_PRIMARY["$session_id"]="$artifact_id"
  else
    existing="${SESSION_PRECOMPACT[$session_id]:-}"
    SESSION_PRECOMPACT["$session_id"]="${existing:+$existing }${artifact_id}"
  fi
done

# Collect all unique session IDs.
declare -A ALL_SESSIONS
for sid in "${!SESSION_PRIMARY[@]}" "${!SESSION_PRECOMPACT[@]}"; do
  ALL_SESSIONS["$sid"]=1
done
SESSION_IDS=("${!ALL_SESSIONS[@]}")

if [[ ${#SESSION_IDS[@]} -eq 0 ]]; then
  echo "No sessions to process after grouping."
  exit 0
fi

echo "Grouped into ${#SESSION_IDS[@]} session(s)."

# ── Process each session ──────────────────────────────────────────────────────

FAILED=0

for session_id in "${SESSION_IDS[@]}"; do
  echo ""
  echo "=== Processing session: ${session_id} ==="

  # Build ordered list of JSONL transcript files.
  # Precompact snapshots first (sorted by timestamp in ID), then primary.
  TRANSCRIPT_FILES=()

  precompact_ids="${SESSION_PRECOMPACT[$session_id]:-}"
  if [[ -n "$precompact_ids" ]]; then
    for pc_id in $(echo "$precompact_ids" | tr ' ' '\n' | sort); do
      pc_file="${STAGED_STORE}/${pc_id}.jsonl"
      if [[ -f "$pc_file" ]]; then
        TRANSCRIPT_FILES+=("$pc_file")
      else
        echo "Warning: JSONL missing for precompact artifact '${pc_id}'" >&2
      fi
    done
  fi

  primary_id="${SESSION_PRIMARY[$session_id]:-}"
  if [[ -n "$primary_id" ]]; then
    primary_file="${STAGED_STORE}/${primary_id}.jsonl"
    if [[ -f "$primary_file" ]]; then
      TRANSCRIPT_FILES+=("$primary_file")
    else
      echo "Warning: JSONL missing for primary artifact '${primary_id}'" >&2
    fi
  fi

  if [[ ${#TRANSCRIPT_FILES[@]} -eq 0 ]]; then
    echo "=== SKIPPED: ${session_id} — no JSONL files found ===" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  # Dispatch the Scribe for all transcript files in this session.
  if "${SCRIPT_DIR}/dispatch.sh" scribe "${TRANSCRIPT_FILES[@]}"; then
    echo "=== Done: ${session_id} ==="

    # ── Transcript ingestion ──────────────────────────────────────────────
    # Promote each Artifact<StagedTranscript> to a durable Artifact<Transcript>
    # and delete the staged artifacts from the store.

    INGESTION_TS=$(date -u +%Y-%m-%dT%H%M%SZ)

    # Collect all staged artifact IDs for this session.
    SESSION_ARTIFACT_IDS=()
    [[ -n "$primary_id" ]] && SESSION_ARTIFACT_IDS+=("$primary_id")
    if [[ -n "$precompact_ids" ]]; then
      for pc_id in $precompact_ids; do
        SESSION_ARTIFACT_IDS+=("$pc_id")
      done
    fi

    for staged_id in "${SESSION_ARTIFACT_IDS[@]}"; do
      # Store a durable Artifact<Transcript> in the NexusArtifactsRepository.
      transcript_id="${INGESTION_TS}-${staged_id}"
      echo "{
  \"type\": \"transcript\",
  \"id\": \"${transcript_id}\",
  \"createdAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"content\": {
    \"sessionId\": \"${session_id}\"
  }
}" | "${ARTIFACT_CLI}" store

      # Delete the Artifact<StagedTranscript> (both JSON and companion JSONL).
      "${ARTIFACT_CLI}" delete staged-transcript "$staged_id"
      rm -f "${STAGED_STORE}/${staged_id}.jsonl"

      echo "scribe-all: ingested staged-transcript '${staged_id}' -> transcript '${transcript_id}'"
    done

  else
    # Failure isolation: leave staged artifacts in place for retry.
    echo "=== FAILED: ${session_id} ===" >&2
    echo "scribe-all: staged artifacts for '${session_id}' left in store for retry." >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Processed ${#SESSION_IDS[@]} session(s), ${FAILED} failure(s)."

[[ $FAILED -eq 0 ]]
