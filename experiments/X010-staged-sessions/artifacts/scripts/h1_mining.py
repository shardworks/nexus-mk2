#!/usr/bin/env python3
"""H1 cheap-mining: per-turn usage extraction from piece-session transcripts.

Outputs a per-turn TSV and a per-session summary for the two decomposed rigs.

Pricing assumptions (Opus 4, per 1M tokens):
  input:         $15.00
  cache_create:  $18.75  (ephemeral 5m; close enough to blended)
  cache_read:    $1.50
  output:        $75.00
"""
from __future__ import annotations
import json
import statistics
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass
from typing import List

PRICE_IN   = 15.0
PRICE_CC   = 18.75
PRICE_CR   =  1.50
PRICE_OUT  = 75.0

@dataclass
class Turn:
    turn_idx: int
    elapsed_s: float
    input_tok: int
    cache_create_tok: int
    cache_read_tok: int
    output_tok: int

    @property
    def cost(self) -> float:
        return (self.input_tok * PRICE_IN
                + self.cache_create_tok * PRICE_CC
                + self.cache_read_tok * PRICE_CR
                + self.output_tok * PRICE_OUT) / 1_000_000

@dataclass
class Session:
    label: str
    wall_s: int
    turns: List[Turn]

def load(label: str, wall_s: int, path: str) -> Session:
    turns: List[Turn] = []
    first = None
    seen_ids: set[str] = set()
    with open(path) as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if rec.get('type') != 'assistant':
                continue
            msg = rec.get('message') or {}
            msg_id = msg.get('id')
            if not msg_id or msg_id in seen_ids:
                continue  # dedupe: same assistant message appears multiple times
            seen_ids.add(msg_id)
            u = msg.get('usage') or {}
            ts = datetime.fromisoformat(rec['timestamp'].replace('Z','+00:00'))
            if first is None:
                first = ts
            turns.append(Turn(
                turn_idx=len(turns)+1,
                elapsed_s=(ts - first).total_seconds(),
                input_tok=u.get('input_tokens',0) or 0,
                cache_create_tok=u.get('cache_creation_input_tokens',0) or 0,
                cache_read_tok=u.get('cache_read_input_tokens',0) or 0,
                output_tok=u.get('output_tokens',0) or 0,
            ))
    return Session(label=label, wall_s=wall_s, turns=turns)

