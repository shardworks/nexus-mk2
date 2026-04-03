#!/usr/bin/env bash
# regression-test-instruments.sh — Run new instrument runner against all
# scored commissions and compare with original scores.
#
# Produces a comparison table: original composite vs new composite per commission.
# Runs blind mode only (all 22 commissions have blind scores).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="$PROJECT_ROOT/packages/instruments/src/cli.ts"
IROOT="$PROJECT_ROOT/experiments/instruments"
DATA="$PROJECT_ROOT/experiments/data/commissions"
NODE_CMD=(node --disable-warning=ExperimentalWarning --experimental-transform-types)

DRY_RUN="${1:-}"

OUTBASE=$(mktemp -d)
echo "═══ Instrument Runner Regression Test ═══"
echo "Output: $OUTBASE"
echo ""

# Commission manifest: id, repo, base_commit (empty = auto-discover)
# Pre-identity commissions need explicit base_commit and commit overrides.
COMMISSIONS=(
  # ses-* commissions (pre-identity, /workspace/nexus)
  "ses-0334962d|/workspace/nexus|081d46824310|385a159"
  "ses-053770d1|/workspace/nexus|8deedff06a31|3f6ab13"
  "ses-19194146|/workspace/nexus|9180f7789ea6|081d468"
  "ses-2149b518|/workspace/nexus|eeeb02c7a0c0|8deedff"
  "ses-8cdbbc39|/workspace/nexus|3f6ab13b8840|db85fee"
  # w-* pre-identity commissions
  "w-mnhiv9lbbccc525bf153|/workspace/vibers/.nexus/codexes/nexus.git|2f323ca3b32d|f535cec8caf8"
  "w-mnhjg4deb43b581c763e|/workspace/vibers/.nexus/codexes/nexus.git|f535cec8caf8|5efe7670eeff"
  "w-mnhl7kt97066dce908b2|/workspace/vibers/.nexus/codexes/nexus.git|3a06b4c1436c|e2cf1e66d4d4"
  "w-mnho6jxd-c8139f50006c|/workspace/vibers/.nexus/codexes/nexus.git|7fde2e895901|dc58a07e5b81"
  "w-mnhq6gpv-a979fbca3213|/workspace/nexus|55a185cc434e|2c2377b"
  "w-mnhq8v8z-0b0f4f13e815|/workspace/nexus|dc58a07e5b81|55a185c"
  # w-* with author-email identity (auto-discover)
  "w-mnhr98jj-9a4fd05dd0a8|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mnhsn4xw-39672cfe2dc8|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mnhy86ga-fedf0135a60c|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mni0ugjx-05b64cee0466|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mni0yd80-5273102b8dba|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mni1acqg-88f5da5b5b04|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mni4ieo6-22abcfe2f5a4|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mni83clg-8750dc6eac23|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mni87qen-981aaa61c035|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mnif2seu-e879825d08eb|/workspace/vibers/.nexus/codexes/nexus.git||"
  "w-mnivi5fq-e2c19aa925d6|/workspace/vibers/.nexus/codexes/nexus.git||"
)

TOTAL=${#COMMISSIONS[@]}
echo "Running $TOTAL commissions..."
echo ""

for entry in "${COMMISSIONS[@]}"; do
  IFS='|' read -r id repo base_commit commit <<< "$entry"

  outdir="$OUTBASE/$id"

  PARAMS=(--param "commission=$id" --param "repo=$repo")
  [[ -n "$base_commit" ]] && PARAMS+=(--param "base_commit=$base_commit")
  [[ -n "$commit" ]] && PARAMS+=(--param "commit=$commit")

  echo "── $id ──"

  DRY_ARGS=()
  [[ -n "$DRY_RUN" ]] && DRY_ARGS+=(--dry-run)

  "${NODE_CMD[@]}" "$RUNNER" \
    --instrument-name spec-blind-quality-scorer \
    --instrument-root "$IROOT" \
    "${PARAMS[@]}" \
    --output-dir "$outdir" \
    "${DRY_ARGS[@]}" 2>&1 | { grep -E '(Composite:|✓|✗|Error|Warning)' || true; } | sed 's/^/  /'

  echo ""
done

# ── Comparison table ──────────────────────────────────────────

echo ""
echo "═══ Comparison: Original vs New ═══"
echo ""
printf "%-35s %10s %10s %10s\n" "Commission" "Original" "New" "Delta"
printf "%-35s %10s %10s %10s\n" "----------" "--------" "---" "-----"

for entry in "${COMMISSIONS[@]}"; do
  IFS='|' read -r id repo base_commit commit <<< "$entry"

  # Original composite
  orig_file="$DATA/$id/quality-blind.yaml"
  if [[ -f "$orig_file" ]]; then
    orig=$(grep '^ *composite:' "$orig_file" | head -1 | awk '{print $2}')
  else
    orig="N/A"
  fi

  # New composite
  new_file="$OUTBASE/$id/quality-spec-blind-quality-scorer.yaml"
  if [[ -f "$new_file" ]]; then
    new=$(grep '^ *composite:' "$new_file" | head -1 | awk '{print $2}')
  else
    new="N/A"
  fi

  # Delta
  if [[ "$orig" != "N/A" && "$new" != "N/A" ]]; then
    delta=$(awk "BEGIN {printf \"%.2f\", $new - $orig}")
  else
    delta="N/A"
  fi

  printf "%-35s %10s %10s %10s\n" "$id" "$orig" "$new" "$delta"
done

echo ""
echo "Artifacts: $OUTBASE"
