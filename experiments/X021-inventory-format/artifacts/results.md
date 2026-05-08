# X021 — Results

**Experiment:** Inventory Format Optimization
**Click:** `c-mophvf0d`
**Spec:** [`../spec.md`](../spec.md)
**Runlog:** [`runlog.md`](./runlog.md)
**Per-trial extracts:** [`2026-05-07-claude-direct-rerun/`](./2026-05-07-claude-direct-rerun/)
**Companion experiments born from this work:** X023 (implementer
strategy nudges) — see `experiments/X023-implementer-strategy-nudges/`.

## TL;DR

Augmenting the implementer's spec with inline type signatures (#3),
inline pattern templates (#4), and a "do not Read" list (#5) reduces
substantive-workload implementer cost by **~11%** — real but smaller
than the original xguild estimate of −26%. The earlier number was
inflated by a baseline-contamination artifact in the xguild trial
shape; under faithful methodology (claude-direct), the real effect is
roughly half. **H1's ≥15% gate is not cleared**; the directional
finding is informative but underpowered at n=3 against a ~10% CV
noise floor.

The most valuable outputs of this experiment are arguably:

1. **A methodology lesson** — xguild trial shapes contaminate
   pure-read baselines by ~20pp; cost comparisons drawn from xguild
   data should be re-validated under claude-direct.
2. **A noise-floor measurement** — same-workload cost variance is
   3–12% CV (median ~9%) on opus, materially constraining what
   effect sizes can be detected at small n.
3. **A motivating observation for X023** — three runs across three
   different variant groups landed 8–14% below their group means via
   mechanisms (commit decomposition; implementation conciseness)
   that have nothing to do with X021's interventions. Those
   mechanisms are individually larger than X021's spec-content
   intervention.

## Hypotheses — final verdicts

### H1 — Combined v4 cuts substantive cost ≥15% vs baseline

**NOT SUSTAINED.** Mean reduction −11.4% (n=3 v4 runs vs n=1
baseline). Range −6.2% to −18.3%. Two of three runs were under the
gate; the central tendency is below it. The signal is real and
directional, but does not clear ≥15%.

| | baseline (n=1) | v4 combined (n=3) | Δ |
|---|---|---|---|
| cost (USD) | $22.16 | mean $19.63 (range $18.10–$20.79) | **−11.4%** |
| total Read content (KB) | 411 | mean 320 | −22% |
| commit shape | 15 files +1941/−1738 | 15/15/16 files; ~+2000/−1800 | similar |
| verify | exit 0 | exit 0 (3/3) | — |

The mechanism is corroborated: the spec-resident "do not Read"
guidance plus inline content reliably reduces total context loaded
(~22% drop in total Read across all three v4 runs). But the cost
effect is roughly half the read-reduction effect — implementers
compensate with more Edit calls, more output tokens, and more
iteration when given less context to load.

### H2 — Per-idea contribution roughly additive (#3 ≥ #4 ≥ #5)

**NOT SUSTAINED.** Underpowered at n=3 against a ~10% CV noise
floor. v3 alone (#5 do-not-read, n=3, mean −1.5%) is statistically
indistinguishable from baseline. v1 alone (#3 inline-types, n=1,
+26%) appears to backfire — but n=1 is too thin to trust given the
v3 group's noise spread of ±29%. v2 alone (#4 inline-templates) was
not run in isolation.

If you must pick one most-likely-driver of v4's effect, the residual
math (v1 backfires, v3 is flat, v4 is −11%) points at v2
(inline-templates) — but this is inference from missing data, not
measurement.

### H3 — Control variant insensitive to v4 (within ±5%)

**MOSTLY SUSTAINED.** Median cost delta on the doc-cleanup workload
is −1.0%; mean is +5.9% (driven by one cheap baseline outlier that
chose a single monolithic commit instead of a 6-commit sweep). Either
way, the v4 effect on control is **substantially smaller** than on
substantive (~12pp difference between rigs), supporting the
directional claim that spec content augmentation works on substantive
code commissions, not on doc-cleanup commissions.

| | control baseline (n=3) | control v4 (n=3) | Δ (mean) | Δ (median) |
|---|---|---|---|---|
| cost (USD) | mean $13.49 (median $14.35) | mean $14.29 (median $14.20) | **+5.9%** | **−1.0%** |
| total Read (KB) | mean 168 | mean 190 | +13% | — |

## Why xguild's −26% was wrong

The xguild trial 5 (2026-05-03, `w-mopzmkhd`) reported v4 at
**−26%** vs xguild trial 1 ($77.30 → $57.09). That headline drove
the original "H1 SUSTAINED" call.

Under claude-direct's faithful baseline, the real effect is **−11%**.
What changed?

The xguild trial 1 baseline pure-read share was **71%**. Production
baseline pure-read (`rig-moj12h4o` in the production guild) was
**49%**. The claude-direct baseline run came in at **53.7%** —
within ~5pp of production. **xguild was contaminated by ~20pp.**

The contamination source: xguild trials run a full test-guild rig
(plan + implement + review + revise + seal + observation lift). The
review/revise/seal stages re-Read files the implementer Edited,
adding "context" the read-utilization instrument scored as pure-read
on the implementer's transcript. (Whether this was a true instrument
artifact or a real-but-non-implementer effect is a finer point; in
either case it inflated the baseline.)

About half of the xguild's apparent −26% savings was
the v4 intervention "fixing" a contamination its own trial shape
introduced. The real signal — a modest cost reduction on substantive
workloads — is preserved in the new claude-direct data, just at half
the magnitude.

**Recommendation:** for any cost-comparison experiment going forward,
prefer claude-direct over xguild unless the experiment specifically
needs rig-level review/seal stages. xguild's per-trial cost is also
~3× claude-direct's because of the extra engines.

## Run-to-run variance — measured

We have four n=3 groups against the same brief content within each
group. Coefficient of variation:

| group | runs | mean cost | stdev | CV |
|---|---|---|---|---|
| substantive v4 combined | 3 | $19.63 | $1.40 | **7.1%** |
| substantive v3 do-not-read | 3 | $21.82 | $2.45 | **11.2%** |
| control baseline | 3 | $13.49 | $1.61 | **12.0%** |
| control v4 combined | 3 | $14.29 | $0.46 | **3.2%** |

Same workload, three runs: cost varies **3–12% (median ~9%)**.

**Implications for future cost experiments:**

- Effects under ~15% are difficult to detect at n=3.
- Effects of ~25% are 2–3× the noise floor and detectable.
- Plan for **n=5–8 minimum** if expected effect sizes are <20%, or
  pick experiments where the predicted effect is >25%.
- **Never trust an n=1 cost result.** Today's data shows v3's mean
  flipping from +1.8% (n=1) to +4.7% (n=2) to −1.5% (n=3). Same
  intervention, same workload — sample size matters.

## Cheap-outlier observations — motivates X023

Three runs landed **8–14% below their group means** through
mechanisms unrelated to X021's interventions:

| run | cost | discount | distinguishing behavior |
|---|---|---|---|
| Control baseline run 3 | $11.62 | −14% | **1 commit** instead of 6 |
| Substantive v4 run 3 | $18.10 | −8% | lowest output tokens (92K vs 99K/108K) |
| Substantive v3 run 3 | $19.07 | −13% | lowest output tokens (100K vs 108K/118K) |

These cheap runs **were not doing less work**; diffstats are
comparable to (or slightly larger than) their expensive companions.
They were doing the **same work more concisely** — fewer redundant
edits, fewer test-fix cycles, more direct go-from-A-to-B trajectory.
Two distinct mechanisms surfaced:

1. **Commit decomposition** — visible only on control baseline (where
   the brief permitted multiple decomposition strategies). Single
   monolithic commit saved ~14% over the 6-commit sweep choice. Same
   end state.
2. **Implementation conciseness / iteration discipline** — visible
   on substantive runs where commit count was held at 1 across all
   trials. Output tokens varied 92K–118K (28% spread) on the same
   brief. Cheap runs Wrote less code, ran fewer test cycles, and
   made fewer redundant edits.

These mechanisms are individually larger than X021's spec-content
intervention. They became the motivating observations for **X023 —
Implementer Strategy Nudges**.

## Per-trial cost surprise (handoff prediction was off)

The HANDOFF document predicted **$0.40–$0.80/trial** under
claude-direct, total **$3–$6** for the seven-trial sequence. Actual
per-trial cost was **$11–$28**, total **$257.78** across 14 trials.
That's ~50× the predicted total.

The error: the HANDOFF figure was extrapolated from smoke-trial scale
(sub-minute mock work). Real X021 substantive workload runs the
implementer for 30–40 minutes against opus on a 25 KB spec, producing
1700–2300 lines of code. Per-trial cost lands in the $20–$25 range,
which lines up cleanly with the production rig's implement-portion
estimate of $25–$35.

Future X-experiment authors: for opus-based implement-only trials on
production-scale specs, plan **$15–$30 per trial** on substantive
workloads and **$10–$15 per trial** on doc-cleanup workloads. The
HANDOFF estimate has been corrected in the runlog.

## Recommendation

**Do not deploy v4's spec augmentation as a default.** The −11% effect
is real but below the implementation effort threshold for a planner
prompt change. The mechanism (less context loaded) is fragile —
implementers compensate with other work — and the magnitude varies
2× run-to-run on the same intervention.

**Do pursue the cheap-outlier mechanisms in X023.** Commit
decomposition and implementation conciseness produced 8–14% effects
without a deliberate intervention; with a deliberate prompt nudge
they could plausibly produce 20–30%. That's well above today's noise
floor and would be a publishable, deployable finding.

**Carry forward to future experiments:**

- Use **claude-direct** as the canonical trial doctype for
  cost experiments unless rig-level review/seal is specifically needed.
- Use **total Read content (KB)** as the load-bearing context-bloat
  metric. Drop pure-read share — it's artifact-prone.
- Plan for **n=3 minimum** on cost effects ≥20%, **n=5–8** on smaller
  effects, **never n=1** for go/no-go decisions.
- The X011 read-utilization instrument is the canonical tool for
  pure-read analysis but **report total Read content alongside
  share** so future readers can spot the same Edit-vs-Write artifact
  we hit here.

## Artifacts

All trial extracts under
[`2026-05-07-claude-direct-rerun/`](./2026-05-07-claude-direct-rerun/):

- `trial-1-baseline/` — substantive baseline, $22.16
- `trial-2-v1-inline-types/` — substantive v1, $27.90 (n=1)
- `trial-v4-run-{1,2,3}/` — substantive v4 combined, n=3
- `trial-substantive-v3-run-{1,2,3}/` — substantive v3 do-not-read, n=3
- `trial-control-baseline-run-{1,2,3}/` — control baseline, n=3
- `trial-control-v4-run-{1,2,3}/` — control v4 combined, n=3

Each extract carries the trial's manifest, animator-sessions JSON
(stamped costUsd / tokenUsage / durationMs / providerSessionId),
animator-transcripts JSON, codex-history (commits and patches), and
the trial context preamble. Pure-read analysis runnable with:

    python3 experiments/instruments/read-utilization.py \
        --session <providerSessionId>
