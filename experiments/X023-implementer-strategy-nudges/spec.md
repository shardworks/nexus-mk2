---
status: draft
---

# X023 — Implementer Strategy Nudges

**This experiment's click:** `c-mowd893x`.
**Parent click:** `c-mok4oct1` — Category 3 (Implementer behavior,
prompt-level nudges) of the Apr 29 cost-optimization landscape under
`c-mok4nke6`.

**Sibling experiment:** [X022 — Implementer Behavior
Nudges](../X022-implementer-behavior-nudges/spec.md) — tests
five tool-use micro-optimizations (Bash bulk edits, targeted Reads
after Grep, repeat-grep avoidance, narrow test filters, no re-test
of unchanged packages). X022 and X023 are independent; both
modify the artificer role file but target different categories
of implementer behavior. X023's interventions are about
**high-level work strategy**; X022's are about **tool-use
micro-discipline**.

## Motivating observations from X021

While running [X021](../X021-inventory-format/) at n=3 on six
groups (2026-05-07/08), three runs landed **8–14% below their
group means** through mechanisms that had nothing to do with X021's
spec-content interventions:

| run | cost | discount | distinguishing behavior |
|---|---|---|---|
| Control baseline run 3 (`w-mow3n5ly`) | $11.62 | −14% | **1 commit** instead of 6; same end-state |
| Substantive v4 run 3 (`w-mow0bdwn`) | $18.10 | −8% | lowest output tokens (92K vs 99K/108K) |
| Substantive v3 run 3 (`w-mowa4fzj`) | $19.07 | −13% | lowest output tokens (100K vs 108K/118K) |

Diffstat checks confirmed cheap runs were **not doing less work** —
total file changes were comparable to (and sometimes larger than)
their expensive companions. They were doing the same work more
concisely.

Two distinct mechanisms surfaced:

1. **Commit decomposition.** Visible only on the control rig where
   the brief permitted multiple decomposition strategies. Two runs
   chose 6 small thematic commits; one run chose a single monolithic
   commit. The single-commit run cost ~14% less for an
   equivalent end state. The mechanism: skipping intermediate
   `git status`/`git diff`/`git commit -m` cycles, plus avoiding
   the per-commit "verify state is committable" turn-spend.

2. **Implementation conciseness / iteration discipline.** Visible on
   substantive runs where commit count was held at 1 across all
   trials (the substantive brief only permits one commit).
   Output tokens varied **92K–118K** (28% spread) on the same brief.
   Cheap runs Wrote less code, ran fewer test-fix cycles, and made
   fewer redundant edits. The mechanism: less exploratory rewriting,
   tighter "design before edit" discipline.

These mechanisms are individually larger than X021's spec-content
intervention (~11% on the load-bearing variant). With deliberate
prompting, they may be **stackable**.

X021 also surfaced the noise floor for opus implement-only trials
on these workloads: ~10% CV across n=3 runs of the same workload.
That informs sample-size planning here — **at n=3 we can confidently
detect effects ≥20%**.

## Research question

Does prepending two **strategy nudges** to the implementer role
file (a) directing single-commit decomposition and (b) directing
iteration-conservative implementation reduce implementer session
cost ≥20% on a real historical commission, without degrading
outcomes?

## Pipeline placement

X023 modifies the **artificer role file** — the persistent
role-instruction substrate Loom binds into every implement /
revise session. Same intervention surface as X022. The role file
is a deployment-friendly intervention point: one file, one
plugin (Loom), changes apply to every future implementer session
without further per-commission work.

The trial shape is **claude-direct** (not xguild). X021 demonstrated
that claude-direct produces a more faithful implementer baseline
(53.7% pure-read vs xguild's 71%, vs production's 49.1%), and
xguild's review/revise/seal stages contaminate cost-comparison
baselines by ~20pp. X023 cost numbers should be directly comparable
to X021's claude-direct dataset since they share doctype, codex
pins, and rig source.

## Background — the cheap-run trajectory

Looking at the cheap-outlier transcripts in detail:

**Control baseline run 3 (1 commit, $11.62):**
- The implementer surveyed the codebase, identified all files
  needing changes, then made all edits before the first commit.
- Tests run once at the end (filtered), confirmed green, single
  `git commit -am "delete vision-keeper plugin and redefine
  The Surveyor"`.
- Compare runs 1 & 2 (6 commits each): each commit was preceded
  by a partial test run, a `git status` check, and a per-commit
  message-construction turn. ~6× the per-commit ceremony, plus
  more turns spent on "what should the next commit be" planning.

