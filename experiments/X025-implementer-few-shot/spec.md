---
status: active
---

# X025 — Implementer Few-Shot Examples

**This experiment's click:** `c-mp29xf23` (child of `c-mok4nke6` Apr 29 cost-optimization landscape; source landscape `.scratch/cost-control/prompt-engineering-landscape.md` Category C).

**Sibling experiments:**
- [X022 — Implementer Behavior Nudges](../X022-implementer-behavior-nudges/spec.md)
  — five imperative tool-use directives. Tested at -13% n=3, marginal.
- [X023 — Implementer Strategy Nudges](../X023-implementer-strategy-nudges/spec.md)
  — two strategy directives (commit discipline, conciseness).
  Authored but not run; superseded by Sonnet swap.
- [X024 — Implementer Turn Discipline](../X024-implementer-turn-discipline/spec.md)
  — goal-stated reframe of X022. Tested at -3.5% n=3, refuted.

X022/X023/X024 all used **imperative directives** as the intervention
mechanism. X025 uses **demonstrations** — in-context examples of good vs
bad implementer trajectory. Different mechanism axis, same intervention
surface (artificer role file).

## Motivation

X021 surfaced a cheap-outlier phenomenon: three runs out of six groups
landed 8-14% below their group means through trajectory-level mechanisms
unrelated to the spec-content intervention being tested. The same brief,
same tools, same model — but very different overall session shapes:

- **Commit decomposition** (control rig): runs 1 & 2 made 6 thematic
  commits each; run 3 made 1 monolithic commit. End-state identical.
  Run 3 cost 14% less due to skipped per-commit ceremony.
- **Implementation conciseness** (substantive rig): same brief produced
  92K-118K output tokens (28% spread). Cheap runs made fewer Read-Edit
  cycles, ran fewer test invocations, wrote less speculative code.

X022 (imperative directives) and X024 (goal-stated reframe) both tried
to *describe* this cheap-trajectory pattern to the implementer. Results:
marginal at best, mechanism story muddled. The hypothesis informing X025
is that **demonstrations succeed where descriptions failed** — the
implementer responds to concrete examples of "good" and "bad" trajectory
in ways it doesn't respond to imperative rules about the same.

This aligns with broader prompting-literature guidance: few-shot
in-context examples are documented to outperform abstract descriptions
for tasks with implicit quality criteria. "Good implementer behavior" has
exactly that property — many rules, none fully expressible, recognized
when seen.

## Pipeline placement

Same as X022/X023/X024 — modifies the **artificer role file**. The role
file is the persistent role-instruction substrate Loom binds into every
implement / revise session. Deployment-friendly intervention point: one
file, one plugin, changes apply to every future implementer session.

Trial doctype: **claude-direct**. Matches X021/X023's faithful baseline
(53.7% pure-read vs xguild's 71% contamination).

## Hypothesis

**H1 (combined effect).** The combined v3 variant (prepending two example
blocks — one good-trajectory walkthrough, one anti-example — to
artificer.md) reduces implementer session cost (USD) **≥20%** on
substantive Sonnet workloads relative to baseline, at n=3.

**H2 (per-example attribution, informational).** Single-example variants
attribute the combined effect:
- v1 (good-trajectory only): ≥10% reduction
- v2 (anti-example only): ≥10% reduction

H2 is informational, not gating — the MVP can ship with a combined-only
verdict if per-example attribution is unaffordable.

**H3 (shape sensitivity).** The effect bites harder on workloads with
high trajectory degrees of freedom (greenfield, thin-spec) than on
workloads with narrow scope (mechanical, well-specified).
Operationalized: v3 on A2 (greenfield apparatus) and A6' (thin-spec
frontend) shows ≥20% reduction; v3 on A5 (well-specified migration)
shows ≤15% reduction.

H3 is informational — tests whether the mechanism is shape-specific or
universal. Useful for deployment decision (should examples ship in
artificer.md by default, or only inject for thin-spec work?).

## Sample size

n=3 against the ~10% CV noise floor measured in X021. Detects ≥20%
effects cleanly; misses smaller effects.

**Sonnet-era caveat.** The 10% CV figure is from Opus implement-only
trials. Sonnet noise floor may differ — the first 3 baseline trials
will measure it. If CV is >15%, n=5 may be needed for H1 confidence.
Plan accordingly.

