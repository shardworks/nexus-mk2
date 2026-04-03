# X010 Phase 1 — Cost Curve Analysis

**Date:** 2026-04-03
**Dataset:** 71 sessions with 4+ assistant turns (of 104 total), from `/workspace/shardworks/.nexus/sessions/`
**Model:** Claude Opus 4 (all sessions)
**Pricing:** Input $15/M, Output $75/M, Cache write $18.75/M, Cache read $1.875/M

## Summary

The cost curve is real but gentle. Long sessions cost more per turn
than short ones, but caching absorbs enough of the growth that
restarting fresh (staging) is more expensive than continuing — for
sessions under ~120 turns. The economic case for staged sessions is
weak at current session lengths. If staging is pursued, it must be
justified on quality grounds (H2), not economics.

## Aggregate Cost Breakdown

| Metric | Value |
|---|---|
| Total spend (71 sessions) | $445.27 |
| Context tax (cache reads) | $270.86 (60.8%) |
| Average session cost | $6.27 |
| Median session turns | ~35 |

**Context tax** = the cost of cache-read tokens, which are re-reads
of prior conversation history. This is the dominant cost component
across all sessions, accounting for 61% of total spending.

## Cost Per Turn by Session Length

| Bucket | N | Avg $/turn | Avg Tax % | Avg Total $ |
|---|---|---|---|---|
| Short (4–10 turns) | 23 | $0.2210 | 32.7% | $1.35 |
| Medium (11–25 turns) | 13 | $0.1299 | 45.1% | $2.06 |
| Long (26–50 turns) | 6 | $0.0848 | 57.4% | $2.98 |
| Very Long (51+ turns) | 29 | $0.1173 | 59.6% | $12.74 |

Note: short sessions have *higher* average cost per turn because
cache writes (initial context construction) dominate when there are
few turns to amortize them over. The cost per turn actually decreases
from short to long before context tax catches up.

## Context Tax Curve

The fraction of each turn's cost that goes to cache reads grows
monotonically with turn number:

| Turn Range | N samples | Avg $/turn | Context Tax % |
|---|---|---|---|
| 1–10 | 400 | $0.093 | 49.9% |
| 11–20 | 400 | $0.105 | 53.3% |
| 21–30 | 354 | $0.110 | 61.4% |
| 31–40 | 324 | $0.119 | 64.9% |
| 41–50 | 296 | $0.104 | 72.3% |
| 51–60 | 272 | $0.120 | 73.2% |
| 61–70 | 250 | $0.113 | 78.4% |
| 71–80 | 205 | $0.124 | 79.8% |
| 81–90 | 160 | $0.125 | 85.6% |
| 91–100 | 106 | $0.134 | 85.5% |
| 101–110 | 81 | $0.127 | 89.2% |
| 111–120 | 70 | $0.118 | 87.6% |
| 121–130 | 51 | $0.143 | 89.4% |
| 131–140 | 35 | $0.139 | 93.5% |
| 141–150 | 26 | $0.137 | 92.6% |
| 151–160 | 10 | $0.151 | 94.0% |
| 191–200 | 10 | $0.180 | 94.3% |

By turn 130+, 94 cents of every dollar goes to re-reading context
that has already been processed. The productive work — fresh input
tokens and output tokens — is a sliver.

## Q1 vs Q4 Marginal Cost Ratio

For sessions with 15+ turns, comparing the average cost per turn in
the first quarter vs the last quarter:

| Session | Turns | Q1 $/turn | Q4 $/turn | Ratio |
|---|---|---|---|---|
| ses-15587ae7 | 369 | $0.115 | $0.317 | 2.75x |
| ses-313f5383 | 135 | $0.109 | $0.202 | 1.85x |
| ses-488bb790 | 95 | $0.081 | $0.163 | 2.00x |
| ses-813e135d | 92 | $0.056 | $0.081 | 1.46x |
| ses-fcee3ba7 | 146 | $0.080 | $0.112 | 1.40x |
| ses-66af440c | 121 | $0.102 | $0.139 | 1.36x |
| ses-ca1c0d10 | 128 | $0.097 | $0.123 | 1.27x |
| ses-31e94e2a | 108 | $0.123 | $0.143 | 1.16x |
| **(average across 15 sessions)** | | | | **1.35x** |