**Substantive v4 run 3 ($18.10) and v3 run 3 ($19.07):**
- Both completed in ~32–33 minutes vs ~37 minutes for their group
  companions — proportional to their lower output-token count.
- Both made 5–6 Read-then-Edit cycles on edit-target files vs 7
  cycles in the more expensive runs.
- Both ran the targeted verify (`pnpm --filter ... test`) once
  near the end, vs expensive runs running it twice or three times.

The pattern is **less work-in-progress, more direct A-to-B
trajectory.** The implementer can be talked into this — but only
if the prompt explicitly directs it, because the default implementer
behavior is to commit progress incrementally and re-verify often.

## Hypothesis

**H1 (combined strategy effect).** The combined two-nudge variant
reduces implementer session cost (USD) ≥20% on the substantive rig
(`rig-moj12h4o`, Reckoner periodic-tick replay) relative to baseline,
at n=3.

**H2 (per-nudge separation).** Single-nudge variants attribute the
combined effect:
- v1 (single-commit nudge alone): ≥10% reduction
- v2 (conciseness nudge alone): ≥10% reduction

H2 is informational, not gating — the experiment can ship with a
combined-only verdict if v1/v2 are unaffordable.

**H3 (control insensitivity).** On the control rig (`rig-moji64hs`,
vision-keeper deletion), the combined variant produces a smaller
effect than on substantive (≤H1's effect minus 5pp). Doc-cleanup
work has fewer "iteration discipline" surfaces; the single-commit
nudge should still bite, but the conciseness nudge should not.

H1 sample size (n=3) is calibrated to clear a 20% effect against
the 7–11% CV noise floor measured on the same workload in X021.

## Variants

| variant | description | role file |
|---|---|---|
| baseline | verbatim production artificer.md (snapshot 2026-05-08) | `fixtures/roles/artificer-baseline.md` |
| v1 single-commit | baseline + "Commit Discipline" section directing single-commit work | `fixtures/roles/artificer-v1-single-commit.md` |
| v2 conciseness | baseline + "Implementation Conciseness" section directing direct A-to-B trajectory | `fixtures/roles/artificer-v2-conciseness.md` |
| v3 combined | both nudges | `fixtures/roles/artificer-v3-combined.md` |

The intervention is role-file-only; brief content, codex pins,
plugin set, framework version are identical across variants.

### Nudge content sketches (to be refined during Phase 1)

**v1 single-commit nudge** — proposed text:

> ## Commit Discipline
>
> Make all changes for this commission in **a single final commit**.
> Do not commit incrementally. Use `git status` and `git diff` only
> to verify the change at the end, not as a per-step checkpoint.
> If the work needs to be staged, stage it all in one operation
> before the single commit.
>
> Empirical: when implementers chose monolithic over incremental
> decomposition on equivalent work, cost dropped ~14%
> (X021 control rig, 2026-05-07).

**v2 conciseness nudge** — proposed text:

> ## Implementation Conciseness
>
> Plan the full set of edits before making any. Avoid speculative
> refactoring beyond what the task requires. Run tests **once at
> the end** of the work, not after each edit; only run them
> earlier if a specific assertion is in doubt. Do not rewrite
> working code "for clarity" unless the task asks for it.
>
> Empirical: implementers running on the same brief produced
> 92K–118K output tokens (28% spread); the cheap-run trajectory
> was lower-iteration, lower-rewrite (X021 substantive runs,
> 2026-05-07).

Final phrasing TBD — the empirical justification lines may be
counterproductive for production deployment but useful during
the experiment. Decide before Phase 1 ships.

## Metrics

### Primary (cost)

- **Implementer session cost (USD)** — stamped from claude's
  `total_cost_usd`
- **Implementer tokens** — input / output / cache-read / cache-write
- **Implementer wallclock duration**

### Secondary (mechanism)

- **Commit count** — number of commits produced (v1 mechanism;
  expect 1 across the board on combined/v1; expect 1–2 on baseline
  for substantive, 1–6 on baseline for control)
- **Output tokens** — proxy for implementation verbosity (v2 mechanism)
- **Tool-call mix** — Read / Bash / Edit / Grep counts
- **Test-run count** — invocations of `pnpm test` family commands
  in the transcript (Bash patterns); expect lower on combined / v2
- **Edit-redundancy** — Edits to the same file in non-adjacent
  turns (proxy for "speculative rewrite"); expect lower on combined / v2

### Quality (no-regression)

- **Tier 1 mechanical** (every trial): `verifyCommand` exit 0,
  filtered test suite green at end of trial.
- **Tier 2 manual diff** (every variant): Coco/Sean diffs the
  variant's commit(s) against baseline's. Flag obvious regressions
  (missing edits, drifted edits, wrong test changes). One-paragraph
  summary in the trial's artifact directory.

H1 is sustained when cost reduction ≥20% is observed on combined v3
on the substantive rig at n=3 AND Tier 1 + Tier 2 both pass on every
trial in the cell.

## Design

### Phase 0 — Reuse the X021 measurement instruments

No new instrument work. X023 reuses:

- **Pure-read / read-utilization analysis** —
  `experiments/instruments/read-utilization.py` (introduced in
  X021 Phase 0, factored out of X011).
- **Cost / token / duration extraction** — `nsg lab trial-extract`
  produces `stacks-export/animator-sessions.json`; reading the
  `costUsd` / `tokenUsage` / `durationMs` / `providerSessionId`
  fields is sufficient.
- **Diffstat extraction** — `nsg lab trial-extract` produces
  `codex-history/commits-manifest.yaml` with `filesChanged` /
  `insertions` / `deletions` per commit.
- **Test-run count / Edit-redundancy** — to be added inline if
  X021's read-utilization output isn't sufficient. Phase 1 work,
  ~30 min.

### Phase 1 — Author the role file variants

1. Snapshot `/workspace/vibers/roles/artificer.md` (the production
   role) into `fixtures/roles/artificer-baseline.md`. Freeze the
   snapshot — it doesn't track upstream production drift during
   the experiment.
2. Author the four variant files (or three, if we skip v1/v2 and
   only run baseline + combined):
   - `artificer-v1-single-commit.md`
   - `artificer-v2-conciseness.md`
   - `artificer-v3-combined.md`
3. Decide whether the empirical-justification lines stay in the
   role file (helps the model anchor on "why") or get stripped
   (cleaner deployment-style file).

### Phase 2 — Briefs

Reuse X021's briefs verbatim (they ARE the production PlanDoc spec
sections):

