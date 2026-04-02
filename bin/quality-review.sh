#!/usr/bin/env bash
# quality-review.sh — Run N independent quality reviews and aggregate scores
#
# Executes the anima quality scorer against a commission's output.
# Each run is independent (separate API call, independent sampling).
# Results are aggregated into a single review artifact.
#
# Usage:
#   ./bin/quality-review.sh --commission <id> --repo <path> [options]
#
# Required:
#   --commission <id>    Commission ID (e.g. C003). Used to identify the
#                        diff and name the output artifact.
#   --repo <path>       Path to the git repo where the commission's work landed.
#
# Options:
#   --commit <sha>       End commit (head of range) to review. If omitted,
#                        attempts to auto-detect from git log.
#   --base-commit <sha>  Start of range (parent of first commission commit).
#                        When set, diffs base-commit..commit. When omitted,
#                        diffs commit~1..commit (single commit mode).
#   --runs <n>           Number of independent review runs (default: 3)
#   --mode <mode>        "blind" or "aware". In aware mode,
#                        --spec-file is required. (default: blind)
#   --spec-file <path>   Path to the commission spec (required for aware mode)
#   --prompt-version <v> Prompt version to use (default: v1)
#   --instrument-dir <p> Path to instrument definition (prompt versions).
#                        Default: X013 anima-quality-scorer instrument dir.
#   --output-dir <path>  Where to write artifacts
#                        (default: X013 artifacts/reviews/quality)
#   --dry-run            Print the plan without executing
#
# Output:
#   Writes a review artifact to <output-dir>/<commission-id>/quality.yaml
#   containing per-run scores, aggregated scores, and metadata.
#
# Exit codes:
#   0 — review completed
#   1 — usage error
#   2 — diff extraction failed
#   3 — one or more review runs failed
#   4 — aggregation failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTRUMENT_DIR="$PROJECT_ROOT/experiments/X013-commission-outcomes/instruments/anima-quality-scorer"

# ── Cleanup trap ────────────────────────────────────────────
# Ensure temp directories are always cleaned up, even on early exit.

RUNS_DIR=""
SANDBOX_DIR=""
USER_MESSAGE_FILE=""
cleanup() {
  [[ -n "$RUNS_DIR" && -d "$RUNS_DIR" ]] && rm -rf "$RUNS_DIR"
  [[ -n "$SANDBOX_DIR" && -d "$SANDBOX_DIR" ]] && rm -rf "$SANDBOX_DIR"
  [[ -n "$USER_MESSAGE_FILE" && -f "$USER_MESSAGE_FILE" ]] && rm -f "$USER_MESSAGE_FILE"
}
trap cleanup EXIT

# ── Defaults ─────────────────────────────────────────────────

COMMISSION=""
REPO=""
COMMIT=""
BASE_COMMIT=""
RUNS=3
MODE="blind"
SPEC_FILE=""
PROMPT_VERSION="v1"
OUTPUT_DIR="$PROJECT_ROOT/experiments/X013-commission-outcomes/artifacts/reviews/quality"
DRY_RUN=false

# ── Parse arguments ──────────────────────────────────────────

show_help() {
  cat <<'HELP'
quality-review — execute N independent code quality reviews

Usage:
  quality-review.sh --commission <id> --repo <path> [options]

Required:
  --commission <id>    Commission ID (e.g. C003)
  --repo <path>       Git repo path where the work landed

Options:
  --commit <sha>       Commit (or end of range) to review (auto-detected if omitted)
  --base-commit <sha>  Start of commit range (parent of first commission commit).
                       When provided, diffs base-commit..commit instead of commit~1..commit.
  --runs <n>           Number of runs (default: 3)
  --mode <mode>        "blind" or "aware" (default: blind)
  --spec-file <path>   Commission spec path (required for aware mode)
  --prompt-version <v> Prompt version (default: v1)
  --instrument-dir <p> Instrument dir (default: X013 anima-quality-scorer)
  --output-dir <path>  Artifact output dir (default: X013 artifacts/reviews/quality)
  --dry-run            Print plan, don't execute
  --help               Show this help
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commission)   COMMISSION="$2"; shift 2 ;;
    --repo)        REPO="$2"; shift 2 ;;
    --commit)       COMMIT="$2"; shift 2 ;;
    --base-commit)  BASE_COMMIT="$2"; shift 2 ;;
    --runs)         RUNS="$2"; shift 2 ;;
    --mode)         MODE="$2"; shift 2 ;;
    --spec-file)    SPEC_FILE="$2"; shift 2 ;;
    --prompt-version) PROMPT_VERSION="$2"; shift 2 ;;
    --instrument-dir) INSTRUMENT_DIR="$2"; shift 2 ;;
    --output-dir)   OUTPUT_DIR="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --help)         show_help; exit 0 ;;
    *)              echo "Unknown argument: $1" >&2; show_help; exit 1 ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────

