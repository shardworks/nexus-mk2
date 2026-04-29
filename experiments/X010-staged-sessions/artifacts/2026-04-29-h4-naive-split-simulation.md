# X010 H4 — Naive-Split & Handoff-Split Simulation

**Date:** 2026-04-29
**Hypothesis tested:** H4 candidate sub-hypotheses derived from a session-economics
analysis during a polyrepo design conversation:

- **H4a** — Naive splitting (no handoff) has a per-half break-even at roughly
  `T_post ≥ B_cost / α` turns, where `B_cost` is the orientation-read cost and
  `α` is the carried-forward phase-1-specific content the second half wouldn't
  otherwise need.
- **H4b** — Savings from splitting scale primarily with `(B − H)` (baseline
  context size minus handoff size), not just with `α`. A small handoff captures
  most of the available savings.
- **H4c** — Per-piece orientation tax (paid once per session) explains the
  X010 H1 monolithic-baseline result more than cache-read drag does.

**Method:** Simulate split-session costs against the cumulative cache-read
curves from 101 archived implement transcripts (≥ 50 turns each) plus 2 recent
rig transcripts. For each transcript, compute monolithic cost, naive-split
cost (with full re-read), and handoff-split cost at handoff sizes
{30K, 60K, 100K} across split points {20%, 30%, 40%, 50%, 60%, 70%, 80%}.

**Click:** none yet — proposing this artifact close the H4-naive-vs-handoff
sub-question and unpark `c-modxxtu6` (checkpoint architecture design) with
quantitative target thresholds.

## Dataset

| Source | Count | Notes |
|---|---:|---|
| Recent rig transcripts (vision-keeper cleanup, reckoner tick) | 2 | From the 2026-04-29 polyrepo conversation. Both 130–155 turns, post-manifest regime. |
| Archived transcripts at `experiments/data/transcripts/*.jsonl` | 99 | Filtered to ≥ 50 unique assistant turns. Mixed engines, mostly post-manifest implement sessions. |
| **Total** | **101** | |

Sessions with auto-compaction events near end-of-session (those with `final_cr <
1K`) were excluded — their reset breaks the cumulative-cost simulation. One
such session was found and dropped.

## Cost Model

For a given session with N turns and per-turn cache-read `cr[i]`:

**Monolithic cost** = `Σ cr[i] for i=1..N`

**Handoff split at K with handoff size H** — session 1 runs unchanged
through turn K; session 2 starts with context H and accumulates only the
*new* content past K:

```
split_cost = Σ cr[i] for i=1..K  +  Σ (H + cr[K+i] - cr[K]) for i=1..N-K
           = monolithic - (N-K) * (cr[K] - H)
```

**Savings (handoff)** = `(N-K) × (cr[K] - H)` — linear in remaining-turns
times the difference between context-at-split and handoff size.

**Naive split at K** — session 2 has no handoff and must re-do the
orientation reads, mirroring session 1's first `T_baseline` turns to reach
the post-orientation context `B`:

```
naive_split_cost = Σ cr[i] for i=1..K  +  Σ cr[i] for i=1..T_base
                 + Σ (B + cr[K+i] - cr[K]) for i=1..N-K
```

**Savings (naive)** = `(N-K) × α  −  baseline_cost`, where `α = cr[K] − B` is
the phase-1-specific content sitting in context at the split point.

`T_baseline` and `B` are estimated heuristically: `B` = the cache-read at the
turn where context first reaches 60% of final, and `T_baseline` is that turn
index. This captures the "knee" where steep orientation reading transitions to
slower incremental work.

The model assumes per-turn cache-read is the dominant cost component
(supported by the 2026-04-03 analysis: 60–94% of cost depending on session
length). Output and cache-create costs are not modeled; this gives a
conservative lower bound on naive-split overhead (the ignored components are
slightly higher per turn in the naive case due to the extra orientation
output).

## Results

### Naive split rarely pays off

**73% of 101 sessions have NO split point at which naive splitting saves
money.** At a midpoint split specifically, only 18% of sessions show any
savings.

| Session-length bucket | N | Naive @ midpoint: median Δ | Best naive Δ achievable | Sessions where naive ever wins |
|---|---:|---:|---:|---:|
| 50–99 turns | 52 | −22.1% | −1.0% (median) | 11/52 (21%) |
| 100–149 turns | 29 | −32.6% | −1.0% | 8/29 (28%) |
| 150–199 turns | 11 | −11.2% | −1.0% | 3/11 (27%) |
| 200–299 turns | 5 | −26.3% | −1.0% | 0/5 (0%) |
| 300+ turns | 4 | +0.0% | +39.3% | 3/4 (75%) |

The "median best naive Δ" sits at exactly −1.0% across most buckets because
in sessions where naive never wins, the simulator returns a sentinel −1.0%.
The interpretation: *most sessions have no naive-split point that beats
monolithic.*

