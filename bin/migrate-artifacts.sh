#!/usr/bin/env bash
# bin/migrate-artifacts.sh — One-shot, idempotent migration of legacy artifact
# layout in the NexusArtifactsRepository to the new artifact CLI layout.
#
# Legacy layout:
#   sessions/YYYY-MM/DD/slug.md        → session-doc/{id}.json
#   herald/slug.md                      → publication/{id}.json
#   transcripts/archived/{uuid}.jsonl   → transcript/{id}.json  (+ companion .jsonl)
#   transcripts/pending/{uuid}.jsonl    → .artifacts/staged-transcript/ (workspace-local)
#
# New layout (artifact CLI convention):
#   {type}/{id}.json   — artifact envelope with { type, id, createdAt, content }
#   Transcript raw data is embedded in content.body (no companion files).
#
# Idempotency: each step checks whether the target artifact already exists
# before creating it. Safe to run repeatedly.
#
# Usage:
#   ./bin/migrate-artifacts.sh [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Operate directly on the workspace checkout of the artifacts repo.
ARTIFACTS_REPO="/workspace/nexus-mk2-artifacts"
WORKSPACE_ARTIFACTS="${PROJECT_ROOT}/.artifacts"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "migrate: $*"; }
skip() { echo "migrate: SKIP $*"; }
dry()  { echo "migrate: DRY-RUN would $*"; }

# Extract a YAML frontmatter field value (simple single-line values only).
# Usage: yaml_field "field" < file
yaml_field() {
  local field="$1"
  # Matches "field: value" or "field: 'value'" or 'field: "value"'
  sed -n "/^---$/,/^---$/{ s/^${field}: *[\"']*\([^\"']*\)[\"']* *$/\1/p; }" | head -1
}

# Extract a YAML frontmatter array field as JSON array.
# Handles both inline [a, b] and block "- item" forms.
yaml_array_field() {
  local field="$1" file="$2"
  # Try inline form first: field: [a, b, c]
  local inline
  inline=$(sed -n "/^---$/,/^---$/{/^${field}:/p}" "$file" | sed "s/^${field}: *//")
  if [[ "$inline" == "["* ]]; then
    # Convert YAML inline array to JSON array
    echo "$inline" | sed 's/\[/["/; s/\]/"]/' | sed 's/, */", "/g'
    return
  fi
  # Block form: collect "  - item" lines after "field:"
  local in_field=false
  local items=()
  while IFS= read -r line; do
    if [[ "$line" == "${field}:" ]]; then
      in_field=true
      continue
    fi
    if $in_field; then
      if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
        items+=("${BASH_REMATCH[1]}")
      else
        break
      fi
    fi
  done < <(sed -n '/^---$/,/^---$/p' "$file")

  # Emit JSON array
  if [[ ${#items[@]} -eq 0 ]]; then
    echo "[]"
  else
    local json="["
    for i in "${!items[@]}"; do
      [[ $i -gt 0 ]] && json+=", "
      json+="\"${items[$i]}\""
    done
    json+="]"
    echo "$json"
  fi
}

# Extract the body (everything after the second ---).
yaml_body() {
  local file="$1"
  awk 'BEGIN{n=0} n>=2{print; next} /^---$/{n++; next} {next}' "$file"
}

# Escape a string for safe embedding in JSON (reads from stdin).
# Uses python3 for reliable handling of multiline content.
json_escape_stdin() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1], end="")'
}

# ── Verify repo is available ─────────────────────────────────────────────────

if [[ ! -d "${ARTIFACTS_REPO}/.git" ]]; then
  log "ERROR: artifacts repo not found at ${ARTIFACTS_REPO}"
  exit 1
fi

# Track whether any changes were made (for final commit).
CHANGES_MADE=false

# ── 1. Migrate session docs ─────────────────────────────────────────────────

log "=== Migrating session docs ==="

SESSION_DOC_DIR="${ARTIFACTS_REPO}/session-doc"
mkdir -p "$SESSION_DOC_DIR"

