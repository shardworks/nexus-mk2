# Tool-use mechanism metrics — X022 preliminary

**Date:** 2026-05-08 (Coco)
**Source:** `scripts/extract-tool-use-metrics.py` run against trial 1
(xguild book) + trials 2–7 (live ~/.claude/projects/ jsonls).
**Caveat:** baseline n=1 (trial 1 only). Trials 8–9 (substantive
baseline replicates 2/3) still in flight; will refresh when they
land.

## Per-cell means

| metric | sub-baseline (n=1) | sub-combined (n=3) | ctrl-combined (n=3) | Δ vs baseline |
|---|---:|---:|---:|---:|
| Bash count | 94.0 | 69.0 | 37.7 | **-26.6%** |
| Edit + MultiEdit | 68.0 | 56.7 | 40.3 | -16.7% |
| Bash / (Bash+Edit) ratio | 0.58 | 0.55 | 0.48 | -5.5% |
| Read count | 72.0 | 64.3 | 31.3 | -10.6% |
| Targeted-Read fraction | 0.79 | 0.79 | 0.92 | flat |
| Read-after-Grep count | 0.0 | 1.7 | 2.3 | +∞ |
| Grep tool count | 0.0 | 4.3 | 8.7 | +∞ |
| `grep` inside Bash | 44.0 | 29.7 | 17.7 | -32.6% |
| **Total searches (Grep + bash grep)** | **44.0** | **34.0** | **26.3** | **-22.7%** |
| Repeat-grep calls (≥2× same pattern) | 0.0 | 0.7 | 5.3 | +∞ |
| `pnpm -w test` count | 7.0 | 8.0 | 3.7 | **+14.3%** |
| `pnpm --filter` test count | 5.0 | 4.3 | 3.0 | -13.3% |
| Filter-test share | 0.42 | 0.32 | 0.45 | **-23.0%** |
| `sed -i` (bulk-edit) count | 3.0 | 1.7 | 2.0 | **-44.4%** |

## Mechanism-by-mechanism reading

### #8 — "Prefer Bash bulk edits for systematic changes"
**Wrong direction.** Variant uses `sed -i` LESS (3 → 1.7) and the
Bash/(Bash+Edit) ratio dropped slightly (0.58 → 0.55). The nudge
either (a) didn't fire or (b) was actively counterproductive.
Possible explanation: the Reckoner refactor in this rig isn't
particularly bulk-edit-shaped (it's mostly individual-callsite
changes), so the brief's content limited the headroom for #8 to
matter.

### #9 — "Targeted Reads after Grep"
**Flat at 0.79 in both cells.** Baseline already had 79% of Reads
carrying offset/limit; variant doesn't move it. Likely a ceiling
effect — the implementer was already fairly targeted, and the
nudge can't push past the ceiling without changing what kind of
file gets read.

### #10 — "Avoid repeat greps"
**Strong signal in the predicted direction.** Total search activity
(Grep tool + `grep`-in-Bash) dropped 22.7% (44 → 34). This is the
load-bearing mechanism most consistent with the cost reduction.

The substantive-combined cell still has a small repeat-grep load
(0.7 mean), but vastly less than the control-combined cell (5.3),
which suggests the substantive rig's repeat-grep pattern (the
`handleWritsChange|runCatchUpScan|stacks.watch` re-search the
landscape called out) was actually addressed.

### #11 — "Narrow test filters during iteration"
**Wrong direction.** Variant runs MORE workspace tests (7 → 8)
and FEWER filtered tests (5 → 4.3); filter-test share dropped
from 42% to 32%. The nudge appears to have either misfired or
lost out to other behaviors.

### #12 — "Don't re-test packages you didn't change"
**Wrong direction (same signal as #11).** Workspace test count up,
not down.

## Cost-reduction provenance

The variant cell saved $4.54 mean implementer-cost vs baseline.
Mechanism breakdown by what *actually* moved:

- **Search activity ↓ 22.7%** — accounts for some of the cache-read
  reduction (the X022-spec headline 62.7M → 49–55M cache-read tokens).
- **Bash count ↓ 26.6%** — fewer turns interacting with the shell.
- **Edit + MultiEdit ↓ 16.7%** — fewer file-modification rounds.
- **Read count ↓ 10.6%** — fewer code-context reads.

The cost-reduction story is **"the variant just does less work"**
across the board — fewer turns, fewer ops per turn — rather than
"the variant does the same work more cheaply." That's a real
intervention effect, but not in the per-mechanism shape the spec
predicted.

## Interesting baseline behavior — search via Bash, not Grep tool

Trial 1 implementer made **zero** Grep tool calls and 44 `grep`
invocations inside Bash. The variants made 4–9 Grep tool calls
and 18–43 Bash-grep invocations.

The combined-nudges role file mentions Grep tool by name (#9
"Targeted Reads after Grep"), which appears to have *partially*
migrated search from Bash → Grep tool — but the dominant effect
was reducing total search activity (`-22.7%`) rather than
substituting one for the other.

## Confidence statement

- **Substantive cost delta is real (~12%)** but the n=1 baseline
  is sitting inside X021's measured 3–12% noise floor. Trials 8–9
  will either firm or weaken this.
- **Mechanism findings are preliminary** — same n=1 baseline issue.
  Per-trial variation in the variant cell is moderate (CV 7%); the
  baseline could itself be ±20% in either direction.
- **The wrong-direction signals (#8, #11, #12) are the most
  notable finding.** If they hold up post-replication, the
  combined-nudge bundle is succeeding *despite* three of its five
  ideas, not because of them. A per-idea ablation experiment
  becomes the natural follow-up.

## Recommended follow-ups

1. **Wait for trials 8–9** (in flight, ~90 min ETA) and re-run the
   extractor with n=3 baseline.
2. **Per-idea ablation experiment.** Variant arms: just-#10, just-#8,
   just-#11+#12. Spec'd as a follow-up to X022 if the n=3 picture
   sustains.
3. **Re-examine spec hypothesis text.** H1 is sustained by cost,
   but the assumed mechanism (Bash-bulk-edits + filtered-tests) is
   not what's actually moving. The "true" mechanism appears to be
   "less searching, less doing-everything" — which is a useful
   finding even if it wasn't the predicted one.
