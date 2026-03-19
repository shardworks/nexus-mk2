#!/usr/bin/env bash
# Hook: PreCompact
# Fires before Claude compacts the conversation context.
# Captures the pre-compaction transcript as Artifact<StagedTranscript>.
# This preserves full context that would otherwise be summarized.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACT_CLI="${PROJECT_ROOT}/bin/artifact.sh"

LOG_DIR="${PROJECT_ROOT}/.claude/hook-logs"
mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/on_pre_compact.log" 2>&1

HOOK_DATA=$(cat)
echo "[$(date -Iseconds)] on_pre_compact: received payload: $HOOK_DATA"
TRANSCRIPT_PATH=$(echo "$HOOK_DATA" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$HOOK_DATA" | jq -r '.session_id // "unknown"')
TRIGGER=$(echo "$HOOK_DATA" | jq -r '.trigger // "unknown"')
AGENT_TYPE=$(echo "$HOOK_DATA" | jq -r '.agent_type // "main"')

# Only capture sessions from interactive agents
ALLOWED_AGENTS=("main" "coco")
if [[ ! " ${ALLOWED_AGENTS[@]} " =~ " ${AGENT_TYPE} " ]]; then
  exit 0
fi

if [[ -z "$TRANSCRIPT_PATH" ]]; then
  echo "on_pre_compact: no transcript_path in hook payload, skipping" >&2
  exit 0
fi

if [[ ! -s "$TRANSCRIPT_PATH" ]]; then
  echo "on_pre_compact: transcript file missing or empty, skipping" >&2
  exit 0
fi

# Precompact artifact ID appends a timestamp to avoid collisions across compactions.
ARTIFACT_ID="${SESSION_ID}.precompact.$(date -u +%s)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Build and store Artifact<StagedTranscript> via the artifact CLI.
# The CLI handles path resolution and directory creation.
jq -n \
  --arg type "staged-transcript" \
  --arg id "${ARTIFACT_ID}" \
  --arg createdAt "${NOW}" \
  --arg sessionId "${SESSION_ID}" \
  --arg captureType "precompact" \
  '{type: $type, id: $id, createdAt: $createdAt, content: {sessionId: $sessionId, captureType: $captureType}}' \
  | "${ARTIFACT_CLI}" store

# Write companion JSONL via the path helper (callers are responsible for the JSONL
# companion per bin/artifact.sh convention — the CLI stores JSON metadata only).
JSONL_PATH="$("${PROJECT_ROOT}/bin/artifact-jsonl-path.sh" "${ARTIFACT_ID}")"
cp "$TRANSCRIPT_PATH" "$JSONL_PATH"

echo "on_pre_compact: captured transcript as Artifact<StagedTranscript> (session=${SESSION_ID}, captureType=precompact, trigger=${TRIGGER})"