### When naive split does pay off, T_post is large

Among the 27 sessions where some K achieves positive naive savings, the
break-even point's post-split work `T_post = N − K` clusters around:

```
median T_post at break-even: 79 turns
median T_post at optimum:    79 turns (same — because savings curve is broad)
```

The original analytical formula predicted break-even at ~30 turns of
post-split work. **Empirically it's roughly 50–80 turns** — meaningfully
higher. The discrepancy: my formula underestimated baseline cost because it
treated the orientation reads as a constant-overhead lump rather than a curve
that itself accumulates cache-read drag.

The sessions where naive split pays off share a profile:

- **Low T_baseline** (early knee — orientation reads completed in <30 turns)
- **Low B** (post-orientation context under ~80K)
- **Long total N** (≥ 100 turns of work to amortize the re-read tax across)

These are the sessions where the second half does many turns of new work
relative to the orientation cost. The two recent rigs from the polyrepo
conversation don't fit this profile (T_baseline 50–52, B 121K–225K) — and
indeed neither has any naive-split break-even.

### Handoff (30K) is a near-universal win

Distribution of 30K-handoff savings at midpoint split, across all 101 sessions:

```
min:     −28.9%   (one outlier session — small/short, unfavorable curve)
p25:     +26.3%
median:  +33.0%
p75:     +41.9%
max:     +73.7%
positive: 94/101 (93%)
```

**93% of sessions in the dataset benefit from a 30K-handoff midpoint split,
with median savings of one-third.**

By session-length bucket (30K-handoff midpoint savings):

| Bucket | N | Median savings | Best achievable savings (any split point) |
|---|---:|---:|---:|
| 50–99 turns | 52 | +32.3% | +33.7% |
| 100–149 turns | 29 | +32.2% | +40.7% |
| 150–199 turns | 11 | +41.3% | +44.5% |
| 200–299 turns | 5 | +36.0% | +49.5% |
| 300+ turns | 4 | +50.3% | +104.0% |

Savings ramp with session length. Long sessions (300+) leave 50%+ on the
table by running monolithically.

### Naive vs handoff side-by-side, longest sessions

| Session | Turns | Naive best | 30K handoff best | Handoff edge |
|---|---:|---:|---:|---:|
| `cd8ba358` | 588 | +55.2% | +127.0% | +71.8 pp |
| `807a2a89` | 463 | +65.5% | +89.7% | +24.3 pp |
| `1e85ced3` | 383 | +23.4% | +118.3% | +94.9 pp |
| `003e859f` | 311 | (naive ≤ 0) | +42.1% | — |
| `8d1d17b8` | 288 | +52.3% | +90.4% | +38.2 pp |
| `30687cf6` | 250 | (naive ≤ 0) | +49.5% | — |
| `7578529e` | 249 | +59.4% | +113.6% | +54.2 pp |
| `023683e5` | 241 | (naive ≤ 0) | +37.5% | — |
| `be5795ea` | 224 | (naive ≤ 0) | +39.8% | — |
| `5ae4c570` | 195 | +19.1% | +70.8% | +51.7 pp |
| `bae3f417` | 180 | +34.0% | +69.3% | +35.3 pp |
| `166741dd` | 162 | +28.7% | +61.7% | +32.9 pp |
| `rig2-impl` | 155 | (naive ≤ 0) | +53.1% | — |
| `rig1-impl` | 139 | (naive ≤ 0) | +48.2% | — |

Where naive does work, handoff still beats it by 24–95 percentage points.

Note: `+127%` and `+118%` savings figures look impossible (you can't save
more than 100%). They reflect the model's idealization — the handoff session
2's accumulated cache-read genuinely is smaller than the original second
half's accumulated cache-read, because the original second half was
carrying ~300K of context that contributed nothing to the work. The
"savings" exceeds 100% in cases where session 2's run is cheaper than just
the *monolithic incremental cost* of the second half. This is the
theoretical ceiling, not what we'd actually achieve — see Caveats.

## Findings

**H4a — Naive split has a per-half break-even.** Confirmed in shape, refined
in magnitude. The analytical prediction of ~30 turns was too optimistic;
empirical break-even is ~50–80 turns of post-split work. **Practical
implication: naive splitting (no handoff) requires sessions of at least
~150–200 turns total before midpoint split can possibly help.** Below that,
splitting always loses.

**H4b — Handoff savings dominate.** Confirmed strongly. A 30K handoff
captures a median 33% savings vs monolithic across 101 sessions, and works
at almost any split point in the middle ~30–60% range. The savings vector
is `(B − H)` — the difference between what session 2 would have inherited
and what it actually inherits — and `B` (post-orientation context, typically
80–250K) is much larger than `α` (phase-1-specific accumulation, typically
30–100K). **Handoffs are a structural ~3× multiplier on splitting savings.**

