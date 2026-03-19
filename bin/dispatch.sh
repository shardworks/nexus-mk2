#!/usr/bin/env bash
# bin/dispatch.sh — Unified Dispatcher entry point for Nexus Mk II
#
# Provides a single command-line interface for dispatching Operations
# on any registered Operator. Conforms to the Dispatcher interface
# defined in domain/ontology/system.ts.
#
# Registered Operators and their Operations:
#   auditor  — audit    (produces: assessment)
#   builder  — build    (consumes: assessment; produces: build-result; implements)
#   scribe   — scribe   (consumes: transcript; produces: session-doc)
#   herald   — herald   (consumes: session-doc; produces: publication)
#
# Usage:
#   ./bin/dispatch.sh <operator> [<operation>] [args...]
#
# When an operator has only one operation, the operation name is optional.
#
# Examples:
#   ./bin/dispatch.sh auditor builder/single-task    # audit one requirement
#   ./bin/dispatch.sh auditor audit builder/single-task  # same (explicit op)
#   ./bin/dispatch.sh builder              # runs the build operation
#   ./bin/dispatch.sh builder build        # same as above (explicit)
#   ./bin/dispatch.sh scribe <transcript>  # runs the scribe operation
#   ./bin/dispatch.sh herald "Write a recap for this week"
#
# Exit codes:
#   0 — operation completed successfully
#   1 — usage error (unknown operator, missing args, etc.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Operator dispatch table ────────────────────────────────────

dispatch_auditor() {
  local first_arg="${1:-}"

  # If first arg is the operation name "audit", consume it.
  if [[ "$first_arg" == "audit" ]]; then
    shift
    first_arg="${1:-}"
  fi

  # The requirement ID is required.
  local requirement_id="$first_arg"
  if [[ -z "$requirement_id" ]]; then
    echo "Error: auditor requires a requirement ID" >&2
    echo "Usage: dispatch.sh auditor <requirement-id>" >&2
    echo "Example: dispatch.sh auditor builder/single-task" >&2
    exit 1
  fi

  claude -p "Evaluate the requirement: $requirement_id" --agent auditor
}

dispatch_builder() {
  local operation="${1:-build}"
  if [[ "$operation" != "build" ]]; then
    echo "Error: builder has one operation: build (got '$operation')" >&2
    exit 1
  fi
  claude -p "execute your instructions" --agent builder-mk1
}

dispatch_scribe() {
  local operation="${1:-scribe}"
  # If the first arg looks like a file path, treat it as the transcript
  # (operation name was omitted)
  if [[ -f "$operation" ]]; then
    shift 0  # don't consume — pass everything as files
    set -- "$operation" "$@"
  elif [[ "$operation" == "scribe" ]]; then
    shift
  else
    # Assume it's a file path (operation name omitted)
    set -- "$operation" "$@"
  fi

  if [[ $# -eq 0 ]]; then
    echo "Error: scribe requires at least one transcript file" >&2
    echo "Usage: dispatch.sh scribe <transcript.jsonl> [<precompact.jsonl> ...]" >&2
    exit 1
  fi

  # Validate all provided files exist
  for f in "$@"; do
    if [[ ! -f "$f" ]]; then
      echo "Error: file not found: $f" >&2
      exit 1
    fi
  done

  claude -p --agent scribe "Synthesize session transcripts from the following files: $*"
}

dispatch_herald() {
  local operation="${1:-}"
  # If the first arg is the operation name "herald", consume it
  if [[ "$operation" == "herald" ]]; then
    shift
    operation="${1:-}"
  fi

  local prompt="$operation"
  if [[ -z "$prompt" ]]; then
    echo "Error: herald requires a prompt describing what to write" >&2
    echo "Usage: dispatch.sh herald \"Write a weekly recap for ...\"" >&2
    exit 1
  fi

  claude -p --agent herald "$prompt"
}

# ── Help ───────────────────────────────────────────────────────

show_help() {
  cat <<'HELP'
Nexus Mk II Dispatcher — single entry point for all Operations

Usage:
  dispatch.sh <operator> [<operation>] [args...]

Registered Operators:

  auditor   Evaluates a single requirement against current project state
            Operations: audit <requirement-id>
            Effects: produces assessment

  builder   Implements changes to satisfy failing requirements
            Operations: build
            Effects: consumes assessment, produces build-result, implements

  scribe    Synthesizes session transcripts into structured docs
            Operations: scribe <transcript.jsonl> [<precompact.jsonl> ...]
            Effects: consumes transcript, produces session-doc

  herald    Produces outward-facing narratives from session docs
            Operations: herald "<prompt>"
            Effects: consumes session-doc, produces publication

Examples:
  dispatch.sh auditor builder/single-task
  dispatch.sh builder
  dispatch.sh scribe /path/to/transcript.jsonl
  dispatch.sh herald "Write a weekly recap"
  dispatch.sh help
HELP
}

# ── Main ───────────────────────────────────────────────────────

OPERATOR="${1:-}"

if [[ -z "$OPERATOR" || "$OPERATOR" == "help" || "$OPERATOR" == "--help" || "$OPERATOR" == "-h" ]]; then
  show_help
  exit 0
fi

shift

case "$OPERATOR" in
  auditor)  dispatch_auditor "$@" ;;
  builder)  dispatch_builder "$@" ;;
  scribe)   dispatch_scribe "$@" ;;
  herald)   dispatch_herald "$@" ;;
  *)
    echo "Error: unknown operator '$OPERATOR'" >&2
    echo "Available operators: auditor, builder, scribe, herald" >&2
    echo "Run 'dispatch.sh help' for usage information." >&2
    exit 1
    ;;
esac
