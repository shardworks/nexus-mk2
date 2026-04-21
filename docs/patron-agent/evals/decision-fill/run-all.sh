#!/usr/bin/env bash
# Run the patron agent against every stripped plandoc in stripped/.
#
# Usage: run-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

shopt -s nullglob
INPUTS=("$ROOT"/stripped/*.yaml)
shopt -u nullglob

if [[ ${#INPUTS[@]} -eq 0 ]]; then
  echo "no stripped/*.yaml files found under $ROOT" >&2
  exit 1
fi

echo "running patron across ${#INPUTS[@]} plandocs..."

for IN in "${INPUTS[@]}"; do
  SLUG="$(basename "$IN" .yaml)"
  echo "=== $SLUG ==="
  "$ROOT/run-patron.sh" "$SLUG" || echo "  (run-patron.sh exited non-zero for $SLUG)"
done

echo "done. log: $ROOT/runs.log"
