---
status: superseded
superseded_at: 2026-04-30
superseded_reason: |
  Spec generation became automated through the Astrolabe pipeline,
  eliminating spec-quality variance — every commission now ships with a
  plan-writer-authored spec rated 'strong' by construction. Structured
  patron review (complexity, outcome, failure_mode, reviewed_at,
  reviewed_by_ethnographer) was retired 2026-04-30: the Laboratory's
  CDC watchers were removed, the manual fields deprecated, and the
  ethnographer's commission-probing protocol withdrawn. All four
  hypotheses (H1 spec quality predicts outcome, H2 complexity threshold,
  H3 revision rate as health signal, H4 attribution) depended on
  patron-set instrumentation that no longer exists. The historical
  dataset (150 patron-touched entries through 2026-04-29) is preserved
  as a frozen baseline at
  artifacts/2026-04-30-commission-log-frozen-baseline.yaml;
  the per-commission artifact directories were pruned to the 22 with
  substantive review notes. Future work in this space (X014 technical spec quality,
  X015 spec detail as model substitute) takes a different
  experimental approach not dependent on patron-set ratings.

  See artifacts/2026-04-30-retrospective.md for what X013
  surfaced during its active period (per-hypothesis disposition,
  methodological observations, what the successor experiments
  inherit).
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

> **Historical note (2026-04-30):** The Data Collection section below
> describes the instrument *as it was operated* during X013's active
> period. References to `experiments/data/commission-log.yaml` and
> `experiments/data/commissions/<id>/` are to the live instrument paths
> that no longer exist. The frozen baseline of the commission log lives
> at [`artifacts/2026-04-30-commission-log-frozen-baseline.yaml`](artifacts/2026-04-30-commission-log-frozen-baseline.yaml).
> The 22 surviving per-commission directories with substantive patron
> review notes remain in place. The Laboratory's CDC watchers that
> populated both have been removed. See the spec frontmatter for the
> supersession context.

### Data Architecture

Commission data is split across two tiers, optimized for different
access patterns:

1. **Commission log** (`experiments/data/commission-log.yaml`) — a lean,
   human-navigable YAML file containing patron-subjective judgments and
   dispatch metadata. This is the primary instrument for browsing,
   annotating, and discussing commissions interactively.

2. **Per-commission artifacts** (`experiments/data/commissions/<id>/`) —
   the full evidentiary record: session telemetry, quality scorer output,
   commission body, dispatch log, review notes, and scoring context.
   These are the source of truth for objective/automated data.

The unified analytical dataset is assembled on demand by joining the
commission log with per-commission artifacts. The log's `id` field is
the join key to the per-commission folder name. See the
[commissions README](../data/commissions/README.md) for the artifact
schema and join documentation.

This separation is deliberate: the commission log stays small enough
for a human or agent to read end-to-end, while the full data richness
is available for analysis without cluttering the navigable instrument.

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

Fields marked `auto` are populated by `inscribe.sh` when a commission
is posted. Fields marked `patron` must be filled in by Sean at dispatch
time — this is the contamination-safe window.

| Field | Source | Values | Notes |
|---|---|---|---|
| `id` | auto | string | writ ID from Clerk |
| `title` | auto | string | extracted from commission body |
| `codex` | auto | string | target codex name |
| `complexity` | patron | 1 / 2 / 3 / 5 / 8 / 13 / 21 | **rate now, before outcome is known** |
| `spec_quality_pre` | patron | strong / adequate / weak | **rate now, before outcome is known** |

**Complexity (Fibonacci scale — patron self-assessment):**

Use Scrum story point intuition. Rough anchors:
- *1–2* — additive, self-contained, single area of the system, no integration work
- *3–5* — multiple touch points, moderate cross-system interaction
- *8–13* — core lifecycle, dispatch logic, event chains, or broad behavioral changes
- *21* — system-wide; touches core abstractions with broad downstream effects

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

#### At Outcome Review

All fields are filled in by Sean at review time.

| Field | Source | Values | Notes |
|---|---|---|---|
| `outcome` | patron | success / partial / wrong / abandoned | patron assessment of the commission result |
| `revision_required` | patron | boolean | whether follow-up work was needed |
| `spec_quality_post` | patron | strong / adequate / weak | retrospective — record separately from `spec_quality_pre`; divergence is data |
| `reviewed_at` | coco | ISO date / null | date patron reviewed this commission with Coco; null = not reviewed |
| `failure_mode` | patron | spec_ambiguous / requirement_wrong / execution_error / complexity_overrun / broken / incomplete | optional; best guess at root cause |
| `reviewed_by_ethnographer` | ethnographer | boolean | mark after ethnographer has probed this case |
| `note` | patron | string | optional; meta info about the record itself |

