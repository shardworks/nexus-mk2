#!/usr/bin/env bash
# Hook: PreCompact
# Fires before Claude compacts the conversation context.
# Auto-compaction can destroy transcript fidelity mid-session — this hook
# ensures we archive the full transcript before any summarization occurs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

LOG_DIR="${PROJECT_ROOT}/.claude/hook-logs"
mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/on_pre_compact.log" 2>&1

HOOK_DATA=$(cat)
echo "[$(date -Iseconds)] on_pre_compact: received payload: $HOOK_DATA"
TRANSCRIPT_PATH=$(echo "$HOOK_DATA" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$HOOK_DATA" | jq -r '.session_id // "unknown"')
TRIGGER=$(echo "$HOOK_DATA" | jq -r '.trigger // "unknown"')
AGENT_TYPE=$(echo "$HOOK_DATA" | jq -r '.agent_type // "main"')

# Only archive sessions from interactive agents
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

# Archive to the artifacts repo's pending directory
ARCHIVE_DIR="/workspace/nexus-mk2-artifacts/transcripts/pending"
mkdir -p "$ARCHIVE_DIR"

# Use a compaction-specific filename so we don't clobber the Stop archive.
TIMESTAMP=$(date +%s)
DEST="${ARCHIVE_DIR}/${SESSION_ID}.precompact.${TIMESTAMP}.jsonl"

cp "$TRANSCRIPT_PATH" "$DEST"
echo "on_pre_compact: snapshot saved to $DEST (trigger: $TRIGGER)"
