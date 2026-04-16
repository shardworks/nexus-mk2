#!/usr/bin/env python3
"""H1 projection: estimate what a single-session run of the same work
would have cost, based on the marginal cache-read growth pattern observed.

Key insight: in a single continuous session, cache_read grows roughly linearly
with turn count. If we concatenated all the per-turn WORK (output_tokens,
cache_create_tokens, input_tokens) into one session, the cache_read for
turn N would be (approximately) the sum of all prior cache_create_tokens
plus initial context.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from typing import List

from h1_mining import SESSIONS_R1, SESSIONS_R2, load, Turn, Session, PRICE_IN, PRICE_CC, PRICE_CR, PRICE_OUT

def simulate_monolithic(all_turns: List[Turn], initial_context_toks: int = 14440) -> dict:
    """Simulate the same sequence of turns in one continuous session.

    Assumptions:
    - Each turn's work (input_tok, cache_create_tok, output_tok) stays the same.
    - cache_read for each turn is the cumulative cache_create of all prior turns + initial.
    - This slightly understates reality because Claude cache retrieval isn't perfect,
      but it's a lower bound.
    """
    cum_cache = initial_context_toks
    sim_cost = 0.0
    per_turn = []
    for i, t in enumerate(all_turns):
        # Simulated turn: cache_read = cumulative context so far
        sim_cr = cum_cache
        turn_cost = (t.input_tok * PRICE_IN
                     + t.cache_create_tok * PRICE_CC
                     + sim_cr * PRICE_CR
                     + t.output_tok * PRICE_OUT) / 1_000_000
        sim_cost += turn_cost
        per_turn.append((i+1, sim_cr, turn_cost))
        cum_cache += t.cache_create_tok  # new creation adds to persistent context
    return {
        'total_turns': len(all_turns),
        'final_context_toks': cum_cache,
        'simulated_monolithic_cost': sim_cost,
        'per_turn': per_turn,
    }

def observed_cost(turns: List[Turn]) -> float:
    return sum(t.cost for t in turns)

def sum_session_cost(sessions: List[Session]) -> float:
    return sum(observed_cost(s.turns) for s in sessions)

if __name__ == '__main__':
    rig1 = [load(lbl, w, p) for lbl,w,p in SESSIONS_R1]
    rig2 = [load(lbl, w, p) for lbl,w,p in SESSIONS_R2]

    for rig_label, sessions in [("RIG 1 (piece-cancelled fix, 5 pieces)", rig1),
                                 ("RIG 2 (Oculus click-tree, 6 pieces)",   rig2)]:
        print("=" * 80)
        print(rig_label)
        print("=" * 80)
        observed = sum_session_cost(sessions)
        all_turns = [t for s in sessions for t in s.turns]
        sim = simulate_monolithic(all_turns)
        print(f"  Observed decomposed cost:  ${observed:>8.2f}  ({len(all_turns)} turns across {len(sessions)} sessions)")
        print(f"  Simulated monolithic cost: ${sim['simulated_monolithic_cost']:>8.2f}  ({sim['total_turns']} turns, 1 session)")
        print(f"  Final context size:        {sim['final_context_toks']:,} tokens")
        print(f"  Ratio (mono / decomp):     {sim['simulated_monolithic_cost']/observed:>8.2f}x")
        print()

        # Show cumulative context growth at key milestones
        milestones = [10, 25, 50, 100, 150, 200, 250, len(all_turns)]
        print(f"  {'turn':>5} {'cache_read':>12} {'cum_cost':>10}")
        cum = 0.0
        for t, cr, cost in sim['per_turn']:
            cum += cost
            if t in milestones or t == sim['total_turns']:
                print(f"  {t:>5d} {cr:>12,d} ${cum:>9.2f}")
        print()