## Variants

| variant | description | role file |
|---|---|---|
| baseline | Sonnet-era snapshot of `/workspace/vibers/roles/artificer.md` (frozen at X025 Phase 0) | `fixtures/roles/artificer-baseline.md` |
| v1 good-only | baseline + C1 good-trajectory example prepended | `fixtures/roles/artificer-v1-good.md` |
| v2 anti-only | baseline + C2 anti-example prepended | `fixtures/roles/artificer-v2-anti.md` |
| v3 combined | both examples prepended | `fixtures/roles/artificer-v3-combined.md` |

Intervention surface is role-file-only. Brief content, codex pins,
plugin set, framework version are identical across variants.

### Example content provenance

**C1 (good-trajectory) source:** X021 control baseline run 3
(`w-mow3n5ly`, $11.62, 1 commit, -14% below group mean). Same brief as
runs 1 & 2 ($13-14, 6 commits each), same end-state. Demonstrates clean
A-to-B trajectory: codebase survey → all edits → single commit.

**C2 (anti-example) source:** X021 control baseline run 1 or 2
(6 commits each, $13-14). Same brief as C1. Demonstrates trajectory
bloat: per-commit ceremony, redundant test invocations, fragmented
decomposition.

Real provenance — no invented trajectories. The same-brief same-end-state
contrast makes the mechanism unambiguous.

### Example format (proposed)

Each example is ~50-80 lines:

```markdown
## Example trajectory: clean
**Brief context:** Delete vision-keeper plugin and redefine The Surveyor.
**Cost outcome:** $11.62, 20 minutes, 1 commit.

Tool sequence:
1. Read packages/plugins/vision-keeper/package.json
2. Grep "@shardworks/vision-keeper-apparatus" across the repo
3. Read 4 files identified by grep
4. Edit 1 (deletion)
5. Edit 2 (rename in docs)
... (15 more edits)
N-1. Bash: pnpm --filter @shardworks/clockworks-apparatus test
N. Bash: git add -A && git commit -m "delete vision-keeper plugin..."

What made this efficient:
- All edits planned before any made (no exploratory rewriting)
- Tests run once at the end, not after each edit
- One commit covering all related changes (the work was naturally
  atomic; multi-commit decomposition would have added per-commit
  ceremony without benefit)
- No speculative refactoring beyond the brief's scope
```

Anti-example follows the same shape but with negative framing in the
"What to avoid here" annotation: the 6 commits, the per-commit status
checks, the redundant test invocations.

Final phrasing TBD during Phase 1.

## Workload portfolio

Drawn from `docs/lab-operations/trial-workload-portfolio.md`. MVP picks
3 workloads spanning the dimensions where few-shot examples are most
likely to bite:

| # | Workload | Shape | Why chosen |
|---|---|---|---|
| A2 | rig-mohvspfy Reckoner skeleton | greenfield apparatus | Highest design freedom — blank-page work, no patterns to copy. Strongest test of demonstration anchoring. |
| A6' | rig-mo1wajm9 Oculus click tree | frontend feature, thin spec | Thin spec → design freedom. Different stack (React/UI) from greenfield apparatus. |
| A7' | rig-movzo2vk d4-tools v2 | ~~frontend feature, Next.js stack~~ **RETIRED 2026-05-12** | d4-tools repo has crash-prone test infrastructure (HTTP-server acceptance suite + Playwright e2e suite) at A7p's SHA range; DO NOT RUN guardrails landed later (commit `7a1c998`). See `artifacts/runlog.md` "Unsafe d4-tools SHA range" and `docs/lab-operations/trial-workload-portfolio.md`. Non-nexus codex dimension uncovered in this run. |

**Optional expansion for H3 testing:**
- A5 (Cartograph migration) — well-specified substantive work; tests the
  H3 prediction that the effect is smaller on shape-constrained
  workloads.
- A3 (narrow bugfix) — minimal design freedom; tests as null-effect
  control.

Workload manifests use the portfolio's `sealedBaseline`,
`discrimination`, and `verifyCommand` template. No per-workload custom
authoring needed beyond filling in placeholders.

## Trial plan

**MVP** (recommended starting point):
- 3 workloads × 2 variants (baseline + v3 combined) × n=3 = **18 trials**
- Estimated cost: **$40-70 Sonnet**

