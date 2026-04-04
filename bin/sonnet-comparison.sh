#!/usr/bin/env bash
# sonnet-comparison.sh — Run instruments with both Opus and Sonnet for cost/quality comparison.
#
# Runs spec-blind, spec-aware, and codebase-integration scorers against
# three commissions, once with Opus (v2/v1) and once with Sonnet (v2-sonnet/v1-sonnet).
#
# Output lands in experiments/data/model-comparison/{opus,sonnet}/<commission>/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="$PROJECT_ROOT/packages/instruments/src/cli.ts"
IROOT="$PROJECT_ROOT/experiments/instruments"
OUTBASE="$PROJECT_ROOT/experiments/data/model-comparison"
NODE_CMD=(node --disable-warning=ExperimentalWarning --experimental-transform-types)

# Target commissions (not dashboard, range of complexity/context sizes)
COMMISSIONS=(
  "w-mnjxdvcq-ee5e2e06df62|/workspace/vibers/.nexus/codexes/nexus.git"   # Remove Dispatch Apparatus (largest)
  "w-mnjl74k8-ad073e761c15|/workspace/vibers/.nexus/codexes/nexus.git"   # Loom Composition (large)
  "w-mnjvo50v-ed9f0850a952|/workspace/vibers/.nexus/codexes/nexus.git"   # Rig Engine Status (medium)
)

# Filter: which model to run (opus, sonnet, or both)
MODEL_FILTER="${1:-both}"

run_instrument() {
  local model_label="$1" instrument_name="$2" instrument_version="$3"
  local commission="$4" repo="$5" spec_file="${6:-}"

  local outdir="$OUTBASE/$model_label/$commission"

  local PARAMS=(
    --instrument-name "$instrument_name"
    --instrument-version "$instrument_version"
    --instrument-root "$IROOT"
    --param "commission=$commission"
    --param "repo=$repo"
    --output-dir "$outdir"
  )

  [[ -n "$spec_file" ]] && PARAMS+=(--param "spec_file=$spec_file")

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  $model_label / $commission / $instrument_name"
  echo "════════════════════════════════════════════════════════════"
  echo ""

  "${NODE_CMD[@]}" "$RUNNER" "${PARAMS[@]}" 2>&1
}

for entry in "${COMMISSIONS[@]}"; do
  IFS='|' read -r commission repo <<< "$entry"
  spec_file="experiments/data/commissions/$commission/commission.md"

  if [[ "$MODEL_FILTER" == "opus" || "$MODEL_FILTER" == "both" ]]; then
    run_instrument opus spec-blind-quality-scorer v2 "$commission" "$repo"
    run_instrument opus spec-aware-quality-scorer v2 "$commission" "$repo" "$spec_file"
    run_instrument opus codebase-integration-scorer v1 "$commission" "$repo" "$spec_file"
  fi

  if [[ "$MODEL_FILTER" == "sonnet" || "$MODEL_FILTER" == "both" ]]; then
    run_instrument sonnet spec-blind-quality-scorer v2-sonnet "$commission" "$repo"
    run_instrument sonnet spec-aware-quality-scorer v2-sonnet "$commission" "$repo" "$spec_file"
    run_instrument sonnet codebase-integration-scorer v1-sonnet "$commission" "$repo" "$spec_file"
  fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  All runs complete. Results in: $OUTBASE"
echo "════════════════════════════════════════════════════════════"
