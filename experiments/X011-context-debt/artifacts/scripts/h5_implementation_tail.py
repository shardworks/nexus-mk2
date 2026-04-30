#!/usr/bin/env python3
"""H5 implementation-tail analyzer.

Mirror of H4c orientation-tax: instead of measuring the front of a session
(turns until first productive edit), this measures the back — turns AFTER
the last edit, plus the per-decile edit-density curve, to detect whether
implement sessions have a natural "implement → finalize" phase boundary.

Question: does the agent typically have a clean tail of verify/read turns
after the last edit, or does it edit-test-edit-test all the way to the end?

Methodology:
  - Walk each transcript turn-by-turn (dedupe by assistant message id).
  - Classify each turn by tool-call signature:
      EDIT     — Edit, Write, MultiEdit, NotebookEdit, file-modifying Bash
      VERIFY   — Bash matching test/typecheck/lint/build patterns (no edit)
      READ     — Read, Grep, Glob (only)
      MIXED    — both EDIT and VERIFY signals in the same turn
      OTHER    — anything else
  - Compute per session:
      total_turns, last_edit_turn, tail_len, tail_frac
      longest consecutive verify-only run at the end
      edit-density per decile (10 buckets covering the session)
      "drop-below-20% turn" — the turn beyond which remaining edits are
        <20% of remaining turns (the operational break point)
  - Aggregate distributions across the corpus.

Filter: ≥50 assistant turns AND ≥5 EDIT turns AND ≥1 VERIFY turn —
captures implementer-shaped sessions in the archive.

Usage:
  python3 h5_implementation_tail.py
  python3 h5_implementation_tail.py --verbose   # per-session detail
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


ARCHIVE_DIR = Path('/workspace/nexus-mk2/experiments/data/transcripts')
PROJECTS_DIR = Path('/home/vscode/.claude/projects')

# Identify implementer sessions by their first user-message shape.
# Implementer prompts start with "# {Brief Title}" then "## Intent" —
# distinct from reader-analyst ("Plan ID:..."), spec-writer ("Plan ID: ...
# Decision summary:..."), reviewer ("# Code Review"), revise ("# Revision
# Pass"), and patron-anima ("# Patron Anima").
IMPLEMENT_PROMPT = re.compile(r'^#\s+[^\n]+\n+##\s+Intent\b', re.MULTILINE)
ROLE_PROMPTS = re.compile(r'^#\s+(Code Review|Revision Pass|Patron Anima)\b', re.MULTILINE)

# Bash commands that modify files. Output-redirection patterns are tightened
# to require a file-path-like target (excluding '>&1' style fd redirections
# that would otherwise misclassify every 'pnpm test 2>&1 | tail').
BASH_MODIFY = re.compile(
    r'\b(rm|mv|cp|sed\s+-i|perl\s+-i|git\s+(rm|mv)|touch|tee)\b'
    r'|>>?\s*[a-zA-Z./_~][\w./_~-]*'
)

# Bash commands that verify (test / typecheck / lint / build)
BASH_VERIFY = re.compile(
    r'\b(pnpm.*?(test|typecheck|lint|build|tsc)|'
    r'npm.*?(test|run\s+test|run\s+lint|run\s+build|run\s+typecheck)|'
    r'yarn.*?(test|lint|build|typecheck)|'
    r'vitest|jest|mocha|tsc|eslint|prettier(\s+--check)?|'
    r'cargo\s+(test|check|build|clippy)|go\s+(test|build|vet)|'
    r'pytest|mypy|ruff)\b'
)


@dataclass
class TurnInfo:
    idx: int
    has_edit: bool
    has_verify: bool
    has_read: bool
    has_other: bool

    @property
    def category(self) -> str:
        if self.has_edit and self.has_verify:
            return 'MIXED'
        if self.has_edit:
            return 'EDIT'
        if self.has_verify:
            return 'VERIFY'
        if self.has_read and not self.has_other:
            return 'READ'
        return 'OTHER'

    @property
    def counts_as_edit(self) -> bool:
        return self.has_edit  # MIXED also counts as edit-bearing

    @property
    def counts_as_verify_only(self) -> bool:
        return self.has_verify and not self.has_edit


@dataclass
class TailStats:
    label: str
    total_turns: int
    edit_turns: int
    verify_turns: int  # verify-only across whole session
    last_edit_turn: Optional[int]
    tail_len: int  # total - last_edit
    tail_frac: float
    # Composition of the post-last-edit tail
    tail_verify: int
    tail_read: int
    tail_other: int
    decile_edit_density: List[float]  # 10 buckets, each = fraction of edit-bearing turns
    # Decline-from-peak: first decile (1-indexed) where edit-density drops to ≤50% of peak
    peak_decile: int
    decline_decile: Optional[int]


def classify_turns(path: Path) -> Tuple[str, List[TurnInfo]]:
    """Walk a transcript and produce per-turn classification."""
    label = path.stem[:8]
    seen_ids: set[str] = set()
    turns: List[TurnInfo] = []
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

        has_edit = False
        has_verify = False
        has_read = False
        has_other = False

        for c in msg.get('content') or []:
            if not isinstance(c, dict):
                continue
            if c.get('type') != 'tool_use':
                continue
            name = c.get('name', '')
            if name in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit'):
                has_edit = True
            elif name == 'Bash':
                cmd = (c.get('input') or {}).get('command', '') or ''
                if BASH_MODIFY.search(cmd):
                    has_edit = True
                elif BASH_VERIFY.search(cmd):
                    has_verify = True
                else:
                    has_other = True
            elif name in ('Read', 'Grep', 'Glob', 'NotebookRead'):
                has_read = True
            else:
                has_other = True

        turns.append(TurnInfo(
            idx=len(turns) + 1,
            has_edit=has_edit,
            has_verify=has_verify,
            has_read=has_read,
            has_other=has_other,
        ))

    return label, turns


def compute_stats(label: str, turns: List[TurnInfo]) -> TailStats:
    n = len(turns)
    edit_turns = sum(1 for t in turns if t.counts_as_edit)
    verify_turns = sum(1 for t in turns if t.counts_as_verify_only)

    last_edit = None
    for t in turns:
        if t.counts_as_edit:
            last_edit = t.idx

    if last_edit is None:
        tail_len = n
        tail_frac = 1.0
    else:
        tail_len = n - last_edit
        tail_frac = tail_len / n if n else 0.0

    # Tail composition: count categories among post-last-edit turns
    tail_verify = 0
    tail_read = 0
    tail_other = 0
    if last_edit is not None:
        for t in turns[last_edit:]:
            if t.counts_as_verify_only:
                tail_verify += 1
            elif t.has_read and not t.has_edit and not t.has_verify and not t.has_other:
                tail_read += 1
            else:
                tail_other += 1

    # Decile edit-density
    deciles = [0.0] * 10
    if n >= 10:
        for d in range(10):
            lo = (d * n) // 10
            hi = ((d + 1) * n) // 10
            if hi > lo:
                bucket = turns[lo:hi]
                deciles[d] = sum(1 for t in bucket if t.counts_as_edit) / len(bucket)

    # Decline-from-peak: identify the peak decile then the first subsequent decile
    # whose density is ≤50% of the peak. The decline_decile is the operational
    # "tail begins here" signal: editing has unambiguously dropped off.
    peak_decile = max(range(10), key=lambda i: deciles[i]) + 1  # 1-indexed
    decline_decile = None
    peak_density = max(deciles)
    if peak_density > 0:
        for d in range(peak_decile, 10):
            if deciles[d] <= 0.5 * peak_density:
                decline_decile = d + 1  # 1-indexed
                break

    return TailStats(
        label=label,
        total_turns=n,
        edit_turns=edit_turns,
        verify_turns=verify_turns,
        last_edit_turn=last_edit,
        tail_len=tail_len,
        tail_frac=tail_frac,
        tail_verify=tail_verify,
        tail_read=tail_read,
        tail_other=tail_other,
        decile_edit_density=deciles,
        peak_decile=peak_decile,
        decline_decile=decline_decile,
    )


def is_implementer_session(path: Path) -> bool:
    """Detect implementer sessions by first user-message prompt shape."""
    try:
        with open(path) as f:
            for line in f:
                rec = json.loads(line)
                if rec.get('type') != 'user':
                    continue
                msg = rec.get('message') or {}
                content = msg.get('content', '')
                if not isinstance(content, str):
                    return False
                # Strip the boilerplate cwd preamble if present
                marker = 'Do NOT read, write, or explore files outside this directory.'
                if marker in content:
                    content = content.split(marker, 1)[1]
                content = content.lstrip()
                if ROLE_PROMPTS.match(content):
                    return False
                return bool(IMPLEMENT_PROMPT.match(content))
    except Exception:
        return False
    return False


def passes_filter(turns: List[TurnInfo]) -> bool:
    """Activity filter on a session already known to be implementer-shaped:
    ≥30 turns, ≥3 edits. We drop the verify requirement since some sessions
    use the rig-level verify step rather than in-session pnpm test."""
    n = len(turns)
    if n < 30:
        return False
    edits = sum(1 for t in turns if t.counts_as_edit)
    return edits >= 3


def stats_dict(xs: List[float]) -> dict:
    if not xs:
        return {}
    xs = sorted(xs)
    n = len(xs)
    return {
        'min': xs[0],
        'p25': xs[n // 4],
        'median': xs[n // 2],
        'p75': xs[3 * n // 4],
        'max': xs[-1],
        'mean': sum(xs) / n,
        'n': n,
    }


def report_session(s: TailStats) -> None:
    last = f"T{s.last_edit_turn}" if s.last_edit_turn else "—"
    decline = f"D{s.decline_decile}" if s.decline_decile else "—"
    deciles_str = ' '.join(f"{d:>3.0f}" for d in [100 * x for x in s.decile_edit_density])
    print(f"  {s.label:<10} N={s.total_turns:>3} edits={s.edit_turns:>3} verifies={s.verify_turns:>3} "
          f"last_edit@{last:<6} tail={s.tail_len:>3}({100*s.tail_frac:>4.0f}%) "
          f"tail[v/r/o]={s.tail_verify}/{s.tail_read}/{s.tail_other:<3} "
          f"peak=D{s.peak_decile} decline={decline}")
    print(f"             edit-density per decile (%): {deciles_str}")


def aggregate(rows: List[TailStats]) -> None:
    print(f"\n{'='*78}")
    print(f"Aggregate — {len(rows)} sessions")
    print(f"{'='*78}")

    last_edit_turn = [s.last_edit_turn for s in rows if s.last_edit_turn]
    last_edit_frac = [s.last_edit_turn / s.total_turns for s in rows if s.last_edit_turn]
    tail_lens = [s.tail_len for s in rows]
    tail_fracs = [s.tail_frac for s in rows]
    decline_deciles = [s.decline_decile for s in rows if s.decline_decile is not None]
    verify_total = [s.verify_turns for s in rows]

    def fmt(s: dict, suffix: str = '') -> str:
        if not s:
            return '(no data)'
        return (f"min={s['min']:.1f}{suffix} p25={s['p25']:.1f}{suffix} "
                f"median={s['median']:.1f}{suffix} p75={s['p75']:.1f}{suffix} "
                f"max={s['max']:.1f}{suffix} mean={s['mean']:.1f}{suffix}")

    print(f"\nLast-edit turn (absolute):")
    print(f"  {fmt(stats_dict([float(x) for x in last_edit_turn]))}")

    print(f"\nLast-edit position (% of session):")
    print(f"  {fmt(stats_dict([100*x for x in last_edit_frac]), '%')}")

    print(f"\nTail length (turns after last edit):")
    print(f"  {fmt(stats_dict([float(x) for x in tail_lens]))}")

    print(f"\nTail fraction (% of session after last edit):")
    print(f"  {fmt(stats_dict([100*x for x in tail_fracs]), '%')}")

    print(f"\nVerify-only Bash turns per session (test/typecheck/lint runs):")
    print(f"  {fmt(stats_dict([float(x) for x in verify_total]))}")

    print(f"\nDecline-from-peak decile (1-10; first decile after peak with ≤50% of peak density):")
    n_decline = len(decline_deciles)
    print(f"  {n_decline}/{len(rows)} sessions ({100*n_decline/len(rows):.0f}%) have a clean decline")
    if decline_deciles:
        print(f"  {fmt(stats_dict([float(x) for x in decline_deciles]))}")

    # Tail composition aggregate
    tail_totals = sum(s.tail_len for s in rows)
    tail_v = sum(s.tail_verify for s in rows)
    tail_r = sum(s.tail_read for s in rows)
    tail_o = sum(s.tail_other for s in rows)
    print(f"\nTail composition (post-last-edit turns, corpus-wide):")
    if tail_totals:
        print(f"  total tail turns: {tail_totals}")
        print(f"  verify-only:      {tail_v:>4} ({100*tail_v/tail_totals:>4.1f}%)")
        print(f"  read-only:        {tail_r:>4} ({100*tail_r/tail_totals:>4.1f}%)")
        print(f"  other (git/ls/…): {tail_o:>4} ({100*tail_o/tail_totals:>4.1f}%)")

    # Aggregate decile-density curve
    if rows:
        avg_deciles = [
            sum(s.decile_edit_density[d] for s in rows) / len(rows)
            for d in range(10)
        ]
        print(f"\nAverage edit-density per decile (corpus-wide):")
        print(f"  decile:  {' '.join(f'{i+1:>4}' for i in range(10))}")
        print(f"  edit %:  {' '.join(f'{100*x:>3.0f}%' for x in avg_deciles)}")

    # Distribution buckets for tail_frac (the most decision-relevant signal)
    print(f"\nTail-fraction distribution:")
    buckets = [(0.0, 0.05), (0.05, 0.10), (0.10, 0.20), (0.20, 0.30), (0.30, 0.50), (0.50, 1.01)]
    for lo, hi in buckets:
        count = sum(1 for f in tail_fracs if lo <= f < hi)
        bar = '█' * int(50 * count / max(len(tail_fracs), 1))
        print(f"  [{100*lo:>4.0f}%, {100*hi:>4.0f}%): {count:>3} {bar}")


def main() -> None:
    verbose = '--verbose' in sys.argv
    rows: List[TailStats] = []
    n_scanned = 0
    n_implementer = 0
    n_passed = 0

    # Walk the live projects dir for nexus-draft rigs (where actual implementer
    # sessions live). The sanctum archive contains mostly Coco / interactive
    # sessions, not implementer sessions.
    for project_dir in sorted(PROJECTS_DIR.glob('-workspace-vibers-tmp-nexus-drafts-nexus-draft-*')):
        for path in sorted(project_dir.glob('*.jsonl')):
            if path.stat().st_size < 50_000:
                continue
            n_scanned += 1
            if not is_implementer_session(path):
                continue
            n_implementer += 1
            try:
                label, turns = classify_turns(path)
            except Exception:
                continue
            if not passes_filter(turns):
                continue
            n_passed += 1
            rows.append(compute_stats(label, turns))

    print(f"Scanned: {n_scanned} sessions in nexus-draft rigs")
    print(f"Implementer-shaped (first prompt = '# Title\\n## Intent'): {n_implementer}")
    print(f"Activity filter passed (≥30 turns, ≥3 edits): {n_passed}")

    if verbose:
        print(f"\n{'='*78}")
        print("Per-session detail (sorted by total turns)")
        print(f"{'='*78}")
        for s in sorted(rows, key=lambda r: -r.total_turns):
            report_session(s)

    aggregate(rows)


if __name__ == '__main__':
    main()
