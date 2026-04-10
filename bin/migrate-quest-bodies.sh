#!/usr/bin/env bash
#
# migrate-quest-bodies.sh — migrate quest writs to the file-canonical body model.
#
# For each live-status quest writ:
#   1. Write the current row body to /workspace/vibers/writs/quests/<id>.md
#      with an h1 title on the first line.
#   2. Extract the "## Goal" section from the original body.
#   3. Replace the row body with the generic live-quest stub (warning comments
#      + the extracted Goal section).
#
# Idempotent and re-runnable: quests whose files already exist are skipped.
# Terminal-status quests (completed/cancelled/failed) are never touched.
#
# Flags:
#   --dry-run   Print what would happen without making changes.
#
# Resolves quest w-mnt0jin1-960d83b73712 (File-canonical quest bodies).

set -euo pipefail

VIBERS_ROOT="/workspace/vibers"
QUESTS_DIR="$VIBERS_ROOT/writs/quests"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[dry-run] no changes will be written"
fi

STUB_HEADER='<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->'

mkdir -p "$QUESTS_DIR"

# Collect all live-status quest ids. We query each status separately to stay
# under the output-size ceiling on `nsg writ list`.
declare -a IDS=()
for status in new ready active waiting; do
  mapfile -t STATUS_IDS < <(
    nsg writ list --type quest --status "$status" --limit 200 \
      | jq -r '.[].id'
  )
  IDS+=("${STATUS_IDS[@]}")
done

# Dedupe in case a writ transitioned states mid-run.
mapfile -t IDS < <(printf '%s\n' "${IDS[@]}" | sort -u)

echo "Found ${#IDS[@]} live quest writs"

migrated=0
skipped=0

for id in "${IDS[@]}"; do
  file="$QUESTS_DIR/$id.md"

  if [[ -f "$file" ]]; then
    echo "[skip]     $id — file already exists"
    skipped=$((skipped + 1))
    continue
  fi

  writ_json=$(nsg writ show --id "$id")
  title=$(echo "$writ_json" | jq -r '.title')
  body=$(echo "$writ_json" | jq -r '.body')

  # Extract the Goal section: the "## Goal" line (inclusive) through the line
  # before the next "## " h2 heading. Subsections (### or deeper) are kept.
  goal=$(echo "$body" | awk '
    /^## Goal/ { in_goal=1; print; next }
    in_goal && /^## / { exit }
    in_goal { print }
  ')

  if [[ -z "$goal" ]]; then
    goal=$'## Goal\n\nSee file body for this quest\'s goal and content. (Migrated without a detected Goal section.)'
  fi

  new_row_body="$STUB_HEADER

$goal"

  file_body="# $title

$body"

  if $DRY_RUN; then
    echo "[dry-run]  $id — would write file ($(echo "$file_body" | wc -l) lines), update row body"
    continue
  fi

  printf '%s\n' "$file_body" > "$file"
  nsg writ edit --id "$id" --body "$new_row_body" > /dev/null

  echo "[migrated] $id — $title"
  migrated=$((migrated + 1))
done

echo
echo "Summary: $migrated migrated, $skipped skipped (already present)"

if $DRY_RUN; then
  exit 0
fi

# Commit the new files in the vibers guild repo.
cd "$VIBERS_ROOT"

if [[ -z "$(git status --porcelain writs/quests/)" ]]; then
  echo "No filesystem changes to commit."
  exit 0
fi

GIT_AUTHOR_NAME=Coco GIT_AUTHOR_EMAIL=coco@nexus.local \
GIT_COMMITTER_NAME=Coco GIT_COMMITTER_EMAIL=coco@nexus.local \
  git add writs/quests/

GIT_AUTHOR_NAME=Coco GIT_AUTHOR_EMAIL=coco@nexus.local \
GIT_COMMITTER_NAME=Coco GIT_COMMITTER_EMAIL=coco@nexus.local \
  git commit -m "migrate: extract live quest bodies to files

Extracts the living body of each live-status quest writ from the
Clerk's writs table to a markdown file at
writs/quests/<writ-id>.md, per the file-canonical quest body
convention (quest w-mnt0jin1-960d83b73712). Row bodies now hold
the generic warning-comment stub plus the Goal section only.

Session: 89e9a8ee-b620-4fbe-9ecf-03d21aaf5cba"

echo "Committed vibers-side migration."
