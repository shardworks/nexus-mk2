# X010 H1 — Cheap-Mining of Two Decomposed Rigs

**Date:** 2026-04-16
**Hypothesis tested:** H1 — Long sessions accumulate marginal cost that staging avoids.
**Method:** Mine per-turn token usage from existing piece-session transcripts of two
decomposed rigs; project what a single-session (monolithic) run of the same work
would have cost by simulating cache-read accumulation.
**Click:** `c-mo1w0d9a-16ddf9904d2c` (H1 cheap-mining, concluded by this artifact)
**Related clicks:** `c-mo1w0g2n-4b206fe845e5` (expensive baseline, parked; triggered as `rig-mo1wajm9-8bf5d205`)

## Dataset

Two decomposed rigs using `piece-session` engine with `implement-loop` orchestrator:

| Rig | Writ | Spec | Pieces | Total turns | Observed cost | Wall time |
|---|---|---|---:|---:|---:|---:|
| 1 | `w-mo1n7t3l-daa33f72a08c` | "piece engine shows as cancelled" fix | 5 | 150 | $6.92 | ~20 min |
| 2 | `w-mo1o65ky-683de2230313` | "Oculus click tree view" (25-decision spec) | 6 | 267 | $20.11 | ~48 min |

Transcripts sourced from:
- `/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1n7twn-84d9ea8d/`
- `/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1o66gw-d09ff833/`

Mapped to Laboratory session YAML records by end-time.

## Method

1. **Per-turn extraction.** For each assistant message in each transcript, record
   `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and
   `output_tokens`. Dedupe by `message.id` since Claude Code's transcript
   format writes each assistant message multiple times (streaming echoes).

2. **Pricing model.** Blended Opus 4 estimates (see *Caveats* for the 3× absolute
   offset from actual): input $15/M, cache_create $18.75/M, cache_read $1.50/M,
   output $75/M. Ratios between scenarios are preserved even if absolute
   dollars are inflated.

3. **Monolithic projection.** Simulate the same per-turn work in one continuous
   session. Each simulated turn carries `cache_read = cumulative_cache_create_from_prior_turns
   + initial_context`. Per-turn `input`, `cache_create`, and `output` are held constant
   from the observed decomposed data. This models the known effect that a continuous
   session must replay its full prior context on every turn.

Scripts: `scripts/h1_mining.py` and `scripts/h1_projection.py` in this artifact directory.

## Per-Session Results

Dedup'd turn counts, summed token usage, and derived marginal measures:

```
label    wall_s  turns      input   cache_create   cache_read    output   crd/turn   crd_slope
R1-P0      245s    39          44         46,292    1,692,668    10,888    43,402      960
R1-P1      130s    18          23         37,358      697,327     7,664    38,740    2,038
R1-P2      177s    28          38         89,739    1,232,190    12,483    44,007    1,852
R1-P3      138s    23          28         49,663    1,069,068     7,847    46,481    2,259
R1-P4      534s    42          47         71,090    2,491,126    20,109    59,313    1,546
R2-P0      142s    23          38         85,117    1,052,103     8,956    45,744    2,097
R2-P1       91s    20          25         56,253      887,741     4,576    44,387    2,566
R2-P2      305s    53          63        160,735    4,053,695    18,969    76,485    1,590
R2-P3      906s    50          60        169,736    4,057,278    38,484    81,146    2,504
R2-P4      694s    80          90        180,552    7,424,067    37,027    92,801    1,248
R2-P5      579s    41          51        163,057    3,113,061    24,492    75,928    2,087
```

- `crd/turn` — mean cache-read tokens per turn within the session.
- `crd_slope` — linear-regression slope of `cache_read` vs `turn_index` (= new
  cache-read tokens added per additional turn).

**`crd_slope` is remarkably consistent across sessions at 1,000–2,500 tokens/turn.**
This is the marginal context-drag: each additional turn must carry ~1.5–2.5K
more tokens of context than the previous one. Slope is session-agnostic; it
reflects the rate at which new information (tool outputs, file contents,
agent thinking) enters the persistent context window per turn of work.

## Bucket-by-Turn-Index

Averaging across all 11 piece-sessions by position within the session:

| Turn | Sessions observed | Mean cache_read |
|---:|---:|---:|
| 1 | 11 | 14,440 |
| 10 | 11 | 50,924 |
| 20 | 10 | 65,186 |
| 30 | 10 | ~80,000 |
| 50 | 5 | ~95,000 |
| 60 | 3 | ~110,000 |
| 75 | 2 | ~110,000 |

Growth is roughly linear through turn ~50 then flattens — likely because only
the longest session (R2-P4 at 80 turns) reaches those turns, and that session
probably hit auto-compaction. The visible linear slope in this cross-session
average is **≈1,500 tokens/turn**, consistent with the per-session slopes.

## Monolithic Projection

Simulated cost of the same work done in one continuous session:

```
RIG 1 (150 total turns):
  Observed decomposed (model dollars):  $20.72
  Simulated monolithic (model dollars): $46.81
  Ratio:                                2.26×
  Final projected context:              308,582 tokens

