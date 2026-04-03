# X013 Instrumentation Review

**Tracking for:** X013 (Commission Outcomes)

Open questions and known issues with the quality scoring and commission log instruments. Collect here; address in a focused instrumentation session when there's enough data to act on.

---

## 1. Aware Mode codebase_consistency Bias

**Observed:** Aware scorer consistently rates `codebase_consistency` lower than blind.

Early data points:
- **w-mnhy86ga (Fabricator):** blind=3, aware=2. Aware flagged eager singleton and split scanning.
- **w-mni0ugjx (Fabricator tests):** blind=3, aware=2. Aware hedged on convention matching.

Later commissions (Walker 1.1, Dashboard, Animator session output) both modes agreed at 3.00 — the pattern may have been early-cohort noise, or it may resurface with more complex specs. Keep watching.

**Hypothesis:** Blind scorer gets sibling files as direct context. Aware scorer may anchor on spec language and penalize when it can't independently verify convention compliance.

**Possible actions:**
- Ensure both modes get the same sibling context
- Separate spec-compliance from convention-compliance in the aware prompt
- Document as finding if pattern holds

---

## 2. Outcome Scale Granularity

**Observed:** `partial` covers too wide a range. Walker 1.1 (works correctly, missed two spec items) and Dashboard (fatal syntax error, doesn't run) both land in `partial`.

The failure mode split (`broken` vs `incomplete`) helps differentiate *why*, but the top-level outcome still groups them. For reporting, this means "partial" is nearly meaningless without reading the failure mode.

**Options to consider:**
- **Add a subgrade** — e.g., `partial-minor` vs `partial-major`, or a numeric severity alongside the category
- **Lean on composite score** — the quality scores (2.75 vs 2.00) already differentiate these. Maybe the categorical outcome just needs to mean "not success" and the score does the real work
- **Expand the outcome enum** — e.g., `success | minor-gaps | partial | broken | wrong | abandoned`. More categories = more precision but harder to maintain consistency across raters (Sean rating subjectively over time)
- **Do nothing** — accept that the category is coarse and let failure_mode + composite score carry the signal. Simplest; may be sufficient for the sample sizes we'll have

**Leaning:** Probably "do nothing" until we have 30+ commissions and can assess whether the coarse bucketing is actually losing signal that matters for published findings.

---

## 3. Failure Mode Vocabulary Completeness

Current modes: `spec_ambiguous | requirement_wrong | execution_error | complexity_overrun | broken | incomplete`

**Question:** Is this vocabulary sufficient, or are there failure modes we'll encounter that don't fit?

Hypothetical gaps:
- **Environment/tooling failure** — anima's work is correct but the build/test environment was broken, dependency missing, etc. Distinct from `execution_error` (anima process failed) and `broken` (code has bugs). Haven't hit this yet.
- **Scope creep** — anima did more than asked, introduced unnecessary changes. Not really a "failure mode" but a quality concern. Currently would land in `partial` if it caused problems.
- **Multiple failure modes** — a commission could be both `incomplete` and `broken`. Currently we pick the primary one. Is that enough?

**Action:** Leave as-is until a real commission doesn't fit. Don't pre-engineer categories we haven't needed.

---

## 4. Quality Score Ceiling Effect

**Observed in Cohort 2 analysis:** `code_structure` and `codebase_consistency` are saturated at 3.00 across most commissions. Useful variance concentrates in `test_quality` and `error_handling`.

The 3-point scale (1/2/3) may not have enough resolution for dimensions where agents consistently perform well. But expanding the scale mid-experiment would break comparability.

**Action:** Accept for now. Document as instrument limitation. Consider a scale revision if/when we reset the instrument for a new experiment cohort.
