#!/usr/bin/env bash

# Audit reconciliation loop.
#
# Desired state: every non-deprecated requirement has a current Assessment
# (projectCommit and domainCommit match HEAD).
#
# Each iteration: the auditor identifies stale/missing Assessments and
# reassesses them. When all Assessments are current, the loop idles.
#
# Hot-reload: if this script's source changes on disk, re-exec on next
# iteration so updates are picked up without manual restart.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
SELF_HASH="$(md5sum "$SELF" | cut -d' ' -f1)"

echo "[audit-loop] Audit reconciliation loop starting. Ctrl+C to stop."

while true; do
  # Hot-reload: detect changes to this script.
  current_hash="$(md5sum "$SELF" | cut -d' ' -f1)"
  if [[ "$current_hash" != "$SELF_HASH" ]]; then
    echo "[audit-loop] Script changed on disk. Re-executing..."
    exec "$SELF" "$@"
  fi

  echo "[audit-loop] Running audit..."

  if ! "$SCRIPT_DIR/dispatch.sh" auditor; then
    echo "[audit-loop] Audit failed. Retrying in 30s..."
    sleep 30
    continue
  fi

  echo "[audit-loop] Audit complete. Sleeping 30s..."
  sleep 30
done