for md_file in "$ARTIFACTS_REPO"/sessions/*/*/*.md; do
  [[ -f "$md_file" ]] || continue

  slug=$(basename "$md_file" .md)
  # Derive an artifact ID from the date path + slug.
  # e.g., sessions/2026-03/17/foo.md → 2026-03-17-foo
  rel_path="${md_file#"${ARTIFACTS_REPO}"/sessions/}"   # 2026-03/17/foo.md
  year_month=$(dirname "$(dirname "$rel_path")")         # 2026-03
  day=$(basename "$(dirname "$rel_path")")               # 17
  artifact_id="${year_month}-${day}-${slug}"

  target="${SESSION_DOC_DIR}/${artifact_id}.json"

  if [[ -f "$target" ]]; then
    skip "session-doc/${artifact_id} already exists"
    continue
  fi

  # Parse frontmatter
  date_val=$(yaml_field "date" < "$md_file")
  topic_val=$(yaml_field "topic" < "$md_file")
  significance_val=$(yaml_field "significance" < "$md_file")
  transcript_val=$(yaml_field "transcript" < "$md_file")
  tags_json=$(yaml_array_field "tags" "$md_file")

  # Default date to midnight if only date portion provided
  created_at="$date_val"
  if [[ ! "$created_at" == *T* ]]; then
    created_at="${created_at}T00:00:00Z"
  fi
  # Ensure Z suffix
  if [[ ! "$created_at" == *Z ]]; then
    created_at="${created_at}Z"
  fi

  if $DRY_RUN; then
    dry "create session-doc/${artifact_id}"
    continue
  fi

  topic_escaped=$(echo -n "$topic_val" | json_escape_stdin)
  body_escaped=$(yaml_body "$md_file" | json_escape_stdin)

  cat > "$target" <<ENDJSON
{
  "type": "session-doc",
  "id": "${artifact_id}",
  "createdAt": "${created_at}",
  "content": {
    "date": "${date_val}",
    "topic": "${topic_escaped}",
    "tags": ${tags_json},
    "significance": "${significance_val}",
    "transcript": "${transcript_val}",
    "body": "${body_escaped}"
  }
}
ENDJSON

  log "created session-doc/${artifact_id}"
  CHANGES_MADE=true
done

# ── 2. Migrate publications ─────────────────────────────────────────────────

log "=== Migrating publications ==="

PUBLICATION_DIR="${ARTIFACTS_REPO}/publication"
mkdir -p "$PUBLICATION_DIR"

