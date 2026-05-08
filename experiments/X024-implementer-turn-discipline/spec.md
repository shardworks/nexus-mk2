---
status: active
---

# X024 — Implementer Turn Discipline

**Parent click:** TBD (will be opened on activation; child of
`c-mok4nke6` Apr 29 cost-optimization landscape).

**Sibling experiment:** [X022](../X022-implementer-behavior-nudges/spec.md) —
five-imperatives bundle. X024 is a follow-up testing whether **goal-stated
framing** with examples produces the same or stronger effect than
X022's rule-following framing.

## Research question

Does prepending a goal-stated tooling-discipline directive (minimize
turns; avoid wasteful tool calls; three illustrative examples) to the
**artificer role file** reduce **implementer session cost ≥10%** on
the substantive Reckoner refactor rig vs X022's n=3 baseline,
without degrading outcomes?

Sub-question: does the goal-stated framing produce a **cleaner per-mechanism
signature** than X022's combined-nudges variant — i.e. do the three
named examples (Bash bulk edits, repeat-grep avoidance, no re-test of
unchanged packages) actually fire in the predicted directions?

## Background

X022's combined-nudges variant prepended a "Tooling Discipline" section
to the artificer role file with five imperatives. n=3 results:

- Cost: -13% vs n=3 baseline ($32.81 vs $37.85), clears H1 threshold marginally.
- **Per-mechanism story did not hold.** Three of five imperatives went
  wrong direction or flat:
  - #11 narrow test filters: variant did **MORE** workspace tests (+20%)
    and used filtered tests **LESS** (filter-share 38% → 32%).
  - #12 don't re-test unchanged: variant ran 20% more workspace tests.
  - #10 avoid repeat greps: weakened to -9% search reduction at n=3
    (vs strong -23% at n=1); variants actually had **more** repeat-greps.
  - #8 Bash bulk edits: weak positive (+67% sed) — likely the real win.
  - #9 targeted Reads: flat at 79% in both cells (ceiling effect).

The most parsimonious explanation is that **the "Tooling Discipline"
framing itself produced an across-the-board "be deliberate" effect**
without the specific tactics firing. The cost reduction was not
traceable to any individual mechanism.

## Hypothesis

**H1 (cost).** A goal-stated turn-discipline directive reduces
implementer session cost ≥10% on rig-moj12h4o (substantive) at n=3
vs X022's n=3 baseline ($37.85 mean).

**H2 (cleaner mechanism).** The variant produces a per-mechanism
signature with at least two of the three named examples (Bash bulk
edits, repeat-grep avoidance, no re-test of unchanged packages) moving
in the predicted direction at n=3.

**H3 (no-regression).** The variant's sealed commits pass Tier 1
mechanical checks (verifyCommand exit 0) and Tier 2 manual diff vs
X022's baseline (`7c810bb`). No quality regression detected.

**H4 (foil sanity).** If the substantive variant clears H1, a foil
trial pair on rig-moji64hs (n=3) shows variant cost ≤ $20.39
(production full-rig). Skipped if H1 fails.

## Variants

| variant | description |
|---|---|
| baseline | **Reuses X022's n=3 substantive baseline** (`w-mopuwdsp`, `w-mowr4jq1`, `w-mowr4mri`). Mean $37.85, range $32.59–$43.60. Same brief, same codex pin, same model, same framework version. |
| turn-discipline | New role file: `roles/artificer-turn-discipline.md`. Verbatim production artificer with one new "Tooling discipline" section prepended between "Role" and "Testing". Three illustrative examples (Bash bulk, repeat greps, re-testing unchanged) in support of a single goal statement. |

## The intervention

The variant role file prepends this section between "Role" and
"Testing" in `/workspace/vibers/roles/artificer.md`:

> ## Tooling discipline
>
> Your goal each turn is to make meaningful progress toward the brief's
> acceptance criteria. Each tool call adds a turn; the fewer turns you
> spend to ship correct work, the better.
>
> Avoid wasteful or unnecessary tool calls. Some examples of
> turn-wasting patterns this discipline is meant to prevent:
>
> - Running 10 separate Edits to make 10 versions of the same systematic
>   change when one Bash `sed -i` would do it in a single turn.
> - Grepping the same pattern multiple times when the result is already
>   in context — re-running search you've already done is a wasted turn.
> - Re-running tests on packages you didn't change — verification you've
>   already done costs another turn.
>
> These are illustrative, not exhaustive. The real test is: does this
> tool call advance the commission, or am I repeating work I've already
> done in a previous turn? Skip the repetition.

## Design

### Phase 1 — Substantive cell (3 trials, depends-on chain)

Three trials of `manifests/rig-moj12h4o-turn-discipline.yaml`,
posted as drafts in a depends-on chain, then published. Spider
serializes via the `depends-on` link kind.

| run order | manifest | rig | role file |
|---|---|---|---|
| 1 | `rig-moj12h4o-turn-discipline.yaml` | substantive | turn-discipline |
| 2 | `rig-moj12h4o-turn-discipline.yaml` | substantive | turn-discipline |
| 3 | `rig-moj12h4o-turn-discipline.yaml` | substantive | turn-discipline |

Estimated cost: $54–$84 ($18–$28 × 3, by X021's measured per-trial
range on this workload).

### Phase 2 — Foil cell (conditional, 3 trials)