SESSIONS_R1 = [
    ("R1-P0", 245, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1n7twn-84d9ea8d/ed11ec61-76f3-4487-b20d-fdd22585924f.jsonl"),
    ("R1-P1", 130, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1n7twn-84d9ea8d/9231ba4a-2fff-4c42-a2c4-c9626a67d365.jsonl"),
    ("R1-P2", 177, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1n7twn-84d9ea8d/4ddfb8b6-a008-4e1c-a886-e889e4b8feab.jsonl"),
    ("R1-P3", 138, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1n7twn-84d9ea8d/2fe950bd-55fd-4788-ae4f-81485a3993f6.jsonl"),
    ("R1-P4", 534, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1n7twn-84d9ea8d/b1527e2e-f4d4-4e0c-9d25-207b164ea5bf.jsonl"),
]
SESSIONS_R2 = [
    ("R2-P0", 142, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1o66gw-d09ff833/fe16cf1c-b45d-4d41-bbb6-0a16e08a0cba.jsonl"),
    ("R2-P1",  91, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1o66gw-d09ff833/66b082ee-941f-4ec7-845a-22cb4b287773.jsonl"),
    ("R2-P2", 305, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1o66gw-d09ff833/37635893-4703-4647-9c56-8ce55be5bb7c.jsonl"),
    ("R2-P3", 906, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1o66gw-d09ff833/51feb121-e4a0-4eb5-ab39-e95166f80c1e.jsonl"),
    ("R2-P4", 694, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1o66gw-d09ff833/f5b71427-4915-4441-b1cd-52967395fa64.jsonl"),
    ("R2-P5", 579, "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1o66gw-d09ff833/f6cd2ccb-812f-447a-9a49-309fef246a3f.jsonl"),
]

def summarize(sessions: List[Session]) -> None:
    print(f"\n{'label':<8} {'wall_s':>6} {'turns':>5} {'in':>8} {'ccr':>10} {'crd':>12} {'out':>8} {'cost':>8} "
          f"{'crd/turn':>10} {'out/turn':>8} {'crd_slope':>10} {'cost/turn':>10}")
    for s in sessions:
        if not s.turns:
            continue
        total_in = sum(t.input_tok for t in s.turns)
        total_cc = sum(t.cache_create_tok for t in s.turns)
        total_cr = sum(t.cache_read_tok for t in s.turns)
        total_out = sum(t.output_tok for t in s.turns)
        total_cost = sum(t.cost for t in s.turns)
        n = len(s.turns)
        # Slope of cache_read_input_tokens vs turn_idx (simple linear regression)
        xs = [t.turn_idx for t in s.turns]
        ys = [t.cache_read_tok for t in s.turns]
        if n > 1:
            mx = statistics.mean(xs); my = statistics.mean(ys)
            num = sum((x-mx)*(y-my) for x,y in zip(xs,ys))
            den = sum((x-mx)**2 for x in xs)
            slope = num/den if den else 0.0
        else:
            slope = 0.0
        print(f"{s.label:<8} {s.wall_s:>6d} {n:>5d} "
              f"{total_in:>8d} {total_cc:>10d} {total_cr:>12d} {total_out:>8d} "
              f"${total_cost:>7.2f} {total_cr/n:>10.0f} {total_out/n:>8.0f} "
              f"{slope:>10.0f} ${total_cost/n:>8.4f}")

def per_turn_dump(sessions: List[Session]) -> None:
    print(f"\n{'session':<7} {'turn':>4} {'elapsed':>8} {'in':>5} {'ccr':>6} {'crd':>8} {'out':>5} {'cost':>8}")
    for s in sessions:
        for t in s.turns:
            print(f"{s.label:<7} {t.turn_idx:>4d} {int(t.elapsed_s):>7d}s "
                  f"{t.input_tok:>5d} {t.cache_create_tok:>6d} {t.cache_read_tok:>8d} "
                  f"{t.output_tok:>5d} ${t.cost:>7.4f}")

def bucket_by_turn_idx(sessions: List[Session]) -> None:
    """Aggregate across all sessions by turn_idx — does turn 40 cost more than turn 4?"""
    by_idx: dict[int, List[Turn]] = {}
    for s in sessions:
        for t in s.turns:
            by_idx.setdefault(t.turn_idx, []).append(t)
    print(f"\n{'turn_idx':>8} {'n':>3} {'mean_crd':>10} {'mean_out':>8} {'mean_cost':>10}")
    for idx in sorted(by_idx):
        ts = by_idx[idx]
        if len(ts) < 2:  # need at least 2 sessions to bucket
            continue
        mcrd = statistics.mean(t.cache_read_tok for t in ts)
        mout = statistics.mean(t.output_tok for t in ts)
        mcost = statistics.mean(t.cost for t in ts)
        print(f"{idx:>8d} {len(ts):>3d} {mcrd:>10.0f} {mout:>8.0f} ${mcost:>8.4f}")

if __name__ == '__main__':
    rig1 = [load(lbl, w, p) for lbl,w,p in SESSIONS_R1]
    rig2 = [load(lbl, w, p) for lbl,w,p in SESSIONS_R2]
    all_sessions = rig1 + rig2

    print("=" * 100)
    print("PER-SESSION SUMMARY")
    print("=" * 100)
    summarize(all_sessions)

    print("\n" + "=" * 100)
    print("BUCKET BY TURN INDEX (across all 11 piece-sessions)")
    print("=" * 100)
    bucket_by_turn_idx(all_sessions)

    print("\n" + "=" * 100)
    print("PER-TURN DETAIL")
    print("=" * 100)
    per_turn_dump(all_sessions)
