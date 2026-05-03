# Variant trial 2 — tight surface-map (levers 1+2+3), N=1

**Trial id:** `w-mop8812c-b8b8b71c093d`
**Outer rig:** `rig-mop8ixz2-b80f3319` (completed cleanly, ~22 min total)
**Inner rig:** `rig-mop8jixh-3b70546c` (in test guild)
**Reader-analyst session:** `ses-mop8jj1g-31d65ee8`
**Codex SHA:** `aff280e75add02bd25e1af0e9467e8a81bfbcd41`
**Surface map injected:** `2026-05-03-surface-map-aff280e7-tight.txt` (29.5 KB / ~7.4K tokens — vs variant 1's 87 KB / ~22K tokens)

## Verdict (N=1)

**Tightening backfired. Variant 2 cost MORE than variant 1, and the
mechanism win largely collapsed.**

| | |
|---|---|
| **Cost (primary)** | **−9% from baseline** (vs variant 1's −13%). Variant 2 is **+4.6% MORE expensive than variant 1**. |
| **Mechanism (secondary)** | **Mostly lost.** Bash 5 → 23 (back to baseline). |
| **Quality (Tier 1)** | Worse than variant 1 — 2 scope items, 15 decisions (bottom of band), spec is 32% shorter than baseline. |

The shrinkage hypothesis is **falsified**. Format/representation
matters more than byte count.

## Reader-analyst metrics — three-way

| metric | baseline (trial 5) | variant 1 (JSON, 22K tok) | **variant 2 (tight, 7.4K tok)** | v2 vs baseline | v2 vs v1 |
|---|---|---|---|---|---|
| **cost USD** | $9.04 | $7.88 | **$8.24** | **−9%** | **+4.6%** |
| **wall duration** | 15.92 min | 13.95 min | 14.78 min | −7% | +6% |
| input tokens | 103 | 65 | 86 | — | +32% |
| output tokens | 58,487 | 50,499 | 48,351 | −17% | −4% |
| cache read tokens | 11,928,094 | 8,729,263 | **11,029,564** | **−7%** | **+26%** |
| cache write tokens | 257,943 | 359,553 | **242,531** | −6% | −33% |

Cost decomposition (vs variant 1):
- Cache writes saved ~$0.45 (the smaller prompt, as predicted)
- Cache reads cost ~$0.69 MORE (unexpected!)
- Net: ~$0.36 worse than variant 1

The cache-write tax did fall as predicted, but the cache-read
volume went up by 2.3M tokens — wiping out the savings and then
some.

## Tool-call profile — the mechanism collapsed

| tool | baseline | variant 1 | **variant 2** | v2 vs v1 |
|---|---|---|---|---|
| **Bash** | 24 | 5 | **23** | **+360%** |
| Grep | 25 | 6 | **12** | +100% |
| Read | 34 | 31 | 31 | — |
| Glob | 0 | 4 | 0 | −100% |

**Variant 2's Bash count is essentially identical to baseline (23 vs
24).** The 79% Bash reduction variant 1 achieved is gone. Variant 2's
Bash calls are 7 `ls` walks and 16 grep-via-bash invocations —
exactly the baseline orientation pattern.

The planner, when given the tight format, reverted to its
pre-surface-map workflow of "ls everything, grep everything." The
JSON format had successfully changed that behavior; the tight format
did not.

## Plan-doc structural metrics — Tier 1

| metric | baseline | variant 1 | **variant 2** | thresh | v2 result |
|---|---|---|---|---|---|
| inventory words | 3011 | 3272 | **2669** | ±40% | ✅ pass |
| scope count | 5 | 3 ⚠️ | **2** | ±30% | ⚠️⚠️ flagged |
| decision count | 22 | 17 | **15** | ±30% (15.4–28.6) | ⚠️ at boundary |
| observation count | 3 | 0 | 2 | not strict | ok |
| spec word count | 6830 | 8068 | **4604** (−32%) | not strict | ⚠️ noticeably short |

Variant 2 shrank the spec by 32% vs baseline (4604 vs 6830 words)
and 43% vs variant 1 (4604 vs 8068). That's a **larger** structural
divergence than variant 1 and pushes the decision count to the
bottom of the ±30% band. Pure quality regression on this dimension.

## What broke the mechanism — hypotheses

The tight format made four changes simultaneously:

1. **Stripped path prefixes.** `cartograph` instead of `src/cartograph.ts`. The planner may have lost confidence that map entries map to real files. Cue: extra `ls` to verify.
2. **Kind codes.** `fn`, `int`, `var` etc. Require mental decoding vs spelled-out forms. Possibly less skimmable.
3. **`publicApi:` line lacks kinds.** Re-exports collapsed into a names-only line. When the planner is checking what a barrel file exports, the missing kinds may force a lookup elsewhere.
4. **Comma-separated names.** Long lines like `int: A, B, C, D, E, F, G, H, I, J, K, L, M` are harder to scan for a specific symbol than indented JSON `[{"name":"A","kind":"interface"},...]`.

We did not isolate which of these caused the readability collapse.

## Sample of variant 2's Bash calls

The planner's grep-via-bash calls are exactly what variant 1
suppressed:

- `ls packages`
- `ls packages/framework packages/plugins`
- `ls packages/plugins/cartograph/src`
- `grep -rn "ext\['" packages/plugins --include="*.ts" | head -30`
- `grep -rn "VisionDoc\|ChargeDoc\|PieceDoc" packages/plugins | grep -v packages/plugins/cartograph | head -20`
- `grep -rn "cartograph" packages/plugins --include="*.ts" | grep -v packages/plugins/cartograph | head -30`
- 17 more

These are the orientation traffic the surface map was supposed to
displace. Variant 1 displaced them; variant 2 didn't.

## Implications

- **Lever A (prompt injection) has structural limits.** Tightening past ~22K tokens regresses on cost AND mechanism, not just plateaus.
- **Format/representation is load-bearing.** The 7.4K-token tight format did worse than the 22K-token JSON format. Bytes aren't the bottleneck; readability is.
- **Strong evidence for the queryable-interface route (X019-style).** Sean's intuition (captured as click during analysis) appears to be correct. A queryable interface lets the planner pull only what it needs without paying a re-read tax on the entire prompt every turn.

## Files in this extract

- `manifest.yaml` — captured trial config.
- `NOTES.md` — this file.
- `produced-spec.md` — the spec the variant 2 planner wrote (TBD, extract from astrolabe-plans.json).
- `produced-inventory.md` — the variant 2 inventory (TBD).
- `README.md` — auto-generated probe summary.
- `trial-context.yaml` — lab-host probe output.
- `stacks-export/` — full books snapshot.