if [[ -z "$COMMISSION" ]]; then
  echo "Error: --commission is required" >&2
  exit 1
fi

if [[ -z "$REPO" ]]; then
  echo "Error: --repo is required" >&2
  exit 1
fi

# Validate --runs is a positive integer
if ! [[ "$RUNS" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: --runs must be a positive integer, got: $RUNS" >&2
  exit 1
fi

# Validate --mode
if [[ "$MODE" != "blind" && "$MODE" != "aware" ]]; then
  echo "Error: --mode must be 'blind' or 'aware', got: $MODE" >&2
  exit 1
fi

if [[ "$MODE" == "aware" && -z "$SPEC_FILE" ]]; then
  echo "Error: --spec-file is required in aware mode" >&2
  exit 1
fi

if [[ "$MODE" == "aware" && ! -f "$SPEC_FILE" ]]; then
  echo "Error: spec file not found: $SPEC_FILE" >&2
  exit 1
fi

VERSION_DIR="$INSTRUMENT_DIR/${PROMPT_VERSION}"
if [[ ! -d "$VERSION_DIR" ]]; then
  echo "Error: prompt version directory not found: $VERSION_DIR" >&2
  echo "Available versions:" >&2
  ls -d "$INSTRUMENT_DIR"/v*/ 2>/dev/null | xargs -I{} basename {} >&2
  exit 1
fi

SYSTEM_PROMPT_FILE="$VERSION_DIR/system-prompt-${MODE}.md"
USER_TEMPLATE_FILE="$VERSION_DIR/user-template-${MODE}.md"

if [[ ! -f "$SYSTEM_PROMPT_FILE" ]]; then
  echo "Error: system prompt not found: $SYSTEM_PROMPT_FILE" >&2
  exit 1
fi
if [[ ! -f "$USER_TEMPLATE_FILE" ]]; then
  echo "Error: user template not found: $USER_TEMPLATE_FILE" >&2
  exit 1
fi

# ── Resolve repo path ────────────────────────────────────────

REPO_PATH="$REPO"
if [[ ! -d "$REPO_PATH/.git" ]]; then
  echo "Error: not a git repository: $REPO_PATH" >&2
  exit 1
fi

# ── Extract diff and context ────────────────────────────────

echo "═══ Quality Review: $COMMISSION ═══"
echo "  Repo:    $REPO_PATH"
echo "  Mode:    $MODE"
echo "  Runs:    $RUNS"
echo "  Prompt:  $PROMPT_VERSION"
echo ""

# Resolve commit if not provided
if [[ -z "$COMMIT" ]]; then
  # Search only the main branch (not --all) to avoid matching
  # unrelated branches. Use the most recent match.
  COMMIT=$(git -C "$REPO_PATH" log --oneline --grep="$COMMISSION" \
    --format="%H" -1)
  if [[ -z "$COMMIT" ]]; then
    echo "Error: could not auto-detect commit for $COMMISSION." >&2
    echo "Provide --commit <sha> explicitly." >&2
    exit 2
  fi
  echo "  Auto-detected commit: ${COMMIT:0:8}"
fi

# Determine the diff range
if [[ -n "$BASE_COMMIT" ]]; then
  DIFF_RANGE="${BASE_COMMIT}..${COMMIT}"
  echo "  Range:   $DIFF_RANGE"
else
  DIFF_RANGE="${COMMIT}~1..${COMMIT}"
fi

# Extract the diff
DIFF=$(git -C "$REPO_PATH" diff "$DIFF_RANGE" --stat --patch) || {
  echo "Error: failed to extract diff for range $DIFF_RANGE" >&2
  exit 2
}

# Get list of files touched
CHANGED_FILES=$(git -C "$REPO_PATH" diff --name-only "$DIFF_RANGE")

# Extract full file contents for context
FULL_FILES=""
while IFS= read -r file; do
  if git -C "$REPO_PATH" show "${COMMIT}:${file}" &>/dev/null; then
    FULL_FILES+="
=== FILE: ${file} ===
$(git -C "$REPO_PATH" show "${COMMIT}:${file}")
"
  fi
done <<< "$CHANGED_FILES"

# Get surrounding file tree from the commit (not working directory)
TREE_DIRS=$(echo "$CHANGED_FILES" | xargs -I{} dirname {} | sort -u)
FILE_TREE=""
for dir in $TREE_DIRS; do
  tree_listing=$(git -C "$REPO_PATH" ls-tree --name-only "${COMMIT}" "$dir/" 2>/dev/null | xargs -I{} basename {})
  if [[ -n "$tree_listing" ]]; then
    FILE_TREE+="
=== TREE: ${dir}/ ===
$tree_listing
"
  fi
done

# Gather convention reference files — sibling files in the same
# directories that the commission did NOT modify. These give the
# reviewer a sense of local conventions (naming, structure, patterns)
# for the codebase consistency dimension. Pick up to 3 per directory,
# preferring the largest files (more likely to be representative).
CONTEXT_FILES=""
MAX_CONTEXT_PER_DIR=3
for dir in $TREE_DIRS; do
  # List files in dir at the commit, exclude files the commission changed
  sibling_files=$(git -C "$REPO_PATH" ls-tree --name-only "${COMMIT}" "$dir/" 2>/dev/null | while read -r f; do
    # Skip if this file was changed by the commission
    if ! echo "$CHANGED_FILES" | grep -qx "$f"; then
      # Get file size for sorting (prefer larger = more representative)
      size=$(git -C "$REPO_PATH" cat-file -s "${COMMIT}:${f}" 2>/dev/null || echo 0)
      echo "$size $f"
    fi
  done | sort -rn | head -"$MAX_CONTEXT_PER_DIR" | awk '{print $2}')

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    content=$(git -C "$REPO_PATH" show "${COMMIT}:${file}" 2>/dev/null) || continue
    CONTEXT_FILES+="
=== CONTEXT FILE: ${file} ===
$content
"
  done <<< "$sibling_files"
done

# ── Resolve referenced files from spec (aware mode) ─────────

# Commission prompts often reference files in the repo ("see the spec
# at docs/architecture/apparatus/foo.md") rather than inlining them.
# Since the reviewer has no filesystem access, we resolve these
# references and append them to the user message.
#
# We pull from the base commit (pre-commission state) because the
# commission itself may have modified the referenced files. The agent
# worked from the pre-commission state.

REFERENCED_FILES=""
MAX_REFERENCED_FILES=10
if [[ "$MODE" == "aware" && -f "$SPEC_FILE" ]]; then
  if [[ -n "$BASE_COMMIT" ]]; then
    PARENT_COMMIT="$BASE_COMMIT"
  else
    PARENT_COMMIT=$(git -C "$REPO_PATH" rev-parse "${COMMIT}~1" 2>/dev/null || echo "")
  fi

  if [[ -n "$PARENT_COMMIT" ]]; then
    # Scan the spec file for paths that look like repo files.
    # Match patterns like:
    #   docs/architecture/apparatus/clerk.md
    #   src/scriptorium-core.ts
    #   packages/plugins/codexes/README.md
    # Heuristic: sequences of word-chars/hyphens/dots separated by /,
    # ending in a file extension. Won't catch everything, but covers
    # the common "see the spec at X" pattern.
    #
    # False positives (URLs, npm refs) fail silently on git show and
    # are skipped. False negatives are the inherent limitation —
    # use a manually flattened --spec-file for unusual cases.
    candidate_paths=$(grep -oE '[a-zA-Z0-9_./-]+\.[a-zA-Z]{1,5}' "$SPEC_FILE" \
      | grep '/' \
      | sort -u)

    if [[ -n "$candidate_paths" ]]; then
      # First pass: resolve candidates, get sizes, filter dupes with
      # CHANGED_FILES. Collect as "size path" pairs for sorting.
      sized_paths=""
      while IFS= read -r ref_path; do
        # Skip files the commission modified — they're already in
        # FULL_FILES (post-commission state). Including the pre-
        # commission version here too would give the reviewer two
        # copies at different states, which is confusing.
        if echo "$CHANGED_FILES" | grep -qx "$ref_path"; then
          continue
        fi

        # Check if the file exists at the parent commit
        ref_size=$(git -C "$REPO_PATH" cat-file -s "${PARENT_COMMIT}:${ref_path}" 2>/dev/null) || continue
        sized_paths+="$ref_size $ref_path"$'\n'
      done <<< "$candidate_paths"

      # Sort by size descending and take the top N — keep the largest
      # (most likely to be substantive specs/docs, not small configs)
      if [[ -n "$sized_paths" ]]; then
        resolved_count=0
        resolved_bytes=0
        skipped_count=0

        while IFS=' ' read -r ref_size ref_path; do
          [[ -z "$ref_path" ]] && continue

          if [[ $resolved_count -ge $MAX_REFERENCED_FILES ]]; then
            skipped_count=$((skipped_count + 1))
            continue
          fi

          ref_content=$(git -C "$REPO_PATH" show "${PARENT_COMMIT}:${ref_path}" 2>/dev/null) || continue
          REFERENCED_FILES+="
=== REFERENCED FILE: ${ref_path} (pre-commission state) ===
$ref_content
"
          resolved_count=$((resolved_count + 1))
          resolved_bytes=$((resolved_bytes + ref_size))
        done <<< "$(echo "$sized_paths" | sort -rn)"

        if [[ $resolved_count -gt 0 ]]; then
          echo "  Resolved $resolved_count referenced file(s) (~$((resolved_bytes / 1024))KB) from parent commit ${PARENT_COMMIT:0:8}"
        fi
        if [[ $skipped_count -gt 0 ]]; then
          echo "  Skipped $skipped_count smaller referenced file(s) (MAX_REFERENCED_FILES=$MAX_REFERENCED_FILES)" >&2
        fi
      fi
    fi
  else
    echo "  Warning: could not resolve parent commit; skipping reference resolution" >&2
  fi
fi

# ── Build the prompt ─────────────────────────────────────────

# Read the versioned system prompt (fed directly — file is the prompt)
SYSTEM_PROMPT=$(cat "$SYSTEM_PROMPT_FILE")

# Assemble the user message by writing sections to a temp file.
# This avoids bash string substitution on large content, which is
# slow, memory-hungry, and mangles special characters (\, &, $).
USER_MESSAGE_FILE=$(mktemp)

assemble_user_message() {
  local template_file="$1"
  local out_file="$2"

  # Read template line by line, replacing placeholders with file contents
  while IFS= read -r line; do
    case "$line" in
      *'{{SPEC}}'*)
        if [[ "$MODE" == "aware" && -f "$SPEC_FILE" ]]; then
          cat "$SPEC_FILE"
        fi
        ;;
      *'{{DIFF}}'*)
        echo '```'
        echo "$DIFF"
        echo '```'
        ;;
      *'{{FULL_FILES}}'*)
        echo "$FULL_FILES"
        ;;
      *'{{CONTEXT_FILES}}'*)
        echo "$CONTEXT_FILES"
        ;;
      *'{{REFERENCED_FILES}}'*)
        echo "$REFERENCED_FILES"
        ;;
      *'{{FILE_TREE}}'*)
        echo '```'
        echo "$FILE_TREE"
        echo '```'
        ;;
      *)
        echo "$line"
        ;;
    esac
  done < "$template_file" > "$out_file"
}

