# X013 — Data Collection Assessment

*2026-04-03. Based on 22 commissions, 65–66 scoring runs, and full commission log review.*

This document assesses the two primary data collection instruments —
the quality scorer and the commission log — identifies deficiencies,
and proposes changes. Each proposal is numbered for discussion and
tracked with a disposition (pending / accepted / rejected / deferred).

---

## 1. Quality Scorer

### 1.1 Current State

The scorer runs 3 independent reviews per commission in two modes
(blind and aware), producing per-dimension scores on a 3-point scale
(1=Weak, 2=Adequate, 3=Strong) across 4 dimensions (blind) or 5
(aware). The instrument is versioned (currently v1) and isolated
(no tools, no project config, pure text-in/text-out).

### 1.2 Run-Level Value Distributions (Aware Mode, N=65 runs)

| Dimension | 1 (Weak) | 2 (Adequate) | 3 (Strong) |
|---|---|---|---|
| test_quality | 15 (23%) | 8 (12%) | 42 (65%) |
| code_structure | 0 (0%) | 6 (9%) | 59 (91%) |
| error_handling | 0 (0%) | 53 (82%) | 12 (18%) |
| codebase_consistency | 0 (0%) | 13 (20%) | 52 (80%) |
| requirement_coverage | 4 (6%) | 36 (55%) | 25 (38%) |

Blind mode (N=66 runs) shows the same pattern: `code_structure` 91%
at 3, `codebase_consistency` 91% at 3, `error_handling` 85% at 2.

### 1.3 Problems Identified

**P1 — Dimension saturation.** `code_structure` scores 3 in 91% of
runs. `codebase_consistency` scores 3 in 80–91%. These are effectively
constants — they confirm a baseline expectation but cannot distinguish
quality levels within the range of work the system actually produces.
They function as defect alarms (a score below 3 would be notable) but
provide no analytical variance for hypothesis testing.

**P2 — Binary masquerading as a scale.** `error_handling` scores 2 in
82% of runs and never scores 1. The gap between "Adequate" (errors
caught and reported, major paths handled) and "Strong" (typed,
contextual, recoverable) is too wide for most code to clear. The
dimension functions as a yes/no toggle, not a 3-point scale.

**P3 — Useful variance concentrates in two dimensions.** Only
`test_quality` (which spreads across all three values, driven partly
by "no tests = 1") and `requirement_coverage` (55% at 2, 38% at 3)
produce meaningful analytical variance. The composite score is anchored
at ~2.5 by the saturated dimensions, compressing the signal from the
useful ones. For X013 H1 testing, the composite is nearly useless as
a dependent variable — analysis would need to target `test_quality`
and `requirement_coverage` specifically.

**P4 — Near-zero inter-run SD is an instrument problem, not a
confidence signal.** 20 of 22 commissions show composite SD = 0.00
across runs. On a 3-point discrete scale with "when in doubt, score
lower" guidance, the model snaps to the same integer every time. This
demonstrates reliability (consistent reproduction) but reveals poor
measurement resolution. The absence of inter-run variance means we
cannot distinguish genuine quality certainty from instrument
insensitivity. A wider scale would likely produce more inter-run
variance, which would be *informative* — it would indicate where the
scorer is uncertain, rather than hiding that uncertainty behind
discrete snap decisions.

**P5 — Ceiling effect on strong commissions.** Manual review of
commissions that scored 3.00/3.00 (e.g., w-mni0yd80) found real
quality distinctions the scorer couldn't express: a spurious index
declaration, a weak error-isolation test. These are minor but
represent the kind of signal that distinguishes "good" from "very
good." The 3-point scale cannot capture it.

### 1.4 Proposed Changes

#### QS-1: Expand to a 5-point scale

Expand all dimensions from 3-point to 5-point. Same dimension names,
more gradations. The current 1/2/3 anchors map roughly to 1/3/5 on
the new scale, with 2 and 4 providing intermediate positions.

**Rationale:** The 3-point scale was chosen for reliability, but it
achieved reliability by sacrificing discriminant power. A 5-point
scale should allow the saturated dimensions to spread (current 3s
would distribute across 4 and 5) and give error_handling room to
express intermediate quality. Inter-run variance will likely increase,
which is informative rather than problematic.

**Risk:** Prompt anchoring for 5 levels requires careful writing.
Poorly anchored intermediate levels could introduce noise rather than
signal.

**Disposition:** accepted — implemented as v2

---

#### QS-2: Add structured concern list

Add a structured qualitative output to each scoring run: "list the
top 3 quality concerns in order of severity, or state that none were
found." This captures nuance the quantitative scale cannot —
architectural choices, subtle debt, minor-but-real issues that don't
warrant a score reduction.

**Rationale:** Manual review notes consistently surface concerns the
scorer misses or can't express numerically. The structured list is
still analyzable (count concern types, track recurrence across
commissions) without forcing everything through a numeric funnel.
Complements the quantitative scores rather than replacing them.

