#!/usr/bin/env bash
# artifact.sh — CLI for the Artifact store.
#
# Abstracts over the filesystem storage layout so humans and agents
# can discover and inspect Artifacts without knowing path conventions.
#
# Usage:
#   artifact.sh list <type>          List all artifacts of a given type
#   artifact.sh show <type> <id>     Display full artifact JSON
#   artifact.sh latest <type>        Display the most recent artifact of a type
#   artifact.sh store                Store artifact JSON from stdin
#   artifact.sh delete <type> <id>   Delete an artifact by type and id
#
# Valid artifact types:
#   audit-report, assessment, build-result, staged-transcript,
#   transcript, session-doc, publication
#
# Persistent types (transcript, session-doc, publication) are stored in the
# NexusArtifactsRepository at ARTIFACTS_REPO and committed+pushed on store.
# The CLI lazily clones the repo on first use — no external startup hooks needed.
# Non-persistent types (audit-report, assessment, build-result, staged-transcript)
# are written to workspace-local storage only ($ARTIFACT_ROOT).
#
# staged-transcript companion convention:
#   Each Artifact<StagedTranscript> has an associated companion JSONL file that
#   holds the raw transcript data. Both files share the same base name:
#     .artifacts/staged-transcript/<id>.json   — artifact metadata
#     .artifacts/staged-transcript/<id>.jsonl  — raw transcript content
#   Callers are responsible for writing and reading the companion JSONL directly.
#   The delete command removes both files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ARTIFACT_ROOT="${PROJECT_ROOT}/.artifacts"
ARTIFACTS_REPO="${NEXUS_TEMP_DIR:?NEXUS_TEMP_DIR is not set}/nexus-mk2-artifacts"
ARTIFACTS_REPO_REMOTE="${NEXUS_ARTIFACTS_REMOTE:?NEXUS_ARTIFACTS_REMOTE is not set}"

# --- helpers ----------------------------------------------------------------

die() { echo "error: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  artifact.sh list   <type>        List artifacts (most recent first)
  artifact.sh show   <type> <id>   Show full artifact JSON
  artifact.sh latest <type>        Show the most recent artifact
  artifact.sh store                Store artifact JSON from stdin
  artifact.sh delete <type> <id>   Delete an artifact by type and id

Types: audit-report | assessment | build-result | staged-transcript | transcript | session-doc | publication
EOF
  exit 1
}

# Validate that a string is a known ArtifactTypeName.
validate_type() {
  case "$1" in
    audit-report|assessment|build-result|staged-transcript|transcript|session-doc|publication) ;;
    *) die "unknown artifact type: '$1'" ;;
  esac
}

# Returns 0 if the type is stored in the NexusArtifactsRepository (persistent),
# non-zero if it is workspace-local only (non-persistent).
is_persistent() {
  case "$1" in
    transcript|session-doc|publication) return 0 ;;
    *) return 1 ;;
  esac
}

# Ensure the NexusArtifactsRepository is present locally, cloning if needed.
# Called before any operation on a persistent artifact type.
ensure_artifacts_repo() {
  if [[ -d "${ARTIFACTS_REPO}/.git" ]]; then
    return 0
  fi
  echo "artifact: cloning NexusArtifactsRepository to ${ARTIFACTS_REPO}..." >&2
  git clone "$ARTIFACTS_REPO_REMOTE" "$ARTIFACTS_REPO" >&2
}

# Return the store directory for a given type.
store_dir() {
  if is_persistent "$1"; then
    echo "${ARTIFACTS_REPO}/$1"
  else
    echo "${ARTIFACT_ROOT}/$1"
  fi
}

# --- commands ---------------------------------------------------------------