**Mid** (adds H2 per-example attribution):
- 3 workloads × 4 variants × n=3 = **36 trials**
- Estimated cost: **$80-130 Sonnet**

**Full** (adds H3 shape-sensitivity test):
- 5 workloads × 4 variants × n=3 = **60 trials**
- Estimated cost: **$130-225 Sonnet**

Run sequence:
1. Phase 0 — Snapshot Sonnet-era artificer.md baseline (freeze)
2. Phase 1 — Author C1, C2 examples + four role-file variants
3. Phase 2 — Author per-workload manifests (3 workloads × 2 variants
   for MVP; expand if H1 sustains)
4. Phase 3 — Run trials sequentially per X023's discipline. Capture
   results in `artifacts/<date>-<run-name>/`.
5. Phase 4 — Analyze. Append runlog. Decide on expansion.

## Metrics

### Primary (cost)
- Implementer session cost (USD) — stamped `total_cost_usd`
- Implementer tokens — input / output / cache-read / cache-write
- Implementer wallclock duration

### Secondary (mechanism)
- **Output tokens** — proxy for implementation verbosity. Expected to
  drop on v1/v3 (anchored to concise trajectory).
- **Commit count** — proxy for commit-discipline mechanism. Expected to
  drop on v1/v3 on workloads where multi-commit is natural.
- **Tool-call mix** — Read / Bash / Edit / Grep counts. Expected to drop
  on v1/v3 (less exploratory churn).
- **Test-run count** — `pnpm test` family invocations. Expected to drop
  on v1/v3 (fewer mid-session test cycles).
- **Edit-redundancy** — Edits to the same file in non-adjacent turns.
  Expected to drop on v1/v3.

### Quality (no-regression)
- **Tier 1 mechanical** (every trial): verify with workload's
  `sealedBaseline` allow-list per portfolio doc. Variant fails Tier 1
  if it introduces new typecheck/test failures beyond baseline OR fails
  discrimination thresholds.
- **Tier 2 manual diff** (every variant cell): Coco/Sean diffs the
  variant's commits against baseline's. Flag drift, missing edits,
  speculative additions. One-paragraph summary in trial's artifact dir.

H1 is sustained when:
- Cost reduction ≥20% observed on v3 vs baseline on substantive
  workloads at n=3
- Tier 1 + Tier 2 PASS on every trial in the cell

## Risks

