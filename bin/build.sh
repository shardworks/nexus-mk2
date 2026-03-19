#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure the build-result artifact store exists before the builder agent runs.
# The builder reads from and writes to this store for deduplication and traceability.
mkdir -p "$PROJECT_ROOT/.artifacts/build-result"

claude -p "execute your instructions" --agent builder-mk1