# list <type>
# Lists all artifacts of the given type, ordered by createdAt descending.
# Output columns: id  createdAt  type
cmd_list() {
  local type="$1"
  validate_type "$type"
  is_persistent "$type" && ensure_artifacts_repo
  local dir
  dir="$(store_dir "$type")"

  if [[ ! -d "$dir" ]] || [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
    echo "No artifacts of type '$type' found."
    exit 0
  fi

  # Collect id, createdAt, type from each artifact JSON, sort by createdAt desc.
  # We use a lightweight approach: extract fields with grep/sed to avoid
  # requiring jq as a dependency.
  local entries=()
  for f in "$dir"/*.json; do
    [[ -f "$f" ]] || continue
    local id created atype
    id=$(grep -m1 '"id"' "$f" | sed 's/.*"id" *: *"\([^"]*\)".*/\1/')
    created=$(grep -m1 '"createdAt"' "$f" | sed 's/.*"createdAt" *: *"\([^"]*\)".*/\1/')
    atype=$(grep -m1 '"type"' "$f" | sed 's/.*"type" *: *"\([^"]*\)".*/\1/')
    entries+=("${created}	${id}	${atype}")
  done

  # Sort descending by createdAt (first column), then print with header.
  printf "%-28s  %-28s  %s\n" "ID" "CREATED" "TYPE"
  printf '%s\n' "${entries[@]}" | sort -r | while IFS=$'\t' read -r created id atype; do
    printf "%-28s  %-28s  %s\n" "$id" "$created" "$atype"
  done
}

# show <type> <id>
# Displays the full JSON content of a single artifact.
cmd_show() {
  local type="$1" id="$2"
  validate_type "$type"
  is_persistent "$type" && ensure_artifacts_repo
  local file
  file="$(store_dir "$type")/${id}.json"

  if [[ ! -f "$file" ]]; then
    die "artifact not found: type='$type' id='$id'"
  fi

  cat "$file"
}

# latest <type>
# Displays the most recent artifact of a given type (by filename sort desc).
cmd_latest() {
  local type="$1"
  validate_type "$type"
  is_persistent "$type" && ensure_artifacts_repo
  local dir
  dir="$(store_dir "$type")"

  if [[ ! -d "$dir" ]] || [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
    die "no artifacts of type '$type' exist"
  fi

  # Filenames are ISO 8601 timestamps, so reverse-sorted ls gives most recent.
  local latest
  latest=$(ls -1 "$dir"/*.json 2>/dev/null | sort -r | head -1)

  if [[ -z "$latest" ]]; then
    die "no artifacts of type '$type' exist"
  fi

  cat "$latest"
}

# store
# Reads a JSON artifact from stdin, validates required fields, and writes it
# to the appropriate store directory based on its type field.
cmd_store() {
  local input
  input=$(cat)

  if [[ -z "$input" ]]; then
    die "store requires JSON input on stdin"
  fi

  # Extract required fields using grep/sed (no jq dependency).
  # Use || true to prevent set -e from aborting on missing fields.
  local atype id createdAt content
  atype=$(echo "$input" | grep -m1 '"type"' | sed 's/.*"type" *: *"\([^"]*\)".*/\1/' || true)
  id=$(echo "$input" | grep -m1 '"id"' | sed 's/.*"id" *: *"\([^"]*\)".*/\1/' || true)
  createdAt=$(echo "$input" | grep -m1 '"createdAt"' | sed 's/.*"createdAt" *: *"\([^"]*\)".*/\1/' || true)
  # For content, just check that the key exists (value can be any JSON).
  content=$(echo "$input" | grep '"content"' || true)

  # Validate all required fields are present and non-empty.
  [[ -n "$atype" ]]     || die "store: missing required field 'type'"
  [[ -n "$id" ]]        || die "store: missing required field 'id'"
  [[ -n "$createdAt" ]] || die "store: missing required field 'createdAt'"
  [[ -n "$content" ]]   || die "store: missing required field 'content'"

  # Validate that type is a known artifact type.
  validate_type "$atype"
  is_persistent "$atype" && ensure_artifacts_repo

  # Ensure the store directory exists.
  local dir
  dir="$(store_dir "$atype")"
  mkdir -p "$dir"

  # Write the artifact to the store.
  local file="${dir}/${id}.json"
  echo "$input" > "$file"

  echo "Stored artifact: type='$atype' id='$id' -> $file"

  # For persistent types, commit and push to the NexusArtifactsRepository.
  if is_persistent "$atype"; then
    git -C "$ARTIFACTS_REPO" add "$file"
    if ! git -C "$ARTIFACTS_REPO" diff --cached --quiet; then
      git -C "$ARTIFACTS_REPO" commit -m "artifact: store ${atype}/${id}"
      git -C "$ARTIFACTS_REPO" push
      echo "artifact: committed and pushed ${atype}/${id} to NexusArtifactsRepository"
    fi
  fi
}

# delete <type> <id>
# Deletes a single artifact by type and id.
# For staged-transcript, also removes the companion JSONL file if present.
cmd_delete() {
  local type="$1" id="$2"
  validate_type "$type"
  is_persistent "$type" && ensure_artifacts_repo
  local file
  file="$(store_dir "$type")/${id}.json"

  if [[ ! -f "$file" ]]; then
    die "artifact not found: type='$type' id='$id'"
  fi

  rm "$file"
  echo "Deleted artifact: type='$type' id='$id'"

  # For staged-transcript, also delete the companion JSONL if it exists.
  if [[ "$type" == "staged-transcript" ]]; then
    local jsonl_file
    jsonl_file="$(store_dir "$type")/${id}.jsonl"
    if [[ -f "$jsonl_file" ]]; then
      rm "$jsonl_file"
      echo "Deleted companion JSONL: ${id}.jsonl"
    fi
  fi

  # For persistent types, commit and push the removal to the NexusArtifactsRepository.
  if is_persistent "$type"; then
    git -C "$ARTIFACTS_REPO" add "$file"
    if ! git -C "$ARTIFACTS_REPO" diff --cached --quiet; then
      git -C "$ARTIFACTS_REPO" commit -m "artifact: delete ${type}/${id}"
      git -C "$ARTIFACTS_REPO" push
      echo "artifact: committed and pushed deletion of ${type}/${id} to NexusArtifactsRepository"
    fi
  fi
}

# --- dispatch ---------------------------------------------------------------

[[ $# -ge 1 ]] || usage

case "$1" in
  list)
    [[ $# -ge 2 ]] || die "list requires a type argument"
    cmd_list "$2"
    ;;
  show)
    [[ $# -ge 3 ]] || die "show requires type and id arguments"
    cmd_show "$2" "$3"
    ;;
  latest)
    [[ $# -ge 2 ]] || die "latest requires a type argument"
    cmd_latest "$2"
    ;;
  store)
    cmd_store
    ;;
  delete)
    [[ $# -ge 3 ]] || die "delete requires type and id arguments"
    cmd_delete "$2" "$3"
    ;;
  *)
    usage
    ;;
esac
