#!/usr/bin/env bash
# Compose the with-surface-map variant of astrolabe.sage-primer-attended.
#
# Splices an "Orientation: Package Surface Map" section into the upstream
# role prompt right after the opening paragraphs (before "## Tools").
# The injected section carries the precomputed surface map for the codex
# SHA the trial pins to, plus a directive to consult the map for
# orientation before any grep/ls/Read traversal of the package tree.
#
# Usage:
#   build-variant-role.sh \
#     --role <path-to-upstream-sage-primer-attended.md> \
#     --map  <path-to-surface-map.json> \
#     --out  <path-to-variant.md>
#
# All three flags required; all paths absolute. The role file is taken
# from the upstream nexus repo at the same SHA the trial pins (or
# /workspace/nexus HEAD for live development).

set -euo pipefail

role=
map=
out=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role) role="$2"; shift 2 ;;
    --map)  map="$2";  shift 2 ;;
    --out)  out="$2";  shift 2 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$role" && -n "$map" && -n "$out" ]] || {
  echo "usage: $0 --role <md> --map <json> --out <md>" >&2
  exit 2
}
[[ -f "$role" ]] || { echo "role not found: $role" >&2; exit 2; }
[[ -f "$map"  ]] || { echo "map not found: $map"   >&2; exit 2; }

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

# Compact the JSON for token efficiency (one-line representation).
compact=$(mktemp)
trap 'rm -f "$tmp" "$compact"' EXIT
jq -c . "$map" > "$compact"

# Find the line number of the first "## Tools" heading. Inject before it.
tools_line=$(grep -n '^## Tools' "$role" | head -1 | cut -d: -f1)
[[ -n "$tools_line" ]] || { echo "could not find '## Tools' anchor in role" >&2; exit 1; }

# Lines 1..(tools_line - 1) — the preamble.
preamble_end=$((tools_line - 1))

{
  sed -n "1,${preamble_end}p" "$role"

  cat <<'INJECT_HEADER'
## Orientation: Package Surface Map

Below is a **precomputed package surface map** for this codex — every
package, every source file, and every exported symbol with its kind
(function, class, interface, type, const, etc.). It captures the
information you would otherwise gather by `ls`-walking the package
tree, opening `index.ts` / `types.ts` to learn what they export, and
running existence-check Greps for symbol names.

**Use the surface map FIRST for orientation.** Before reaching for
`Bash ls`, `Glob`, `Grep` for a name, or `Read` on `index.ts` /
`types.ts` to learn what a package exports — consult the map. The
map lists every package, every file, and every exported symbol
name + kind in this codex.

**The map is not a substitute for reading code.** It carries
**no signatures, no JSDoc, no implementation detail**. When you need
the actual signature of a function, the body of an interface, the
shape of a type, or any semantic detail beyond name and kind — read
the file. The map is for orientation; reads are for comprehension.

**The map is generated against this exact codex SHA.** It is
authoritative for what exists. If your reading reveals a divergence
between the map and the actual code, treat that as a bug and surface
it — but otherwise, trust the map.

```json
INJECT_HEADER

  cat "$compact"

  cat <<'INJECT_FOOTER'
```

INJECT_FOOTER

  sed -n "${tools_line},\$p" "$role"
} > "$tmp"

mv "$tmp" "$out"
trap - EXIT

bytes=$(wc -c < "$out")
lines=$(wc -l < "$out")
printf 'wrote %s\n  bytes: %d\n  lines: %d\n' "$out" "$bytes" "$lines"
