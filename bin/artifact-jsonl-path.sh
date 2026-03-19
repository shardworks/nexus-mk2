#!/usr/bin/env bash
# bin/artifact-jsonl-path.sh — Returns the filesystem path for the JSONL companion
# of a staged-transcript artifact.
#
# Abstracts the artifact storage layout so callers don't hardcode storage paths.
# All scripts that need to read or write a staged-transcript companion JSONL should
# use this helper rather than constructing the path themselves.
#
# Usage:
#   artifact-jsonl-path.sh <artifact-id>
#
# Output: absolute filesystem path to the companion JSONL file (may or may not exist)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ARTIFACT_ID="${1:?Usage: artifact-jsonl-path.sh <artifact-id>}"

# Non-persistent artifact types are stored under ${PROJECT_ROOT}/.artifacts/<type>/.
# This mirrors the store_dir() logic in bin/artifact.sh for non-persistent types.
echo "${PROJECT_ROOT}/.artifacts/staged-transcript/${ARTIFACT_ID}.jsonl"
