# Variant trial 3 — YAML format, full schema, no shrinkage (N=1)

**Trial id:** `w-mopaxksh-b985c3a997aa`
**Outer rig:** completed cleanly, ~31 min total
**Reader-analyst session:** `ses-mopay7gp-2b1c3345`
**Codex SHA:** `aff280e75add02bd25e1af0e9467e8a81bfbcd41`
**Surface map injected:** `2026-05-03-surface-map-aff280e7.yaml` (115 KB / ~28K tokens — vs variant 1's 87 KB / ~22K tokens for the same content in JSON)

## Verdict (N=1)

**Format-readability hypothesis FALSIFIED. Variant 3 is the worst
of all four runs (baseline + three variants), and worse than
baseline.**

| | |
|---|---|
| **Cost (primary)** | **+28% MORE EXPENSIVE than baseline** ($11.55 vs $9.04). Worst variant tested. |
| **Mechanism** | Reverted toward baseline behavior on Bash; Grep INCREASED above baseline. |
| **Quality (Tier 1)** | Same shrunk plan structure as v2 (2 scope, 15 decisions, 0 observations). |

YAML's whitespace structure is NOT more LLM-readable than compact
JSON for this planner. The opposite — adding ~28K tokens of
YAML-formatted reference material to the system prompt actively
hurt performance vs no surface map at all.

## Reader-analyst metrics — four-way

| metric | baseline (trial 5) | variant 1 (JSON, 22K tok) | variant 2 (tight, 7K tok) | **variant 3 (YAML, 28K tok)** | v3 vs baseline | v3 vs v1 |
|---|---|---|---|---|---|---|
| **cost USD** | $9.04 | $7.88 | $8.24 | **$11.55** | **+28%** | **+47%** |
| **wall duration** | 15.92 min | 13.95 min | 14.78 min | **16.41 min** | +3% | +18% |
| input tokens | 103 | 65 | 86 | 109 | — | +68% |
| output tokens | 58,487 | 50,499 | 48,351 | 56,438 | −4% | +12% |
| cache read tokens | 11,928,094 | 8,729,263 | 11,029,564 | **15,809,711** | **+33%** | +81% |
| cache write tokens | 257,943 | 359,553 | 242,531 | 357,401 | +39% | −1% |

Cost decomposition (variant 3 vs variant 1):
- Cache writes essentially flat (~$0.00, slightly less)
- Cache reads went UP by 7.1M tokens (~+$2.13)
- Output up slightly (~+$0.45)
- Net: ~+$3.67 worse than variant 1

Cache reads grew explosively. The planner re-read the YAML map
roughly twice as much as it re-read the JSON map — same content,
just different syntax.

## Tool-call profile — mechanism collapsed in a different way

| tool | baseline | variant 1 | variant 2 | **variant 3** |
|---|---|---|---|---|
| Bash | 24 | 5 | 23 | **17** |
| Grep | 25 | 6 | 12 | **29** ⚠️ |
| Read | 34 | 31 | 31 | **37** ⚠️ |

Variant 3 didn't just lose the mechanism win — its Grep count went
ABOVE baseline (+16%) and its Read count is the highest of all four
runs (+9% over baseline). The planner did MORE searching with the
YAML map than with NO map at all.

Bash count of 17 sits between v1's 5 and baseline's 24 — partial
suppression of orientation `ls` walks but nothing like v1's clean
collapse.

## Plan-doc structural metrics — Tier 1

| metric | baseline | v1 | v2 | **v3** |
|---|---|---|---|---|
| inventory words | 3011 | 3272 | 2669 | 4018 |
| scope count | 5 | 3 | 2 | **2** |
| decision count | 22 | 17 | 15 | **15** |
| observation count | 3 | 0 | 2 | **0** |
| spec word count | 6830 | 8068 | 4604 | **5297** |

Same shrinkage pattern as v2 — 2 scope items (below ±30% band),
15 decisions (bottom of band), 0 observations. The shorter spec
(5297 words, −22% vs baseline) is consistent with v2.

The inventory is actually larger (4018 vs 3011 baseline, +33%) —
suggests the planner spent time excerpting from the surface map
into the inventory itself. Possibly related to the explosive cache-
read growth.

## Why YAML did worse — hypotheses

Same content as variant 1, only the syntax changed. So the format
properties themselves are responsible for the degradation:

1. **LLMs see compact JSON in training constantly.** YAML for
   structured data is much rarer in training-corpus volume. The
   model's "JSON parsing" is essentially native; YAML may require
   more attention/processing per re-read.
2. **Whitespace-sensitive structure.** YAML scope is determined by
   indentation depth; the planner may be uncertain about field
   nesting at any given line.
3. **No explicit closing delimiters.** A `}` in JSON tells the
   model "this object is done." YAML has no such marker, so the
   model must infer closures from indentation transitions.
4. **Bigger payload.** 28K tokens of YAML vs 22K tokens of JSON
   means more cache-write up front AND more cache-read per turn.

(2) and (3) might explain why cache reads grew so much — the model
re-traverses the YAML structure more often to keep its bearings.

## What this completes for X018

This is the third and final injection variant. Across all three:
- v1 (compact JSON) was the local optimum (-13% cost; mechanism real)
- v2 (tight; smaller; structured prefixes/codes stripped) → mechanism collapsed; cost worse than v1
- v3 (YAML; same content; bigger) → mechanism worse-than-baseline; cost much worse than v1 AND worse than baseline

The Lever A injection mechanism is bounded. Variant 1 represents
the local maximum in the design space we explored, and that maximum
is below H1's ≥25% threshold.

H1 not sustained. See `spec.md` for the verdict and recommendation
to pivot to a queryable-interface mechanism.

## Files in this extract

- `manifest.yaml` — captured trial config.
- `NOTES.md` — this file.
- `produced-spec.md` — the spec the variant 3 planner wrote (313 lines, 5297 words).
- `produced-inventory.md` — the variant 3 inventory (339 lines, 4018 words).
- `README.md` — auto-generated probe summary.
- `trial-context.yaml` — lab-host probe output.
- `stacks-export/` — full books snapshot (auto-archive ran).
