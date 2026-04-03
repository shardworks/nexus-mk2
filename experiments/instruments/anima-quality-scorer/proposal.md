# Proposal: Autonomous Code Quality Reviewer

## Part 1 — Motivation and Plan

### The Problem

X013 (Commission Outcomes) tracks whether autonomous commissions succeed
or fail — but its outcome measure is coarse. The `outcome` field
captures requirement satisfaction (success / partial / wrong / abandoned),
not code quality. Two commissions can both be "success" while producing
wildly different code: one ships clean abstractions with thorough tests,
the other ships a working rats' nest.

This matters because X013's central hypothesis (H1) claims that spec
quality predicts **output quality** — but the instrument only measures
**requirement fulfillment**. These are related but distinct. A commission
can meet its requirements and still produce code that's fragile,
untested, or inconsistent with the codebase. Without a quality signal
beyond pass/fail, H1 is a weaker claim than intended.

### Why Not a Patron Rating?

The obvious fix — have Sean rate quality on a scale at review time — has
the same contamination problem the spec warns about for other
retrospective fields. The patron knows the outcome, knows how the
commission felt, and knows whether they're frustrated. A "quality"
number attached to that emotional state is unreliable.

### The Proposal

Create an **autonomous code quality reviewer** — an agent that examines
commission output against a published rubric and produces structured
quality scores. Key properties:

1. **Independent assessment.** The reviewer is not the patron and not the
   implementing agent. It has no stake in the outcome and no emotional
   priors about whether the commission "should have" worked.

2. **Documented, reproducible methodology.** The rubric, the prompt, and
   the review procedure are published as part of the experiment. Another
   researcher could run the same instrument against the same code and
   get a comparable result. This is a significant methodological
   improvement over subjective ratings.

3. **Multi-run averaging.** LLMs are noisy instruments. A single review
   run may reflect prompt sensitivity or sampling variance more than
   actual code quality. Running 3–5 independent reviews and averaging
   the scores treats the LLM like what it is — a noisy sensor — and
   produces a more stable signal. The inter-run variance is itself data:
   high disagreement may indicate code that is ambiguously good or bad.

4. **Two operating modes.** The same agent, same rubric, two
   configurations:
   - **Spec-aware** — sees the commission spec and the output code.
     Answers: "Did this accomplish what was asked, and how well?" This
     is a general-purpose **acceptance review** tool, useful for the
     commission workflow independent of any experiment.
   - **Spec-blind** — sees only the output code, not the commission.
     Answers: "Is this well-written code on its own merits?" This is
     the **experimental quality instrument** — orthogonal to requirement
     satisfaction, which is what X013 needs to strengthen H1.

5. **Backfillable.** Code quality is a property of the artifact, not of
   the moment. Existing commissions can be reviewed retroactively
   without contamination. The current corpus (5 commissions) can be
   scored immediately to establish a baseline.

6. **Dual purpose.** The spec-aware mode is immediately useful as an
   operational tool — a structured acceptance check that runs before
   the patron reviews a commission. The spec-blind mode serves the
   experiment. Both justify the investment; neither alone would.

### What This Enables for X013

A new field in the commission log: `code_quality_agent` (or similar),
populated by the reviewer's averaged spec-blind score. This sits
alongside `outcome` as a second dependent variable:

- `outcome` measures: did the commission meet requirements?
- `code_quality_agent` measures: is the code good, independent of
  requirements?

H1 becomes testable as: does `spec_quality_pre` predict
`code_quality_agent`, controlling for `complexity`? That's a crisper,
more interesting claim than predicting a 4-value pass/fail enum.

### Open Questions for Discussion

These are deliberately left open — they're good topics for peer review
and conversation before locking in the design.

- **What dimensions matter?** The rubric needs to capture what "quality"
  means in this system. Test coverage? Code structure? Error handling?
  Consistency with codebase conventions? Readability by future agents?
  The right dimensions depend on what we actually value, which is worth
  discussing before encoding.

