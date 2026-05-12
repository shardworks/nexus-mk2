# X021 & X022 — Retroactive Deployment Evaluation (2026-05-12)

Applying the two-tier threshold framework (`docs/lab-operations/experiment-discipline.md`)
to the X021 and X022 results, which were previously categorized as "below threshold"
under the older single-gate model.

## Framework recap

- **Detection threshold:** statistical confidence at low n (typically ≥20% at n=3
  against ~10% CV). Used for clean attribution, publishable claims, mechanism work.
- **Deployment threshold:** three conditions — central estimate positive + no
  measurable quality regression + low-risk to deploy. Used for shipping cheap,
  reversible interventions.

Both X021 v4 and X022 combined-nudges were previously rejected against the
~15-20% detection threshold. Under the deployment threshold, both warrant
re-evaluation.

---

## X021 v4 — Inventory format augmentation

**Experiment click:** `c-mophvf0d` (concluded)
**Mechanism:** sage-writer produces inventories with **inline type signatures**
(idea #3), **inline pattern templates** (idea #4), and a **"do not Read" list**
(idea #5). Replaces "see `types.ts:116` for `StandingOrder`" with the actual
200-char type def, etc.

### Effect data

| | baseline (n=1*) | v4 combined (n=3) | Δ |
|---|---|---|---|
| Cost | $22.16 | mean $19.63 (range $18.10-$20.79) | **-11.4%** |
| Total Read content | 411 KB | mean 320 KB | -22% |
| Tier 1 (verify) | exit 0 | exit 0 (3/3) | — |
| Tier 2 (manual diff) | — | PASS | — |

*Baseline n=1 is a calibration weakness. Re-anchored against the X023
baseline runs (n=3, mean ~$21-22), -11.4% holds directionally.

### Deployment threshold check

1. **Central estimate positive?** ✓ Yes. All 3 v4 runs cheaper than baseline.
   -11.4% n=3 with consistent direction. Mechanism (less context loaded)
   corroborated by independent measurement (Read content -22%).
2. **Quality regression?** ✗ None. Tier 1 PASS (3/3 exit 0). Tier 2 PASS
   per `results.md`. No new failure modes observed.
3. **Low-risk to deploy?** ✓ Yes. Single sage-writer prompt change; trivially
   reversible by `git revert`; downstream review/seal catches regressions.

**Deployment-threshold verdict: ELIGIBLE.**

### Deployment surface — different from X025

X021 modifies the **planner side** (sage-writer's inventory output), not
the implementer side. Deployment surface is in astrolabe plugin (the
sage-writer role and/or its prompt template), not vibers' artificer.md.

Concretely: the sage-writer prompt instructs the planner to produce an
inventory in a specific format. X021's intervention rewrites that
instruction to inline type signatures, pattern templates, and do-not-read
markers.

Implementation note: need to locate the exact sage-writer prompt/role
file in the astrolabe plugin source. The X021 fixtures
(`experiments/X021-inventory-format/fixtures/`) carry the variant inventory
content that demonstrates the format — but production deployment requires
locating and editing the sage-writer prompt that produces inventories in
this shape going forward.

### Independence from X025

X021 (planner-side, sage-writer) and X025 (implementer-side, artificer)
modify different pipeline stages. **Their effects should be independent**;
deploying both should yield roughly additive savings on substantive code
work.

If X021 lands at -11% (planner reduces context loaded) and X025 lands at
-8.7% on its substantive trial (implementer behavior shaping), the stacked
expected savings is ~18-19% on substantive workloads. That's a real
operational win.

---

## X022 combined-nudges — Implementer tool-use directives

**Experiment click:** `c-mopiarth` (concluded — but conclusion may have
been written before trial 8 firmed up the n=2 baseline)
**Mechanism:** five tool-use directives prepended to artificer.md:
1. Prefer `sed -i` for bulk renames over sequential Edits
2. Targeted Reads with `--offset` after Grep
3. Discourage repeat greps
4. Narrow test filters during iteration
5. Don't re-test unchanged packages

### Effect data

| | baseline (n=2) | combined (n=3) | Δ |
|---|---|---|---|
| Cost | mean $40.48 | mean $32.81 | **-19%** |
| Edit count | 73.5 | 56.7 | -23% |
| Bash count | 83.5 | 69.0 | -17% |
| Total searches | 41.5 | 34.0 | -18% |
| Workspace tests | 8.0 | 8.0 | flat (nudges #11/#12 did not bite) |
| `sed -i` invocations | 1.5 | 1.7 | +11% (nudge #8 weakly positive) |

Tier 1 PASS on all variant trials. Tier 2 manual diff: test coverage
parity for v1/v2, v3 had 5 fewer test cases but coverage migrated rather
than lost (`2026-05-08-tier-2-manual-diff.md`).

### Why this was previously characterized as "marginal"

The parent click's conclusion (`c-mok4oct1`) summarized X022 as
"-13% n=3 marginal sustained at edge of noise, mechanism story muddled
(3 of 5 wrong direction)."

The two issues with that characterization:

1. **The -13% figure was pre-trial-8.** Trial 8 firmed up the baseline at
   n=2 and the delta moved to -19%. The runlog reflects this; the click
   conclusion was written earlier.
2. **The "mechanism story muddled" is true but misleading for deployment.**
   At the per-mechanism level, #11/#12 (narrow tests) didn't move workspace
   test counts and #9 (targeted Reads) was already at ceiling. But the
   bundle's HEADLINE effect (-19%) doesn't depend on every individual
   directive firing — only the overall trajectory. The cost-reduction
   provenance is "variants do less work overall" (Edit -23%, Bash -17%,
   searches -18%), which is a real, uniform efficiency gain from the
   role-file framing.

### Deployment threshold check

1. **Central estimate positive?** ✓ Yes. -19% n=3 vs n=2 baseline. Tool-use
   metrics show uniform efficiency reduction across Edit/Bash/Search,
   independent of which specific directive "did the work."
2. **Quality regression?** ✗ None confirmed. Tier 1 PASS. Tier 2 PASS with
   the v3 minor under-coverage observation (5 fewer test cases) noted but
   characterized as "coverage migrated, not lost — both reasonable
   interpretations" in the manual diff doc.
3. **Low-risk to deploy?** ✓ Yes. Role-file edit; trivially reversible.

**Deployment-threshold verdict: ELIGIBLE.**

### Interaction with X025 (both modify artificer.md)

X022 and X025 BOTH modify `/workspace/vibers/roles/artificer.md`. X025 v3
is already deployed (commit `0fee44c`, 2026-05-12). If we also deploy
X022's combined-nudges:

- **Stacking option:** append X022's five directives to the post-X025
  artificer.md. The deployment is additive in role-file content; the
  intervention's effect on session behavior is plausibly additive
  (different mechanisms — X025 shapes overall trajectory via examples,
  X022 shapes tool-use micro-discipline via directives).
- **Concern:** the X025 monitoring window has just begun. Adding another
  intervention contaminates the baseline-vs-post-deployment comparison
  for X025. We won't know whether observed cost reduction is from X025,
  X022, or both.

Two ways to handle:

**Option A: Stack X022 onto the X025 deployment NOW (before X025
monitoring accumulates data).** Treat the combined X025+X022 as the
"intervention bundle" being monitored. Single 14-day window measures the
bundle's effect against pre-X025 baseline ($2.86 last-24h mean).

This matches the framework's stacking recommendation: when multiple
interventions clear the deployment threshold, deploy as a bundle and
monitor the bundle, not the individual pieces.

**Option B: Wait for X025 monitoring window to complete, then deploy X022.**
Cleaner attribution per-intervention; longer total elapsed time before
both savings are realized.

My recommendation: **Option A**. The framework explicitly says deploy
bundles. The cost of NOT bundling (waiting 14 days for X025 to finish
monitoring, then 14 more days to monitor X022) is two months of leaving
~30% in compounded savings on the table. The cost of bundling (couldn't
attribute observed effect to one or the other) is operationally cheap to
recover from — if the bundle is net positive, we keep both; if net
negative, we roll back both and run a more careful sequential evaluation.

The downside scenario only matters if there's a real chance the
interventions are non-additive in a bad way (e.g., the X022 directives
conflict with X025's "single commit" example by encouraging incremental
test runs). The mechanisms are mostly orthogonal — examples shape
trajectory, directives shape tool-use — so antagonism is unlikely.

---

## Summary

| Experiment | Effect | Detection verdict (old) | Deployment verdict (new) | Surface | Status |
|---|---|---|---|---|---|
| X021 v4 | -11.4% | NOT sustained | (already deployed) | sage prompts in astrolabe plugin | **LIVE since 2026-04-30 (nexus commit `b7f65aa`)** |
| X022 combined | -19% | NOT sustained | **ELIGIBLE** | artificer.md (vibers) | **DEPLOYED 2026-05-12 (vibers commit `1999c12`)** |
| X025 v3 | A2 -8.7% / A6p +2% / CV halved | NOT sustained | **ELIGIBLE** | artificer.md (vibers) | **DEPLOYED 2026-05-12 (vibers commit `0fee44c`)** |

### Important correction — X021 was already deployed

Initial draft of this evaluation flagged X021 as deployment-eligible.
Investigation found that the X021 interventions were ALREADY shipped
to production on 2026-04-30 by Coco in commit `b7f65aa` ("astrolabe:
P1 inventory excerpting — inline references in sage prompts"). The
commit explicitly references the cost-optimization landscape's P1
click `c-mok4rf0h`. All three X021 mechanisms — inline type sigs,
inline pattern templates, do-not-read markers — plus idea #7
(pre-quote source excerpts) are present in production sage-writer.md
and sage-primer-*.md.

The X021 results.md concluded "do not deploy v4's spec augmentation
as a default" but apparently a follow-up deployment happened anyway.
Likely informed by the same logic the two-tier framework codifies
retroactively.

**Implication:** the pre-X025 baseline ($2.86 last-24h mean from
2026-05-12) already reflects X021's deployed effect. X025 + X022
stack on top of an already-X021-modified planner.

### What the live deployments measure

The post-X025-deployment monitoring window measures the **bundle**
against the pre-X025 baseline ($2.86 last-24h mean):

- Pre-monitoring baseline reflects: X021 (planner inline content,
  live ~12 days) + Sonnet swap (model selection, live several days)
- During-monitoring (Bundle = X022 + X025): adds artificer-side
  trajectory examples (X025) and tool-use discipline (X022)

Expected combined bundle effect (X022 + X025 only):
- X022: -19% on substantive implementer work (mechanism: tool-use efficiency)
- X025: -9% on substantive (mechanism: trajectory shaping); CV halved
  (mechanism: variance constraint)

If approximately independent: combined ~25-28% reduction on
substantive implementer work, ADDITIONAL to whatever savings X021 +
Sonnet swap have already baked in.

If antagonistic: less. Production monitoring is the test.

---

## Status — all decisions executed

- **X021:** No deployment needed; live since 2026-04-30.
- **X022:** Deployed 2026-05-12 (vibers commit `1999c12`), stacked
  onto X025.
- **X025:** Deployed 2026-05-12 (vibers commit `0fee44c`).
- **Bundle monitoring:** under X025 monitoring subclick `c-mp34v6op`.
  Single 14-day window measures the X022+X025 bundle against
  pre-deployment baseline.
- **Rollback criteria:** aggregate cost >+10% vs $2.86 last-24h
  pre-deployment baseline OR Tier 1 pass rate degrades >5pp. Rolling
  back means reverting both `1999c12` and `0fee44c`.