If substantive cell clears H1 (-10% vs $37.85), post 3 trials of
`manifests/rig-moji64hs-turn-discipline.yaml` to test H4. Compare
against production full-rig $20.39 as the H2/H4 comparator.

If substantive cell fails H1 (less than -10%), cancel foil cell.

Estimated cost (conditional): $33–$45 ($11–$15 × 3).

### Reused inputs from X022

- **Briefs.** Both manifests reference X022's brief paths directly:
  - `experiments/X022-implementer-behavior-nudges/briefs/rig-moj12h4o-baseline.md`
  - `experiments/X022-implementer-behavior-nudges/briefs/rig-moji64hs-baseline.md`
- **Codex pins.** Same as X022:
  - rig-moj12h4o → `0e1e81f4a219179fd264625b869e12bd00778365`
  - rig-moji64hs → `d6e34097f698df66d595f81f928320eafde8276f`
- **Baseline cell.** X022's n=3 substantive baseline (writs `w-mopuwdsp`,
  `w-mowr4jq1`, `w-mowr4mri`). Mean $37.85, CV 14.6%.

If H1 sustains and we want to firm the comparison further, we can post
fresh baseline trials in the same window as the variant trials. Skipped
unless results warrant.

## Metrics

### Primary (cost)

- **Implementer session cost (USD)** — single implement engine under
  claude-direct, no review/revise/seal sessions.
- **Implementer tokens** — input / output / cache-read / cache-write.
- **Implementer wallclock duration**.

### Secondary (mechanism — does the goal-stated framing produce a
cleaner signature than X022's imperative framing?)

Reuse `experiments/X022-implementer-behavior-nudges/scripts/extract-tool-use-metrics.py`
extended to ingest X024 trials. Per-cell means and deltas:

- **Total tool calls** — turns × tool-calls-per-turn proxy. Headline metric
  for the goal-stated framing.
- **Bash sed-i count** — should rise (#8 mechanism). Variants in X022
  showed +67% at n=3.
- **Total searches (Grep tool + bash-grep)** — should fall (#10 mechanism).
  X022 showed -9% at n=3.
- **Repeat-grep calls** (≥2× same pattern) — should fall (#10 mechanism).
  X022 showed +100% (wrong direction) at n=3.
- **Workspace test count** — should fall or stay flat (#12 mechanism).
  X022 showed +20% (wrong direction) at n=3.
- **Edit + MultiEdit count** — should fall as some get bundled into
  Bash. X022 showed -17%.
- **Read count** — controlled comparison; should be flat-or-lower.

### Quality (no-regression)

**Tier 1 — Mechanical** (every trial): verifyCommand exit 0 (filtered
build+test on substantive; workspace typecheck on foil), sealed commit
pushed.

**Tier 2 — Manual side-by-side** (every variant trial): Coco diffs
the variant's sealed commits against X022's baseline `7c810bb`. Same
methodology as X022's Tier 2 review. ~10 min per variant.

H1 sustains when cost reduction ≥10% AND Tier 1 + Tier 2 both pass.

## Risks

- **Effect size at noise floor.** X022's -13% sat at the edge of the
  measured 3–12% noise floor. If X024 produces a similar -10–15%
  effect, n=3 may not be enough to distinguish genuine improvement
  from noise. Mitigation: if signal is borderline, expand to n=5 on
  the substantive cell.

- **Goal-stated framing has unpredictable side effects.** A goal of
  "minimize turns" could cause the implementer to skip useful
  intermediate verification, leading to subtle quality regressions
  not caught by Tier 1. Mitigation: Tier 2 manual diff. If regressions
  appear, narrow the goal statement (e.g. "minimize *unnecessary*
  turns") in a follow-up arm.

- **The example list could anchor specific tactics again.** Three
  examples might be enough to re-trigger X022's "follow these rules"
  effect with the same wrong-direction failures. Mitigation: only
  three examples (vs X022's five), and the prompt explicitly frames
  them as "illustrative, not exhaustive."

- **Cross-experiment baseline reuse.** Comparing X024 variants to
  X022 baselines assumes the test environment hasn't drifted (model
  versions, framework version, codex content at the pinned SHA).
  Framework version is the same (0.1.304) and codex SHA is pinned;
  Anthropic-side model drift is the only unmodeled risk. Mitigation:
  if results look anomalous, post fresh baselines in the same window.

## Depends on

- X022 baseline data (`w-mopuwdsp`, `w-mowr4jq1`, `w-mowr4mri`) — comparator.
- X022's reusable assets:
  - Briefs (`briefs/rig-{moj12h4o,moji64hs}-baseline.md`)
  - Tool-use metrics extractor (`scripts/extract-tool-use-metrics.py`)
- Implement-only trial shape (claude-direct doctype, framework 0.1.304+).

## Sequencing

X024 is independent of X023 (strategy nudges) and runs its own
variant arm against X022's pre-existing baseline. No ordering
dependency on X023.

## References

- Sibling experiments:
  - X022 — five-imperative bundle (this experiment's predecessor)
  - X023 — strategy nudges (sibling intervention axis)
- Parent click landscape: `c-mok4nke6` (Apr 29 cost-optimization)
- Source rigs: `rig-moj12h4o` (substantive) and `rig-moji64hs` (foil)
- Source plans: `w-moiy8hkv` (substantive) and `w-moji63xm` (foil)
