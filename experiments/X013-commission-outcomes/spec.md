---
status: active
---

# X013 — Commission Outcomes

## Research Question

What predicts good outcomes from autonomous commissions — and can
tracking outcomes over time serve as a health indicator for the system?

## Background

The system has been running autonomous commissions since 2026-03-25.
Failures occur, sometimes critically. But the attribution is unclear:
when a commission produces a wrong result, is that a spec quality
problem (patron's craft), a complexity problem (system capability
limit), or an agent deficiency (model or curriculum)? These three
causes have different fixes. Without separating them, every failure
is ambiguous and every improvement effort is a guess.

This experiment creates the tracking infrastructure to answer that
question over time — and tests whether revision rate (the fraction
of commissions requiring follow-up work) functions as a meaningful
health indicator for the system as it matures.

## Hypotheses

### H1 — Spec Quality Predicts Output Quality

Commission spec quality is a significant predictor of output quality,
independent of task complexity. A well-written spec — clear scope
boundaries, explicit event flows, unambiguous acceptance criteria —
produces better outcomes regardless of task complexity.

Output quality is measured on two axes:

- **Requirement satisfaction** (`outcome`) — did the commission meet
  its requirements? Measured as success / partial / wrong / abandoned.
- **Code quality** (`code_quality_agent`) — is the code well-written
  independent of requirements? Measured by the autonomous quality
  scorer (see Data Collection — Quality Scorer). This is a composite
  score (1.0–3.0) averaged across multiple independent reviewer runs,
  covering test quality, code structure, error handling, and codebase
  consistency.

Spec quality is defined against objective, agent-independent criteria
(see Data Collection). The same spec may produce different results
with different agents; that variation is agent deficiency, not spec
quality variation.

**If true:** Commission writing is a learnable craft that meaningfully
improves outcomes. Two levers exist: patron skill development (better
spec-writing practice, templates, checklists) and system-level
correction (agentic preparation — e.g., Sage consultation — that
identifies and repairs deficient specs before dispatch). These are
complementary: patron skill sets the baseline; agentic correction
catches what remains.

**If false:** Spec quality is a weak predictor. The bottleneck is
elsewhere — complexity handling, model capability, or curriculum quality.

*Note: H1 is only testable if spec quality is rated before outcome is
known. See Data Collection — contamination of pre-dispatch ratings is
the primary methodological risk.*

### H2 — Complexity Threshold

There is a complexity threshold above which failure rate increases
significantly. Below the threshold, task complexity has little effect
on outcome. Above it, failures cluster. The threshold is not fixed —
it may shift as curricula improve, models improve, or oversight
mechanisms are added.

**If true:** Complexity tier is a useful dispatch signal. Tasks above
the threshold need different handling — more oversight, staged
delivery, or a sage consultation step — rather than just better specs.

**If false:** Complexity is a weak predictor once spec quality is
controlled for. Good specs can bridge complex tasks without special
handling.

*Note: Complexity ratings carry the same contamination risk as spec
quality ratings. Both must be recorded at dispatch time, before outcome
is known. See Data Collection.*

### H3 — Revision Rate as System Health Indicator

Revision rate (fraction of commissions requiring follow-up fixes)
declines as the system matures. A declining rate indicates some
combination of: improved spec-writing practice, improved curricula,
better anima capability, or better complexity-matching. A flat or
rising rate indicates something isn't improving despite investment.

The early period of this experiment establishes the descriptive
baseline. There is no external reference class to target; the primary
signal is change over time within the system. External comparison to
industry rework rates is a future analysis goal — see Future Work.

**If true:** Revision rate is a leading indicator worth tracking
continuously — an early warning signal before failures become critical.

**If false:** Revision rate is noisy and doesn't track system quality
meaningfully. Use other signals.

### H4 — Attribution Becomes Possible

By controlling for spec quality (H1) and complexity (H2), failures
can be attributed to root cause. The taxonomy has four causes:

- **Patron craft** — spec quality was low; the failure traces to how
  the commission was written
- **System limits** — complexity was above threshold; the task was
  beyond current handling regardless of spec quality
