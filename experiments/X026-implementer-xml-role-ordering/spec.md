---
status: draft
---

# X026 — Implementer XML-Tagged Role-First systemPrompt

**This experiment's click:** `c-mp2o2m5h` (child of `c-mok4nke6` Apr 29 cost-optimization landscape; bundles B3 + B4 levers from `.scratch/cost-control/prompt-engineering-landscape.md`).

**Sibling experiments:**
- [X022 — Implementer Behavior Nudges](../X022-implementer-behavior-nudges/spec.md) — five imperative tool-use directives. Tested at -13% n=3, marginal.
- [X023 — Implementer Strategy Nudges](../X023-implementer-strategy-nudges/spec.md) — two strategy directives. Authored, not run; superseded by Sonnet swap.
- [X024 — Implementer Turn Discipline](../X024-implementer-turn-discipline/spec.md) — goal-stated reframe of X022. Tested at -3.5% n=3, refuted.
- [X025 — Implementer Few-Shot Examples](../X025-implementer-few-shot/spec.md) — in-context demonstration mechanism. In flight.

X022/X023/X024 all tested **imperative directive content**. X025 tests
**demonstrations**. X026 tests **prompt structure** (XML tags + section
ordering). Different mechanism axis again, same intervention surface
(artificer role file).

## Motivation

Section B of the prompt-engineering landscape (`.scratch/cost-control/prompt-engineering-landscape.md`) catalogued two related items as untested:

- **B3 — XML structural tags.** Anthropic's recommended pattern: wrap distinct content cohorts in `<role>`, `<task>`, `<context>` tags. Improves recall and reduces cross-section bleed.
- **B4 — Front-load with goal, not background.** Put "your task is to X" first; put persona/background after. Matches the "primacy + recency dominate" finding from the lost-in-the-middle literature.

The May 12 controlled `claude --print` measurement (see `.scratch/cost-control/prompt-debug-experiment.md`) established that our role-file content lands at the back of the systemPrompt (after `## Tool:` blocks rendered by `loom.ts`), and the systemPrompt itself sits in the primacy zone of the larger assembled context. That means:

- Position effects on our role-file content operate within the strong-primacy zone of the overall context — small lever territory.
- The role file's INTERNAL ordering still affects which directives get primacy-within-the-section vs which get recency-within-the-section.

X026 tests whether structural cues (XML tags) plus goal-first internal ordering produce measurable cost or quality improvement on substantive Sonnet workloads.

## Pipeline placement

Same as X022/X023/X024/X025 — modifies the **artificer role file**. No
framework changes; `loom.ts` assembly is untouched. Trial doctype is
**claude-direct** (matches X025).

## Hypothesis

**H1 (cost effect).** The combined XML-tagged, goal-first variant reduces implementer session cost (USD) **≥10%** on substantive Sonnet workloads relative to baseline, at n=3.

H1 is a **weak prior**. X022 (imperative directives, n=3) was -13%, X024 (goal-stated reframe, n=3) was -3.5%. Both were behavioral-structure interventions; both came in marginal-to-negative. The honest expectation for X026 is **null or small effect**. The experiment closes B3/B4 cleanly so the landscape can be retired, rather than promising savings.

**H2 (quality effect, informational).** The combined variant does not regress quality versus baseline — variant runs pass verify at the same rate as baseline runs.

H2 is informational. The acceptance script is identical to X025's A2 manifest (typecheck + build clean, only sentinel-baseline test failures allowed, ≥1000 insertions to packages/plugins/reckoner).

## Sample size

n=3 per cell against the ~10% CV noise floor measured in X021. Detects ≥20% effects cleanly; misses smaller effects. Same Sonnet-era caveat as X025: if the first three baseline trials show CV >15%, n=5 may be needed.

## Variants

| variant | description | role file |
|---|---|---|
| baseline | Verbatim Sonnet-era snapshot of `/workspace/vibers/roles/artificer.md` (frozen at X026 Phase 0) | `fixtures/roles/artificer-baseline.md` |
| combined | XML structural tags + goal-first reordering (B3 + B4 bundled) | `fixtures/roles/artificer-combined.md` |

Intervention surface is **role-file-only**. Brief content, codex pins, plugin set, framework version, MCP tool surface — all identical across variants.

### Combined-variant treatment description

The combined variant changes two things in the artificer role file:

1. **XML structural tags (B3).** Each section is wrapped in semantic XML tags (`<task>`, `<testing>`, `<documentation>`, `<persona>`, `<finishing>`) replacing Markdown `##` headers. The doc-drift subsection nests as `<adjacent-doc-drift-cleanup>` inside `<documentation>`.

2. **Goal-first reordering (B4).** A new `<task>` block at the top summarizes the goal in goal-stated framing ("Land it as a single clean commit..."). The original persona/role statement moves to a `<persona>` block before `<finishing>`. The critical commit directive stays last for recency.

