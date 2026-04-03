#!/usr/bin/env bash
# api-surface.sh — Extract the full codebase API surface as .d.ts declarations.
#
# Clones the repo at the base commit, runs a best-effort declaration emit
# (--emitDeclarationOnly --skipLibCheck, tolerating type errors), and
# concatenates all .d.ts files with path headers.
#
# Caches results by commit SHA in .cache/api-surface/{sha}/ to avoid
# rebuilding for the same base commit.
#
# Falls back to raw index.ts/barrel files if tsc is unavailable or the
# build produces no declarations.

set -euo pipefail

REPO="$INSTRUMENT_REPO"
CTX="$INSTRUMENT_CONTEXT_DIR"
BASE=$(cat "$CTX/base_commit")

# Resolve full SHA for cache key
FULL_SHA=$(git -C "$REPO" rev-parse "$BASE" 2>/dev/null || echo "$BASE")

# ── Cache check ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.cache/api-surface/$FULL_SHA"

if [[ -f "$CACHE_DIR/api-surface.txt" ]]; then
  cat "$CACHE_DIR/api-surface.txt"
  exit 0
fi

# ── Clone and build declarations ──────────────────────────────
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Cloning at $BASE for API surface extraction..." >&2
git clone --quiet "$REPO" "$WORK_DIR/repo" 2>&1 >&2
cd "$WORK_DIR/repo"
git checkout --quiet "$FULL_SHA" 2>&1 >&2

# Install deps
if [[ -f "pnpm-lock.yaml" ]]; then
  pnpm install --frozen-lockfile 2>&1 >&2 || pnpm install 2>&1 >&2 || true
elif [[ -f "package-lock.json" ]]; then
  npm ci 2>&1 >&2 || npm install 2>&1 >&2 || true
fi

# Best-effort declaration emit — ignore type errors, skip dependency checks
DECL_COUNT=0
OUTPUT_FILE="$WORK_DIR/api-surface.txt"
touch "$OUTPUT_FILE"

# Run tsc per-package (monorepo with project references)
for pkg_tsconfig in packages/*/*/tsconfig.json; do
  [[ -f "$pkg_tsconfig" ]] || continue
  pkg_dir=$(dirname "$pkg_tsconfig")

  # Emit declarations, tolerating errors
  npx tsc -p "$pkg_tsconfig" \
    --declaration \
    --emitDeclarationOnly \
    --skipLibCheck \
    2>/dev/null || true
done

# Collect all .d.ts files
while IFS= read -r dts_file; do
  [[ -z "$dts_file" ]] && continue
  # Make path relative to repo root
  rel_path="${dts_file#./}"
  echo "=== ${rel_path} ===" >> "$OUTPUT_FILE"
  cat "$dts_file" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  DECL_COUNT=$((DECL_COUNT + 1))
done < <(find . -path '*/dist/*.d.ts' ! -name '*.d.ts.map' ! -path '*/node_modules/*' 2>/dev/null | sort)

# ── Fallback: barrel files if no declarations ────────────────
if [[ "$DECL_COUNT" -eq 0 ]]; then
  echo "No .d.ts files emitted, falling back to index.ts barrel files..." >&2
  while IFS= read -r idx_file; do
    [[ -z "$idx_file" ]] && continue
    rel_path="${idx_file#./}"
    echo "=== ${rel_path} (source barrel — no declarations available) ===" >> "$OUTPUT_FILE"
    cat "$idx_file" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    DECL_COUNT=$((DECL_COUNT + 1))
  done < <(find ./packages -name 'index.ts' ! -path '*/node_modules/*' ! -path '*/dist/*' 2>/dev/null | sort)
fi

echo "API surface: $DECL_COUNT files extracted" >&2

# ── Cache the result ─────────────────────────────────────────
mkdir -p "$CACHE_DIR"
cp "$OUTPUT_FILE" "$CACHE_DIR/api-surface.txt"

# Output
cat "$OUTPUT_FILE"
