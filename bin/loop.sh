#!/usr/bin/env bash

# Build loop: continuously runs audit→build cycles.
# Runs indefinitely until interrupted (Ctrl+C / SIGINT).
# Sleeps 30 seconds between iterations only when no work was done.
# Skips audit if no commits have changed in either the project or domain repos.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOMAIN_DIR="$PROJECT_ROOT/domain"

# Track last-seen commit hashes for change detection.
last_project_hash=""
last_domain_hash=""

get_project_hash() {
  git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown"
}

get_domain_hash() {
  git -C "$DOMAIN_DIR" rev-parse HEAD 2>/dev/null || echo "unknown"
}

echo "[loop] Build loop starting. Ctrl+C to stop."

while true; do
  current_project_hash="$(get_project_hash)"
  current_domain_hash="$(get_domain_hash)"

  # Change detection: skip audit if nothing changed since last run.
  if [[ "$current_project_hash" == "$last_project_hash" && \
        "$current_domain_hash" == "$last_domain_hash" ]]; then
    echo "[loop] No changes detected. Sleeping 30s..."
    sleep 30
    continue
  fi

  echo "[loop] Changes detected. Running audit..."
  last_project_hash="$current_project_hash"
  last_domain_hash="$current_domain_hash"

  # Run audit via the Dispatcher. If it fails, log and continue.
  if ! "$SCRIPT_DIR/dispatch.sh" auditor; then
    echo "[loop] Audit failed. Will retry next iteration."
    continue
  fi

  # Check if any requirements failed by inspecting the latest audit report.
  latest_report="$(ls -1 "$PROJECT_ROOT/.artifacts/audit-report/"*.json 2>/dev/null | sort | tail -n1)"
  if [[ -z "$latest_report" ]]; then
    echo "[loop] No audit report found."
    continue
  fi

  # Count failures in the report.
  fail_count="$(grep -o '"result"[[:space:]]*:[[:space:]]*"fail"' "$latest_report" | wc -l | tr -d ' ' || true)"

  if [[ "$fail_count" -gt 0 ]]; then
    echo "[loop] $fail_count failing requirement(s). Running builder..."
    if ! "$SCRIPT_DIR/dispatch.sh" builder; then
      echo "[loop] Builder failed. Will retry next iteration."
    else
      echo "[loop] Builder completed."
    fi
  else
    echo "[loop] All requirements passing. Nothing to build."
  fi
done
