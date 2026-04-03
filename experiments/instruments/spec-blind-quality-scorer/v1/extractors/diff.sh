#!/usr/bin/env bash
# diff.sh — Extract the commission diff (stat + patch).
set -euo pipefail

REPO="$INSTRUMENT_REPO"
CTX="$INSTRUMENT_CONTEXT_DIR"
BASE=$(cat "$CTX/base_commit")
HEAD=$(cat "$CTX/head_commit")

git -C "$REPO" diff "${BASE}..${HEAD}" --stat --patch