for md_file in "$ARTIFACTS_REPO"/herald/*.md; do
  [[ -f "$md_file" ]] || continue

  slug=$(basename "$md_file" .md)
  artifact_id="$slug"
  target="${PUBLICATION_DIR}/${artifact_id}.json"

  if [[ -f "$target" ]]; then
    skip "publication/${artifact_id} already exists"
    continue
  fi

  # Parse frontmatter
  date_val=$(yaml_field "date" < "$md_file")
  type_val=$(yaml_field "type" < "$md_file")
  scope_val=$(yaml_field "scope" < "$md_file")
  sessions_json=$(yaml_array_field "sessions" "$md_file")

  created_at="$date_val"
  if [[ ! "$created_at" == *T* ]]; then
    created_at="${created_at}T00:00:00Z"
  fi
  if [[ ! "$created_at" == *Z ]]; then
    created_at="${created_at}Z"
  fi

  if $DRY_RUN; then
    dry "create publication/${artifact_id}"
    continue
  fi

  scope_escaped=$(echo -n "$scope_val" | json_escape_stdin)
  body_escaped=$(yaml_body "$md_file" | json_escape_stdin)

  cat > "$target" <<ENDJSON
{
  "type": "publication",
  "id": "${artifact_id}",
  "createdAt": "${created_at}",
  "content": {
    "date": "${date_val}",
    "type": "${type_val}",
    "scope": "${scope_escaped}",
    "sessions": ${sessions_json},
    "body": "${body_escaped}"
  }
}
ENDJSON

  log "created publication/${artifact_id}"
  CHANGES_MADE=true
done

# ── 3. Migrate archived transcripts ─────────────────────────────────────────

log "=== Migrating archived transcripts ==="

TRANSCRIPT_DIR="${ARTIFACTS_REPO}/transcript"
mkdir -p "$TRANSCRIPT_DIR"

for jsonl_file in "$ARTIFACTS_REPO"/transcripts/archived/*.jsonl; do
  [[ -f "$jsonl_file" ]] || continue

  uuid=$(basename "$jsonl_file" .jsonl)
  artifact_id="$uuid"
  target_json="${TRANSCRIPT_DIR}/${artifact_id}.json"

  if [[ -f "$target_json" ]]; then
    skip "transcript/${artifact_id} already exists"
    continue
  fi

  # Get file modification time as createdAt.
  created_at=$(date -u -r "$jsonl_file" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
    || stat -c '%Y' "$jsonl_file" | xargs -I{} date -u -d @{} +%Y-%m-%dT%H:%M:%SZ)

  if $DRY_RUN; then
    dry "create transcript/${artifact_id} (with embedded body)"
    continue
  fi

  # Embed the raw JSONL content directly in the artifact envelope.
  body_escaped=$(json_escape_stdin < "$jsonl_file")

  cat > "$target_json" <<ENDJSON
{
  "type": "transcript",
  "id": "${artifact_id}",
  "createdAt": "${created_at}",
  "content": {
    "sessionId": "${uuid}",
    "body": "${body_escaped}"
  }
}
ENDJSON

  log "created transcript/${artifact_id}"
  CHANGES_MADE=true
done

# ── 4. Stage pending transcripts to workspace-local store ────────────────────

log "=== Staging pending transcripts ==="

STAGED_DIR="${WORKSPACE_ARTIFACTS}/staged-transcript"
mkdir -p "$STAGED_DIR"

for jsonl_file in "$ARTIFACTS_REPO"/transcripts/pending/*.jsonl; do
  [[ -f "$jsonl_file" ]] || continue

  uuid=$(basename "$jsonl_file" .jsonl)
  artifact_id="$uuid"
  target_json="${STAGED_DIR}/${artifact_id}.json"

  if [[ -f "$target_json" ]]; then
    skip "staged-transcript/${artifact_id} already exists"
    continue
  fi

  created_at=$(date -u -r "$jsonl_file" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
    || stat -c '%Y' "$jsonl_file" | xargs -I{} date -u -d @{} +%Y-%m-%dT%H:%M:%SZ)

  if $DRY_RUN; then
    dry "create staged-transcript/${artifact_id} (workspace-local, with embedded body)"
    continue
  fi

  # Embed the raw JSONL content directly in the artifact envelope.
  body_escaped=$(json_escape_stdin < "$jsonl_file")

  cat > "$target_json" <<ENDJSON
{
  "type": "staged-transcript",
  "id": "${artifact_id}",
  "createdAt": "${created_at}",
  "content": {
    "sessionId": "${uuid}",
    "captureType": "primary",
    "body": "${body_escaped}"
  }
}
ENDJSON

  log "created staged-transcript/${artifact_id} (workspace-local)"
done

# ── 5. Commit and push persistent artifacts ──────────────────────────────────

if $DRY_RUN; then
  log "=== Dry run complete. No changes made. ==="
  exit 0
fi

if $CHANGES_MADE; then
  log "=== Committing migrated artifacts ==="
  git -C "$ARTIFACTS_REPO" add session-doc/ publication/ transcript/
  if ! git -C "$ARTIFACTS_REPO" diff --cached --quiet; then
    git -C "$ARTIFACTS_REPO" commit -m "migrate: convert legacy layout to artifact CLI format

Idempotent migration of:
- sessions/ → session-doc/{id}.json
- herald/ → publication/{id}.json
- transcripts/archived/ → transcript/{id}.json (JSONL embedded in body)

Legacy directories are preserved (not deleted) for reference."
    git -C "$ARTIFACTS_REPO" push
    log "committed and pushed to NexusArtifactsRepository"
  else
    log "nothing to commit (all artifacts already up to date)"
  fi
else
  log "no changes needed — all artifacts already migrated"
fi

log "=== Migration complete ==="
