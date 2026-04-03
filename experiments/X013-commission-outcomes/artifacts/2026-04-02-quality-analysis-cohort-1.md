# Quality Analysis — Commission Cohort Through 2026-04-02

## Dataset

8 commissions dispatched, covering the system's first operational period.

| # | ID | Title | Complexity | Outcome | Failure Mode |
|---|---|---|---|---|---|
| 1 | ses-93ad1c4c | Clerk MVP | 5 | abandoned | execution_error |
| 2 | ses-19194146 | Clerk MVP (re-dispatch) | 5 | partial | — |
| 3 | ses-0334962d | Dispatch apparatus | 3 | success | — |
| 4 | ses-2149b518 | Scriptorium hardening | 2 | success | — |
| 5 | ses-053770d1 | Clerk alignment | 2 | partial | — |
| 6 | ses-8cdbbc39 | Dispatch alignment | 1 | success | — |
| 7 | w-mnhiv9lbbccc525bf153 | Normalize IDs | 2 | abandoned | execution_error |
| 8 | w-mnhjg4deb43b581c763e | Normalize IDs (re-dispatch) | 2 | partial | spec_ambiguous |

**Outcomes:** 3 success (37.5%), 3 partial (37.5%), 2 abandoned (25%).

**Revision required:** 3 of 6 non-abandoned commissions (50%).

## Findings

### 1. Pipeline Mechanics Are Sound

The dispatch pipeline — Clerk → Dispatch → Scriptorium → seal → push → score — works reliably. Both abandonment failures were upstream of the pipeline (anima behavior, not infrastructure). The Scriptorium's seal/push path handles concurrent dispatches correctly. The quality scorer produces consistent, actionable results. The operational tooling (inscribe.sh) successfully orchestrates the full cycle.

**Conclusion:** Infrastructure is not the bottleneck.

### 2. Simple, Tightly-Scoped Commissions Succeed

The three successes share properties:
- Complexity 1–3
- Strong spec quality (rated pre-dispatch)
- Single-area changes with clear acceptance criteria
- Minimal need for the anima to reason about impact beyond the stated scope

The partial outcomes share a different pattern: the anima completed the *obvious* part of the work but failed to reason about adjacent concerns (test updates, related callers, other packages in scope).

### 3. Animas Do Not Infer Adjacent Requirements

This is the most consistent quality signal. Examples:
- **Clerk MVP:** 10+ spec deviations — the anima built something functional but diverged from the spec on naming, field presence, API shape, and lifecycle semantics.
- **Normalize IDs:** Core extraction was clean, but the anima didn't update the animator test that its changes broke, didn't consider migrating the Clerk (the origin of the convention), and didn't add tests for the new utility.
- **Clerk alignment:** Required revision because the anima addressed some deviations but not all.

In each case, the anima did what was *explicitly stated* in the spec and stopped. It did not check for regressions, verify that tests still pass, consider related callers, or exercise judgment about what "done" means beyond the literal text.

### 4. The Spec Carries the Entire Weight of Quality

With no role instructions, no curriculum, and no temperament, the writ body is the *only* guidance the anima receives. Every commission must re-teach basic practices (commit your work, run tests, check for regressions). This is a structural problem:

- **Two commissions were abandoned** because the prompt didn't include a commit instruction. This was the same failure mode both times — known, preventable, and now mitigated by inscribe.sh appending a commit instruction.
- **Partial outcomes** consistently trace to things the spec didn't explicitly say but a competent developer would check: "update tests that assert on the old format," "check if other packages use the same function."

### 5. Attribution: Spec Quality vs. Anima Capability

Is this a spec problem or an anima problem? Both, but the evidence leans toward **spec quality as the dominant factor** at current complexity levels.

- The three successes all had **strong** specs.
- The partials had **adequate** specs that required inference.
- At complexity 1–3, the tasks are well within model capability. The anima *can* do the work — it just doesn't know to do the parts that aren't explicitly stated.

This is early evidence for H1 (spec quality predicts output quality), though N=8 is far too small for confidence. It also suggests that the current complexity threshold (H2) hasn't been reached — failures at complexity 2 are spec-driven, not complexity-driven.

### 6. Current Quality Bar

**Animas will reliably do what you explicitly tell them to do. They will not infer adjacent requirements, check for regressions, or exercise judgment about scope.**

This defines the spec-writing standard needed for reliable outcomes: be exhaustive about the impact surface, explicitly list tests to update, explicitly name callers to check, explicitly state what "done" looks like including verification steps.

## Improvement Vectors

Ranked by expected impact:

1. **Better specs.** Be exhaustive about impact surface. Include explicit verification steps ("run tests," "check that X still works"). Name specific files and tests that may need updates. This is the highest-leverage intervention available now.

2. **Role instructions** (when the Loom supports them). Standing guidance about git workflow, test expectations, regression checking, and scope awareness. Moves repeated per-commission instructions into persistent role knowledge. This is the structural fix for the commit-instruction failure and the regression-blindness pattern.

3. **Pre-dispatch checklists.** Prompt the patron to think about test impact, related callers, and verification steps before dispatch. Could be a template or an inscribe.sh prompt. Low-cost intervention that compensates for spec omissions.

4. **Spec scorer.** An anima that reviews the spec before dispatch and flags gaps (missing test instructions, unnamed impact files). Would catch the normalize-IDs spec gap ("you mention Codexes, Animator, Parlour — but the Clerk has the same function"). Depends on having enough commission history to calibrate.

## Status Relative to X013 Hypotheses

- **H1 (Spec quality predicts output quality):** Early signal supports this. Strong specs → success, adequate specs → partial. N too small for confidence.
- **H2 (Complexity threshold):** No signal yet. All failures are at complexity ≤ 5 and attributable to spec quality, not complexity limits. The threshold hasn't been tested.
- **H3 (Revision rate as health indicator):** Baseline revision rate is 50% (3/6 non-abandoned). This is the starting point to track improvement from.
- **H4 (Attribution becomes possible):** The data supports preliminary attribution. Two clear execution_errors (no commit instruction), one spec_ambiguous (normalize IDs), remainder are spec-quality-correlated partials. But N is too small and the causes too correlated to separate cleanly.