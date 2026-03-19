#!/usr/bin/env bash

# Audit reconciliation loop.
#
# Desired state: every non-deprecated requirement has a current Assessment
# (projectCommit and domainCommit match HEAD).
#
# Each iteration: identifies one Requirement with a stale or missing
# Assessment and dispatches the Auditor to evaluate it. When all
# Assessments are current, the loop idles.
#
# Priority order:
#   1. Requirements with no existing Assessment (missing)
#   2. Requirements whose most recent Assessment has result "fail" (stale failures)
#   3. Requirements with a stale passing Assessment
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
  python3 -c "
import yaml, sys
with open('$PROJECT_ROOT/domain/requirements/index.yaml') as f:
    features = yaml.safe_load(f)
for feature in features:
    fid = feature['id']
    for req in feature.get('requirements', []):
        if req.get('status') != 'deprecated':
            print(f\"{fid}/{req['id']}\")
"
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
  domain_head="$(git -C "$PROJECT_ROOT/domain" rev-parse HEAD)"

  # Get all non-deprecated requirement IDs.
  all_reqs="$(parse_requirements)"

  # Build a map of each requirement's most recent assessment.
  # We'll query the artifact CLI to find assessments and check freshness.
  assessment_ids="$("$ARTIFACT_CLI" list assessment 2>/dev/null | tail -n +2 | awk '{print $1}' || true)"

  # For each requirement, find its most recent assessment and classify it.
  # Priority buckets:
  #   missing_reqs: no assessment at all
  #   failing_reqs: most recent assessment is stale and result=fail
  #   stale_reqs: most recent assessment is stale and result!=fail
  missing_reqs=""
  failing_reqs=""
  stale_reqs=""

  for req_id in $all_reqs; do
    # Convert requirement ID to assessment ID prefix (feature/req -> feature--req)
    req_slug="${req_id//\//-}"  # feature-id/req-id -> feature-id-req-id (partial)
    req_slug="${req_id/\//-}"   # Only replace first /
    # Assessment IDs use -- as separator: feature-id--req-id-<timestamp>
    req_prefix="${req_id/\/--/--}"
    # Correct: feature-id/req-id -> feature-id--req-id
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
    a_result="$(echo "$assessment_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['content']['result'])" 2>/dev/null || true)"

    # Current if both commits match.
    if [[ "$a_project" == "$project_head" && "$a_domain" == "$domain_head" ]]; then
      continue  # Assessment is current, skip.
    fi

    # Stale — classify by result.
    if [[ "$a_result" == "fail" ]]; then
      failing_reqs="${failing_reqs}${req_id}"$'\n'
    else
      stale_reqs="${stale_reqs}${req_id}"$'\n'
    fi
  done

  # Select one requirement by priority: missing > failing > stale.
  selected=""
  for candidate in $missing_reqs; do
    selected="$candidate"
    echo "[audit-loop] Selected (missing assessment): $selected"
    break
  done

  if [[ -z "$selected" ]]; then
    for candidate in $failing_reqs; do
      selected="$candidate"
      echo "[audit-loop] Selected (stale failure): $selected"
      break
    done
  fi

  if [[ -z "$selected" ]]; then
    for candidate in $stale_reqs; do
      selected="$candidate"
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
  # Don't sleep — check immediately for more work.
done
