#!/usr/bin/env bash
# spec.sh — Read the commission spec file.
set -euo pipefail

if [[ -z "${INSTRUMENT_SPEC_FILE:-}" ]]; then
  echo "Error: INSTRUMENT_SPEC_FILE not set" >&2
  exit 1
fi

if [[ ! -f "$INSTRUMENT_SPEC_FILE" ]]; then
  echo "Error: spec file not found: $INSTRUMENT_SPEC_FILE" >&2
  exit 1
fi

cat "$INSTRUMENT_SPEC_FILE"