**Against X010 thresholds:**
- Confirmed (>2x): only 2 of 15 sessions
- Partially confirmed (1.3–2x): 4 of 15 sessions
- Below threshold (<1.3x): 9 of 15 sessions

**Verdict: H1 is partially confirmed.** The marginal cost increase is
real but modest. Context tax is enormous in aggregate (61%) but its
*growth rate* is gentle enough that long sessions don't blow up the
way you'd expect.

## Staging Simulation

Modeled: "What if sessions were capped at 50 turns and restarted
fresh?" Assumes 5 turns of re-orientation overhead per restart
(conservative — X007 H2 found orientation cost is significant).

| Session | Turns | Actual | Staged | Savings |
|---|---|---|---|---|
| ses-15587ae7 | 369 | $73.41 | $38.92 | **47.0%** |
| ses-313f5383 | 135 | $21.36 | $17.06 | **20.1%** |
| ses-488bb790 | 95 | $11.95 | $9.65 | **19.2%** |
| ses-fcee3ba7 | 146 | $16.14 | $14.61 | **9.5%** |
| ses-f9894e54 | 122 | $10.07 | $15.57 | -54.7% |
| ses-967542c3 | 150 | $17.29 | $20.53 | -18.7% |
| ses-a963ed47 | 103 | $12.08 | $21.69 | -79.6% |
| **(all 29 sessions)** | | **$369.58** | **$414.55** | **-12.2%** |

**Staging costs 12% more overall.** Only 4 of 29 sessions show
positive savings, and 3 of those are >120 turns. The re-orientation
overhead — rebuilding the cache, re-reading the codebase, picking up
where the prior session left off — eats the context tax savings for
typical sessions.

The crossover point appears to be around **120–150 turns**, where
context growth finally outpaces restart overhead. Below that, just
let the session run.

## The Orientation Cost Lever

The staging simulation assumes 5 turns of re-orientation overhead per
restart. This is conservative — X007 H2 (Orientation Cost Dominates,
confirmed) found that agents spend a significant fraction of their
early turns exploring the codebase before doing productive work.

If orientation cost could be reduced — e.g., via warm sessions
(X007 artifact: `warm-session-spec.md`), pre-loaded codebase context,
or better manifest construction — the staging crossover point would
drop. At 2 turns of orientation overhead instead of 5, staging becomes
economical at shorter session lengths and the 12% aggregate penalty
could flip to a net savings.

**This is the key lever.** The economic argument for staging depends
on solving the orientation problem first. Reducing startup cost makes
every fresh session cheaper, which makes staging viable, which in turn
reduces context tax. The two optimizations compound: cheaper restarts
→ more frequent staging → lower context tax → lower total cost.

X007's warm-session mechanism and any future work on manifest
optimization are prerequisites for revisiting the staging economics.

## Implications for X010

### Phase 2 (Quality Comparison) — Still worth running

The economic case is weak, but quality may tell a different story.
If agents produce measurably better work in short sessions (fresher
context, less drift), that could justify staging even at a cost
premium. Phase 2 tests this independently.

### Phase 3 (Systemic Costs) — Weaker motivation

H3 (merge conflicts, blast radius) still matters, but without the
cost argument reinforcing it, the case for staged sessions rests on
quality + systemic risk alone. The "just write smaller commissions"
outcome from the spec becomes more likely — better task decomposition
may be the real answer, not mechanical staging.

### Commission sizing as the natural lever

The data suggests that **avoiding 120+ turn sessions through better
commission scoping** is more cost-effective than staging. A commission
that produces a 60-turn session costs roughly $8 and has modest
context tax. A commission that would produce a 150-turn session should
probably be decomposed into 2–3 independent commissions, each merging
separately — which also reduces merge conflict risk (H3) without
needing staging infrastructure.

## Raw Data

Analysis script and full per-session data available on request.
Source data: 104 session JSON files in
`/workspace/shardworks/.nexus/sessions/`.
