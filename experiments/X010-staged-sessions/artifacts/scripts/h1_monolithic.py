#!/usr/bin/env python3
"""H1 monolithic analysis: compare observed single-session H1 baseline
(rig-mo1wajm9-8bf5d205, same Oculus spec, implement engine, 749s wall)
against the decomposed Rig 2 run.

This is the dataset that tests my cheap-mining projection.
"""
from __future__ import annotations
import sys
sys.path.insert(0, '/tmp')
from h1_mining import load, Session, Turn, PRICE_IN, PRICE_CC, PRICE_CR, PRICE_OUT

MONO_IMPL = ("MONO-IMPL", 749, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1wak9c-9415c244/99c46df8-e422-4efa-b8d5-aec28d9f7089.jsonl")

s = load(*MONO_IMPL)
print(f"Session: {s.label}")
print(f"Wall time: {s.wall_s}s ({s.wall_s/60:.1f}min)")
print(f"Turns: {len(s.turns)}")

if not s.turns:
    print("NO TURNS FOUND")
    sys.exit(1)

total_in = sum(t.input_tok for t in s.turns)
total_cc = sum(t.cache_create_tok for t in s.turns)
total_cr = sum(t.cache_read_tok for t in s.turns)
total_out = sum(t.output_tok for t in s.turns)
print(f"Total input_tok:        {total_in:>12,d}")
print(f"Total cache_create_tok: {total_cc:>12,d}")
print(f"Total cache_read_tok:   {total_cr:>12,d}")
print(f"Total output_tok:       {total_out:>12,d}")

total_cost = sum(t.cost for t in s.turns)
print(f"Computed cost (model $): ${total_cost:.2f}")
print()

# Context growth profile
print(f"{'turn':>5} {'elapsed':>8} {'input':>6} {'ccr':>8} {'crd':>10} {'out':>6} {'cost':>8}")
for i, t in enumerate(s.turns):
    if i % max(1, len(s.turns) // 40) == 0 or i == len(s.turns) - 1:
        print(f"{t.turn_idx:>5d} {int(t.elapsed_s):>7d}s "
              f"{t.input_tok:>6d} {t.cache_create_tok:>8d} {t.cache_read_tok:>10d} "
              f"{t.output_tok:>6d} ${t.cost:>7.4f}")

print()
# Peak cache_read and slope
max_cr = max(t.cache_read_tok for t in s.turns)
print(f"Peak cache_read_tok in any turn: {max_cr:,}")
print(f"Mean cache_read_tok per turn:    {total_cr/len(s.turns):,.0f}")

# Compare to decomposed Rig 2 (aggregate)
from h1_mining import SESSIONS_R2
rig2 = [load(lbl, w, p) for lbl, w, p in SESSIONS_R2]
all_r2 = [t for s2 in rig2 for t in s2.turns]
r2_cost = sum(t.cost for t in all_r2)
r2_turns = len(all_r2)
r2_in = sum(t.input_tok for t in all_r2)
r2_cc = sum(t.cache_create_tok for t in all_r2)
r2_cr = sum(t.cache_read_tok for t in all_r2)
r2_out = sum(t.output_tok for t in all_r2)
r2_wall = sum(s2.wall_s for s2 in rig2)

print()
print("=" * 72)
print("COMPARISON: MONOLITHIC vs DECOMPOSED (Rig 2 pieces only)")
print("=" * 72)
print(f"{'metric':<24} {'monolithic':>14} {'decomposed':>14} {'mono/decomp':>12}")
print(f"{'turns':<24} {len(s.turns):>14d} {r2_turns:>14d} {len(s.turns)/r2_turns:>11.2f}x")
print(f"{'wall_s':<24} {s.wall_s:>14d} {r2_wall:>14d} {s.wall_s/r2_wall:>11.2f}x")
print(f"{'input_tok':<24} {total_in:>14,d} {r2_in:>14,d} {total_in/r2_in:>11.2f}x")
print(f"{'cache_create_tok':<24} {total_cc:>14,d} {r2_cc:>14,d} {total_cc/r2_cc:>11.2f}x")
print(f"{'cache_read_tok':<24} {total_cr:>14,d} {r2_cr:>14,d} {total_cr/r2_cr:>11.2f}x")
print(f"{'output_tok':<24} {total_out:>14,d} {r2_out:>14,d} {total_out/r2_out:>11.2f}x")
print(f"{'model cost':<24} ${total_cost:>13.2f} ${r2_cost:>13.2f} {total_cost/r2_cost:>11.2f}x")
print()
# Also the actual billed costs
mono_actual = 7.07485775   # from ses-mo1wakbo YAML
r2_actual = 18.58          # sum of 6 piece sessions from earlier analysis
print(f"{'actual billed (impl only)':<28} ${mono_actual:>9.2f} ${r2_actual:>9.2f} {mono_actual/r2_actual:>11.2f}x")