- **Agent deficiency** — spec was adequate, complexity was appropriate,
  agent still failed; the failure traces to model or curriculum
- **Patron requirement error** — spec was clear and well-formed, but
  described the wrong thing; the agent did exactly what was asked and
  the result was still wrong

This attribution is currently impossible because the contributing
factors are unmeasured.

**If true:** We can direct improvement effort rather than treating
every failure as undifferentiated: better spec-writing practice,
higher-complexity curriculum, model or oversight changes, or
improved requirement validation before dispatch.

*Note: H4 is the most aspirational of the four hypotheses. It requires
H1 and H2 to hold cleanly, the contamination problem to be solved, and
sufficient N to detect signal. Treat it as the north star for analysis,
not an expected early result. Even with objective spec quality scoring,
different agents may produce different results on the same spec —
the goal is to hold agent constant when comparing spec quality effects,
or hold spec constant when comparing agents.*

## Data Collection

### Commission Log (Standing Research Instrument)

The commission log lives at `experiments/data/commission-log.yaml`.
It is not experiment-specific — it is a standing research instrument
that will accumulate data across multiple experiments over time. X013
defines the first analytical framework applied to it; future experiments
may draw on the same corpus.

Annotation is split into two moments. Pre-dispatch ratings — complexity
and spec quality — must be recorded before the commission runs and the
outcome is known. Conflating pre- and post-dispatch ratings in a single
review step is the primary methodological risk: failed commissions will
feel like they had weaker specs and higher complexity in retrospect,
producing artificial correlation.

#### At Dispatch

Fields marked `auto` are populated by a guild engine when a patron writ
is posted. Fields marked `patron` must be filled in by Sean at dispatch
time — this is the contamination-safe window. Fields marked `anima` are
populated by the spec scorer if commissioned; they are not subject to
the timing problem and can be backfilled on older entries.

| Field | Source | Values | Notes |
|---|---|---|---|
| `writ_id` | auto | string | from engine stub |
| `date_posted` | auto | timestamp | from engine stub |
| `title` | auto | string | from engine stub |
| `anima` | auto | name | from engine stub |
| `complexity` | patron | 1 / 2 / 3 / 5 / 8 / 13 / 21 | **rate now, before outcome is known** |
| `spec_quality_pre` | patron | strong / adequate / weak | **rate now, before outcome is known** |
| `spec_note` | patron | string | optional; one line on what the spec covers or lacks |
| `spec_quality_anima` | anima | strong / adequate / weak | auto-populated if spec scorer is active |
| `complexity_anima` | anima | 1 / 2 / 3 / 5 / 8 / 13 / 21 | auto-populated if spec scorer is active |

**Complexity (Fibonacci scale — patron self-assessment):**

Use Scrum story point intuition. Rough anchors:
- *1–2* — additive, self-contained, single area of the system, no integration work
- *3–5* — multiple touch points, moderate cross-system interaction
- *8–13* — core lifecycle, dispatch logic, event chains, or broad behavioral changes
- *21* — system-wide; touches core abstractions with broad downstream effects

The spec scorer anima uses the same scale, enabling direct comparison
between patron and anima estimates. Consistent divergence is itself a signal.

**Spec quality criteria (at dispatch — mountain-spec adequacy):**

Spec quality is assessed at the requirements/product-owner level.
It does not reward implementation detail — that is the anima's
domain. A spec scoreable by someone who knows the product goal but
nothing about the codebase is a well-formed spec.

- *Strong* — success is unambiguous (you'd recognize it when you saw
  it), scope boundary is clear, motivation/context is present,
  non-obvious product-level cases are addressed
- *Adequate* — success is recognizable, scope mostly clear, major
  cases covered
- *Weak* — unclear what success looks like, ambiguous scope, or
  missing key context

Spec quality scoring has three intended sources that will develop
progressively: patron self-assessment (this field), spec scorer anima
(see Depends On), and automated text heuristics if suitable ones can
be identified. When multiple signals are available, agreement increases
confidence; divergence is data.

#### At Outcome Review