assemble_user_message "$USER_TEMPLATE_FILE" "$USER_MESSAGE_FILE"

if $DRY_RUN; then
  echo "── DRY RUN ──"
  echo ""
  echo "Would execute $RUNS review runs with prompt version $PROMPT_VERSION"
  echo "Diff size: $(echo "$DIFF" | wc -l) lines"
  echo "Full files size: $(echo "$FULL_FILES" | wc -l) lines"
  echo "Context files size: $(echo "$CONTEXT_FILES" | wc -l) lines"
  echo "Referenced files size: $(echo "$REFERENCED_FILES" | wc -l) lines"
  echo "User message size: $(wc -l < "$USER_MESSAGE_FILE") lines"
  echo "Changed files:"
  echo "$CHANGED_FILES" | sed 's/^/  /'
  echo ""
  echo "Output would be written to: $OUTPUT_DIR/${COMMISSION}/quality.yaml"
  exit 0
fi

# ── Execute review runs ─────────────────────────────────────

mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RUNS_DIR=$(mktemp -d)
SANDBOX_DIR=$(mktemp -d)
FAILED_RUNS=0

echo "── Running $RUNS independent reviews in parallel ──"
echo ""

# Launch all runs concurrently. Each run is independent (separate
# API call, independent sampling) so there's no reason to serialize.
# The user message is piped via stdin to avoid OS argument length
# limits (~2MB Linux, ~256KB macOS) on large commissions.
#
# Isolation per run:
#   --tools ""             — disable ALL built-in tools
#   --disallowed-tools     — belt-and-suspenders: deny by name too
#   --setting-sources user — OAuth auth only, no project CLAUDE.md
#   --max-turns 1          — single response, no interaction loop
#   empty tmpdir as cwd    — nothing to discover if tools leak
#
# The reviewer is a pure text-in/text-out instrument. All context
# is in the prompt; it has no need for filesystem access.
#
# TODO: When the guild's Animator supports one-shot sessions,
# replace this with a proper guild invocation.
# TODO: Verify --tools "" actually disables tools in current CLI
# version. If not, --disallowed-tools may be the primary control.