- `briefs/rig-moj12h4o-baseline.md` — copy from X021
  (Reckoner periodic-tick refactor)
- `briefs/rig-moji64hs-baseline.md` — copy from X021
  (vision-keeper deletion)

No variant briefs in X023 — the intervention is role-file-only.

### Phase 3 — Trial sequence

Six trials at minimum (n=3 baseline + n=3 combined on substantive
to test H1; control trials and v1/v2 separation are stretch).

| group | manifest | n | purpose |
|---|---|---|---|
| substantive baseline | `manifests/rig-moj12h4o-baseline.yaml` | 3 | H1 anchor; replicates the X021 substantive baseline at n=3 |
| substantive combined | `manifests/rig-moj12h4o-combined.yaml` | 3 | H1 (≥20% reduction) |
| control baseline | `manifests/rig-moji64hs-baseline.yaml` | 3 | H3 anchor (optional; partially captured in X021 at n=3) |
| control combined | `manifests/rig-moji64hs-combined.yaml` | 3 | H3 (smaller effect than substantive) |
| substantive v1 (single-commit alone) | `manifests/rig-moj12h4o-v1-single-commit.yaml` | 3 | H2 informational (optional) |
| substantive v2 (conciseness alone) | `manifests/rig-moj12h4o-v2-conciseness.yaml` | 3 | H2 informational (optional) |

**Minimum-viable run plan:** 6 trials (substantive baseline n=3 +
substantive combined n=3) → answers H1.

**Mid-plan:** 12 trials (above + control baseline n=3 + control
combined n=3) → adds H3.

**Full plan:** 18 trials (above + v1 n=3 + v2 n=3) → adds H2.

The minimum-viable plan can fall back to **n=3 substantive combined
+ X021 substantive baseline data (n=1, $22.16)** if budget-tight.
Risk: X021's baseline is n=1, so the comparison would be against
a single sample with unknown variance. Better to re-anchor at n=3.

### Codex pins

Same as X021:

- rig-moj12h4o → `b92dc90502dc0e38a92012cbd238c9eae0e65b0d`
- rig-moji64hs → `d6e34097f698df66d595f81f928320eafde8276f`

These are the implementer-eye-view of the codebase at the moment
each rig started.

### Cost estimate

Based on X021's actual per-trial cost on the same workloads:

- Substantive: $18–$28/trial (claude-direct)
- Control: $11–$15/trial (claude-direct)

