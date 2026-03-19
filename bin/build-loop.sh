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

ARTIFACT_CLI="$SCRIPT_DIR/artifact.sh"
FEATURE_LOCK="$SCRIPT_DIR/feature-lock.sh"

echo "[build-loop] Build reconciliation loop starting. Ctrl+C to stop."

while true; do
  # Hot-reload: detect changes to this script.
  current_hash="$(md5sum "$SELF" | cut -d' ' -f1)"
  if [[ "$current_hash" != "$SELF_HASH" ]]; then
    echo "[build-loop] Script changed on disk. Re-executing..."
    exec "$SELF" "$@"
  fi

  # Check for failing assessments via the artifact CLI.
  has_actionable=false

  # List all assessments and extract IDs (skip header line).
  assessment_ids="$("$ARTIFACT_CLI" list assessment 2>/dev/null | tail -n +2 | awk '{print $1}' || true)"

  if [[ -n "$assessment_ids" ]]; then
    # Collect acted-on assessment IDs from existing BuildResults via the CLI.
    acted_on=""
    build_ids="$("$ARTIFACT_CLI" list build-result 2>/dev/null | tail -n +2 | awk '{print $1}' || true)"
    for bid in $build_ids; do
      br_assessment_id="$("$ARTIFACT_CLI" show build-result "$bid" 2>/dev/null \
        | grep -m1 '"assessmentId"' | sed 's/.*"assessmentId" *: *"\([^"]*\)".*/\1/' || true)"
      if [[ -n "$br_assessment_id" ]]; then
        acted_on="${acted_on}${br_assessment_id}"$'\n'
      fi
    done

    current_head="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"

    # Check each assessment for failures, respecting feature locks.
    for aid in $assessment_ids; do
      # Read assessment JSON via the CLI.
      assessment_json="$("$ARTIFACT_CLI" show assessment "$aid" 2>/dev/null || true)"
      [[ -n "$assessment_json" ]] || continue

      result="$(echo "$assessment_json" | grep -m1 '"result"' | sed 's/.*"result" *: *"\([^"]*\)".*/\1/')"
      if [[ "$result" == "fail" ]]; then
        # Check if already acted on.
        if echo "$acted_on" | grep -qF "$aid"; then
          continue
        fi

        # Only act on assessments whose projectCommit matches current HEAD.
        # Stale assessments (from older commits) are skipped — the audit loop
        # will reassess against the current codebase.
        project_commit="$(echo "$assessment_json" | grep -m1 '"projectCommit"' | sed 's/.*"projectCommit" *: *"\([^"]*\)".*/\1/')"
        if [[ "$project_commit" != "$current_head" ]]; then
          continue
        fi

        # Extract feature id from requirement id (format: feature-id/requirement-id).
        req_id="$(echo "$assessment_json" | grep -m1 '"requirementId"' | sed 's/.*"requirementId" *: *"\([^"]*\)".*/\1/')"
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