declare -a RUN_PIDS

for i in $(seq 1 "$RUNS"); do
  RUN_FILE="$RUNS_DIR/run-${i}.yaml"

  (cd "$SANDBOX_DIR" && claude --print \
    --system-prompt "$SYSTEM_PROMPT" \
    --output-format text \
    --max-turns 1 \
    --tools "" \
    --disallowed-tools "Bash,Read,Write,Edit,Glob,Grep" \
    --setting-sources user \
    < "$USER_MESSAGE_FILE") \
    > "$RUN_FILE" 2>/dev/null &

  RUN_PIDS+=($!)
done

# Wait for all runs and collect results
for i in $(seq 1 "$RUNS"); do
  idx=$((i - 1))
  if wait "${RUN_PIDS[$idx]}"; then
    echo "  ✓ Run $i complete"
  else
    echo "  ✗ Run $i failed" >&2
    FAILED_RUNS=$((FAILED_RUNS + 1))
  fi
done

echo ""

# Check if enough runs succeeded
SUCCESSFUL_RUNS=$((RUNS - FAILED_RUNS))
if [[ $SUCCESSFUL_RUNS -lt 2 ]]; then
  echo "Error: only $SUCCESSFUL_RUNS runs succeeded (need at least 2)" >&2
  exit 3