1. **Examples may be cargo-culted.** A C1 example showing 1 commit might
   induce the implementer to force monolithic commits on workloads where
   multi-commit decomposition would be appropriate. Mitigation: annotate
   examples with WHY the trajectory was right ("the work was naturally
   atomic"), not WHAT to always do.

2. **Anti-example may be misread as instruction.** If the implementer
   interprets C2 as "do this," that's a regression. Mitigation: clear
   "AVOID" framing in annotations, possibly XML tags
   (`<good-example>` / `<bad-example>`) to disambiguate.

3. **Length budget.** Adding ~150-200 lines to artificer.md is a real
   cost (cache write tax). If the few-shot effect is small (<20%), the
   added context cost may offset savings. The MVP measurement
   automatically catches this: if v3 cost > baseline cost, the
   intervention isn't paying for itself.

4. **Cross-shape generalization unknown.** The C1/C2 examples come from
   a control-rig workload (vision-keeper deletion). X025 trials run on
   different workloads (A2 apparatus, A6' frontend, A7' Next.js).
   Whether the trajectory pattern generalizes is exactly what H3 tests.

5. **Examples come from Opus transcripts.** The C1/C2 trajectories were
   produced by Opus implementer. X025 baseline is Sonnet. If Sonnet
   trajectories differ structurally from Opus, the examples may not
   anchor effectively. Mitigation: present examples as "clean" vs
   "bloated" without mentioning model. Watch for divergent variant
   behavior that suggests this gap.

6. **The cheap-outlier mechanism may have already been captured by the
   Sonnet swap.** If Sonnet output costs are 5× lower, the output-token
   savings X025 is targeting are 5× smaller in absolute dollars. The
   ≥20% relative threshold partially insulates against this, but the
   intervention's deployment value diminishes if Sonnet alone already
   captures most of the available headroom.

7. **Per-trial cost is moderate, not low.** $2-5/trial on Sonnet × 18
   MVP trials = $40-70. Plan accordingly; if H1 fails, full plan ($130-225)
   is hard to justify.

## Depends on

- **claude-direct trial doctype** (framework v0.1.304+).
- **`lab.codex-checkout` fixture** for codex isolation per trial.
- **Trial workload portfolio** at `docs/lab-operations/trial-workload-portfolio.md`
  for baseline allow-lists and discrimination thresholds.
- **Sonnet-era artificer.md.** Confirmed stable per
  `cost-control/section-a-cache-data.md` work — Sean's A-thread is done;
  B is exploratory and won't land changes during X025's run.

## Operational breadcrumb — running the trials

### 1. Phase 0 — Snapshot baseline

```bash
# Capture Sonnet-era artificer.md, freeze for the experiment
cp /workspace/vibers/roles/artificer.md \
   experiments/X025-implementer-few-shot/fixtures/roles/artificer-baseline.md
# Verify model selection in artificer.md (should reference Sonnet)
grep -i "sonnet\|model:" experiments/X025-implementer-few-shot/fixtures/roles/artificer-baseline.md
```

### 2. Phase 1 — Author examples + variants

C1 and C2 examples sourced from X021 control transcripts. Recover the
transcripts via:

```bash
# Find the X021 control runs in the lab archive
ls experiments/X021-inventory-format/artifacts/*/control-baseline*/
```

For each example:
- Extract the tool sequence (Read/Edit/Bash calls in order)
- Compose the annotated example markdown
- Write to `fixtures/roles/c1-good-trajectory.md` and
  `fixtures/roles/c2-anti-example.md` as standalone blocks
- Compose the four variant role files by concatenating examples + baseline

### 3. Phase 2 — Author manifests

3 workloads (A2, A6', A7') × 2 variants (baseline, v3) = 6 manifests
for MVP. Copy the portfolio fixture stanzas into each manifest, fill in
the verify template, point role-file path at the variant fixture.

### 4. Phase 3 — Run trials

```bash
# Post a trial
nsg lab trial-post experiments/X025-implementer-few-shot/manifests/<manifest>.yaml
# Note writ id, wait for terminal
until nsg writ show <wid> 2>&1 | grep -qE 'classification: terminal'; do sleep 30; done
# Extract artifacts
nsg lab trial-extract <wid> --to experiments/X025-implementer-few-shot/artifacts/<date>/<trial>
```

Sequential, not parallel (claude-direct doctype serializes via spider).

### 5. Phase 4 — Per-cell analysis

After n=3 of a cell:
- Mean cost, stdev, range, CV
- Delta vs baseline (mean and median)
- Mechanism metrics (output tokens, commit count, tool mix)
- Tier 1 verify pass rate
- Tier 2 diff review (one trial per cell minimum)

Append to `artifacts/<date>/runlog.md`. Decide H1 verdict.

## Sequencing

X025 is independent of all other experiments. Same intervention surface
as X022/X023/X024 but different mechanism axis.

Run **after** X025's portfolio dependencies (currently met — portfolio
doc is final at `docs/lab-operations/trial-workload-portfolio.md`).

Run **before** any follow-on experiment that wants to test stacked
interventions (X025 examples + structural prompt change, etc.).

## Open questions

- **Examples-with-or-without annotation?** Anthropic's literature
  recommends both (concrete + narrative). MVP plan includes annotations
  ("what made this efficient"). If annotations dilute the demonstration
  signal, a future variant could test raw-transcript-only.
- **Example placement in role file?** MVP prepends (matches X022/X023
  pattern). Position-effects experiments (Sean's B-thread, exploratory)
  could later test alternative placements.
- **Should v1/v2 attribution run at all?** MVP defers H2 until H1
  sustains. If H1 cleanly sustains at MVP scale, the per-example
  attribution informs deployment decisions (ship both? just C1? just
  C2?). If H1 fails at MVP, H2 has no upside.

## Status

**Draft.** Not yet ready to run:
- ☐ Phase 0 — artificer.md snapshot
- ☐ Phase 1 — C1/C2 examples authored, four role-file variants composed
- ☐ Phase 2 — 6 MVP manifests authored
- ☐ Click opened for tracking
- ☐ Spec promoted from `.scratch/` to `experiments/X025-implementer-few-shot/`

When all checked, the operational breadcrumb (§ "Running the trials")
is the runbook.
