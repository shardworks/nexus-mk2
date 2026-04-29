#!/usr/bin/env python3
"""H4a/H4b/H4c naive-split and handoff-split simulation.

Reads Claude Code transcript jsonl files, extracts per-turn cache-read curves,
and simulates two split-session scenarios at multiple split points:

  1. Naive split — session 2 re-reads baseline files (no handoff). Modeled as:
        Session 2 cost = baseline_cost + sum(B + delta_phase2[i] for i=1..N-K)
     where B = baseline post-orientation context and baseline_cost is the cost
     of T_baseline turns of orientation reads in session 2.

  2. Handoff split — session 2 starts at a small handoff size H. Modeled as:
        Session 2 cost = sum(H + delta_phase2[i] for i=1..N-K)
     where delta_phase2[i] = orig_cr[K+i] - orig_cr[K].

For each session we compute savings vs the monolithic baseline at split points
{20%, 30%, 40%, 50%, 60%, 70%, 80%} and at handoff sizes {30K, 60K, 100K, naive}.

Savings derivation (handoff case):
    savings = total_cost - split_cost
            = (N-K) * (orig_cr[K] - H)

Savings derivation (naive case):
    savings = (N-K) * α  -  baseline_cost
    where α = orig_cr[K] - B

Pricing assumptions (Opus 4, per 1M tokens):
  cache_read:    $1.50

We focus on cache_read because it dominates long-session cost (~60% per the
2026-04-03 analysis, and ~85-94% in turns 100+). Output / cache-create costs
are not modeled — they're approximately preserved across split scenarios in
the handoff case, and slightly inflated in the naive case (extra orientation
turns generate some extra output). Excluding them gives a conservative lower
bound on naive-split overhead.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple

PRICE_CR = 1.50  # per 1M cache_read tokens

# Heuristic: baseline = the turn at which cache_read first reaches BASELINE_FRAC of final
BASELINE_FRAC = 0.60


@dataclass
class TurnCR:
    idx: int
    cr: int  # cache_read_input_tokens


def load_curve(path: Path) -> List[TurnCR]:
    """Extract dedup'd per-turn cache_read curve from a Claude Code jsonl."""
    seen_ids: set[str] = set()
    turns: List[TurnCR] = []
    with open(path) as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if rec.get('type') != 'assistant':
                continue
            msg = rec.get('message') or {}
            mid = msg.get('id')
            if not mid or mid in seen_ids:
                continue
            seen_ids.add(mid)
            u = msg.get('usage') or {}
            cr = u.get('cache_read_input_tokens', 0) or 0
            turns.append(TurnCR(idx=len(turns) + 1, cr=cr))
    return turns


def find_baseline(turns: List[TurnCR]) -> Tuple[int, int]:
    """Return (T_baseline, B) — turn index at which cache_read first reaches
    BASELINE_FRAC of final, and the cache_read value at that turn."""
    if not turns:
        return 0, 0
    final = turns[-1].cr
    target = int(final * BASELINE_FRAC)
    for t in turns:
        if t.cr >= target:
            return t.idx, t.cr
    return turns[-1].idx, turns[-1].cr


def total_cost(turns: List[TurnCR]) -> int:
    """Sum of cache_read tokens across all turns (the cumulative replay cost)."""
    return sum(t.cr for t in turns)


def naive_split_cost(turns: List[TurnCR], K: int, T_baseline: int, B: int) -> int:
    """Cost if we split at turn K with no handoff (session 2 redoes baseline reads).

    Session 1: turns 1..K (unchanged).
    Session 2: T_baseline orientation turns (mirroring session 1's first T_baseline
               turns) + (N-K) phase-2 turns each with context = B + (orig_cr[K+i] - orig_cr[K]).
    """
    N = len(turns)
    if K >= N or K <= 0:
        return total_cost(turns)
    # Session 1
    s1 = sum(t.cr for t in turns[:K])
    # Session 2 — orientation phase
    s2_orient = sum(t.cr for t in turns[:T_baseline])
    # Session 2 — phase 2 work
    cr_at_K = turns[K - 1].cr
    s2_phase2 = sum(B + (turns[K + i].cr - cr_at_K) for i in range(N - K))
    return s1 + s2_orient + s2_phase2


def handoff_split_cost(turns: List[TurnCR], K: int, H: int) -> int:
    """Cost if we split at turn K with handoff size H (no re-orientation needed).

    Session 1: turns 1..K (unchanged).
    Session 2: (N-K) turns each with context = H + (orig_cr[K+i] - orig_cr[K]).

    Per-turn cache_read is clamped to >= H — a session can't have less
    context than its starting handoff. (This affects the rare cases where
    the post-split delta would otherwise produce negative values; mostly
    a no-op but prevents savings >100% artifacts in late-session ranges.)
    """
    N = len(turns)
    if K >= N or K <= 0:
        return total_cost(turns)
    s1 = sum(t.cr for t in turns[:K])
    cr_at_K = turns[K - 1].cr
    s2 = sum(max(H, H + (turns[K + i].cr - cr_at_K)) for i in range(N - K))
    return s1 + s2


