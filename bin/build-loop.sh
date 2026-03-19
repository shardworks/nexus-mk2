#!/usr/bin/env bash

# Build reconciliation loop.
#
# Desired state: every requirement has a passing Assessment.
#
# Each iteration: checks for failing Assessments. If any exist (and don't
# already have a corresponding BuildResult), invokes the builder to address
# one — respecting feature locking so concurrent builders don't collide.
# When all Assessments pass (or all failing Features are locked), the loop idles.
#
# Hot-reload: if this script's source changes on disk, re-exec on next
# iteration so updates are picked up without manual restart.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
SELF_HASH="$(md5sum "$SELF" | cut -d' ' -f1)"

ASSESSMENT_DIR="$PROJECT_ROOT/.artifacts/assessment"
BUILD_RESULT_DIR="$PROJECT_ROOT/.artifacts/build-result"
FEATURE_LOCK="$SCRIPT_DIR/feature-lock.sh"

echo "[build-loop] Build reconciliation loop starting. Ctrl+C to stop."

while true; do
  # Hot-reload: detect changes to this script.
  current_hash="$(md5sum "$SELF" | cut -d' ' -f1)"
  if [[ "$current_hash" != "$SELF_HASH" ]]; then
    echo "[build-loop] Script changed on disk. Re-executing..."
    exec "$SELF" "$@"
  fi

  # Check for failing assessments.
  has_actionable=false

  if [[ -d "$ASSESSMENT_DIR" ]]; then
    # Collect acted-on assessment IDs from existing BuildResults.
    acted_on=""
    if [[ -d "$BUILD_RESULT_DIR" ]]; then
      acted_on="$(grep -h '"assessmentId"' "$BUILD_RESULT_DIR"/*.json 2>/dev/null \
        | sed 's/.*"assessmentId" *: *"\([^"]*\)".*/\1/' || true)"
    fi

    # Check each assessment file for failures, respecting feature locks.
    for f in "$ASSESSMENT_DIR"/*.json; do
      [[ -f "$f" ]] || continue

      result="$(grep -m1 '"result"' "$f" | sed 's/.*"result" *: *"\([^"]*\)".*/\1/')"
      if [[ "$result" == "fail" ]]; then
        # Check if already acted on.
        aid="$(grep -m1 '"id"' "$f" | sed 's/.*"id" *: *"\([^"]*\)".*/\1/')"
        if echo "$acted_on" | grep -qF "$aid"; then
          continue
        fi

        # Only act on assessments whose projectCommit matches current HEAD.
        # Stale assessments (from older commits) are skipped — the audit loop
        # will reassess against the current codebase.
        project_commit="$(grep -m1 '"projectCommit"' "$f" | sed 's/.*"projectCommit" *: *"\([^"]*\)".*/\1/')"
        current_head="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
        if [[ "$project_commit" != "$current_head" ]]; then
          continue
        fi

        # Extract feature id from requirement id (format: feature-id/requirement-id).
        req_id="$(grep -m1 '"requirementId"' "$f" | sed 's/.*"requirementId" *: *"\([^"]*\)".*/\1/')"
        feature_id="${req_id%%/*}"

        # Check if feature is locked.
        if "$FEATURE_LOCK" check "$feature_id" >/dev/null 2>&1; then
          echo "[build-loop] Feature '$feature_id' is locked, skipping."
          continue
        fi

        has_actionable=true
        break
      fi
    done
  fi

  if [[ "$has_actionable" == "true" ]]; then
    echo "[build-loop] Failing assessment(s) found. Running builder..."
    if ! "$SCRIPT_DIR/dispatch.sh" builder; then
      echo "[build-loop] Builder failed. Retrying in 30s..."
      sleep 30
      continue
    fi
    echo "[build-loop] Builder completed."
    # Don't sleep — check immediately for more work.
    continue
  fi

  echo "[build-loop] No actionable failures. Sleeping 30s..."
  sleep 30
done
