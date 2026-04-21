#!/usr/bin/env bash
# Run the patron agent against a single stripped plandoc.
#
# Usage: run-patron.sh <slug>
#   where <slug> corresponds to stripped/<slug>.yaml

set -euo pipefail

SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then
  echo "usage: $0 <slug>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
IN="$ROOT/stripped/$SLUG.yaml"
OUT="$ROOT/agent-output/$SLUG.yaml"
META="$ROOT/agent-output/$SLUG.meta.json"
LOG="$ROOT/runs.log"

if [[ ! -f "$IN" ]]; then
  echo "error: input not found: $IN" >&2
  exit 1
fi

mkdir -p "$ROOT/agent-output"
rm -f "$OUT" "$META"

START=$(date -u +%s)

PROMPT="Read the decisions YAML at $IN. For each decision, select an option (or write a custom answer) per your operational mode and principles. Write the filled YAML to $OUT. Do not modify the input file."

# Invoke patron sub-agent via claude CLI.
# --output-format json gives us a metadata envelope (cost, duration, stop_reason).
# The decision output itself goes to $OUT via the Write tool.
claude -p \
  --agent patron \
  --model opus \
  --permission-mode bypassPermissions \
  --no-session-persistence \
  --output-format json \
  "$PROMPT" \
  > "$META"

END=$(date -u +%s)
DUR=$((END - START))

# Validate output YAML parses.
if [[ -f "$OUT" ]]; then
  if python3 -c "import yaml,sys; yaml.safe_load(open('$OUT'))" 2>/dev/null; then
    STATUS="ok"
  else
    STATUS="invalid-yaml"
  fi
else
  STATUS="no-output"
fi

echo "$SLUG  $(date -u +%FT%TZ)  ${DUR}s  $STATUS" | tee -a "$LOG"
