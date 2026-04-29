#!/usr/bin/env python3
"""Aggregate the H4a/H4b naive-split & handoff-split simulation across the
full archive of long-running transcripts.

Outputs cohort-level statistics: median naive-split outcome by session length,
median handoff savings at 30K, distribution of break-even points, etc.
"""
from __future__ import annotations
import json
import statistics
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional

import sys
sys.path.insert(0, str(Path(__file__).parent))
from h4a_naive_split import (
    load_curve, find_baseline, total_cost,
    naive_split_cost, handoff_split_cost,
    PRICE_CR, ARCHIVE_DIR, TRANSCRIPTS,
)


@dataclass
class SessionResult:
    label: str
    turns: int
    final_cr: int
    t_baseline: int
    b: int  # baseline cache_read
    monolithic_cost: int  # cumulative cache_read tokens
    naive_at_50pct: int  # split cost at 50% (cache_read tokens)
    h30_at_50pct: int
    h60_at_50pct: int
    naive_break_even_K: Optional[int]  # smallest K where naive saves >0
    naive_best_savings_pct: float  # best savings % achievable with naive
    h30_best_savings_pct: float


def analyze(label: str, path: Path) -> Optional[SessionResult]:
    turns = load_curve(path)
    if len(turns) < 50:
        return None
    N = len(turns)
    T_base, B = find_baseline(turns)
    final_cr = turns[-1].cr
    if final_cr < 1000:
        # Likely auto-compaction at session end made the final cr unreliable
        return None
    monolithic = total_cost(turns)
    K50 = max(1, N // 2)
    naive_50 = naive_split_cost(turns, K50, T_base, B)
    h30_50 = handoff_split_cost(turns, K50, 30_000)
    h60_50 = handoff_split_cost(turns, K50, 60_000)

    # Break-even sweep for naive
    bk = None
    best_naive_savings = -1
    best_h30_savings = -1
    for K in range(T_base + 5, N - 5):
        c_naive = naive_split_cost(turns, K, T_base, B)
        c_h30 = handoff_split_cost(turns, K, 30_000)
        s_naive_pct = (monolithic - c_naive) / monolithic * 100
        s_h30_pct = (monolithic - c_h30) / monolithic * 100
        if c_naive < monolithic and bk is None:
            bk = K
        if s_naive_pct > best_naive_savings:
            best_naive_savings = s_naive_pct
        if s_h30_pct > best_h30_savings:
            best_h30_savings = s_h30_pct

    return SessionResult(
        label=label, turns=N, final_cr=final_cr,
        t_baseline=T_base, b=B, monolithic_cost=monolithic,
        naive_at_50pct=naive_50, h30_at_50pct=h30_50, h60_at_50pct=h60_50,
        naive_break_even_K=bk,
        naive_best_savings_pct=best_naive_savings,
        h30_best_savings_pct=best_h30_savings,
    )


def main() -> None:
    results: List[SessionResult] = []
    targets = list(TRANSCRIPTS) + [
        (f"archive/{p.stem[:8]}", str(p))
        for p in sorted(ARCHIVE_DIR.glob('*.jsonl'))
    ]
    for label, path in targets:
        try:
            r = analyze(label, Path(path))
        except FileNotFoundError:
            continue
        if r is not None:
            results.append(r)

    print(f"\nDataset: {len(results)} transcripts with >= 50 turns\n")

    # Distribution by session length bucket
    buckets = {
        '50-99': [], '100-149': [], '150-199': [], '200-299': [], '300+': [],
    }
    for r in results:
        if r.turns < 100:
            buckets['50-99'].append(r)
        elif r.turns < 150:
            buckets['100-149'].append(r)
        elif r.turns < 200:
            buckets['150-199'].append(r)
        elif r.turns < 300:
            buckets['200-299'].append(r)
        else:
            buckets['300+'].append(r)

    print(f"{'Bucket':<10} {'N':>3} | {'naive @ 50% split':<28} | {'30K handoff @ 50%':<28} | {'naive ever wins?':<20}")
    print(f"{'':<10} {'':<3} | {'median Δ':>10} {'best %':>10} {'wins':>5} | {'median Δ':>10} {'best %':>10}    | {'count':<5} {'median K':>10}")
    print("-" * 130)

    for name, group in buckets.items():
        if not group:
            print(f"{name:<10} 0 | (no data)")
            continue
        median_naive_pct_at_50 = statistics.median(
            (r.monolithic_cost - r.naive_at_50pct) / r.monolithic_cost * 100
            for r in group
        )
        median_naive_best = statistics.median(r.naive_best_savings_pct for r in group)
        wins_50 = sum(1 for r in group if r.naive_at_50pct < r.monolithic_cost)
        median_h30_at_50 = statistics.median(
            (r.monolithic_cost - r.h30_at_50pct) / r.monolithic_cost * 100
            for r in group
        )
        median_h30_best = statistics.median(r.h30_best_savings_pct for r in group)
        ever_wins = [r for r in group if r.naive_break_even_K is not None]
        ever_count = len(ever_wins)
        median_K = (statistics.median(r.naive_break_even_K for r in ever_wins)
                    if ever_wins else None)
        print(f"{name:<10} {len(group):>3} | "
              f"{median_naive_pct_at_50:>+9.1f}% {median_naive_best:>+9.1f}% {wins_50:>4}/{len(group):<2} | "
              f"{median_h30_at_50:>+9.1f}% {median_h30_best:>+9.1f}%    | "
              f"{ever_count:>2}/{len(group):<2} {(median_K if median_K is not None else '—'):>10}")

    print("\n" + "=" * 80)
    print("Naive break-even sessions (those where some split point has positive savings)")
    print("=" * 80)
    winning = [r for r in results if r.naive_break_even_K is not None]
    print(f"\n{len(winning)}/{len(results)} sessions ({100*len(winning)/len(results):.0f}%) "
          f"have ANY naive-split point that saves money.\n")
    if winning:
        print(f"{'Session':<22} {'turns':>5} {'T_base':>6} {'B/1K':>5} "
              f"{'BE K':>5} {'BE T_post':>10} {'best %':>7}")
        for r in sorted(winning, key=lambda x: -x.naive_best_savings_pct)[:20]:
            T_post = r.turns - r.naive_break_even_K
            print(f"{r.label:<22} {r.turns:>5} {r.t_baseline:>6} {r.b/1000:>4.0f}K "
                  f"{r.naive_break_even_K:>5} {T_post:>10} {r.naive_best_savings_pct:>+6.1f}%")

    print("\n" + "=" * 80)
    print("Handoff (30K) savings at midpoint")
    print("=" * 80)
    h30_50_pct = [(r.monolithic_cost - r.h30_at_50pct) / r.monolithic_cost * 100 for r in results]
    h30_50_pct.sort()
    print(f"\nDistribution of 30K-handoff savings at 50% split (across {len(results)} sessions):")
    print(f"  min:    {h30_50_pct[0]:+.1f}%")
    print(f"  p25:    {h30_50_pct[len(h30_50_pct)//4]:+.1f}%")
    print(f"  median: {h30_50_pct[len(h30_50_pct)//2]:+.1f}%")
    print(f"  p75:    {h30_50_pct[3*len(h30_50_pct)//4]:+.1f}%")
    print(f"  max:    {h30_50_pct[-1]:+.1f}%")
    pos = sum(1 for x in h30_50_pct if x > 0)
    print(f"  positive: {pos}/{len(h30_50_pct)} ({100*pos/len(h30_50_pct):.0f}%)")

    # Comparison of best naive vs best handoff
    print("\n" + "=" * 80)
    print("Best achievable savings: naive vs 30K handoff")
    print("=" * 80)
    print(f"\n{'Session':<22} {'turns':>5} | {'naive best':>10} | {'h30 best':>10} | {'h30/naive':>10}")
    for r in sorted(results, key=lambda x: -x.turns)[:25]:
        ratio = (f"{r.h30_best_savings_pct - r.naive_best_savings_pct:+.1f} pp"
                 if r.naive_best_savings_pct > 0 else "(naive≤0)")
        print(f"{r.label:<22} {r.turns:>5} | "
              f"{r.naive_best_savings_pct:>+9.1f}% | "
              f"{r.h30_best_savings_pct:>+9.1f}% | "
              f"{ratio:>10}")


if __name__ == '__main__':
    main()