Minimum-viable (6 trials, all substantive): **$120–$170**
Mid-plan (12 trials, +6 control): **$180–$260**
Full plan (18 trials, +6 substantive single-idea): **$300–$430**

The minimum-viable plan is the right starting point. Decide on
expansion after the first 6 land.

## Risks

- **Mechanism uncertain at the implementer level.** The cheap-run
  trajectory was *observed* but not *induced* in X021. We don't
  yet know whether prompt nudges can reliably reproduce that
  trajectory. The implementer may ignore single-commit guidance
  if its training pulls toward incremental commits. Mitigation:
  v1 alone at n=3 is the cleanest test of "can the prompt move the
  needle on commit decomposition"; if v1 alone shows no effect,
  the combined variant is unlikely to either.

- **Conciseness vs correctness trade-off.** A nudge that says
  "iterate less" could induce the implementer to skip a useful
  test-run and ship subtly broken code. The verify-command and
  Tier 2 review should catch most cases, but watch for regressions
  that pass the filtered test suite but break unrelated code.

- **Single-commit may produce poor commit hygiene.** A monolithic
  commit covering a 1700-line refactor is harder to review and
  bisect. This is a real production cost that doesn't show up in
  the cost metric. **Note for deployment decision:** even if H1
  sustains, deploying the single-commit nudge should consider
  reviewability — possibly only for autonomous-end-to-end work
  where no human reviews intermediate state.

- **Stacking with X022.** X022 (tool-use micro-discipline) and
  X023 (strategy) target the same role file. If both ship, they
  could interact non-additively. Run the experiments
  independently first; if both show effects, run a stacked
  variant in a follow-up.

- **Per-trial cost is high.** $18–$28/trial on substantive opus
  means a 6-trial minimum is ~$140 of measurement spend per
  hypothesis tested. Plan accordingly; don't chase low-confidence
  variants without a clean theory of action.

## Depends on

- **claude-direct trial doctype** (framework v0.1.304+,
  `spider.graft-rig-template` + `laboratory.claude-direct-monolithic`).
  Confirmed working via X021's 14-trial run on 2026-05-07/08.
- **`lab.codex-checkout` fixture** for codex isolation per trial.
- **X021's briefs** as input (verbatim production spec sections).
- **X011 read-utilization instrument** for any pure-read followups.

## Operational breadcrumb — running the trials

This section is the runbook for the future agent picking up X023.
Workflow established by X021's 14-trial run; reuse verbatim.

### 1. Prerequisite check

```bash
# Framework at v0.1.304 or later
git -C /workspace/nexus log --oneline -1   # expect 7d59dde or newer

# Lab daemon up
nsg status   # should print Guild/Nexus/Home/Plugins lines

# X021 fixtures present (X023 reuses them)
ls /workspace/nexus-mk2/experiments/X021-inventory-format/briefs/
# expect: rig-moj12h4o-baseline.md, rig-moji64hs-baseline.md (at minimum)
```

### 2. Author Phase 1 artifacts (role file variants)

```bash
# Snapshot production role
cp /workspace/vibers/roles/artificer.md \
   /workspace/nexus-mk2/experiments/X023-implementer-strategy-nudges/fixtures/roles/artificer-baseline.md

# Author variant role files by hand (see "Variants" section above)
# At minimum: artificer-v3-combined.md
# Optionally: artificer-v1-single-commit.md, artificer-v2-conciseness.md
```

### 3. Author Phase 3 manifests

Copy an X021 manifest as a starting template and patch:

```bash
cp /workspace/nexus-mk2/experiments/X021-inventory-format/manifests/rig-moj12h4o-v4-combined.yaml \
   /workspace/nexus-mk2/experiments/X023-implementer-strategy-nudges/manifests/rig-moj12h4o-combined.yaml
```

Then edit the new manifest to:

- Update `slug` and `title` to X023 values
- Update `description` to reference X023
- Update `rolePath` to point at the X023 variant role file:
  `/workspace/nexus-mk2/experiments/X023-implementer-strategy-nudges/fixtures/roles/artificer-v3-combined.md`
- Update `briefPath` to point at the X021 brief (reused):
  `/workspace/nexus-mk2/experiments/X021-inventory-format/briefs/rig-moj12h4o-baseline.md`
  (note: it's the X021 BASELINE brief — X023 doesn't vary the brief)
- Keep `verifyCommand` identical to X021's substantive command
  (filtered build + test of reckoner + clockworks + push)
- Keep `frameworkVersion`, fixtures, scenario, probes, archive
  blocks unchanged