Fields marked `system` are populated from the writ record and become
automated as system infrastructure builds out (see Progressive
Automation). Fields marked `patron` are filled in by Sean at review
time. The field exists in the log regardless of how it is populated —
manually or automatically.

| Field | Source | Values | Notes |
|---|---|---|---|
| `writ_status` | system | completed / failed / abandoned | read from writ record |
| `token_cost` | system | integer | read from writ record |
| `outcome` | system | success / partial / wrong / abandoned | read from `patronAssessment` on writ; see Progressive Automation |
| `revision_required` | system | boolean | computed from inbound `revises` writ relationship; see Progressive Automation |
| `spec_quality_post` | patron | strong / adequate / weak | retrospective — record separately from `spec_quality_pre`; divergence is data |
| `failure_mode` | patron | spec_ambiguous / requirement_wrong / execution_error / complexity_overrun | optional; best guess at root cause |
| `notes` | patron | string | optional; what failed, what surprised |
| `reviewed_by_ethnographer` | ethnographer | boolean | mark after ethnographer has probed this case |
| `code_quality_agent` | quality scorer | 1.0–3.0 | composite score from autonomous reviewer; see Quality Scorer |
| `code_quality_variance` | quality scorer | float | SD of composite across runs; high = ambiguous quality |
| `code_quality_n` | quality scorer | integer | number of review runs |

**Outcome criteria:**
- *Success* — did what was asked, shippable with minimal or no fixes
- *Partial* — did most of it, needed meaningful follow-up work
- *Wrong* — completed but missed the point; required rework or redo
- *Abandoned* — never executed, got stuck, or was cancelled

### Progressive Automation

The commission log starts as a mostly-manual artifact and becomes
progressively automated as system infrastructure builds out. The data
model is designed to accommodate both states — fields exist in the log
regardless of whether they are populated manually or by the system.

**Phase 1 — Manual (now)**

The guild engine auto-stubs an entry (writ_id, date_posted, title,
anima) when a patron commission is posted. Sean fills in `complexity`
and `spec_quality_pre` at dispatch. At outcome review, Sean fills in
`outcome`, `revision_required`, `spec_quality_post`, and optionally
`failure_mode` and `notes`.

**Phase 2 — Partial automation (after writ relationships + patron assessment ship)**

- `outcome` becomes system-populated: patron calls `assess-writ <id>
  --outcome <value>` rather than editing the YAML directly. The
  commission log engine reads `patronAssessment` from the writ record.
- `revision_required` becomes computed: patron calls `link-writ <newId>
  <originalId> --type revises` when dispatching a fix. The commission
  log engine checks for inbound `revises` relationships rather than
  relying on a manual boolean.

Phase 2 eliminates the two most friction-prone manual steps at outcome
review and ensures `revision_required` is structurally reliable.

**Phase 3 — Code quality scoring (operational now)**

- `code_quality_agent`, `code_quality_variance`, and `code_quality_n`
  are populated by the autonomous quality scorer
  (`bin/quality-review.sh`). Runs post-commission, after seal and
  before patron review. Independent of patron assessment and not
  subject to timing contamination. Backfillable on existing entries.

**Phase 4 — Parallel signals (after spec scorer ships)**

- `spec_quality_anima` and `complexity_anima` are auto-populated by the
  spec scorer anima running against the commission spec text. These
  provide an independent, objective signal not subject to the pre/post
  timing problem. They can also be backfilled on existing log entries.

Across phases, the patron's manual dispatch-time annotation
(`complexity`, `spec_quality_pre`) remains the primary experimental
input — it captures Sean's subjective assessment at the moment of
dispatch, which is itself a data point. Automation supplements and
validates it; it does not replace it.

### Ethnographer Access and Interview Practice

The ethnographer reads the commission log at the start of each session.
Filter for recently completed commissions not yet marked
`reviewed_by_ethnographer`. Prioritize by outcome (wrong, partial, and
abandoned before success) and complexity (higher Fibonacci values
first). Use filtered cases to select specific commissions to probe —
not every commission warrants a dedicated interview probe.

