#!/usr/bin/env bash
# coco-distill.sh — Distill a Coco session transcript into docs/planning/
# and run a verifier; print verifier findings only on discrepancy.
#
# Usage: coco-distill.sh <session-id>
#
# The transcript is preprocessed (chat backbone only, tool results
# stripped) and passed inline to the distiller and verifier agents — they
# don't read files themselves. This keeps the agent runs cheap and fast.

set -euo pipefail

SESSION_ID="${1:?usage: $(basename "$0") <session-id>}"
SANCTUM="/workspace/nexus-mk2"
TRANSCRIPT="$SANCTUM/experiments/data/transcripts/$SESSION_ID.jsonl"
PLANNING_DIR="$SANCTUM/docs/planning"
EXTRACTOR="$SANCTUM/bin/coco-extract-conversation.py"

if [[ ! -f "$TRANSCRIPT" ]]; then
    echo "transcript not found: $TRANSCRIPT" >&2
    exit 1
fi
if [[ ! -x "$EXTRACTOR" ]]; then
    echo "extractor not executable: $EXTRACTOR" >&2
    exit 1
fi

mkdir -p "$PLANNING_DIR"

# 1. Preprocess the transcript into a chat-only markdown view.
CONVERSATION="$("$EXTRACTOR" "$TRANSCRIPT")"

# 2. Run the distiller agent with the conversation inline in the prompt.
DISTILL_RAW="$(claude --agent distiller \
    -p "Distill the following session transcript.

$CONVERSATION" \
    --output-format text)"

# 2a. Strip anything before the first '---' line — agents sometimes leak
# a preamble or commentary before the frontmatter despite instructions.
DISTILL="$(printf '%s\n' "$DISTILL_RAW" | awk '/^---$/{found=1} found{print}')"

if [[ -z "$DISTILL" ]]; then
    echo "distiller produced no frontmatter-prefixed output" >&2
    echo "raw output:" >&2
    printf '%s\n' "$DISTILL_RAW" >&2
    exit 1
fi

# 3. Extract slug and date from the YAML frontmatter the distiller emits.
SLUG="$(printf '%s\n' "$DISTILL" | awk '/^slug: /{print $2; exit}')"
DATE="$(printf '%s\n' "$DISTILL" | awk '/^date: /{print $2; exit}')"

if [[ -z "$SLUG" || -z "$DATE" ]]; then
    echo "distiller did not emit valid frontmatter (slug=$SLUG date=$DATE)" >&2
    exit 1
fi

DISTILL_PATH="$PLANNING_DIR/$DATE-$SLUG.md"

# If a file already exists for this date+slug, append a numeric suffix.
n=2
while [[ -e "$DISTILL_PATH" ]]; do
    DISTILL_PATH="$PLANNING_DIR/$DATE-$SLUG-$n.md"
    ((n++))
done

printf '%s\n' "$DISTILL" > "$DISTILL_PATH"
echo "distill: $DISTILL_PATH"

# 4. Run the verifier with both distill and transcript inline.
VERIFY="$(claude --agent verifier \
    -p "Verify the following distill against its source transcript.

===DISTILL===
$DISTILL
===DISTILL===

===TRANSCRIPT===
$CONVERSATION
===TRANSCRIPT===" \
    --output-format text)"

# 5. Surface verifier output only if it reports a discrepancy.
if printf '%s\n' "$VERIFY" | head -1 | grep -q '^STATUS: discrepancy'; then
    echo ""
    printf '%s\n' "$VERIFY" | tail -n +2
fi