**Outcome criteria:**
- *Success* — did what was asked, shippable with minimal or no fixes
- *Partial* — did most of it, needed meaningful follow-up work
- *Wrong* — completed but missed the point; required rework or redo
- *Abandoned* — never executed, got stuck, or was cancelled

### Per-Commission Artifacts (Objective Data)

Objective and automated data lives in per-commission artifact folders
rather than the commission log. This keeps the log lean while
preserving full data richness for analysis. Key artifacts:

| Artifact | Source | Content |
|---|---|---|
| `sessions/*.yaml` | The Laboratory (auto) | Session telemetry: cost, duration, token usage, timing |
| `quality-blind.yaml` | Quality scorer (auto) | Code quality scores without spec context |
| `quality-aware.yaml` | Quality scorer (auto) | Code quality scores with spec and requirement coverage |
| `commission.md` | `inscribe.sh` (auto) | The writ body as dispatched |
| `dispatch.log` | `inscribe.sh` (auto) | Timestamped dispatch lifecycle log |
| `review.md` | Patron (manual) | Patron review notes and scorer summary |
| `quality-context/` | Quality scorer (auto) | Diff, changed files, context — makes scoring reproducible |

The quality scorer runs post-commission as part of `inscribe.sh`
(Phase 5). It is independent of patron assessment and not subject to
timing contamination. See the Quality Scorer section below.

Session telemetry provides `cost_usd`, `duration_ms`, and token
breakdowns. These are available for analysis via the per-commission
artifacts without needing to be duplicated in the log.

The patron's manual dispatch-time annotation (`complexity`,
`spec_quality_pre`) remains the primary experimental input — it
captures Sean's subjective assessment at the moment of dispatch, which
is itself a data point. Automated data supplements and validates it;
it does not replace it.

### Future Automation

**Spec scorer anima** — reads commission spec text and produces
structured quality and complexity scores using the same criteria and
Fibonacci scale as patron self-assessment. Independent of timing
contamination; backfillable. Output would land in per-commission
artifacts alongside quality scorer output. See Depends On — Future.

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
`experiments/instruments/anima-quality-scorer/proposal.md` for full
motivation and design rationale (archival — the original instrument).
Key properties:

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
- Artifacts land in per-commission folders: `quality-blind.yaml`,
  `quality-aware.yaml`, and `quality-context/`

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

- **Commission log file** — `experiments/data/commission-log.yaml`,
  a standing instrument. Coco scans for unfilled dispatch-time entries
  and prompts Sean to fill them at session start.
- **Dispatch pipeline** — `inscribe.sh` orchestrates the full cycle:
  post → dispatch → capture session record → scaffold log entry →
  quality scoring. Auto-populates per-commission artifacts.
- Minimum ~10 commissions for initial pattern analysis; ~30 for
  meaningful regression.

### Operational (built, running)

- **Quality scorer** — autonomous code quality reviewer. Instrument
  definitions at `experiments/instruments/spec-blind-quality-scorer/`
  and `experiments/instruments/spec-aware-quality-scorer/`. Runner
  package at `packages/instruments/`. Output lands in per-commission
  artifacts. Strengthens H1 by providing a code quality signal
  independent of requirement satisfaction. See
  Data Collection — Quality Scorer.
- **Session telemetry** — The Laboratory auto-generates session YAML
  with cost, duration, and token usage. Lands in per-commission
  `sessions/` directory.

### Future (would strengthen the experiment; not required)

- **Spec scorer anima** — reads commission spec text and produces
  structured quality and complexity scores using the same criteria and
  Fibonacci scale as patron self-assessment. Independent of timing
  contamination; backfillable. Output would land in per-commission
  artifacts. See Future Automation in Data Collection.
- **Writ relationships** — typed directed relationships between writs
  (`revises`, `blocks`, `depends-on`). Would enable `revision_required`
  to be computed from the writ graph rather than a manual boolean, and
  richer revision rate analysis (fix-of-fix chains, remediation volume).
- **Patron assessment tool** — `assess-writ` CLI command to record
  outcome on the writ record directly, reducing manual log editing.

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
  many questions. Keep analysis focused on the four hypotheses. Resist
  adding new data collection without a hypothesis to test.

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