- **How many dimensions?** More dimensions = more signal but more noise
  per dimension and more annotation burden (even for an agent). There's
  a sweet spot between "one vibecheck number" and "a 20-item checklist."

- **LLM-as-judge validity.** There is active research on whether LLMs
  are reliable evaluators. Known failure modes include positional bias,
  verbosity bias, and self-preference. The multi-run averaging mitigates
  some of this; the published rubric mitigates more. But it's worth
  acknowledging the limitation and designing validation checks (e.g.,
  does the agent's quality score correlate with revision rate over time?).

---

## Part 2 — Draft Design

*This section incorporates decisions from initial review. Items marked
as decided are locked; remaining open items are noted.*

### Rubric

Four dimensions, 3-point scale (1–3). Chosen to cover the axes of
quality that are most visible in commission-scale work (single feature
or apparatus implementation) and most relevant to system health over
time.

**Dimensions: decided.** Four is the right count. Documentation quality
and API design were considered and excluded — both are harder to rubric
cleanly and would spread the signal thinner across more dimensions.

**Scale: decided.** 3-point. With N=3–5 runs, the averaged composite
already yields effective 7-point resolution (1.0–3.0 in 0.33
increments) through aggregation. A 5-point scale would give the illusion
of more precision per run while increasing inter-run variance — more
room for the LLM to waffle. Granularity comes from aggregation, not
from forcing the individual judge to be more precise.

| Dimension | 1 — Weak | 2 — Adequate | 3 — Strong |
|---|---|---|---|
| **Test quality** | Tests missing, noops, trivial, or testing implementation details rather than behavior. Key paths unexercised. | Happy path covered. Tests exercise the main contract. Gaps in edge cases or failure modes. | Edge cases, failure modes, and boundary conditions covered. Assertions are specific and readable. Tests would catch real regressions. |
| **Code structure** | Tangled control flow, god functions, unclear responsibility boundaries. Hard to follow or modify. | Reasonable decomposition. Responsibilities mostly separated. Some awkward coupling or unclear naming. | Clean abstractions, clear boundaries, idiomatic for the codebase. A new contributor (human or agent) could extend it confidently. |
| **Error handling** | Silent failures, bare throws, or missing error paths. Caller cannot distinguish failure modes. | Errors caught and reported. Major failure paths handled. Some gaps in error context or recoverability. | Errors are typed, contextual, and recoverable where appropriate. Caller gets enough information to respond meaningfully. |
| **Codebase consistency** | Ignores project conventions (naming, file structure, patterns). Feels like a foreign transplant. | Mostly consistent with surrounding code. Minor deviations in style or structure. | Reads like it belongs. Follows established patterns, uses project abstractions, matches the register of surrounding code. |

**Composite score:** Average of four dimensions, yielding a 1.0–3.0
range per run. Average across N runs for the final score. Report both
the composite and per-dimension scores — the composite is the headline
number; the dimensions are diagnostic.

**Why these four:**
- *Test quality* — the most concrete proxy for "will this hold up."
  Directly predicts whether the code will need revision.
- *Code structure* — captures whether the agent understood the design,
  not just the requirements. Poorly structured code that passes tests
  is a maintenance debt time bomb.
- *Error handling* — a known weak spot for LLM-generated code. Measures
  robustness beyond the happy path.
- *Codebase consistency* — unique to multi-agent systems. An agent that
  produces correct but alien-looking code creates friction for every
  future agent (and human) that touches the area.

**What's deliberately excluded:**
- *Documentation/comments* — hard to assess without knowing what the
  reader needs. Would require its own rubric.
- *Performance* — not meaningful at commission scale without benchmarks.
- *Security* — important but domain-specific and not reliably assessed
  by a general rubric.

### Agent Design

**Identity:** A reviewer role, not a named anima. It doesn't need
personality, curriculum, or memory — it's an instrument, not a
collaborator. Think "lab equipment" not "lab assistant."

**Input (spec-blind mode) — decided:**
- The diff (files created or modified by the commission) — primary
  input for test quality and error handling assessment
- Full file content for modified files — needed for code structure and
  codebase consistency assessment (can't judge "reads like it belongs"
  without seeing what it's sitting next to)
- The surrounding codebase structure (file tree, adjacent modules) for
  consistency assessment
- The rubric (in the system prompt)

The prompt should make the distinction explicit: "The diff shows what
this commission contributed. The full files show the context it lives
in. Assess the contribution, using the context for structural and
consistency judgments."

**Input (spec-aware mode):**
- Everything above, plus:
- The commission spec / prompt text
- Adds a fifth assessment: **Requirement coverage** — did the output
  address what was asked? (This dimension only appears in spec-aware
  mode.)

**Output (structured):**
```yaml
dimensions:
  test_quality: 2
  code_structure: 3
  error_handling: 2
  codebase_consistency: 3
composite: 2.5
notes: |
  Brief free-text explanation of scores. What stood out,
  what's notably good or weak. 2-3 sentences max.
```

**Multi-run protocol — decided:**
- Start with N=3 runs per review
- Each run uses the same prompt and rubric but independent sampling
  (temperature > 0)
- Aggregate: per-dimension mean and standard deviation, composite mean
- Flag any dimension where SD > 0.5 (high disagreement — the rubric
  may be ambiguous for that case)
- **Adaptive N:** If inter-run SD on the composite is consistently < 0.3
  across the first several commissions, 3 is sufficient. If consistently
  > 0.5, increase to 5. Build the decision into the protocol rather than
  fixing it upfront.

**Operational integration:**
- Runs as a post-commission step, after the implementing agent's session
  is sealed and before the patron reviews
- Spec-aware results surface to the patron as a structured acceptance
  check: "Here's what the reviewer found — do you want to look closer
  at test quality?"
- Spec-blind results are recorded in the commission log as
  `code_quality_agent` (composite) with per-dimension detail available
  in the review artifact

### Commission Log Schema Addition

```yaml
# New fields (populated by reviewer agent)
code_quality_agent: 2.5          # composite score, spec-blind mode, averaged across N runs
code_quality_variance: 0.3       # SD of composite across runs — high = ambiguous quality
code_quality_n: 3                # number of review runs
```

Per-dimension detail lives in a separate artifact file (e.g.,
`.artifacts/reviews/C003-quality.yaml`) rather than bloating the
commission log. The log carries the headline number; the artifact
carries the diagnostic detail.

### Prompt Versioning

The rubric is a published, versioned artifact. But the rubric alone
does not determine scores — the full system prompt wrapping it (framing,
instructions, output format directives) also affects how the LLM
interprets and applies the rubric. Changing the prompt between reviews
introduces a confound.

**Protocol:**
- The complete reviewer prompt (system prompt + rubric + output schema)
  is versioned as a single artifact (e.g., `reviewer-prompt-v1.yaml`)
- Each review artifact records which prompt version produced it
- When the prompt is updated, increment the version and note the change
- Analysis should control for prompt version — if a prompt change shifts
  the scoring baseline, scores from different versions are not directly
  comparable without calibration

This is the instrument equivalent of recalibrating after changing a
sensor's housing. The rubric is the calibration standard; the prompt
is the housing. Both matter.

### Validation Strategy

The reviewer is only useful if its scores mean something. Two
validation checks, testable as data accumulates:

1. **Concurrent validity:** Do the reviewer's scores correlate with
   `revision_required`? If high-quality commissions don't come back
   for rework and low-quality ones do, the instrument is measuring
   something real.

2. **Inter-run reliability:** Is the multi-run variance stable and
   reasonable? If the agent gives the same code a 1 on one run and a 3
   on the next, the rubric needs tightening or the run count needs
   increasing.

Both checks require N ≥ 15–20 commissions with reviewer scores. Plan
to run the first validation analysis after that threshold.