Resulting section order: `<task>` → `<testing>` → `<documentation>` → `<persona>` → `<finishing>`. Compare to baseline order: Role → Testing → Documentation → Finishing.

The ~50 tokens of added content (the new `<task>` block) is the only content delta; all other section content is verbatim from baseline.

## Workload portfolio

MVP picks one workload from `docs/lab-operations/trial-workload-portfolio.md`:

| # | Workload | Shape | Why chosen |
|---|---|---|---|
| A10 | rig-moeiitmi Reckoner parseChildFailures fix | diagnostic bugfix | Smallest workload in the portfolio ($12.23 Opus baseline, ~15min historical duration, 500-insertion discrimination floor). Chosen after the original A2 selection hit a "claims-complete-but-no-commit" failure mode at ~17-min session length (see workload-switch note below). |

**Workload switch (2026-05-12):** Original MVP plan used A2 (Reckoner skeleton, greenfield). The first A2 baseline trial (`w-mp2ocw5y`) failed verify with 0 commits despite passing typecheck/build/test — the implementer wrote all files in the working tree but never executed a commit tool call before the session ended. Parallel X025 A2 baseline (`w-mp2o068y`) hit identical failure. Pattern is "auto-compaction strips commit-discipline directive on long sessions"; filed as `c-mp2q270l`. Switching to A10 (smaller workload, shorter expected session) to stay below the threshold where the pattern bites.

**Optional expansion (post-MVP, if H1 sustains):**
- A3 (Arbor apparatus.stop) — narrow bugfix, comparable shape, ~19min historical. Different package surface from A10.
- A6' (Oculus click tree view) — frontend feature, thin spec. Different stack.

## Trial plan

**MVP** (recommended starting point):
- 1 workload (A10) × 2 variants × n=3 = **6 trials**
- Estimated cost: **$12-18 Sonnet** (per-trial expectation $2-3)

**Mid** (adds A3 narrow bugfix):
- 2 workloads × 2 variants × n=3 = **12 trials**
- Estimated cost: **$28-40 Sonnet**

Run sequence:
1. Phase 0 — Snapshot Sonnet-era artificer.md baseline (frozen at experiment start; verbatim copy at `fixtures/roles/artificer-baseline.md`).
2. Phase 1 — Author combined variant (`fixtures/roles/artificer-combined.md`).
3. Phase 2 — Run MVP trials sequentially. Capture results in `artifacts/<date>-<run-name>/`.
4. Phase 3 (conditional on H1 signal) — Expand to A6'.

## Acceptance criteria

**H1 verdict (cost):**
- **Sustained**: combined variant mean cost ≤ baseline mean × 0.90 (≥10% reduction) with both n=3 cells passing verify at ≥2/3.
- **Refuted**: combined variant mean cost ≥ baseline mean × 0.95 (no meaningful reduction), or insufficient passing trials.
- **Inconclusive**: between -10% and -5%, or one cell with insufficient passing trials. Likely calls for n=5 follow-up or shape-sensitivity expansion.

**H2 verdict (quality):**
- **Pass**: combined-variant verify-pass rate ≥ baseline verify-pass rate. No new failure modes surfaced in the variant transcripts (read post-hoc).
- **Fail**: variant introduces regressions not present in baseline. If H1 also fails, the combined variant is unsafe to ship. If H1 sustains, halt and inspect transcripts.

## What this experiment closes

- **B3** (XML structural tags) and **B4** (goal-first ordering) from the prompt-engineering landscape.
- If refuted, the broader B-family (behavioral nudges via prompt structure) gains another data point pointing toward "marginal at best" — consistent with X022/X024 priors.
- If sustained, opens the question of whether the framework-level `loom.ts` reorder lever (`c-mp28jkau`) would compound the effect by putting role content in even stronger primacy.

## Open questions

1. **Confound from added content.** The new `<task>` block adds ~50 tokens. If H1 sustains, attribution between "the XML tags" / "the reorder" / "the goal-stated task summary" is muddy. A follow-up could decompose with v1 (XML-only, no reorder) and v2 (reorder-only, no XML).
2. **Cache impact.** The new role file content invalidates the cache once at first deployment. Steady-state cache utilization will return to baseline within a few sessions per Section A's cross-session-reuse data. Not a concern for the trial.

## References

- `.scratch/cost-control/prompt-engineering-landscape.md` — Section B (catalog source)
- `.scratch/cost-control/section-b-position-data.md` — empirical position data
- `.scratch/cost-control/prompt-debug-experiment.md` — controlled measurement of Claude Code overhead
- X025 spec — sibling experiment, shares A2 workload
- Click `c-mp2o2m5h-3891aa47c125` — X026 experiment click
- Click `c-mp28jkau-ea36951e20ef` — framework-level B4 lever (loom.ts reorder); deferred in favor of prompt-only test here
