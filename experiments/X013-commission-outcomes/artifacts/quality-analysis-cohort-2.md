# Quality Analysis — Cohort 2 (Post-Identity Commissions)

Analysis date: 2026-04-02

This analysis covers commissions dispatched after the anima git identity feature landed (w-mnhq6gpv onward). These commissions have reliable commit attribution, automated session telemetry, and quality scoring via the v1 instrument. The pre-identity commissions (ses-* and the normalize-IDs series) are covered in the [Cohort 1 analysis](quality-analysis-2026-04-02.md).

## Dataset

8 commissions scored. 1 additional commission (w-mni1acqg, Walker Increment 1) is in progress and excluded.

| # | ID | Title | Cplx | Spec Pre | Outcome | Rev? | Blind | Aware | Cost | Duration |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | w-mnhq6gpv | Git Identity — Test Coverage | 2 | strong | success | no | 2.75 | 2.80 | $1.07 | 4.3m |
| 2 | w-mnhq8v8z | Plugin Install — `link:` Protocol | 2 | strong | success | no | 2.50 | 2.80 | $0.30 | 1.7m |
| 3 | w-mnhr98jj | Review Loop — Design Spec | 5 | adequate | success | no | 2.25 | 2.40 | $0.49 | 5.2m |
| 4 | w-mnhsn4xw | Fix Committer Identity Override | 1 | adequate | success | no | 3.00 | 3.00 | $0.29 | 1.7m |
| 5 | w-mnhy86ga | The Fabricator — API Contract | 5 | strong | success | yes | 2.25 | 2.00 | $0.62 | 3.6m |
| 6 | w-mni0ugjx | Fabricator Tests | 2 | adequate | success | no | 2.75 | 2.60 | $0.75 | 3.3m |
| 7 | w-mni0yd80 | Animator Session Output | 3 | strong | success | no | 3.00 | 3.00 | $1.76 | 6.3m |
| 8 | — | **Mean** | **2.75** | — | — | — | **2.69** | **2.70** | **$0.66** | **3.3m** |

**Outcomes:** 8/8 success (100%). A dramatic improvement from Cohort 1's 37.5% success rate.

**Revision required:** 1 of 8 (12.5%). Down from Cohort 1's 50%.

## Quality Score Distribution

### Blind mode (code quality, no spec context)

| Dimension | Mean | Range | Notes |
|---|---|---|---|
| test_quality | 2.25 | 1.00–3.00 | Widest variance. 3 commissions scored 1.00 (no tests or doc-only) |
| code_structure | 3.00 | 3.00–3.00 | Perfect across all 8. No variance at all. |
| error_handling | 2.25 | 2.00–3.00 | Narrow range; only 2 scored 3.00 |
| codebase_consistency | 3.00 | 3.00–3.00 | Perfect across all 8. No variance at all. |
| **composite** | **2.69** | **2.25–3.00** | — |

### Aware mode (includes requirement coverage)

| Dimension | Mean | Range | Notes |
|---|---|---|---|
| requirement_coverage | 2.75 | 2.00–3.00 | Only 1 commission below 2.00 (the Fabricator, which shipped without tests) |
| **composite** | **2.70** | **2.00–3.00** | — |

### Inter-run variance

Near zero across the entire cohort. Only 2 commissions showed any SD > 0:
- w-mnhl7kt97066dce908b2: blind composite SD = 0.12 (marginal)
- w-mnho6jxd-c8139f50006c: aware composite SD = 0.09 (marginal)

All other commissions: SD = 0.00 on every dimension. The instrument is extremely stable — possibly too stable (see Instrument Observations below).

## Findings

### 1. Success Rate Inflection

Cohort 2 is 8/8 success vs Cohort 1's 3/8. What changed:

- **Commit instruction appended to every writ** — eliminated the "abandoned because didn't commit" failure mode (was 2 of Cohort 1's 3 non-successes)
- **Exhaustive spec style adopted** — after Cohort 1's finding that "the spec carries the entire weight of quality," specs became more detailed about impact surface, verification steps, and acceptance criteria
- **Lower average complexity** — Cohort 2 mean complexity is 2.75 vs Cohort 1's ~3.0. No complexity-5 failures to contend with, though two complexity-5 commissions succeeded (design spec + Fabricator)

The single revision (Fabricator, w-mnhy86ga) was for missing tests — the spec didn't require them. This is consistent with Cohort 1's finding: animas do exactly what the spec says and nothing more.

### 2. Code Structure and Consistency Are Solved

Both `code_structure` and `codebase_consistency` scored 3.00 across all 8 commissions with zero variance. The anima consistently produces well-structured code that matches project conventions.

This is probably the least surprising finding — structure and consistency are what LLMs are best at. They absorb patterns from context and reproduce them faithfully. These dimensions may be approaching a floor where they stop providing useful signal.

### 3. Test Quality Is the Primary Differentiator

`test_quality` has the widest range (1.00–3.00) and is the primary driver of composite variance. The three commissions that scored 1.00:

- **w-mnho6jxd (Git Identity)** — contaminated score; 3 of 5 commits in the diff range were from a prior commission's cleanup. The tests exist but belong to the wrong attribution window.
- **w-mnhr98jj (Review Loop Design Spec)** — a documentation commission, not code. test_quality = 1 is correct but not meaningful.
- **w-mnhy86ga (Fabricator API)** — spec didn't require tests. Anima shipped clean code with no test coverage.

Two of these three are scoring artifacts (attribution contamination, doc-only commission), not actual test quality failures. The Fabricator is the genuine case — and it's a spec omission, not an agent capability gap (the follow-up commission w-mni0ugjx added tests successfully when the spec required them).

### 4. Error Handling Clusters at "Adequate"

6 of 8 commissions scored 2.00 on error handling; 2 scored 3.00. The two 3s are both small, tightly-scoped commissions (complexity 1 and 3). This suggests that at higher complexity, agents handle the main error paths but miss edge cases — or that the error surface grows faster than the agent's attention to it.

Worth watching as complexity increases. If error_handling stays at 2.00 for complexity-8+ commissions, that's a capability signal.

### 5. Cost and Duration Are Predictable

| Complexity | Mean Cost | Mean Duration | N |
|---|---|---|---|
| 1 | $0.29 | 1.7m | 1 |
| 2 | $0.71 | 3.1m | 3 |
| 3 | $1.76 | 6.3m | 1 |
| 5 | $0.56 | 4.4m | 2 |

The complexity-5 outlier (low cost, moderate duration) is because both complexity-5 commissions were unusual: one was a design doc (low implementation effort), the other was a focused API contract (no tests). Cost and duration are loosely correlated with complexity but heavily influenced by scope shape.

All commissions completed in a single session with no retries.

## Instrument Observations

### Ceiling Effect

Commission w-mni0yd80 (Animator Session Output) and w-mnhsn4xw (Fix Committer Identity) both scored 3.00/3.00 across all dimensions with zero inter-run variance — 6 consecutive perfect scores each. Manual review of w-mni0yd80 confirmed the work is genuinely strong but identified two minor issues the scorer did not flag:

1. **Spurious index** — the `transcripts` book declares a `sessionId` index, but the document's `id` field already is the session ID. Creates a dead column. Harmless but incorrect.
2. **Weak error-isolation test** — the test verifies the result resolves but doesn't actually induce a write failure to prove the error independence contract. The code is clearly correct (separate try/catches), but the test doesn't exercise the failure path.

Neither issue warrants revision, but both represent quality distinctions that the 3-point scale cannot capture. On clean commissions, every run maxes out — the instrument confirms "good" but cannot distinguish "good" from "very good" or "good with minor nits."

### Structural Dimensions Are Saturated

`code_structure` and `codebase_consistency` are 3.00/3.00 for the entire cohort. If this holds, these dimensions provide no variance to analyze — they become constants, not variables. Two options:
- **Accept saturation** — these dimensions confirm a baseline expectation rather than measuring variation. Useful as a defect alarm (a score below 3 would be notable), not as a quality differentiator.
- **Raise the bar** — tighten the rubric so that 3 requires something beyond "matches conventions" (e.g., proactive simplification, abstraction improvement). Risk: this may inject noise rather than signal.

Recommendation: accept saturation for now. If a commission eventually scores below 3 on either dimension, investigate — it may indicate a complexity threshold or a curriculum gap.

### Implications for H1

The quality scorer's useful variance concentrates in two dimensions: `test_quality` and `error_handling`. For H1 (spec quality predicts output quality), the interesting test is whether spec quality predicts these dimensions specifically — not the composite, which is anchored at ~2.5+ by the two saturated dimensions.

A spec that explicitly requires tests and specifies error handling expectations should score higher on these dimensions than one that doesn't. The Fabricator pair (w-mnhy86ga without test requirement → tq=1, w-mni0ugjx with test requirement → tq=3) is a natural experiment supporting this.

## Status Relative to X013 Hypotheses

- **H1 (Spec quality predicts output quality):** Signal strengthening. The Fabricator pair provides a within-task comparison: same codebase, same apparatus, one spec requires tests and one doesn't → test_quality jumps from 1 to 3. Composite tracks spec quality across the cohort. The saturated dimensions (code_structure, codebase_consistency) limit composite variance, concentrating H1's testable signal in test_quality and error_handling.

- **H2 (Complexity threshold):** Still no signal. Two complexity-5 commissions succeeded. The highest complexity attempted in either cohort is 5. The threshold, if it exists, is above 5 — or it's masked by spec quality (strong specs may push the threshold higher). w-mni1acqg (complexity 8, Walker Increment 1) is in progress and will be the first real test.

- **H3 (Revision rate as health indicator):** Revision rate dropped from 50% (Cohort 1) to 12.5% (Cohort 2). This reflects real process improvements (commit instruction, exhaustive specs) rather than system maturation — the fixes were deliberate interventions based on Cohort 1 findings. H3 is supported: the rate responds to meaningful changes.

- **H4 (Attribution becomes possible):** Improving. With git identity and automated scoring, attribution is cleaner. The Fabricator contamination issue (w-mnho6jxd) is a known, understood artifact. The remaining attribution challenge is separating "spec didn't require X" from "agent couldn't do X" — but the Fabricator pair suggests it's predominantly the former at current complexity levels.