This replaces relying on session notes as the primary source of what
happened. Session notes capture what Coco observed; the commission log
captures Sean's own assessment. Both are useful; they are different
data.

This also represents a shift in the ethnographer's standing operating
mode: commission-specific probing should be consistent and
agenda-driven, not incidental. Update ethnographer standing
instructions accordingly.

When a commission is selected for probing, the interview questions are:

- Walk me through how you evaluated that result. What were you looking for?
- Was there a moment where you could tell what went wrong (or right)?
- What would have made the spec stronger?
- Would you have dispatched this differently knowing what you know now?

### Quality Scorer (Autonomous Code Review)

The quality scorer is an autonomous agent that reviews commission
output against a fixed rubric. It provides the `code_quality_agent`
signal — an independent, reproducible measure of code quality that
is not subject to the patron's retrospective bias.

**Why this exists:** The `outcome` field measures requirement
satisfaction (did the commission do what was asked?), not code quality
(is the code well-written?). Two commissions can both succeed while
producing wildly different code. Without a quality signal beyond
pass/fail, H1's claim about "output quality" reduces to a weaker
claim about requirement fulfillment. The quality scorer closes this
gap.

**Instrument design:** See
`instruments/anima-quality-scorer/proposal.md` for full motivation
and design rationale. Key properties:

- **Four dimensions, 3-point scale:** test quality, code structure,
  error handling, codebase consistency. Composite score 1.0–3.0.
- **Multi-run averaging:** 3 independent runs per review (increase
  to 5 if inter-run SD > 0.5). Treats the LLM as a noisy sensor.
- **Spec-blind mode** (experimental instrument): reviewer sees only
  the code, not the commission spec. Produces a quality score
  orthogonal to requirement satisfaction.
- **Spec-aware mode** (operational acceptance tool): reviewer also
  sees the spec and scores a fifth dimension — requirement coverage.
  Useful for commission acceptance independent of the experiment.
- **Versioned prompt:** The complete prompt (system prompt + rubric +
  user template) is versioned as a unit. Each review artifact records
  which version produced it. Prompt changes require a new version.
- **Isolated execution:** Reviewer runs with all tools disabled, in
  an empty directory, with no access to project configuration. All
  context is in the prompt. Pure text-in/text-out instrument.
- **Backfillable:** Code quality is a property of the artifact, not
  the moment. Existing commissions can be scored retroactively.

**Operational tooling:**

- `bin/quality-review.sh` — run a single-mode review (blind or aware)
- `bin/quality-review-full.sh` — run both modes in parallel
- Artifacts land at `artifacts/reviews/quality/<commission-id>/`

**Commission log fields:** `code_quality_agent` (composite),
`code_quality_variance` (SD), `code_quality_n` (run count). Per-
dimension detail lives in the review artifact, not the log.

### Revision Rate Tracking

Long-term: revision rate is computed from the writ graph — the
percentage of patron commissions with at least one inbound `revises`
relationship. This is automated once the writ relationships commission
ships and enables richer queries: fix-of-fix chains, what fraction of
total commission volume is purely remediation work, etc.

Interim: `revision_required` in the commission log is a manual boolean
that approximates the same signal until writ relationships are in place.

Track revision rate over time and plot alongside system milestones
(curriculum updates, model changes, new animas) to correlate
improvements with rate changes.

**On noise:** A rolling window — whether count-based or time-based —
has noise proportional to window size. At current commission volumes,
any rolling window will be small enough to produce misleading swings.
This is unavoidable early. Track the rate, note when the early period's
rate serves as the descriptive baseline, and avoid strong conclusions
before N ≥ 20. The trend over time is the signal; individual data
points are not.

## Depends On

### Required (experiment cannot start without these)

- **Commission log file** — create `experiments/data/commission-log.yaml`
  as a standing instrument; update ethnographer instructions to read it
  at session startup; update Coco instructions to scan for unfilled
  dispatch-time entries and prompt Sean to fill them at session start.
- **Guild engine: commission log stub** — engine that creates a partial
  commission log entry (writ_id, date_posted, title, anima) for each
  patron-sourced commission when posted. Sean completes the dispatch-time
  fields; remaining fields accumulate as the commission progresses.