**Risk:** Low. The notes field already provides free-text — this adds
structure to what the scorer already tries to do there.

**Disposition:** pending

---

#### QS-3: Replace or rethink saturated dimensions

If QS-1 doesn't resolve the saturation (i.e., code_structure and
codebase_consistency still cluster at 5/5 on a wider scale), consider
replacing them with dimensions that have actual variance. Candidates:

- **Scope discipline** — did the agent stay within the commissioned
  scope, or make unnecessary changes?
- **Documentation quality** — comments, JSDoc, README updates
  appropriate to the change?
- **Defensive design** — input validation, boundary checking, guard
  clauses?

**Rationale:** If LLMs reliably produce well-structured,
convention-matching code (which the data suggests), measuring those
properties provides no experimental signal. Replacing them with
dimensions that vary would increase the composite's analytical value.

**Risk:** Loses comparability with v1 data. New dimensions need
calibration. Should only be considered after QS-1 results are
evaluated.

**Disposition:** deferred (evaluate after QS-1)

---

#### QS-4: Version the change as v2

Any rubric change creates a new instrument version. v1 data is
preserved and clearly labeled. v2 data is not directly comparable
to v1 on the affected dimensions. Cross-version analysis must account
for the instrument change.

**Disposition:** accepted (prerequisite for any change)

---

## 2. Commission Log

### 2.1 Current State

The commission log holds patron-subjective fields: `complexity`,
`spec_quality_pre`, `outcome`, `revision_required`,
`spec_quality_post`, `failure_mode`, and `note`. It is designed to be
lean and human-navigable, with objective data living in per-commission
artifacts.

### 2.2 Field Distributions (N=25 entries, including cancelled/test)

| Field | Values | Distribution |
|---|---|---|
| outcome | success / partial / abandoned / cancelled | 14 / 7 / 3 / 1 |
| spec_quality_pre | strong / adequate / weak | 18 / 5 / 1 |
| spec_quality_post | strong / adequate / weak | 12 / 9 / 1 |
| failure_mode | incomplete / execution_error / broken / spec_ambiguous | 3 / 2 / 1 / 1 |
| complexity | Fibonacci 0–20 | mostly 2–5 |
| revision_required | true / false | 10 / 11 |

### 2.3 Problems Identified

**P6 — `outcome` conflates requirement satisfaction with
shippability.** "Partial" covers two distinct situations: (a) the
requirements were met but the code has architectural issues that
need follow-up (Walker Increment 3 — functionally complete but
hardcoded `engine.id === 'review'` branch), and (b) requirements
were genuinely not met (Spider rename — missed 12 doc references).
These are different phenomena receiving the same label, losing
attribution signal.

**P7 — `failure_mode` mixes symptom and cause taxonomies.** The
spec defines causal attributions (`spec_ambiguous`, `requirement_wrong`,
`execution_error`, `complexity_overrun`). In practice, `broken` and
`incomplete` have been added — these describe symptoms (what went
wrong), not causes (why it went wrong). The field now contains two
orthogonal dimensions jammed together: "the code is broken" (symptom)
vs "the spec was ambiguous" (cause).

**P8 — `revision_required` is binary but severity varies
enormously.** The Spider rename needed a 12-line doc scrub (trivial).
The Clerk MVP had 10+ spec deviations (substantial). The Dashboard
had a fatal JS syntax error (critical). All record as
`revision_required: true`. This compresses significant information —
revision *rate* as a health indicator (X013 H3) would be more useful
if it distinguished between trivial fixups and substantial rework.

**P9 — `spec_quality` is a single axis for a multi-dimensional
judgment.** "Adequate" covers everything from "clear scope but missing
test instructions" to "right direction but ambiguous acceptance
criteria." The pre/post divergence is interesting data, but both
endpoints are too coarse to diagnose *what* about the spec was the
issue.

