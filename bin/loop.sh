#!/usr/bin/env bash

# Nexus Mk II — Main entry point for running both reconciliation loops.
# Starts audit-loop and build-loop as independent background processes.
# Ctrl+C stops both.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[nexus] Starting audit loop and build loop..."

# Run both loops. Trap SIGINT/SIGTERM to kill both.
trap 'kill 0; wait' SIGINT SIGTERM

"$SCRIPT_DIR/audit-loop.sh" &
"$SCRIPT_DIR/build-loop.sh" &

wait