RIG 2 (267 total turns):
  Observed decomposed (model dollars):  $56.11
  Simulated monolithic (model dollars): $206.06
  Ratio:                                3.67×
  Final projected context:              829,890 tokens   ← 4× Opus 4 window
```

Normalizing to real-money equivalents (apply the ~3× deflation factor observed
between the model and actual session YAML costs):

| Rig | Observed (actual) | Projected monolithic (actual) | Ratio |
|---|---:|---:|---:|
| Rig 1 | $6.92 | ~$15.60 | 2.3× |
| Rig 2 | $20.11 | ~$69 | 3.4× |

The ratio grows with total work because cache-read drag compounds quadratically
in a single session (every prior turn is re-read on every subsequent turn).

## Findings

**H1 (weak form) is confirmed.** Cache-read grows linearly within sessions at
~1,500–2,500 tokens/turn. This produces a real but gentle per-turn cost
increase — ~$0.002 extra per turn at current cache-read pricing, compounding
across hundreds of turns into a 2–4× aggregate overhead for monolithic
execution on the same total work.

**H1 (strong form — catastrophic failure above a context threshold) is
implicated but not proven by mining alone.** The Rig 2 monolithic projection
of 830K tokens of context exceeds Claude Opus 4's ~200K window by 4×. A real
monolithic run of the Oculus spec would have to hit one of three failure
modes around turn 75–100:

1. Hard context-window error (engine fails, session ends).
2. Auto-compaction with loss of earlier context (quality cost).
3. Self-imposed checkpoint/handoff patterns by the agent (staging-in-prompt).

The currently-running `rig-mo1wajm9-8bf5d205` — a single-session rerun of the
same Oculus spec using the older `implement` engine — will provide the
empirical data point for which failure mode dominates.

## Caveats

1. **Pricing model is off by ~3× from actual.** My estimates inflate absolute
   dollar values by a factor of ~3 relative to what Claude billed (per the
   session YAML `cost_usd` fields). Possible causes: blended tier assumptions,
   Claude Code applying additional caching discounts I haven't modeled, or
   model-class differences. Ratios between scenarios are preserved.

2. **The monolithic simulation is idealized.** It assumes each turn's per-turn
   `input` and `output` work would be identical in a single session — in
   reality, a monolithic agent might take fewer turns (less orientation
   overhead) or more turns (confused by accumulated context). The projection
   is best read as a "what if the work pattern held constant" estimate, not
   a prediction.

3. **Claude's cache retrieval isn't perfect.** Real monolithic runs may show
   slightly lower cache_read than the simulation projects because of
   pruning, TTL expiry, or optimization. The simulation is a reasonable
   upper bound on context drag.

4. **No quality comparison.** This analysis is pure cost-and-volume. H2 (whether
   decomposed runs produce *better* output than monolithic runs) is unaddressed
   here and remains a separate parked inquiry.

5. **Two rigs is a small sample.** The `crd_slope` consistency across 11
   sessions gives some confidence it generalizes, but a richer corpus (the
   2026-04-03 analysis has 71 sessions) should be cross-checked. Notably the
   earlier artifact concluded "economic case for staged sessions is weak at
   current session lengths" — this newer analysis is more bullish on staging,
   and the difference is worth reconciling. Likely reasons: the 2026-04-03
   analysis didn't project monolithic costs for very long sessions (the
   dataset cut off well below the 267-turn Rig 2 scale), and didn't account
   for the hard context-window ceiling that dominates at that scale.

## Next Steps

- **Conclude `c-mo1w0d9a-16ddf9904d2c`** (this click) with the H1-weak-confirmed
  finding.
- **Wait for `rig-mo1wajm9-8bf5d205`** to complete — its outcome is the
  H1-strong data point.
- **Reconcile with 2026-04-03 analysis** at some point, since the two arrive
  at different conclusions.
- **Design staged-sessions threshold** (parked H4 click `c-mo1w0rfk-2e0eeb3a1460`)
  — the crd_slope gives a first-order estimate: staging pays off above roughly
  `(200K context limit) / (crd_slope ≈ 2K per turn) ≈ 100 turns per session`.
  Rig 2's pieces averaged 44 turns — well below. A monolithic Rig 2 at 267
  turns is well above.
