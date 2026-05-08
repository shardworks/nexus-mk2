#!/usr/bin/env python3
"""
extract-tool-use-metrics.py — per-trial implementer tool-use analysis for X022.

Computes the five mechanism-evidence metrics for the X022 nudges:
  #8  Bash bulk edits        → Bash / (Bash+Edit+MultiEdit) ratio
  #9  Targeted Reads         → fraction of Reads carrying offset/limit
  #10 Repeat-grep avoidance  → unique Grep patterns / total Grep calls
  #11 Narrow test filters    → `pnpm --filter` count / `pnpm -w test` count
  #12 No re-test of unchanged packages → full-workspace `pnpm -w test` count

Usage:
    extract-tool-use-metrics.py [--writ w-... [--writ ...]]
                                [--extract-dir DIR]
                                [--out FILE]

Discovery:
- For each writ, reads its trial extract's stacks-export/animator-sessions.json
  and pulls the providerSessionId.
- Locates the transcript jsonl by scanning ~/.claude/projects/*/{providerSessionId}.jsonl.

Output:
- Per-trial JSON to --out (or stdout): one row per writ with raw counts +
  computed ratios + cell label.
- A printed summary table to stderr with cell means and deltas vs baseline.

Memory: streams one JSONL event at a time.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterator

TRANSCRIPT_ROOT = Path.home() / ".claude" / "projects"
DEFAULT_EXTRACT_DIR = Path(
    "/workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/"
    "artifacts/2026-05-08-trials-2-7-extracts"
)

# Per-writ extract path overrides for non-standard layouts (e.g. trial 1's
# xguild-era 2026-05-03-trial-1-results/extracted/ shape). Each value is the
# directory containing stacks-export/animator-sessions.json.
WRIT_EXTRACT_OVERRIDES: dict[str, Path] = {
    "w-mopuwdsp": Path(
        "/workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/"
        "artifacts/2026-05-03-trial-1-results/extracted"
    ),
}

# Default writ → cell mapping for X022 (extend as new trials land).
WRIT_CELLS: dict[str, str] = {
    # Trial 1 baseline (xguild doctype) — different extraction path
    "w-mopuwdsp": "substantive-baseline",
    # Variant chain (claude-direct)
    "w-mowe5lsl": "substantive-combined",
    "w-mowe93t2": "substantive-combined",
    "w-mowe9ane": "substantive-combined",
    "w-mowe90mm": "control-combined",
    "w-mowe97r2": "control-combined",
    "w-mowe9dm5": "control-combined",
    # Baseline-firming chain (claude-direct, posted 2026-05-08)
    "w-mowr4jq1": "substantive-baseline",
    "w-mowr4mri": "substantive-baseline",
}


@dataclass
class ToolUseStats:
    writ_id: str
    cell: str
    provider_session_id: str | None = None
    transcript_path: str | None = None
    total_events: int = 0

    # Raw tool counts.
    bash_count: int = 0
    edit_count: int = 0
    multiedit_count: int = 0
    read_count: int = 0
    grep_count: int = 0
    write_count: int = 0
    todowrite_count: int = 0
    glob_count: int = 0
    other_tool_count: int = 0

    # Read substructure.
    read_targeted_count: int = 0  # Read with offset or limit
    read_full_count: int = 0
    read_after_grep_count: int = 0  # Read whose immediately preceding tool call was Grep

    # Grep substructure.
    unique_grep_patterns: int = 0
    repeat_grep_calls: int = 0  # patterns appearing ≥2 times (sum of (count - 1))

    # Bash substructure (filtered test discipline).
    bash_pnpm_workspace_test: int = 0  # `pnpm -w test`, `pnpm test`, `pnpm -r test`
    bash_pnpm_filter_test: int = 0  # `pnpm --filter ... test`
    bash_pnpm_typecheck: int = 0
    bash_sed_in_place: int = 0  # `sed -i` for bulk edits
    bash_git: int = 0
    bash_grep: int = 0  # `grep` invoked inside Bash (search via shell vs Grep tool)
    bash_other: int = 0

    @property
    def edit_total(self) -> int:
        return self.edit_count + self.multiedit_count

    @property
    def bash_vs_edit_ratio(self) -> float:
        denom = self.bash_count + self.edit_total
        return (self.bash_count / denom) if denom else 0.0

    @property
    def targeted_read_fraction(self) -> float:
        return (self.read_targeted_count / self.read_count) if self.read_count else 0.0

    @property
    def grep_uniqueness(self) -> float:
        return (self.unique_grep_patterns / self.grep_count) if self.grep_count else 0.0

    @property
    def filter_test_share(self) -> float:
        denom = self.bash_pnpm_filter_test + self.bash_pnpm_workspace_test
        return (self.bash_pnpm_filter_test / denom) if denom else 0.0

    @property
    def total_searches(self) -> int:
        """Aggregate search activity: Grep tool + grep-via-Bash."""
        return self.grep_count + self.bash_grep


def find_transcript(provider_session_id: str) -> Path | None:
    """Locate the transcript jsonl for a given session uuid by scanning."""
    if not provider_session_id:
        return None
    matches = list(TRANSCRIPT_ROOT.rglob(f"{provider_session_id}.jsonl"))
    if not matches:
        return None
    if len(matches) > 1:
        print(
            f"  warning: multiple transcripts for {provider_session_id}, using first",
            file=sys.stderr,
        )
    return matches[0]


def _writ_extract_dir(writ_id: str, extract_dir: Path) -> Path:
    if writ_id in WRIT_EXTRACT_OVERRIDES:
        return WRIT_EXTRACT_OVERRIDES[writ_id]
    return extract_dir / writ_id


def find_implement_session(
    writ_id: str, extract_dir: Path
) -> tuple[str | None, str | None]:
    """Return (lab_session_id, providerSessionId) for the implement engine.

    Returns (None, None) if not locatable.
    """
    sessions_path = _writ_extract_dir(writ_id, extract_dir) / "stacks-export" / "animator-sessions.json"
    if not sessions_path.exists():
        return None, None
    with sessions_path.open() as f:
        sessions = json.load(f)
    impl = None
    for s in sessions:
        if s.get("metadata", {}).get("engineId") == "implement":
            impl = s
            break
    if impl is None and sessions:
        impl = sessions[0]
    if impl is None:
        return None, None
    return impl.get("id"), impl.get("providerSessionId")


def _yield_tool_uses_from_event(e: dict) -> Iterator[tuple[str, dict]]:
    if e.get("type") != "assistant":
        return
    content = e.get("message", {}).get("content", [])
    if not isinstance(content, list):
        return
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            yield block.get("name", "?"), block.get("input", {})


def stream_tool_uses(
    transcript_path: Path,
) -> Iterator[tuple[str, dict]]:
    """Yield (tool_name, tool_input) for every tool_use event in the transcript."""
    with transcript_path.open() as f:
        for line in f:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            yield from _yield_tool_uses_from_event(e)


def stream_tool_uses_from_xguild_book(
    book_path: Path, session_id: str
) -> Iterator[tuple[str, dict]]:
    """Fallback path for xguild trials: read animator-transcripts.json book.

    Each row is `{ id: ses-..., messages: [...] }`. Messages share the same
    schema as ~/.claude/projects/*.jsonl events.
    """
    with book_path.open() as f:
        rows = json.load(f)
    for row in rows:
        if row.get("id") == session_id:
            for msg in row.get("messages", []):
                yield from _yield_tool_uses_from_event(msg)
            return


_GREP_RE = __import__("re").compile(r"(^|[\s|;&])grep\b")


def classify_bash(cmd: str) -> str:
    """Bucket a Bash command for #11/#12 mechanism analysis."""
    c = (cmd or "").strip()
    cl = c.lower()
    # Workspace-wide test invocations: `pnpm -w test`, `pnpm test`, `pnpm -r test`.
    # Be conservative — `pnpm test` at workspace root is workspace-wide.
    if (
        "pnpm -w test" in cl
        or "pnpm -r test" in cl
        or (cl.startswith("pnpm test") and "--filter" not in cl)
    ):
        return "pnpm_workspace_test"
    if "pnpm --filter" in cl and " test" in cl:
        return "pnpm_filter_test"
    if "typecheck" in cl and "pnpm" in cl:
        return "pnpm_typecheck"
    if cl.startswith("sed -i") or " sed -i" in cl:
        return "sed_in_place"
    if cl.startswith("git ") or " git " in cl[:10]:
        return "git"
    if _GREP_RE.search(c):
        return "grep"
    return "other"


def analyze_writ(writ_id: str, cell: str, extract_dir: Path) -> ToolUseStats:
    stats = ToolUseStats(writ_id=writ_id, cell=cell)
    lab_sid, psid = find_implement_session(writ_id, extract_dir)
    stats.provider_session_id = psid
    if psid is None and lab_sid is None:
        print(f"  {writ_id}: no implement session in extract", file=sys.stderr)
        return stats

    # Prefer the live ~/.claude/projects/ jsonl (claude-direct path).
    tpath = find_transcript(psid) if psid else None

    # Fallback: xguild trials captured the transcript into the lab guild's
    # animator-transcripts.json book. Use the lab session id as the row key.
    book_path = _writ_extract_dir(writ_id, extract_dir) / "stacks-export" / "animator-transcripts.json"
    use_book = tpath is None and lab_sid is not None and book_path.exists()

    if tpath is not None:
        stats.transcript_path = str(tpath)
        events = stream_tool_uses(tpath)
    elif use_book:
        stats.transcript_path = f"{book_path}#{lab_sid}"
        events = stream_tool_uses_from_xguild_book(book_path, lab_sid)
    else:
        print(
            f"  {writ_id}: transcript not found (psid={psid}, lab_sid={lab_sid})",
            file=sys.stderr,
        )
        return stats

    grep_patterns: list[str] = []
    last_tool: str | None = None

    for tool_name, tool_input in events:
        stats.total_events += 1

        if tool_name == "Bash":
            stats.bash_count += 1
            bucket = classify_bash(tool_input.get("command", ""))
            if bucket == "pnpm_workspace_test":
                stats.bash_pnpm_workspace_test += 1
            elif bucket == "pnpm_filter_test":
                stats.bash_pnpm_filter_test += 1
            elif bucket == "pnpm_typecheck":
                stats.bash_pnpm_typecheck += 1
            elif bucket == "sed_in_place":
                stats.bash_sed_in_place += 1
            elif bucket == "git":
                stats.bash_git += 1
            elif bucket == "grep":
                stats.bash_grep += 1
            else:
                stats.bash_other += 1
        elif tool_name == "Edit":
            stats.edit_count += 1
        elif tool_name == "MultiEdit":
            stats.multiedit_count += 1
        elif tool_name == "Read":
            stats.read_count += 1
            if tool_input.get("offset") is not None or tool_input.get("limit") is not None:
                stats.read_targeted_count += 1
            else:
                stats.read_full_count += 1
            if last_tool == "Grep":
                stats.read_after_grep_count += 1
        elif tool_name == "Grep":
            stats.grep_count += 1
            grep_patterns.append(tool_input.get("pattern", ""))
        elif tool_name == "Write":
            stats.write_count += 1
        elif tool_name == "TodoWrite":
            stats.todowrite_count += 1
        elif tool_name == "Glob":
            stats.glob_count += 1
        else:
            stats.other_tool_count += 1

        last_tool = tool_name

    # Grep uniqueness.
    seen: dict[str, int] = {}
    for p in grep_patterns:
        seen[p] = seen.get(p, 0) + 1
    stats.unique_grep_patterns = len(seen)
    stats.repeat_grep_calls = sum(c - 1 for c in seen.values() if c > 1)

    return stats


def aggregate_by_cell(rows: list[ToolUseStats]) -> dict[str, dict]:
    """Compute per-cell means for the headline metrics."""
    cells: dict[str, list[ToolUseStats]] = {}
    for r in rows:
        cells.setdefault(r.cell, []).append(r)

    summary: dict[str, dict] = {}
    for cell, items in cells.items():
        n = len(items)
        if n == 0:
            continue
        summary[cell] = {
            "n": n,
            "bash_count_mean": sum(i.bash_count for i in items) / n,
            "edit_total_mean": sum(i.edit_total for i in items) / n,
            "read_count_mean": sum(i.read_count for i in items) / n,
            "grep_count_mean": sum(i.grep_count for i in items) / n,
            "bash_grep_mean": sum(i.bash_grep for i in items) / n,
            "total_searches_mean": sum(i.total_searches for i in items) / n,
            "bash_vs_edit_ratio_mean": sum(i.bash_vs_edit_ratio for i in items) / n,
            "targeted_read_fraction_mean": sum(i.targeted_read_fraction for i in items) / n,
            "read_after_grep_count_mean": sum(i.read_after_grep_count for i in items) / n,
            "grep_uniqueness_mean": sum(i.grep_uniqueness for i in items) / n,
            "repeat_grep_calls_mean": sum(i.repeat_grep_calls for i in items) / n,
            "pnpm_workspace_test_mean": sum(i.bash_pnpm_workspace_test for i in items) / n,
            "pnpm_filter_test_mean": sum(i.bash_pnpm_filter_test for i in items) / n,
            "filter_test_share_mean": sum(i.filter_test_share for i in items) / n,
            "sed_in_place_mean": sum(i.bash_sed_in_place for i in items) / n,
        }
    return summary


def print_summary_table(summary: dict[str, dict], file=sys.stderr) -> None:
    """Pretty-print cell summary with deltas vs substantive-baseline."""
    if not summary:
        print("(no cells)", file=file)
        return
    rows = list(summary.items())
    # Order: substantive-baseline first, then substantive-combined, then control cells.
    order_key = {
        "substantive-baseline": 0,
        "substantive-combined": 1,
        "control-baseline": 2,
        "control-combined": 3,
    }
    rows.sort(key=lambda kv: order_key.get(kv[0], 99))

    cols = [
        ("bash_count_mean", "Bash"),
        ("edit_total_mean", "Edit*"),
        ("bash_vs_edit_ratio_mean", "B/E"),
        ("read_count_mean", "Read"),
        ("targeted_read_fraction_mean", "Tgt%"),
        ("read_after_grep_count_mean", "R←G"),
        ("grep_count_mean", "Grep"),
        ("bash_grep_mean", "bGrp"),
        ("total_searches_mean", "Srch"),
        ("grep_uniqueness_mean", "Uniq"),
        ("repeat_grep_calls_mean", "RptG"),
        ("pnpm_workspace_test_mean", "WSt"),
        ("pnpm_filter_test_mean", "FlSt"),
        ("filter_test_share_mean", "Fl%"),
        ("sed_in_place_mean", "sed-i"),
    ]

    print("\nCell summary (means across n):", file=file)
    header = f"  {'cell':<24s} {'n':>3s} " + " ".join(f"{lbl:>6s}" for _, lbl in cols)
    print(header, file=file)
    print("  " + "-" * (len(header) - 2), file=file)
    for cell, vals in rows:
        line = f"  {cell:<24s} {vals['n']:>3d} "
        for key, _ in cols:
            v = vals.get(key, 0)
            if "ratio" in key or "fraction" in key or "share" in key or "uniqueness" in key:
                line += f" {v:>5.2f} "
            else:
                line += f" {v:>5.1f} "
        print(line, file=file)

    # Delta vs substantive-baseline if both present.
    base = summary.get("substantive-baseline")
    var = summary.get("substantive-combined")
    if base and var:
        print("\nSubstantive variant Δ vs baseline:", file=file)
        for key, lbl in cols:
            b = base.get(key, 0)
            v = var.get(key, 0)
            if b == 0 and v == 0:
                continue
            delta_abs = v - b
            pct = (delta_abs / b * 100) if b else float("inf")
            print(
                f"  {lbl:>6s}  baseline={b:>7.2f}  variant={v:>7.2f}  Δ={delta_abs:+.2f} ({pct:+.1f}%)",
                file=file,
            )


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--writ",
        action="append",
        help="Writ id to analyze (repeatable). Defaults to the X022 trial set.",
    )
    p.add_argument(
        "--extract-dir",
        type=Path,
        default=DEFAULT_EXTRACT_DIR,
        help="Trial extract parent dir (default: %(default)s).",
    )
    p.add_argument(
        "--out",
        type=Path,
        help="Write per-trial JSON to this path (default: stdout).",
    )
    args = p.parse_args(argv)

    # Default to all writs whose extract is locatable (variant chain in
    # DEFAULT_EXTRACT_DIR, plus any with explicit overrides).
    def _has_extract(w: str) -> bool:
        if w in WRIT_EXTRACT_OVERRIDES:
            return (
                WRIT_EXTRACT_OVERRIDES[w] / "stacks-export" / "animator-sessions.json"
            ).exists()
        return (args.extract_dir / w / "stacks-export" / "animator-sessions.json").exists()

    writs: list[str] = args.writ or [w for w in WRIT_CELLS if _has_extract(w)]
    if not writs:
        print("no writs to analyze", file=sys.stderr)
        return 1

    rows: list[ToolUseStats] = []
    for w in writs:
        cell = WRIT_CELLS.get(w, "unknown")
        print(f"analyzing {w} ({cell})...", file=sys.stderr)
        rows.append(analyze_writ(w, cell, args.extract_dir))

    out_data = {
        "trials": [asdict(r) for r in rows],
        "by_cell": aggregate_by_cell(rows),
    }

    sink = args.out.open("w") if args.out else sys.stdout
    json.dump(out_data, sink, indent=2, default=str)
    if args.out:
        sink.close()
        print(f"wrote {args.out}", file=sys.stderr)

    print_summary_table(out_data["by_cell"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
