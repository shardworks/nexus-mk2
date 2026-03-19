#!/usr/bin/env bash

# Feature locking utility for the Builder.
#
# Provides filesystem-based mutual exclusion at the Feature level.
# Uses atomic `mkdir` to prevent race conditions between concurrent
# Builder instances. Stale locks (older than LOCK_TTL_SECONDS) are
# automatically broken to recover from crashed builders.
#
# Usage:
#   feature-lock.sh acquire <feature-id>   # exits 0 if acquired, 1 if held
#   feature-lock.sh release <feature-id>   # releases the lock
#   feature-lock.sh check   <feature-id>   # exits 0 if locked, 1 if free
#   feature-lock.sh list                   # lists currently locked features

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_DIR="$PROJECT_ROOT/.locks/features"

# Locks older than this are considered stale and will be broken.
LOCK_TTL_SECONDS="${LOCK_TTL_SECONDS:-600}"  # 10 minutes

mkdir -p "$LOCK_DIR"

# ─── Helpers ───────────────────────────────────────────────

lock_path() {
  echo "$LOCK_DIR/$1.lock"
}

lock_info_path() {
  echo "$LOCK_DIR/$1.info"
}

now_epoch() {
  date +%s
}

is_stale() {
  local info_file="$1"
  if [[ ! -f "$info_file" ]]; then
    # No info file means we can't verify freshness — treat as stale.
    return 0
  fi
  local created_at
  created_at="$(grep -o '"createdAt":[0-9]*' "$info_file" | cut -d: -f2)"
  if [[ -z "$created_at" ]]; then
    return 0
  fi
  local age=$(( $(now_epoch) - created_at ))
  [[ "$age" -gt "$LOCK_TTL_SECONDS" ]]
}

# ─── Commands ──────────────────────────────────────────────

cmd_acquire() {
  local feature_id="$1"
  local lpath
  lpath="$(lock_path "$feature_id")"
  local ipath
  ipath="$(lock_info_path "$feature_id")"

  # Check for stale lock and break it.
  if [[ -d "$lpath" ]] && is_stale "$ipath"; then
    echo "[feature-lock] Breaking stale lock on feature '$feature_id'."
    rm -rf "$lpath" "$ipath"
  fi

  # Atomic lock acquisition via mkdir.
  if mkdir "$lpath" 2>/dev/null; then
    # Write lock metadata.
    cat > "$ipath" <<EOF
{"featureId":"$feature_id","createdAt":$(now_epoch),"pid":$$}
EOF
    echo "[feature-lock] Acquired lock on feature '$feature_id'."
    exit 0
  else
    echo "[feature-lock] Feature '$feature_id' is locked by another builder."
    exit 1
  fi
}

cmd_release() {
  local feature_id="$1"
  local lpath
  lpath="$(lock_path "$feature_id")"
  local ipath
  ipath="$(lock_info_path "$feature_id")"

  if [[ -d "$lpath" ]]; then
    rm -rf "$lpath" "$ipath"
    echo "[feature-lock] Released lock on feature '$feature_id'."
  else
    echo "[feature-lock] No lock held on feature '$feature_id'."
  fi
}

cmd_check() {
  local feature_id="$1"
  local lpath
  lpath="$(lock_path "$feature_id")"
  local ipath
  ipath="$(lock_info_path "$feature_id")"

  # Check for stale lock.
  if [[ -d "$lpath" ]] && is_stale "$ipath"; then
    echo "[feature-lock] Lock on '$feature_id' is stale."
    exit 1  # Treat as free.
  fi

  if [[ -d "$lpath" ]]; then
    echo "[feature-lock] Feature '$feature_id' is locked."
    exit 0
  else
    echo "[feature-lock] Feature '$feature_id' is free."
    exit 1
  fi
}

cmd_list() {
  local found=false
  for lpath in "$LOCK_DIR"/*.lock; do
    [[ -d "$lpath" ]] || continue
    local feature_id
    feature_id="$(basename "$lpath" .lock)"
    local ipath
    ipath="$(lock_info_path "$feature_id")"

    # Skip stale locks.
    if is_stale "$ipath"; then
      continue
    fi

    echo "$feature_id"
    found=true
  done

  if [[ "$found" == "false" ]]; then
    echo "(no features currently locked)"
  fi
}

# ─── Main ──────────────────────────────────────────────────

usage() {
  echo "Usage: $(basename "$0") <command> [<feature-id>]"
  echo ""
  echo "Commands:"
  echo "  acquire <feature-id>   Acquire a lock (exit 0=acquired, 1=held)"
  echo "  release <feature-id>   Release a lock"
  echo "  check   <feature-id>   Check if locked (exit 0=locked, 1=free)"
  echo "  list                   List currently locked features"
  exit 1
}

if [[ $# -lt 1 ]]; then
  usage
fi

command="$1"
shift

case "$command" in
  acquire)
    [[ $# -ge 1 ]] || usage
    cmd_acquire "$1"
    ;;
  release)
    [[ $# -ge 1 ]] || usage
    cmd_release "$1"
    ;;
  check)
    [[ $# -ge 1 ]] || usage
    cmd_check "$1"
    ;;
  list)
    cmd_list
    ;;
  *)
    usage
    ;;
esac