**P10 — No structured positive signal.** Every subjective field
orients toward deficiency: failure mode, revision required, quality
weakness. Review notes contain rich positive signal ("codebase
consistency was perfect," "faithful to spec," "strongest output") that
has no structured representation in the log. The log can tell you what
went wrong but not what the system is good at.

### 2.4 Proposed Changes

#### CL-1: Split `outcome` into requirements and shippability

Replace the single `outcome` field with two:

- `requirements_met`: yes / mostly / no
- `shippable`: yes / with-fixes / no

**Examples from existing data:**
- Walker Increment 3: `requirements_met: yes`, `shippable: with-fixes`
  (functionally complete, architectural debt)
- Spider rename: `requirements_met: mostly`, `shippable: with-fixes`
  (code perfect, doc scrub missed)
- Dashboard: `requirements_met: mostly`, `shippable: no`
  (fatal JS syntax error)
- Animator Session Output: `requirements_met: yes`, `shippable: yes`

**Rationale:** Separates "did it do what I asked" from "can I use
this." These are independent dimensions — a commission can meet all
requirements and still not be shippable (broken build), or miss some
requirements and still be shippable (minor gap, not blocking).

**Risk:** Adds one field to the log. Requires backfilling existing
entries (feasible — the review notes contain enough detail to
reconstruct both values for all commissions).

**Disposition:** pending

---

#### CL-2: Separate symptom from cause in failure tracking

Replace the single `failure_mode` field with two:

- `symptom`: incomplete / broken / diverged / over-scoped / none
  - *incomplete* — requirements partially met, some missing
  - *broken* — code doesn't work (build failure, runtime error)
  - *diverged* — agent went a different direction than intended
  - *over-scoped* — agent added unrequested work or changed things
    outside the commission boundary
  - *none* — no notable symptom (used on successes if present)

- `cause`: spec_gap / spec_wrong / execution_error /
  complexity_overrun / none
  - *spec_gap* — spec didn't specify something it should have
  - *spec_wrong* — spec described the wrong thing
  - *execution_error* — agent failed despite adequate spec
  - *complexity_overrun* — task exceeded agent capability at this
    complexity level
  - *none* — no attributable cause

**Rationale:** Symptom and cause are orthogonal. "Incomplete because
the spec didn't require tests" (symptom: incomplete, cause: spec_gap)
is fundamentally different from "incomplete because the agent didn't
finish" (symptom: incomplete, cause: execution_error). The current
single field forces a choice between describing what happened and
explaining why.

**Risk:** Adds one field. Cause attribution is inherently subjective
and sometimes ambiguous — but that's already true of `failure_mode`.
Making it explicit that cause is a "best guess" rather than a fact is
an improvement.

**Disposition:** pending

---

#### CL-3: Add `revision_severity`

Add a severity field alongside `revision_required`:

- `revision_severity`: trivial / moderate / substantial
  - *trivial* — minor fixup, <30 minutes of follow-up, no
    re-commission needed
  - *moderate* — meaningful follow-up but bounded, may require a
    targeted follow-up commission
  - *substantial* — significant rework, requires new commission with
    revised scope

**Rationale:** Revision rate (X013 H3) is more useful as a health
indicator if it's weighted. A system that produces frequent trivial
revisions is in a different state than one producing infrequent
substantial revisions. The binary obscures this.

**Risk:** Subjective threshold between levels. Mitigated by the
anchoring descriptions and by the fact that this is patron-assessed
(same person, consistent baseline over time).

**Disposition:** pending

---

#### CL-4: Rethink `spec_quality_post` or make it diagnostic

Two options:

**Option A — Replace with `spec_gap_note`.** Drop the grade, add a
brief free-text field that captures *what* about the spec was the
issue: "missing test instructions," "ambiguous scope boundary for
doc files," "no error handling expectations." This is more actionable
than a grade and directly feeds spec-writing improvement.

**Option B — Keep the grade, add the note.** Preserve the pre/post
divergence signal as quantitative data, but supplement with a brief
diagnostic. Slightly larger log footprint.

**Rationale:** The three-level grade on `spec_quality_post` tells you
the spec was "adequate" but not why. The diagnostic note is what
actually improves future specs.

**Disposition:** pending

---

#### CL-5: Add structured positive signal

Add an optional `strength` field: a brief note capturing what the
commission did well. Not a grade — a qualitative observation.

**Examples from existing review notes:**
- "Codebase consistency perfect — plugin shape matches siblings exactly"
- "Clean first-try success at complexity 8"
- "Test coverage thorough, failure paths exercised"

**Rationale:** The log currently only tells you what went wrong. Over
time, tracking what goes *right* reveals system strengths: which
complexity ranges are comfortable, which task types produce clean
output, which spec patterns lead to strong results. This positive
signal is X008-relevant (the patron's confidence calibration depends
on visible success patterns, not just absence of failure) and
X013-relevant (understanding what predicts good outcomes, not just
what predicts bad ones).

**Risk:** Optional free-text fields tend to be skipped when things
go well. May need a prompt in the review workflow to fill it in.

**Disposition:** pending

---

#### CL-6: Backfill existing entries

If CL-1 through CL-5 are accepted, backfill the 22 non-test
commission log entries from existing review notes and scorer data.
The review notes contain enough detail to reconstruct the new fields
for all completed commissions.

**Disposition:** pending (depends on CL-1 through CL-5 decisions)

---

## Summary of Proposals

| ID | Change | Instrument | Status |
|---|---|---|---|
| QS-1 | Expand to 5-point scale | Quality scorer | accepted |
| QS-2 | Add structured concern list | Quality scorer | pending |
| QS-3 | Replace saturated dimensions | Quality scorer | deferred |
| QS-4 | Version as v2 | Quality scorer | accepted |
| CL-1 | Split outcome into requirements + shippability | Commission log | pending |
| CL-2 | Separate symptom from cause | Commission log | pending |
| CL-3 | Add revision severity | Commission log | pending |
| CL-4 | Rethink spec_quality_post | Commission log | pending |
| CL-5 | Add structured positive signal | Commission log | pending |
| CL-6 | Backfill existing entries | Commission log | pending |