fi

if [[ $FAILED_RUNS -gt 0 ]]; then
  echo "Warning: $FAILED_RUNS of $RUNS runs failed. Aggregating $SUCCESSFUL_RUNS." >&2
fi

# ── Aggregate scores ─────────────────────────────────────────

echo "── Aggregating scores ──"

# Parse YAML scores from each run and compute aggregates.
# This is deliberately simple — extract numbers with grep/awk
# rather than pulling in a YAML parser dependency.

extract_score() {
  local file="$1" field="$2"
  local value
  value=$(grep "^ *${field}:" "$file" 2>/dev/null | head -1 | awk '{print $2}')
  # Validate it's actually 1, 2, or 3
  if [[ "$value" =~ ^[123]$ ]]; then
    echo "$value"
  else
    echo ""
  fi
}

# Collect per-run scores, composites, and notes
declare -a TQ_SCORES CS_SCORES EH_SCORES CC_SCORES RC_SCORES
declare -a RUN_COMPOSITES
declare -a RUN_NOTES

for i in $(seq 1 "$RUNS"); do
  RUN_FILE="$RUNS_DIR/run-${i}.yaml"
  [[ -f "$RUN_FILE" ]] || continue

  tq=$(extract_score "$RUN_FILE" "test_quality")
  cs=$(extract_score "$RUN_FILE" "code_structure")
  eh=$(extract_score "$RUN_FILE" "error_handling")
  cc=$(extract_score "$RUN_FILE" "codebase_consistency")

  # Skip runs where we couldn't parse valid scores
  if [[ -z "$tq" || -z "$cs" || -z "$eh" || -z "$cc" ]]; then
    echo "  Warning: could not parse valid scores from run $i, skipping" >&2
    continue
  fi

  TQ_SCORES+=("$tq")
  CS_SCORES+=("$cs")
  EH_SCORES+=("$eh")
  CC_SCORES+=("$cc")

  # Compute this run's composite for proper SD calculation later
  if [[ "$MODE" == "aware" ]]; then
    rc=$(extract_score "$RUN_FILE" "requirement_coverage")
    if [[ -z "$rc" ]]; then
      echo "  Warning: could not parse requirement_coverage from run $i, skipping" >&2
      # Remove the scores we just added — this run is incomplete
      unset 'TQ_SCORES[-1]' 'CS_SCORES[-1]' 'EH_SCORES[-1]' 'CC_SCORES[-1]'
      continue
    fi
    RC_SCORES+=("$rc")
    RUN_COMPOSITES+=("$(awk "BEGIN {printf \"%.2f\", ($tq + $cs + $eh + $cc + $rc) / 5}")")
  else
    RUN_COMPOSITES+=("$(awk "BEGIN {printf \"%.2f\", ($tq + $cs + $eh + $cc) / 4}")")
  fi

  # Extract notes (multi-line YAML block scalar after "notes: |")
  local_notes=$(awk '/^notes:/{found=1; next} found && /^[^ ]/{exit} found{print}' "$RUN_FILE" | sed 's/^  //')
  RUN_NOTES+=("${local_notes:-"(no notes)"}")
done

N=${#TQ_SCORES[@]}
if [[ $N -lt 2 ]]; then
  echo "Error: only $N runs produced parseable scores (need at least 2)" >&2
  exit 4
fi

# Compute mean and SD for an array of scores using awk (no bc dependency)
compute_stats() {
  local -n arr=$1
  local vals=""
  for val in "${arr[@]}"; do
    vals+="$val "
  done
  awk -v vals="$vals" 'BEGIN {
    n = split(vals, a, " ")
    sum = 0
    for (i = 1; i <= n; i++) sum += a[i]
    mean = sum / n
    sq_sum = 0
    for (i = 1; i <= n; i++) sq_sum += (a[i] - mean)^2
    sd = sqrt(sq_sum / n)
    printf "%.2f %.2f", mean, sd
  }'
}

read TQ_MEAN TQ_SD <<< "$(compute_stats TQ_SCORES)"
read CS_MEAN CS_SD <<< "$(compute_stats CS_SCORES)"
read EH_MEAN EH_SD <<< "$(compute_stats EH_SCORES)"
read CC_MEAN CC_SD <<< "$(compute_stats CC_SCORES)"

# Composite stats computed from per-run composites (proper SD, not averaged SDs)
read COMPOSITE COMPOSITE_SD <<< "$(compute_stats RUN_COMPOSITES)"

if [[ "$MODE" == "aware" && ${#RC_SCORES[@]} -gt 0 ]]; then
  read RC_MEAN RC_SD <<< "$(compute_stats RC_SCORES)"
fi

# ── Write artifact ───────────────────────────────────────────

ARTIFACT_DIR="$OUTPUT_DIR/${COMMISSION}"
mkdir -p "$ARTIFACT_DIR"
ARTIFACT_FILE="$ARTIFACT_DIR/quality-${MODE}.yaml"

{
  cat <<EOF
# Quality Review: $COMMISSION
# Generated: $TIMESTAMP
# Prompt version: $PROMPT_VERSION
# Mode: $MODE
# Runs: $N successful of $RUNS attempted

commission: "$COMMISSION"
repo: "$REPO"
commit: "$COMMIT"
reviewed_at: "$TIMESTAMP"
prompt_version: "$PROMPT_VERSION"
mode: "$MODE"

aggregate:
  composite: $COMPOSITE
  composite_sd: $COMPOSITE_SD
  n: $N
  dimensions:
    test_quality:
      mean: $TQ_MEAN
      sd: $TQ_SD
    code_structure:
      mean: $CS_MEAN
      sd: $CS_SD
    error_handling:
      mean: $EH_MEAN
      sd: $EH_SD
    codebase_consistency:
      mean: $CC_MEAN
      sd: $CC_SD
EOF

  if [[ "$MODE" == "aware" && ${#RC_SCORES[@]} -gt 0 ]]; then
    cat <<EOF
    requirement_coverage:
      mean: $RC_MEAN
      sd: $RC_SD
EOF
  fi

  # Flag high-variance dimensions
  HIGH_VAR=""
  for dim_name in test_quality code_structure error_handling codebase_consistency; do
    case "$dim_name" in
      test_quality)          sd_val="$TQ_SD" ;;
      code_structure)        sd_val="$CS_SD" ;;
      error_handling)        sd_val="$EH_SD" ;;
      codebase_consistency)  sd_val="$CC_SD" ;;
    esac
    if awk "BEGIN {exit !($sd_val > 0.5)}"; then
      HIGH_VAR+="  - $dim_name (sd: $sd_val)\n"
    fi
  done

  if [[ -n "$HIGH_VAR" ]]; then
    echo ""
    echo "high_variance_flags:"
    printf "%b" "$HIGH_VAR"
  fi

  # Per-run detail
  echo ""
  echo "runs:"
  for i in $(seq 0 $((N - 1))); do
    cat <<EOF
  - run: $((i + 1))
    test_quality: ${TQ_SCORES[$i]}
    code_structure: ${CS_SCORES[$i]}
    error_handling: ${EH_SCORES[$i]}
    codebase_consistency: ${CC_SCORES[$i]}
    composite: ${RUN_COMPOSITES[$i]}
EOF
    if [[ "$MODE" == "aware" && ${#RC_SCORES[@]} -gt $i ]]; then
      echo "    requirement_coverage: ${RC_SCORES[$i]}"
    fi
    # Write notes as YAML block scalar
    echo "    notes: |"
    while IFS= read -r line; do
      echo "      $line"
    done <<< "${RUN_NOTES[$i]}"
  done

} > "$ARTIFACT_FILE"

echo ""
echo "═══ Review Complete ═══"
echo ""
echo "  Composite:  $COMPOSITE (sd: $COMPOSITE_SD)"
echo "  Dimensions:"
echo "    test_quality:         $TQ_MEAN (sd: $TQ_SD)"
echo "    code_structure:       $CS_MEAN (sd: $CS_SD)"
echo "    error_handling:       $EH_MEAN (sd: $EH_SD)"
echo "    codebase_consistency: $CC_MEAN (sd: $CC_SD)"
if [[ "$MODE" == "aware" && ${#RC_SCORES[@]} -gt 0 ]]; then
  echo "    requirement_coverage: $RC_MEAN (sd: $RC_SD)"
fi
echo ""
echo "  Notes (run 1): ${RUN_NOTES[0]}"
echo ""
echo "  Artifact: $ARTIFACT_FILE"

if awk "BEGIN {exit !($COMPOSITE_SD > 0.5)}"; then
  echo ""
  printf "  ⚠ High composite variance (sd: %s).\n" "$COMPOSITE_SD"
  echo "    Consider increasing --runs to 5 for this commission."
fi