Repeat for each manifest in the run plan (baseline, v1, v2, v3
combined; for each rig).

### 4. Run trials sequentially

```bash
# Post a trial
nsg lab trial-post /workspace/nexus-mk2/experiments/X023-implementer-strategy-nudges/manifests/rig-moj12h4o-combined.yaml

# Note the writ id (e.g., w-XXXXXX)

# Wait for terminal (run as background per Coco's workflow)
until nsg writ show w-XXXXXX 2>&1 | grep -qE 'classification: terminal'; do sleep 30; done

# Extract artifacts
mkdir -p /workspace/nexus-mk2/experiments/X023-implementer-strategy-nudges/artifacts/<date>-<run-name>/trial-<n>-<variant>
nsg lab trial-extract w-XXXXXX --to /workspace/nexus-mk2/experiments/X023-implementer-strategy-nudges/artifacts/<date>-<run-name>/trial-<n>-<variant>
```

For n=3 of each variant: post, wait, extract, repeat. Don't
parallel-post — claude-direct doesn't queue inside a sub-guild,
but spider concurrency on the lab host serializes implement
sessions anyway, and sequential posting prevents one trial's
failure from contaminating the next.

### 5. Per-trial analysis

```bash
# Cost / tokens / duration
cat artifacts/<run>/trial-<n>/stacks-export/animator-sessions.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
rows = data.get('rows', data) if isinstance(data, dict) else data
for r in rows:
    print('cost:', r['costUsd'])
    print('duration_min:', r['durationMs'] / 60000)
    print('output_tokens:', r['tokenUsage']['outputTokens'])
    print('cache_reads:', r['tokenUsage']['cacheReadTokens'])
    print('claude_session:', r['providerSessionId'])
"

# Pure-read / file-read analysis
python3 /workspace/nexus-mk2/experiments/instruments/read-utilization.py \
    --session <providerSessionId>

# Diffstat / commit count
cat artifacts/<run>/trial-<n>/codex-history/commits-manifest.yaml
```

### 6. Per-group summary

After n=3 of a variant lands, compute:

- mean cost, stdev, range, CV (use these to compare against the
  noise floor of ~10% CV)
- delta vs baseline (mean and median)
- mechanism metrics: commit count, output tokens, test-run count
  (see Metrics section)

Append to `artifacts/<date>-<run>/runlog.md` (mirror X021's
runlog format).

### 7. Hypothesis verdict

Compare against H1 / H2 / H3 thresholds (see Hypothesis section).
If H1 sustained, proceed to Tier 2 manual diff review. If H1 fails
clearly, document and conclude. If H1 is borderline, expand n.

### 8. Wrap-up

- Write `artifacts/results.md` mirroring
  `experiments/X021-inventory-format/artifacts/results.md`.
- Conclude this experiment's click (will be a child of `c-mok4oct1`).
- Update `experiments/index.md` — move X023 from Active to
  Complete.

## Sequencing

X023 is independent of X018/X019/X020 (planner-side) and X021
(spec-content augmentation). Same parent click (`c-mok4nke6` Apr 29
landscape), same broad category as X022 (Category 3, implementer
behavior nudges), but a different mechanism axis (work strategy,
not tool-use micro-discipline).

If X022 has not yet run, **run X022 first**: it has older
authoring (2026-05-03), pre-existing manifests, and an established
4-trial design. X023 can run after, and a follow-on stacked
variant (X022 nudges + X023 nudges) can be tested if both show
independent effects.

## References

- **Motivating data:** `experiments/X021-inventory-format/artifacts/results.md`,
  cheap-outlier section.
- **Parent click:** `c-mok4oct1` (Category 3 implementer behavior).
- **Sibling:** [X022 — Implementer Behavior Nudges](../X022-implementer-behavior-nudges/spec.md).
- **Trial doctype guide:** `docs/lab-operations/running-claude-direct-trials.md`.
- **Pure-read instrument:** `experiments/instruments/read-utilization.py`.
- **Run-to-run noise floor:** X021 results.md, "Run-to-run variance" section.

## Open questions to resolve before Phase 1

- **Empirical justification lines in role file?** (See Phase 1.)
  Keep for the experiment, strip for production? Decide before
  authoring.
- **Six-trial minimum vs full 18-trial plan?** Sean's call. Default
  is six (substantive baseline + combined, n=3 each); expand
  after the first batch lands.
- **Stack with X022 in a follow-on?** Defer until both X022 and
  X023 have results.