def simulate(label: str, turns: List[TurnCR]) -> None:
    if not turns or len(turns) < 20:
        print(f"\n{label}: skipping (too short, N={len(turns)})")
        return
    N = len(turns)
    T_base, B = find_baseline(turns)
    final_cr = turns[-1].cr
    monolithic = total_cost(turns)

    print(f"\n=== {label} ===")
    print(f"  turns: {N}  baseline-knee: turn {T_base} at {B/1000:.0f}K  final-ctx: {final_cr/1000:.0f}K")
    print(f"  monolithic cumulative cache_read: {monolithic/1e6:.2f}M  (model cost: ${monolithic*PRICE_CR/1e6:.2f})")
    print()
    print(f"  {'split %':>7} {'K':>4} {'cr@K':>7} "
          f"{'naive':>10} {'h=100K':>10} {'h=60K':>10} {'h=30K':>10}  "
          f"{'naive Δ':>9} {'30K Δ':>9}")
    for pct in [20, 30, 40, 50, 60, 70, 80]:
        K = max(1, int(N * pct / 100))
        cr_at_K = turns[K - 1].cr
        naive = naive_split_cost(turns, K, T_base, B)
        h100 = handoff_split_cost(turns, K, 100_000)
        h60 = handoff_split_cost(turns, K, 60_000)
        h30 = handoff_split_cost(turns, K, 30_000)
        naive_savings_pct = (monolithic - naive) / monolithic * 100
        h30_savings_pct = (monolithic - h30) / monolithic * 100
        print(f"  {pct:>6}% {K:>4} {cr_at_K/1000:>6.0f}K "
              f"{naive/1e6:>9.2f}M {h100/1e6:>9.2f}M {h60/1e6:>9.2f}M {h30/1e6:>9.2f}M  "
              f"{naive_savings_pct:>+8.1f}% {h30_savings_pct:>+8.1f}%")


def break_even_naive(turns: List[TurnCR]) -> None:
    """Find the smallest split point K at which naive splitting saves anything.

    Sweeps K from baseline+5 to N-5 in steps of 1; reports the first K with
    positive savings, the K with maximum savings, and the savings curve.
    """
    if not turns or len(turns) < 50:
        return
    N = len(turns)
    T_base, B = find_baseline(turns)
    monolithic = total_cost(turns)

    best_K, best_savings = 0, 0
    first_positive_K = None
    rows: List[Tuple[int, int, float]] = []
    for K in range(T_base + 5, N - 5):
        c = naive_split_cost(turns, K, T_base, B)
        savings = monolithic - c
        savings_pct = savings / monolithic * 100
        rows.append((K, savings, savings_pct))
        if savings > 0 and first_positive_K is None:
            first_positive_K = K
        if savings > best_savings:
            best_K, best_savings = K, savings

    if first_positive_K is None:
        print(f"  naive break-even: NEVER (negative savings at all K)")
    else:
        T_post = N - first_positive_K
        print(f"  naive break-even: K={first_positive_K} (post-split work T_post={T_post} turns)")
    if best_K:
        T_post = N - best_K
        best_pct = best_savings / monolithic * 100
        print(f"  naive optimum:    K={best_K} (savings ${best_savings*PRICE_CR/1e6:.2f}, {best_pct:.1f}%, T_post={T_post})")


# Set of transcripts to mine. Mix of:
#  - The two "polyrepo conversation" rigs Sean asked us to look at
#  - A sample of long archived transcripts (filtered to >= 50 turns)
TRANSCRIPTS = [
    ("rig1-impl (vision-keeper cleanup)",
     "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-moji64zc-dfc28f4b/08c3166d-b785-4083-9152-4c7f67920193.jsonl"),
    ("rig2-impl (reckoner tick)",
     "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-moj12hm9-741d87c7/1f5b65ff-e31d-40e8-809f-14234c6da681.jsonl"),
]

ARCHIVE_DIR = Path('/workspace/nexus-mk2/experiments/data/transcripts')


def discover_archive_long_sessions(min_turns: int = 80) -> List[Tuple[str, str]]:
    """Find archived transcripts with at least min_turns unique assistant turns."""
    found: List[Tuple[str, str]] = []
    if not ARCHIVE_DIR.exists():
        return found
    for path in sorted(ARCHIVE_DIR.glob('*.jsonl')):
        # Quick prefilter on file size — small jsonl can't have many turns
        if path.stat().st_size < 200_000:
            continue
        turns = load_curve(path)
        if len(turns) >= min_turns:
            found.append((f"archive/{path.stem[:8]}", str(path)))
    return found


if __name__ == '__main__':
    targets = list(TRANSCRIPTS)
    if '--archive' in sys.argv:
        targets += discover_archive_long_sessions(min_turns=80)

    for label, path in targets:
        try:
            turns = load_curve(Path(path))
        except FileNotFoundError:
            print(f"\n{label}: NOT FOUND ({path})")
            continue
        simulate(label, turns)
        break_even_naive(turns)
