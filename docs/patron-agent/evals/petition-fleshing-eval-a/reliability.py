#!/usr/bin/env python3
"""
Reliability extraction across eval-a reps.

For each (brief, agent, rep), scans the output for signature patterns that
indicate the key "reframe" or "move" we observed in rep-1. Produces a matrix
showing whether each agent produces the move in each rep.

Patterns per brief aim to capture the *semantic move*, not just principle
citations — so a flesh output that makes the move without citing the number
still counts, and a baseline output that happens to make the move also counts.
That way we can distinguish "principles reliably fire" from "Opus sometimes
makes this move anyway."

Output: markdown table to stdout.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPS = ["1", "2", "3"]
AGENTS = ["patron-flesh", "patron-baseline"]

# Per-brief signature patterns.
# Each brief has one or more patterns; a match on ANY pattern counts as "the move fired."
# Patterns are case-insensitive regex, matched against the full output text.
SIGNATURES: dict[str, dict[str, list[str]]] = {
    "cli-flag-edit": {
        "label": "complete-the-set — widen beyond just --title",
        "patterns": [
            r"complete the set",
            r"all\s+(user-?)?editable",
            r"audit\s+(the\s+)?(user-?)?editable",
            r"sibling(s)?\s+(flag|operation|field)",
            r"coherent set",
            r"#\s*36\b",
        ],
    },
    "plugin-writ-types": {
        "label": "fail-loud on plugin-vs-plugin id collision",
        "patterns": [
            # Require collision + error-verb adjacency to avoid false positives
            # from deferred-questions sections that ask "fail loud vs let it crash?"
            r"(throw|fail|error).{0,60}(collision|duplicate|conflict)",
            r"(collision|duplicate|conflict).{0,60}(throw|fail|error)",
            r"both plugin ids named",
            r"no\s+silent\s+(shadowing|fallback)",
        ],
    },
    "writs-page-width": {
        "label": "(tie expected — no strong reframe)",
        "patterns": [
            r"separate conformance",
            r"not.*sweep.*other",
            r"follow-?up\s+petition",
        ],
    },
    "engine-refresh-bug": {
        "label": "widen to sibling surfaces / fix the source",
        "patterns": [
            r"sibling.*(refresh|polling|render|view)",
            r"shared.*(polling|refresh|render)\s+helper",
            r"fix\s+(it\s+)?once",
            r"fix\s+the\s+source",
            r"treating the symptom",
            r"#\s*31\b",
        ],
    },
    "session-viewing": {
        "label": "extend spider, not new page / one streaming bug",
        "patterns": [
            r"(extend|grow)\s+the\s+spider",
            r"new\s+page.*(wrong|misframed|speculation)",
            r"one\s+(bug|fix).*two\s+surfaces",
            r"misframed",
            r"reframe",
            r"#\s*26\b",
        ],
    },
    "running-rig-view": {
        "label": "content-bearing loading + fail-loud on disconnect",
        "patterns": [
            r"content-?bearing",
            r"fail\s+loud",
            r"don'?t\s+silently",
            r"#\s*41\b",
        ],
    },
    "session-provider": {
        "label": "engine produces its own yields / pull on resume",
        "patterns": [
            r"engine\s+produces",
            r"pull\s+on\s+resume",
            r"(book|row)\s+is\s+(the\s+)?truth",
            r"don'?t\s+pass.*what\s+.*produces",
            r"engine\s+does\s+not\s+receive",
            r"#\s*16\b",
        ],
    },
    "ghost-config": {
        "label": "reject-the-framing — delete now, not after retirement",
        "patterns": [
            r"reject(ing)?\s+(the\s+)?(that\s+)?framing",
            r"delete\s+(it\s+)?now",
            r"two\s+deletions\s+are\s+independent",
            r"independent.*delet",
            r"don'?t\s+wait",
            r"#\s*39\b",
        ],
    },
}

BRIEF_ORDER = [
    "cli-flag-edit",
    "plugin-writ-types",
    "writs-page-width",
    "engine-refresh-bug",
    "session-viewing",
    "running-rig-view",
    "session-provider",
    "ghost-config",
]


def check_patterns(text: str, patterns: list[str]) -> tuple[bool, list[str]]:
    """Return (any_match, list_of_matched_patterns)."""
    matched = []
    for p in patterns:
        if re.search(p, text, flags=re.IGNORECASE):
            matched.append(p)
    return (len(matched) > 0, matched)


def count_principle_citations(text: str) -> int:
    """Count inline principle citations like (#23) or #36."""
    return len(re.findall(r"#\s*\d+\b", text))


def main() -> int:
    # Gather all outputs into a nested dict: [brief][agent][rep] = (fired, char_count, citation_count)
    results: dict = {}
    for brief in BRIEF_ORDER:
        results[brief] = {}
        sig = SIGNATURES[brief]
        for agent in AGENTS:
            results[brief][agent] = {}
            for rep in REPS:
                path = ROOT / "reps" / rep / agent / f"{brief}.md"
                if not path.exists():
                    results[brief][agent][rep] = None
                    continue
                text = path.read_text()
                fired, matched = check_patterns(text, sig["patterns"])
                cites = count_principle_citations(text)
                results[brief][agent][rep] = {
                    "fired": fired,
                    "chars": len(text),
                    "cites": cites,
                    "matched": matched,
                }

    # Render markdown report.
    print("# Eval A — Reliability Report (n=3)\n")
    print("Signature-pattern match across 3 reps per (brief × agent). ")
    print("A ✓ means the rep's output contained at least one phrase capturing the key semantic move we observed in rep-1.\n")
    print("**How to read:** flesh `3/3` on a row means the principle fires reliably. ")
    print("Baseline `0/3` on the same row means baseline never made the move. ")
    print("Baseline `2/3` would mean Opus sometimes makes the move unprompted, which narrows the principle's credit.\n")

    print("| brief | signature move | flesh | baseline |")
    print("|---|---|:---:|:---:|")
    for brief in BRIEF_ORDER:
        sig = SIGNATURES[brief]
        flesh_fires = sum(1 for r in REPS if results[brief]["patron-flesh"].get(r) and results[brief]["patron-flesh"][r]["fired"])
        base_fires = sum(1 for r in REPS if results[brief]["patron-baseline"].get(r) and results[brief]["patron-baseline"][r]["fired"])
        # Render ● ● ○ style for visual speed-read
        def dots(agent: str) -> str:
            out = []
            for r in REPS:
                d = results[brief][agent].get(r)
                if d is None:
                    out.append("—")
                elif d["fired"]:
                    out.append("●")
                else:
                    out.append("○")
            return " ".join(out) + f"  ({sum(1 for r in REPS if results[brief][agent].get(r) and results[brief][agent][r]['fired'])}/3)"

        print(f"| {brief} | {sig['label']} | {dots('patron-flesh')} | {dots('patron-baseline')} |")

    # Secondary: principle citation density (flesh only).
    print("\n## Principle citation density (flesh only)\n")
    print("Count of inline `#N` citations per rep. Stable density suggests principles are being applied, not just randomly invoked.\n")
    print("| brief | rep-1 cites | rep-2 cites | rep-3 cites |")
    print("|---|:---:|:---:|:---:|")
    for brief in BRIEF_ORDER:
        cells = []
        for r in REPS:
            d = results[brief]["patron-flesh"].get(r)
            cells.append(str(d["cites"]) if d else "—")
        print(f"| {brief} | {' | '.join(cells)} |")

    # Character count stability.
    print("\n## Character count per rep\n")
    print("| brief | flesh 1 | flesh 2 | flesh 3 | baseline 1 | baseline 2 | baseline 3 |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    for brief in BRIEF_ORDER:
        def cc(agent: str, r: str) -> str:
            d = results[brief][agent].get(r)
            return str(d["chars"]) if d else "—"
        print(f"| {brief} | {cc('patron-flesh', '1')} | {cc('patron-flesh', '2')} | {cc('patron-flesh', '3')} | {cc('patron-baseline', '1')} | {cc('patron-baseline', '2')} | {cc('patron-baseline', '3')} |")

    # Pattern-match details — which specific phrases fired.
    print("\n## Match details\n")
    print("Which signature phrases matched per (brief × agent × rep). Helps sanity-check whether the pattern captured the real move or a lexical coincidence.\n")
    for brief in BRIEF_ORDER:
        sig = SIGNATURES[brief]
        print(f"\n### {brief} — _{sig['label']}_\n")
        print(f"Patterns: `{' | '.join(sig['patterns'])}`\n")
        print("| agent | rep-1 | rep-2 | rep-3 |")
        print("|---|---|---|---|")
        for agent in AGENTS:
            cells = [agent]
            for r in REPS:
                d = results[brief][agent].get(r)
                if d is None:
                    cells.append("—")
                elif not d["fired"]:
                    cells.append("—")
                else:
                    matched = d["matched"][:2]  # show at most 2
                    cells.append(", ".join(f"`{m[:40]}`" for m in matched))
            print("| " + " | ".join(cells) + " |")

    return 0


if __name__ == "__main__":
    sys.exit(main())
