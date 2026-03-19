#!/usr/bin/env bash
# Hook: Stop
# Fires when Claude finishes responding (session end or /clear).
# Archives the session transcript to the repo before it can be overwritten.
 
set -euo pipefail

LOG_DIR="/workspace/nexus-mk2/.claude/hook-logs"
mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/on_stop.log" 2>&1

HOOK_DATA=$(cat)
echo "[$(date -Iseconds)] on_stop: received payload: $HOOK_DATA"
TRANSCRIPT_PATH=$(echo "$HOOK_DATA" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$HOOK_DATA" | jq -r '.session_id // "unknown"')
CWD=$(echo "$HOOK_DATA" | jq -r '.cwd // empty')
AGENT_TYPE=$(echo "$HOOK_DATA" | jq -r '.agent_type // "main"')

# Only archive sessions from interactive agents
ALLOWED_AGENTS=("main" "coco")
if [[ ! " ${ALLOWED_AGENTS[@]} " =~ " ${AGENT_TYPE} " ]]; then
  exit 0
fi
 
# Bail if no transcript path provided
if [[ -z "$TRANSCRIPT_PATH" ]]; then
  echo "on_stop: no transcript_path in hook payload, skipping" >&2
  exit 0
fi
 
# Bail if transcript file doesn't exist or is empty
if [[ ! -s "$TRANSCRIPT_PATH" ]]; then
  echo "on_stop: transcript file missing or empty at $TRANSCRIPT_PATH, skipping" >&2
  exit 0
fi
 
# Resolve archive destination relative to the project working directory
ARCHIVE_DIR="/workspace/nexus-mk2-artifactswe /transcripts/pending"
mkdir -p "$ARCHIVE_DIR"

DEST="${ARCHIVE_DIR}/${SESSION_ID}.jsonl"

cp "$TRANSCRIPT_PATH" "$DEST"
echo "on_stop: archived transcript to $DEST"
 