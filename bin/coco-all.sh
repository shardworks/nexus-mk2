#!/usr/bin/env bash
# bin/agent-all.sh — Run a one-shot Claude session across all nexus packages
#
# Discovers every package in the nexus monorepo (/workspace/nexus/packages)
# and runs `claude -p` against each one, batched for concurrency.
#
# Usage:
#   agent-all.sh --system-prompt <file> ['template with ${PACKAGE_PATH}']
#   agent-all.sh -s <file> ['template with ${PACKAGE_PATH}']
#
# If no template is given, defaults to:
#   "Process ${PACKAGE_PATH} according to your instructions."
#
# The template string may contain ${PACKAGE_PATH}, which is replaced with
# the absolute path of each package before invocation.
#
# Options:
#   -s, --system-prompt <file>   Path to a file containing the system prompt (required)
#   -a, --agent <name>           Agent to use (default: auditor)
#   -n, --batch-size <N>         Max concurrent sessions (default: 8)
#   -h, --help                   Show this help
#
# Examples:
#   agent-all.sh -s specs/code-review-sweep.md 'Review the package at ${PACKAGE_PATH}'
#   agent-all.sh --system-prompt specs/code-review-sweep.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="/workspace/nexus"

SYSTEM_PROMPT_FILE=""
BATCH_SIZE=8
AGENT="auditor"
TEMPLATE='Process ${PACKAGE_PATH} according to your instructions.'

# ── Argument parsing ──────────────────────────────────────────

show_help() {
  cat <<'HELP'
agent-all.sh — Run a one-shot Claude session across all nexus packages

Usage:
  agent-all.sh --system-prompt <file> ['template with ${PACKAGE_PATH}']
  agent-all.sh -s <file> ['template with ${PACKAGE_PATH}']

Options:
  -s, --system-prompt <file>   Path to a file containing the system prompt (required)
  -a, --agent <name>           Agent to use (default: coco)
  -n, --batch-size <N>         Max concurrent sessions (default: 8)
  -h, --help                   Show this help

The template string may contain ${PACKAGE_PATH}, which is replaced with
the absolute path of each package. If omitted, defaults to:
  "Process ${PACKAGE_PATH} according to your instructions."

Examples:
  agent-all.sh -s specs/code-review-sweep.md 'Review the package at ${PACKAGE_PATH}'
  agent-all.sh --system-prompt specs/code-review-sweep.md
  agent-all.sh -s specs/review.md -a auditor 'Audit ${PACKAGE_PATH}'
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--system-prompt)
      SYSTEM_PROMPT_FILE="$2"
      shift 2
      ;;
    -a|--agent)
      AGENT="$2"
      shift 2
      ;;
    -n|--batch-size)
      BATCH_SIZE="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    -*)
      echo "Error: unknown option '$1'" >&2
      show_help >&2
      exit 1
      ;;
    *)
      # Positional arg = template
      TEMPLATE="$1"
      shift
      ;;
  esac
done

if [[ -z "$SYSTEM_PROMPT_FILE" ]]; then
  echo "Error: --system-prompt is required" >&2
  show_help >&2
  exit 1
fi

if [[ ! -f "$SYSTEM_PROMPT_FILE" ]]; then
  echo "Error: system prompt file not found: $SYSTEM_PROMPT_FILE" >&2
  exit 1
fi

# ── Discover packages ─────────────────────────────────────────

PACKAGES=()
while IFS= read -r pkg_json; do
  PACKAGES+=("$(dirname "$pkg_json")")
done < <(find "$NEXUS_ROOT/packages" -name package.json -mindepth 2 -maxdepth 3 | sort)

if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  echo "Error: no packages found in $NEXUS_ROOT/packages" >&2
  exit 1
fi

echo "Found ${#PACKAGES[@]} packages:"
for pkg in "${PACKAGES[@]}"; do
  echo "  ${pkg#"$NEXUS_ROOT/"}"
done
echo ""
echo "System prompt: $SYSTEM_PROMPT_FILE"
echo "Agent:         $AGENT"
echo "Template:      $TEMPLATE"
echo "Batch size:    $BATCH_SIZE"
echo ""

# ── Run sessions in batches ───────────────────────────────────

PIDS=()
PKG_FOR_PID=()
FAILED=()
SUCCEEDED=()

wait_for_batch() {
  for i in "${!PIDS[@]}"; do
    local pid="${PIDS[$i]}"
    local pkg="${PKG_FOR_PID[$i]}"
    if wait "$pid" 2>/dev/null; then
      SUCCEEDED+=("$pkg")
      echo "  ✓ ${pkg#"$NEXUS_ROOT/"}"
    else
      FAILED+=("$pkg")
      echo "  ✗ ${pkg#"$NEXUS_ROOT/"}"
    fi
  done
  PIDS=()
  PKG_FOR_PID=()
}

for pkg in "${PACKAGES[@]}"; do
  # Expand template: replace ${PACKAGE_PATH} with the actual path
  prompt="${TEMPLATE//\$\{PACKAGE_PATH\}/$pkg}"

  echo "▸ Launching: ${pkg#"$NEXUS_ROOT/"}"

  claude -p \
    --agent "$AGENT" \
    --system-prompt-file "$SYSTEM_PROMPT_FILE" \
    --add-dir "$pkg" \
    "$prompt" \
    > /dev/null 2>&1 &

  PIDS+=($!)
  PKG_FOR_PID+=("$pkg")

  # If we've hit the batch size, wait for the current batch
  if [[ ${#PIDS[@]} -ge $BATCH_SIZE ]]; then
    echo "⏳ Waiting for batch of ${#PIDS[@]}..."
    wait_for_batch
    echo ""
  fi
done

# Wait for any remaining
if [[ ${#PIDS[@]} -gt 0 ]]; then
  echo "⏳ Waiting for final batch of ${#PIDS[@]}..."
  wait_for_batch
fi

# ── Summary ───────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
echo "  Done. ${#SUCCEEDED[@]} succeeded, ${#FAILED[@]} failed."
echo "═══════════════════════════════════════"

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo ""
  echo "Failed packages:"
  for pkg in "${FAILED[@]}"; do
    echo "  ✗ ${pkg#"$NEXUS_ROOT/"}"
  done
  exit 1
fi
