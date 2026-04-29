# X010 H4 — Operational Findings & Decision Framework

**Date:** 2026-04-29
**Purpose:** Operational guidance derived from the H4a/H4b/H4c
sub-hypothesis findings. This artifact intentionally separates
*recommendation/decision-shape* content from the formal experimental
spec — the X010 spec carries the hypotheses and falsification paths;
this artifact carries the practical "what should we do, given the data."

**Status:** Draft. The decision framework here reflects the empirical
results in:

- `2026-04-29-h4-naive-split-simulation.md` — cost-model simulation
  across 104 transcripts.
- `2026-04-29-h4c-orientation-tax-analysis.md` — fresh-session
  orientation-tax measurement across 105 transcripts.

Findings are subject to revision as the live H4 test (X010 Phase 2)
generates better data.

## Staging Decision Framework

Combining H4a (naive break-even), H4b (handoff dominates), and H4c
(orientation-tax suppression required), the staging-vs-monolithic
decision becomes:

| Session length | Monolithic? | 2-session naive? | 2-session handoff? | Per-task split? |
|---|:---:|:---:|:---:|:---:|
| < 80 turns | ✓ default | ✗ never | (marginal) | ✗ never |
| 80–150 turns | ✓ default | ✗ usually loses | ✓ +30% median | ✗ never |
| 150–250 turns | (acceptable) | ~ often loses | ✓ +35% median | ✗ never |
| 250+ turns | (cost penalty) | ~ sometimes wins | ✓ +35-50% median | ~ depends on per-piece turns |

Per-task split (what X010 H1 actually tested) remains a poor default —
sub-50-turn pieces don't clear naive break-even, and the orientation
tax compounds across many small sessions. **The architectural
improvement direction is fewer, larger splits with structured handoffs,
not many small splits.**

## Implication for the c-modxxtu6 candidate architecture

The candidate architecture (checkpoint after each manifest task) is on
the right track but needs to satisfy both:

1. **Handoff stays under ~30K** — the contents must be a tight summary
   (commit SHAs, manifest progress, active-task pointer), not a
   transcript carry-forward. From H4b: 30K-handoff median midpoint
   savings is 32%; a 100K handoff drops it to ~15%.

2. **Each post-handoff session begins productive work within ~5 turns** —
   the handoff prompt structure must replace re-orientation, not invite
   it. From H4c: median fresh sessions take 6 turns and accumulate 24K
   context before first productive call; without explicit orientation
   suppression, that cost is paid per fresh session.

If a manifest has many small tasks (5+ tasks averaging <30 turns each),
checkpointing per task may still hurt because of orientation tax across
many sessions. A coarser strategy (checkpoint every 2–3 tasks) likely
gives better economics than per-task.

## Practical recommendations by session shape

### Small commissions (under 80 turns)

Run monolithic. Splitting is reliably negative or marginal at this
scale. Cost optimizations should target inventory excerpting (Priority
1 under `c-mok4nke6`) rather than session decomposition.

### Medium commissions (80–250 turns, the typical regime)

Run monolithic for now; handoff-split when the c-modxxtu6 architecture
ships. Expected cost reduction: ~30-35%. Use a single midpoint split,
not per-task. Keep the handoff under 30K tokens.

### Large commissions (250+ turns)

These are the strongest case for handoff splitting (~35-50% savings).
They're also good candidates for *re-decomposition at the brief level*
— if a single commission is reaching 250+ turns, the brief is probably
too large. The X010 cliff finding (`c-moe0lgs1`) and the predicted-files
gate (`c-moecggl6`) are upstream interventions that would prevent
commissions from reaching this size in the first place. Both upstream
prevention and downstream handoff splitting are valuable.

### Very large commissions (500+ turns)

Rare in the dataset. Likely indicate a brief-decomposition failure
upstream. Should be flagged for brief-author review; a per-commission
handoff split is unlikely to recover the costs without also fixing
the source.

## Sequencing recommendation

If only one intervention can be funded at a time:

1. **Inventory excerpting (Priority 1)** first — cheapest, no
   architecture impact, ~20% cost reduction on substantive work.
2. **Test scoping (Priority 2)** second — compounds with everything
   else, saves wall time, ~10-15% cost.
3. **Handoff split prototype (Priority 3)** third — large lift but
   simulation-validated ~35% savings on long sessions; takes the
   residual cost surface after Priorities 1+2.

Per the cost-optimization landscape (`c-mok4nke6`), ~8× compounding
reduction if all three plus the Sonnet swap stack at expected rates.

## Caveats

1. **Decision boundaries are derived, not measured.** The 80/150/250
   turn thresholds are model predictions from H4a/H4b. They have not
   been validated by a live H4 test. Treat them as initial guidance
   subject to revision.

2. **The "per-task split: never" verdict has an asterisk.** It's
   accurate for the X010 H1 piece-session shape (per-task, 5+ pieces,
   no handoff). A per-task split with a clean handoff might still
   work if the per-task turn count is large enough — but this isn't
   what X010 H1 tested, and the data argues for fewer/larger splits
   regardless.

3. **All percentages assume the simulation cost model holds.** Live
   handoff testing may surface unmodeled costs (output expansion,
   handoff bloat in practice, orientation re-emergence). The H4
   Phase 2 test is designed to surface these.
