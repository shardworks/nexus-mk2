_Imported from `.scratch/todo/x013-instrumentation-review.md` (2026-04-10)._

## Goal

Track open questions and known issues with the X013 quality scoring instruments (spec-blind, spec-aware, integration scorers) and the commission log. Serve as the umbrella for instrumentation-related sub-inquiries — bias investigations, scale revisions, vocabulary gaps — that don't warrant standing experiments of their own.

## Status

Active (low-intensity). Instrument runs are currently paused while T4.1 (unified instrument context / cache efficiency) is resolved. Open issues collected here for a focused instrumentation session when there's enough data to act on.

## Next Steps

When instruments come back online (post T4.1), watch for whether the aware-mode `codebase_consistency` bias resurfaces with more complex specs — the early cohort-2 data was suggestive but inconclusive. Defer scale-revision and outcome-enum changes until 30+ commissions are in the books; pre-engineering categories before they're needed will hurt comparability.

## Context

**Open issues collected so far:**

**1. Aware-mode `codebase_consistency` bias.** Early data (Fabricator commissions) showed aware scorer rating `codebase_consistency` consistently lower than blind. Walker 1.1, Dashboard, and Animator session-output commissions then agreed at 3.00 — the pattern may have been early-cohort noise, or it may resurface with more complex specs. Hypothesis: blind scorer gets sibling files as direct context; aware scorer may anchor on spec language and penalize when it can't independently verify convention compliance. Possible actions: equalize sibling context across modes; separate spec-compliance from convention-compliance in the aware prompt; document as finding if the pattern holds.

**2. Outcome scale granularity.** `partial` covers too wide a range. Walker 1.1 (works correctly, missed two spec items) and Dashboard (fatal syntax error, doesn't run) both land in `partial`. Failure mode split (`broken` vs `incomplete`) helps differentiate *why*, but the top-level outcome groups them. Options: add a subgrade (`partial-minor` / `partial-major`); lean on composite score to differentiate; expand the outcome enum (`success | minor-gaps | partial | broken | wrong | abandoned`); or do nothing and let `failure_mode + composite score` carry the signal. **Leaning: do nothing until 30+ commissions show whether the coarse bucketing actually loses signal.**

**3. Failure mode vocabulary completeness.** Current modes: `spec_ambiguous | requirement_wrong | execution_error | complexity_overrun | broken | incomplete`. Hypothetical gaps: environment/tooling failure (anima's work correct but build broken); scope creep (anima did more than asked); multi-mode commissions (could be both `incomplete` and `broken`). **Action: leave as-is until a real commission doesn't fit.** Don't pre-engineer.

**4. Quality score ceiling effect.** Cohort-2 analysis showed `code_structure` and `codebase_consistency` saturated at 3.00 across most commissions. Useful variance concentrates in `test_quality` and `error_handling`. The 3-point scale may not have enough resolution where agents perform well, but expanding mid-experiment breaks comparability. **Action: accept; document as instrument limitation; consider scale revision if/when we reset for a new cohort.**

## References

- Source doc: `.scratch/todo/x013-instrumentation-review.md`
- Experiment: X013 (commission outcomes)
- Child quests: T4.1 unified instrument context (cache efficiency), T4.2 QS-2 structured concern list
- Cohort-2 analysis artifacts under `experiments/X013/artifacts/`

## Notes

- 2026-04-10: opened from .scratch import as the umbrella for T4.