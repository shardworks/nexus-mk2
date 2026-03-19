#!/usr/bin/env bash

# Audit reconciliation loop.
#
# Desired state: every non-deprecated requirement has a current Assessment
# (projectCommit and domainCommit match HEAD).
#
# Each iteration: identifies one Requirement with a stale, invalidated, or
# missing Assessment and dispatches the Auditor to evaluate it. When all
# Assessments are current, the loop idles.
#
# Priority order:
#   1. Requirements with no existing Assessment (missing)
#   2. Requirements whose most recent Assessment is invalidated
#      (a BuildResult exists for any Requirement in the same Feature and
#       the Assessment's projectCommit does not match project HEAD)
#   3. Requirements with a stale Assessment (projectCommit or domainCommit
#      does not match HEAD) — at most one per idle period
#
# Invalidation rationale: a build on Feature X likely affects other
# Requirements in the same Feature, so those Assessments are fast-tracked
# for re-evaluation before background stale work resumes.
#
# Hot-reload: if this script's source changes on disk, re-exec on next
# iteration so updates are picked up without manual restart.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
SELF_HASH="$(md5sum "$SELF" | cut -d' ' -f1)"
ARTIFACT_CLI="$SCRIPT_DIR/artifact.sh"

echo "[audit-loop] Audit reconciliation loop starting. Ctrl+C to stop."

# parse_requirements: extract non-deprecated requirement IDs from YAML.
# Outputs one fully qualified requirement ID per line (feature-id/requirement-id).
parse_requirements() {
  yq eval '
    .[] | .id as $fid |
    .requirements[] | select(.status != "deprecated") |
    $fid + "/" + .id
  ' "${NEXUS_DOMAIN_PATH}/requirements/index.yaml"
}

# get_feature_id: extract feature ID from a fully-qualified requirement ID.
# e.g., "assessments/freshness" -> "assessments"
get_feature_id() {
  echo "${1%%/*}"
}

while true; do
  # Hot-reload: detect changes to this script.
  current_hash="$(md5sum "$SELF" | cut -d' ' -f1)"
  if [[ "$current_hash" != "$SELF_HASH" ]]; then
    echo "[audit-loop] Script changed on disk. Re-executing..."
    exec "$SELF" "$@"
  fi

  # Capture current HEAD commits.
  project_head="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
  domain_head="$(git -C "${NEXUS_DOMAIN_PATH}" rev-parse HEAD)"

  # Get all non-deprecated requirement IDs.
  all_reqs="$(parse_requirements)"

  # Build a set of feature IDs that have at least one Artifact<BuildResult>.
  # Used to classify invalidated assessments.
  build_result_ids="$("$ARTIFACT_CLI" list build-result 2>/dev/null | tail -n +2 | awk '{print $1}' || true)"
  features_with_build=""
  for brid in $build_result_ids; do
    br_json="$("$ARTIFACT_CLI" show build-result "$brid" 2>/dev/null || true)"
    if [[ -n "$br_json" ]]; then
      br_req="$(echo "$br_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['content']['requirementId'])" 2>/dev/null || true)"
      if [[ -n "$br_req" ]]; then
        br_feature="$(get_feature_id "$br_req")"
        features_with_build="${features_with_build}${br_feature}"$'\n'
      fi
    fi
  done

  # Build a map of each requirement's most recent assessment.
  # We'll query the artifact CLI to find assessments and check freshness.
  assessment_ids="$("$ARTIFACT_CLI" list assessment 2>/dev/null | tail -n +2 | awk '{print $1}' || true)"

  # For each requirement, find its most recent assessment and classify it.
  # Priority buckets:
  #   missing_reqs:     no assessment at all
  #   invalidated_reqs: BuildResult exists for same Feature and projectCommit != HEAD
  #   stale_reqs:       projectCommit or domainCommit != HEAD, not invalidated
  missing_reqs=""
  invalidated_reqs=""
  stale_reqs=""

  for req_id in $all_reqs; do
    # Assessment IDs use -- as separator: feature-id--req-id-<timestamp>
    req_prefix="$(echo "$req_id" | sed 's|/|--|')"

    # Find the most recent assessment for this requirement.
    # Assessment IDs are sorted by createdAt desc in the list output,
    # so the first match is the most recent.
    latest_aid=""
    for aid in $assessment_ids; do
      if [[ "$aid" == "${req_prefix}-"* ]]; then
        latest_aid="$aid"
        break
      fi
    done

    if [[ -z "$latest_aid" ]]; then
      missing_reqs="${missing_reqs}${req_id}"$'\n'
      continue
    fi

    # Read the assessment to check freshness.
    assessment_json="$("$ARTIFACT_CLI" show assessment "$latest_aid" 2>/dev/null || true)"
    if [[ -z "$assessment_json" ]]; then
      missing_reqs="${missing_reqs}${req_id}"$'\n'
      continue
    fi

    a_project="$(echo "$assessment_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['content']['projectCommit'])" 2>/dev/null || true)"
    a_domain="$(echo "$assessment_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['content']['domainCommit'])" 2>/dev/null || true)"

    # Current if both commits match.
    if [[ "$a_project" == "$project_head" && "$a_domain" == "$domain_head" ]]; then
      continue  # Assessment is current, skip.
    fi

    # Stale — check if invalidated.
    # Invalidated: a BuildResult exists for the same Feature AND projectCommit != HEAD.
    feature_id="$(get_feature_id "$req_id")"
    is_invalidated=false
    if [[ "$a_project" != "$project_head" ]] && echo "$features_with_build" | grep -qx "$feature_id"; then
      is_invalidated=true
    fi

    if [[ "$is_invalidated" == "true" ]]; then
      invalidated_reqs="${invalidated_reqs}${req_id}"$'\n'
    else
      stale_reqs="${stale_reqs}${req_id}"$'\n'
    fi
  done

  # Select one requirement by priority: missing > invalidated > stale.
  selected=""
  selected_tier=""

  for candidate in $missing_reqs; do
    selected="$candidate"
    selected_tier="missing"
    echo "[audit-loop] Selected (missing assessment): $selected"
    break
  done

  if [[ -z "$selected" ]]; then
    for candidate in $invalidated_reqs; do
      selected="$candidate"
      selected_tier="invalidated"
      echo "[audit-loop] Selected (invalidated — BuildResult exists for Feature): $selected"
      break
    done
  fi

  if [[ -z "$selected" ]]; then
    for candidate in $stale_reqs; do
      selected="$candidate"
      selected_tier="stale"
      echo "[audit-loop] Selected (stale): $selected"
      break
    done
  fi

  if [[ -z "$selected" ]]; then
    echo "[audit-loop] All assessments current. Sleeping 30s..."
    sleep 30
    continue
  fi

  echo "[audit-loop] Dispatching auditor for: $selected"

  if ! "$SCRIPT_DIR/dispatch.sh" auditor "$selected"; then
    echo "[audit-loop] Audit of $selected failed. Retrying in 30s..."
    sleep 30
    continue
  fi

  echo "[audit-loop] Audit of $selected complete."

  # For stale reassessments, idle before the next iteration so we process at
  # most one stale Assessment per idle period (invariant: freshness/6).
  # Missing and invalidated assessments are high-priority — check immediately.
  if [[ "$selected_tier" == "stale" ]]; then
    echo "[audit-loop] Stale reassessment complete. Idling 30s before next stale check..."
    sleep 30
  fi
  # For missing/invalidated: don't sleep — check immediately for more work.
done
