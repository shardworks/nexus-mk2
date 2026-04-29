#!/usr/bin/env python3
"""H4c orientation-tax analyzer.

Measures, for each implementer transcript, how much of the session is
spent "orienting" before productive work begins. Definition:
"orientation phase" = turns from session start up to (but not including)
the first Edit/Write/file-modifying-Bash call.

The output approximates what a fresh handoff session would have to pay
(in turns and cache-reads) before producing artifact-level work — i.e.,
the per-fresh-session tax that decomposed sessions in X010 H1 paid 6
times for Rig 2 and 5 times for Rig 1.

Comparable across:
  - Pre-decomposition baseline transcripts (e.g., the 2026-04-29 rigs
    we just analyzed, which run as a single session — orientation tax
    paid once)
  - Post-decomposition piece-sessions (would pay it per piece — but
    those transcripts have been cleaned up, so we approximate from the
    cheap-mining artifact's per-session totals)

Usage:
  python3 h4c_orientation_tax.py
  python3 h4c_orientation_tax.py --archive  # also analyze archive
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional, Tuple

import sys
sys.path.insert(0, str(Path(__file__).parent))
from h4a_naive_split import load_curve, ARCHIVE_DIR


# Regex for bash commands that modify files
BASH_MODIFY = re.compile(
    r'\b(rm|mv|cp|sed\s+-i|perl\s+-i|git\s+(rm|mv)|touch|>\s*\S+|>>\s*\S+|tee)\b'
)


@dataclass
class OrientationStats:
    label: str
    total_turns: int
    first_edit_turn: Optional[int]   # turn at which productive work begins
    cr_at_first_edit: int            # cache_read accumulated by then
    final_cr: int


def find_first_productive_turn(path: Path) -> OrientationStats:
    """Walk the transcript turn-by-turn; find the first turn whose tool calls
    include an Edit, Write, or file-modifying Bash."""
    seen_ids: set[str] = set()
    turn_idx = 0
    first_edit = None
    cr_at_first_edit = 0
    final_cr = 0
    label = path.stem[:8]
    with open(path) as f:
        records = [json.loads(line) for line in f if line.strip()]

    for rec in records:
        if rec.get('type') != 'assistant':
            continue
        msg = rec.get('message') or {}
        mid = msg.get('id')
        if not mid or mid in seen_ids:
            continue
        seen_ids.add(mid)
        turn_idx += 1
        u = msg.get('usage') or {}
        cr = u.get('cache_read_input_tokens', 0) or 0
        final_cr = cr

        if first_edit is None:
            for c in msg.get('content') or []:
                if not isinstance(c, dict):
                    continue
                if c.get('type') != 'tool_use':
                    continue
                name = c.get('name', '')
                if name in ('Edit', 'Write'):
                    first_edit = turn_idx
                    cr_at_first_edit = cr
                    break
                if name == 'Bash':
                    cmd = (c.get('input') or {}).get('command', '') or ''
                    if BASH_MODIFY.search(cmd):
                        first_edit = turn_idx
                        cr_at_first_edit = cr
                        break

    return OrientationStats(
        label=label,
        total_turns=turn_idx,
        first_edit_turn=first_edit,
        cr_at_first_edit=cr_at_first_edit,
        final_cr=final_cr,
    )


TRANSCRIPTS = [
    ("rig1-impl (vision-keeper cleanup)",
     "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-moji64zc-dfc28f4b/08c3166d-b785-4083-9152-4c7f67920193.jsonl"),
    ("rig2-impl (reckoner tick)",
     "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-moj12hm9-741d87c7/1f5b65ff-e31d-40e8-809f-14234c6da681.jsonl"),
]


def report(label: str, s: OrientationStats) -> None:
    if not s.first_edit_turn:
        print(f"  {label:<30} N={s.total_turns:>3}  no productive turn detected")
        return
    pct_turns = 100 * s.first_edit_turn / s.total_turns
    pct_ctx = 100 * s.cr_at_first_edit / s.final_cr if s.final_cr else 0
    print(f"  {label:<30} N={s.total_turns:>3}  "
          f"first_edit@T{s.first_edit_turn:<3} ({pct_turns:>5.1f}% of session) "
          f"ctx_at_T{s.first_edit_turn}={s.cr_at_first_edit/1000:>5.0f}K "
          f"({pct_ctx:>5.1f}% of final)")


def aggregate(rows: List[Tuple[str, OrientationStats]]) -> None:
    """Cohort statistics over the orientation-tax rows."""
    if not rows:
        return
    valid = [(lbl, s) for lbl, s in rows if s.first_edit_turn]
    if not valid:
        print("\nNo valid rows.")
        return
    turns = [s.first_edit_turn for _, s in valid]
    ctxs = [s.cr_at_first_edit for _, s in valid]
    pcts_turn = [100 * s.first_edit_turn / s.total_turns for _, s in valid]
    pcts_ctx = [100 * s.cr_at_first_edit / s.final_cr if s.final_cr else 0 for _, s in valid]

    def stats(xs: List[float]) -> dict:
        xs_sorted = sorted(xs)
        n = len(xs_sorted)
        return {
            'min': xs_sorted[0],
            'p25': xs_sorted[n // 4],
            'median': xs_sorted[n // 2],
            'p75': xs_sorted[3 * n // 4],
            'max': xs_sorted[-1],
            'mean': sum(xs_sorted) / n,
        }

    print(f"\n{'='*70}")
    print(f"Orientation tax — {len(valid)} sessions")
    print(f"{'='*70}")

    print(f"\nTurns until first productive call (Edit / Write / file-mod Bash):")
    s = stats(turns)
    print(f"  min  / p25  / median / p75  / max  / mean")
    print(f"  {s['min']:>4.0f} / {s['p25']:>4.0f} / {s['median']:>6.0f} / "
          f"{s['p75']:>4.0f} / {s['max']:>4.0f} / {s['mean']:>4.1f}")

    print(f"\n% of session length spent in orientation:")
    s = stats(pcts_turn)
    print(f"  min  / p25   / median  / p75   / max   / mean")
    print(f"  {s['min']:>4.1f}% / {s['p25']:>4.1f}% / {s['median']:>6.1f}% / "
          f"{s['p75']:>4.1f}% / {s['max']:>4.1f}% / {s['mean']:>4.1f}%")

    print(f"\nContext accumulated by first productive turn (K tokens):")
    s = stats([c / 1000 for c in ctxs])
    print(f"  min  / p25  / median / p75  / max  / mean")
    print(f"  {s['min']:>4.0f}K/ {s['p25']:>4.0f}K/ {s['median']:>5.0f}K / "
          f"{s['p75']:>4.0f}K/ {s['max']:>4.0f}K/ {s['mean']:>4.0f}K")

    print(f"\n% of final context accumulated by first productive turn:")
    s = stats(pcts_ctx)
    print(f"  min  / p25   / median  / p75   / max   / mean")
    print(f"  {s['min']:>4.1f}% / {s['p25']:>4.1f}% / {s['median']:>6.1f}% / "
          f"{s['p75']:>4.1f}% / {s['max']:>4.1f}% / {s['mean']:>4.1f}%")

    # Long-tail
    long_orient = [(l, s) for l, s in valid if s.first_edit_turn and s.first_edit_turn >= 15]
    print(f"\nSessions with orientation phase >= 15 turns: {len(long_orient)}/{len(valid)} "
          f"({100*len(long_orient)/len(valid):.0f}%)")
    if long_orient:
        print(f"\n{'Session':<22} {'orient_turns':>12} {'orient_ctx_K':>13}")
        for lbl, s in sorted(long_orient, key=lambda x: -x[1].first_edit_turn)[:15]:
            print(f"{lbl:<22} {s.first_edit_turn:>12} {s.cr_at_first_edit/1000:>12.0f}K")


if __name__ == '__main__':
    rows: List[Tuple[str, OrientationStats]] = []
    for label, path in TRANSCRIPTS:
        try:
            s = find_first_productive_turn(Path(path))
            rows.append((label, s))
        except FileNotFoundError:
            continue

    print("=" * 70)
    print("Recent rigs:")
    print("=" * 70)
    for lbl, s in rows:
        report(lbl, s)

    if '--archive' in sys.argv:
        for path in sorted(ARCHIVE_DIR.glob('*.jsonl')):
            if path.stat().st_size < 200_000:
                continue
            try:
                s = find_first_productive_turn(path)
            except Exception:
                continue
            if s.total_turns >= 50:
                rows.append((f"archive/{path.stem[:8]}", s))

        aggregate(rows)