- Minimum ~10 commissions for initial pattern analysis; ~30 for
  meaningful regression.

### Commissioned (ship to enable automated data flow)

- **Writ relationships** — typed directed relationships between writs
  (`revises`, `blocks`, `depends-on`). Enables `revision_required` to
  be computed from the writ graph and enables richer revision rate
  analysis. See commission spec.
- **Patron assessment** — `patronAssessment` field on writ record,
  populated via `assess-writ` tool. Enables `outcome` to be
  system-populated rather than manually entered in the log. See
  commission spec.

### Operational (built, ready to run)

- **Quality scorer** — autonomous code quality reviewer. Rubric,
  prompts, and runner script at
  `instruments/anima-quality-scorer/`. Produces `code_quality_agent`
  field for the commission log. Strengthens H1 by providing a code
  quality signal independent of requirement satisfaction. See
  Data Collection — Quality Scorer.

### Potential (would strengthen the experiment; not required)

- **Spec scorer anima** — reads commission spec text and produces
  structured quality and complexity scores using the same criteria and
  Fibonacci scale as patron self-assessment. Independent of timing
  contamination; backfillable. If calibrated against empirical outcomes,
  could eventually be used to automatically flag or reject deficient
  specs before dispatch. Commission after the data model is stable —
  patron assessment should ship first.

## Risks

- **Outcome-contaminated ratings.** Both `complexity` and
  `spec_quality_pre` must be recorded at dispatch time. If either is
  rated after outcome is known, the scores will correlate artificially
  with outcome — which is the thing we're trying to measure. The
  pre-dispatch fields in the commission log are the structural
  mitigation; behavioral discipline alone is not reliable.

- **Small N early.** The first 10–15 commissions will be too noisy for
  pattern analysis. Don't draw conclusions until 20+.

- **Retrospective bias.** `spec_quality_post`, `outcome`, and
  `failure_mode` are all retrospective. This is unavoidable. The
  pre-dispatch annotation mitigates it for spec quality and complexity;
  the remaining fields should be read as qualitative signal, not
  objective measurement.

- **H4 attribution limits.** Even with objective spec quality scoring,
  different agents produce different results on the same spec —
  `failure_mode: execution_error` may actually reflect a harder spec
  than the ratings captured. Attribution will be probabilistic, not
  certain. H4 is the analytical north star; treat early attributions
  as hypotheses to revisit as N grows.

- **Scope creep.** This experiment generates data that could answer
  many questions. Keep analysis focused on the four hypotheses. Two
  additions beyond the original scope have specific purposes:
  `failure_mode` (fourth failure cause in H4) and
  `code_quality_agent` (strengthens H1 by measuring code quality
  independent of requirement satisfaction). Resist adding further
  fields without a hypothesis to test.

## Future Work

- **External baseline for revision rate.** Software engineering
  literature on rework rates — agile sprint defect rates, code review
  rejection rates, bug-to-feature ratios — could provide rough external
  comparison for H3 once internal data accumulates. Not required for the
  experiment, but useful context for published findings. Identify
  relevant data sources and assess applicability.

- **Spec scorer calibration.** Once the spec scorer anima is running
  and empirical outcome data exists, test whether anima-rated spec
  quality predicts outcomes as well as or better than patron
  self-assessment. If the signals align, consider using the anima score
  as a dispatch gate — flagging or holding weak specs before they run.

- **Writ graph analysis.** Once writ relationships are in place,
  revision rate expands into richer analysis: fix-of-fix chains,
  time-to-revision, whether certain animas or complexity tiers
  concentrate revision work, etc.

- **Technical spec quality (X014).** A related but distinct question:
  do technically detailed specs outperform mountain-quality specs on
  comparable tasks? This is a direct empirical test of the mountain-
  spec philosophy and requires a designed intervention — deliberately
  varying implementation detail level across comparable commissions —
  not passive observation. Technical detail ratings can be backfilled
  from spec text retroactively (they are not outcome-contaminated),
  so existing X013 entries can seed the X014 corpus. See X014 draft.
