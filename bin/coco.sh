#!/usr/bin/env bash
# scripts/scribe.sh
# Invoke the Scribe agent to synthesize a session transcript into a session doc.
#
# Usage:
#   ./scripts/scribe.sh <session-id>
#   ./scripts/scribe.sh abc123ef-...
#
# The session-id corresponds to a transcript at docs/transcripts/<session-id>.jsonl

set -euo pipefail

claude --worktree coco --agent coco
