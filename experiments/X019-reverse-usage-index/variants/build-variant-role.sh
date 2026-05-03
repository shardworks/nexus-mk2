#!/usr/bin/env bash
# Compose the with-code-lookup variant of astrolabe.sage-primer-attended.
#
# Splices the code-lookup tool-preference snippet into a base
# sage-primer-attended.md role file, inserting it as a "## Tool
# preference" section right before the role's "## Tools" heading. The
# snippet's headings are demoted by one level so its title becomes a
# sibling of "## Tools" and its sub-sections become `###`.
#
# The base file is the upstream astrolabe sage-primer-attended.md
# (clean baseline — no X018 surface-map injection, after X018 was
# provisionally falsified on cache-write economics).
#
# Usage:
#   build-variant-role.sh \
#     --role <path-to-base-sage-primer-attended.md> \
#     --snippet <path-to-sage-tool-preference.md> \
#     --out <path-to-variant.md>
#
# All three flags required; all paths absolute. The snippet is the
# upstream code-lookup-apparatus role-prompt fragment.

set -euo pipefail

role=
snippet=
out=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role) role="$2"; shift 2 ;;
    --snippet) snippet="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$role" && -n "$snippet" && -n "$out" ]] || {
  echo "usage: $0 --role <md> --snippet <md> --out <md>" >&2
  exit 2
}
[[ -f "$role"    ]] || { echo "role not found: $role"       >&2; exit 2; }
[[ -f "$snippet" ]] || { echo "snippet not found: $snippet" >&2; exit 2; }

# Find the line number of the first "## Tools" heading. Inject before it.
tools_line=$(grep -n '^## Tools' "$role" | head -1 | cut -d: -f1)
[[ -n "$tools_line" ]] || { echo "could not find '## Tools' anchor in role" >&2; exit 1; }

# Lines 1..(tools_line - 1) — the role-file preamble (everything
# above the Tools section).
preamble_end=$((tools_line - 1))

# Compose: preamble → snippet (heading-demoted by 1 level) → ## Tools.
#
# The upstream snippet uses level-1 (`#`) for its title and level-2 (`##`)
# for sub-sections, suitable when shipped as a standalone role-prompt.
# Spliced into a role file whose top-level (`#`) is the role title, the
# snippet's headings need to drop one level so its title becomes a
# sibling of "## Tools" and its sub-sections become `###`.
{
  sed -n "1,${preamble_end}p" "$role"
  sed -E 's/^(#+)/&#/' "$snippet"
  printf '\n'
  sed -n "${tools_line},\$p" "$role"
} > "$out"

echo "wrote $out"