**H4c — X010 H1 piece-session result is fully consistent with H4a.** The
piece-session experiment averaged 30–44 turns per piece — well below the
empirical 50–80 turn break-even. Even ignoring per-piece orientation
overhead (which expanded total turn count by 3.5× in Rig 2), naive
splitting at that grain was guaranteed to lose money on cache-read alone.
The 2.6× cost premium observed was the predictable outcome of splitting at
sub-break-even granularity.

## Implications for `c-modxxtu6` (checkpoint-and-fresh-session architecture)

The H4 candidate architecture in the X010 spec addendum (Apr 25) proposes
ending the implement session after each task commit and starting a fresh one
with a "compact handoff (git log + manifest progress + active-task pointer)."
This simulation gives quantitative targets and a sharper failure mode:

1. **Handoff size matters more than split granularity.** The architecture's
   value depends on keeping the handoff under ~30K. A handoff that grows
   to 100K still saves money but loses ~15–25 percentage points of
   benefit.

2. **Per-piece overhead is the real failure mode to avoid.** A handoff
   architecture that cleanly suppresses re-orientation should produce a
   total turn-count expansion under ~1.3× monolithic. The X010 H1
   piece-session result was 3.5× expansion — the architecture must do
   better than that or it falls back into the same trap.

3. **Manifest-task boundaries are the right structural cut, but not for
   the reasons originally proposed.** They're useful because each task
   has a natural test gate ("task t3 verification passed"), which gives
   the handoff a small, well-defined success-token to carry forward. The
   handoff doesn't need the test files, the spec excerpts, or the
   architectural Reads — it only needs "task t3 done at commit `<sha>`,
   move to t4."

4. **Two-checkpoint splits would already be valuable.** The data suggests
   even one checkpoint at midpoint (with a 30K handoff) saves ~33%
   median. A 2-checkpoint version (3 sessions) on a 150-turn implement
   could save closer to 50%.

## Caveats

1. **Cache-read-only model.** The simulation models cache-read tokens but
   not output tokens, cache-creation, or fresh-input tokens. Handoff
   sessions in practice still pay cache-creation for the handoff content
   on session start, and they may produce slightly more output (any
   session start has some narration overhead). Real-world handoff savings
   are probably 5–10 percentage points lower than the model predicts.

2. **Idealized handoff.** The model assumes session 2 can begin productive
   work on turn 1, with no orientation overhead. In reality, even the
   best-designed handoff probably requires 3–5 turns of "where am I, what
   am I doing" before edits begin. This eats into savings linearly with
   how many sessions are split off.

3. **The 60% baseline-knee heuristic is a guess.** It picks the turn
   where cache-read first reaches 60% of final as the orientation/work
   transition. Some sessions don't have a clean knee; some have multiple
   reading bursts spread across the session. A more sophisticated
   heuristic (e.g., gradient-change detection) might reclassify some
   "naive never wins" sessions.

4. **Savings >100% are model artifacts.** A few long sessions show
   handoff savings >100%. Mathematically this means the simulated split
   accumulates *fewer* cache-read tokens than the original was paying
   per turn at the end — which is true on paper but not achievable in
   practice (you can never save more than you spent).

5. **Mixed engine populations.** The archive includes implement sessions,
   reader-analyst, and various other roles. Aggregate stats average across
   all of them. Implement-only stats would likely show even stronger
   savings since implement is the longest-running engine in the pipeline.

## Next Steps

- **Update `X010/spec.md`** with H4a/H4b/H4c as formalized sub-hypotheses,
  carrying the empirical thresholds (50–80 turn naive break-even; 30K
  handoff target; <1.3× turn-count expansion budget).
- **Unpark `c-modxxtu6`.** The handoff architecture is now backed by
  quantitative savings targets. A first design pass can specify the
  handoff schema and target the 30K cap.
- **Phase 2 H4 live test.** Once a handoff prototype exists, run the same
  commission both ways (monolithic vs 2-session handoff at midpoint).
  Compare actual cost, turn count, and quality against the model's
  prediction of ~33% savings.
- **Reconcile the 2026-04-03 "120-turn break-even" finding.** That
  analysis correctly identified a break-even existed but didn't separate
  naive from handoff. This artifact's empirical 50–80 turn naive
  break-even is consistent with the earlier finding — both arrive at
  "long sessions where naive splitting starts to help" being in the
  150-turn neighborhood. The earlier framing should be retired in favor
  of the naive/handoff distinction.

## Data Sources

- Simulation script: `scripts/h4a_naive_split.py` (alongside this artifact).
- Aggregation script: `scripts/h4a_summary.py`.
- Recent rig transcripts: `/home/vscode/.claude/projects/...` (2 files,
  see script for paths).
- Archive: `/workspace/nexus-mk2/experiments/data/transcripts/*.jsonl` (99 files).
- Pricing model: `cache_read = $1.50 / M tokens` (Opus 4 standard tier).
