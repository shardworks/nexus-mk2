# X013 Retrospective

*Written 2026-04-30 at supersession. Captures what X013 surfaced during its
active period (2026-03-25 → 2026-04-29), the disposition of each hypothesis
at retirement, the methodological observations worth preserving, and what
its successors should inherit.*

## Why this retro exists

The supersession note in the spec frontmatter explains *why X013 was retired*
(spec generation became automated; structured patron review withdrew).
This artifact answers the parallel question: *what did X013 actually surface
before its instrumentation collapsed?*

The dataset is 150 patron-touched entries from the frozen baseline at
[`2026-04-30-commission-log-frozen-baseline.yaml`](2026-04-30-commission-log-frozen-baseline.yaml).
N is small at every cut, so claims here are directional, not statistical.
The point is to preserve institutional memory, not to litigate hypotheses
that didn't reach significance.

## Per-hypothesis disposition

### H1 — Spec quality predicts output quality

**Directional support, never reached significance.** Cross-tab from the
frozen baseline (entries with patron-set `spec_quality_pre` and `outcome`):

| spec quality | success | partial | wrong | abandoned/failed | n  | success rate |
|--------------|---------|---------|-------|------------------|----|--------------|
| strong       | 44      | 12      | 0     | 3                | 59 | 75%          |
| adequate     | 9       | 1       | 0     | 7                | 17 | 53%          |
| weak         | 0       | 1       | 1     | 0                | 2  | 0%           |

The gradient is in the predicted direction: stronger specs produce more
successful outcomes. The "weak" cell is too small to count, but the
strong-vs-adequate delta (75% → 53%, ~22pp) is the kind of signal H1
predicted. No contamination check ever ran.

**Status at retirement:** the experimental arm doesn't exist anymore.
Spec generation through the Astrolabe pipeline produces uniformly-rated
"strong" specs (every commission body now has `author: plan-writer`
frontmatter, which the Laboratory auto-rated 'strong' by construction).
There is no quality variance left to measure.

### H2 — Complexity threshold for failure rate

**Directional support, very small N.** Revision rate by complexity bucket
(only entries with both `complexity` and `revision_required` set):

| complexity bucket | revisions / total | revision rate |
|-------------------|-------------------|---------------|
| small (1–2)       | 5 / 15            | 33%           |
| medium (3–5)      | 6 / 12            | 50%           |
| large (8+)        | 4 / 7             | 57%           |

The gradient is in the predicted direction. n=34 across all buckets is
nowhere near the ~30-per-bucket the spec called for, so this is a sketch
of a finding rather than a finding. Worth noting that the "threshold"
shape (flat below, cluster above) doesn't appear — revision rate climbs
smoothly. If H2 is real, the relationship is more dose-response than
threshold.

**Status at retirement:** complexity capture stopped early. The patron
filled in `complexity` for the first ~30 commissions then largely stopped
(the retroactively-counted N for this analysis is 134 entries with
complexity set, but most are pre-pipeline). The spec automation eliminated
the natural place to ask the question at dispatch.

### H3 — Revision rate as system health indicator

**The strongest signal X013 produced.** This was the hypothesis that
generated the most actionable observation, even though it isn't the
revision-rate-over-time chart the spec described.

The signal is the **per-commission review rate cliff**, captured in the
`reviewed_at` field. Distribution by date (n=40 reviews total):

```
2026-04-02: 17    ← review process operating
2026-04-03:  6
2026-04-04:  2    ← cliff (planning workshop landed; static review rig already up)
2026-04-06:  2
2026-04-07:  4
... ad-hoc, ~1/day or less ...
2026-04-29:  2
```

23 of 40 reviews happened in the first two days of capture; the rest
trickled across the next four weeks. The trigger is identifiable: the
static implement→review→revise rig pipeline (operational ~2026-04-02)
and the planning workshop (operational ~2026-04-04) jointly absorbed
the quality-assurance role the patron had been performing manually.

This is not the H3 the spec asked. H3 asked "does revision rate decline
as the system matures?" What X013 actually surfaced was "the patron's
own per-commission review collapsed in days when structural alternatives
came online" — which is more interesting and more decisive than the
trend line H3 predicted.

**Status at retirement:** this observation has been lifted into X008
§Infrastructure Milestones as evidence for X008 H5 (Criteria-
Internalization Path). The retirement of `reviewed_at` instrumentation
itself is consistent with H5 — system-internalized criteria displacing
per-commission review.

### H4 — Attribution becomes possible

**Aspirational, never tested.** The spec called this "the most aspirational"
hypothesis and treated it as a north star for analysis once H1/H2 had
held cleanly. Neither H1 nor H2 reached the N needed for clean control,
so H4 never had its inputs.

The closest thing to an H4 datapoint is the failure-mode distribution
(among entries where the patron filled it in):

| failure_mode       | n |
|--------------------|---|
| execution_error    | 9 |
| incomplete         | 6 |
| requirement_wrong  | 6 |
| broken             | 5 |
| spec_ambiguous     | 1 |

The taxonomy was useful — patrons did differentiate between agent
deficiency (`execution_error`), patron-craft (`spec_ambiguous`), and
patron-requirement-error (`requirement_wrong`) when filling in the field.
Not enough N to push past anecdote.

**Status at retirement:** structurally untested. The taxonomy itself
might still be useful for any future review-of-failures work.

## Methodological observations worth preserving

1. **The pre/post-rating separation worked structurally.** The spec
   identified outcome-contaminated ratings as the primary methodological
   risk and addressed it by splitting `spec_quality_pre` (at dispatch)
   from `spec_quality_post` (at review). The structural fix kept
   contamination from being a confound in the data we did collect —
   when patron and post ratings differ, that's data, not noise. The
   discipline was easy to maintain (the field appeared in the log
   skeleton at dispatch time, before outcome was knowable).

2. **Patron-rated complexity decayed faster than spec-quality rating.**
   `complexity` was harder for the patron to reason about than
   `spec_quality_pre`. The Fibonacci anchors helped, but the question
   "how big is this?" repeatedly felt like guessing at the system's
   capabilities rather than describing the work. The patron stopped
   filling it in voluntarily well before the planning workshop landed.
   *Lesson:* dispatch-time fields succeed in proportion to how much
   real information the patron has at dispatch — not in proportion to
   how useful the field would be for analysis.

3. **The Walker Increment 3 finding was the cleanest H1 anecdote.**
   The scorer + Coco-review pattern surfaced architectural debt
   (hardcoded `engine.id === 'review'` branch) that the patron explicitly
   said he wouldn't have caught manually. This is one concrete instance
   of "the review layer's value is in the catches the patron wouldn't
   have made unaided" — exactly what H1's spec-quality argument
   indirectly predicted. Cited in X008 §Sessions for H1 / H4 anecdotal
   weight; preserving the reference here so X013 doesn't lose it.

4. **The cliff shape was the surprise.** The spec assumed revision rate
   would shift gradually as the system matured. What actually happened
   was a step function — review behavior changed in days, not weeks,
   triggered by specific infrastructure landings. *Lesson:* "system
   maturation" is sometimes a continuous process and sometimes a
   discrete one tied to landing specific pieces. Trend-line analysis
   alone would have missed this.

## What the successors inherit

### X008 (Patron's Hands) — already absorbed

The `reviewed_at` cliff lives in X008 §Infrastructure Milestones as
H5 (Criteria-Internalization Path) evidence. The retirement of the
review process itself is now also part of H5's evidentiary base. No
further action needed; X008 is the natural home for this signal.

### X014 (Technical Spec Quality) — needs design rethink

X014 was drafted as a comparison between technically-detailed specs
and mountain-quality specs on comparable tasks. Both arms were
implicitly patron-authored. With patron-authored specs no longer the
default path, the experiment as drafted doesn't have a clean control.
*Open question for X014 activation:* is this experiment about
spec-detail variance among patron-authored specs (a now-historical
question) or about spec-detail variance among Astrolabe-pipeline
outputs (a different and arguably more relevant question)? The X013
data didn't answer it; X014's design needs to.

### X015 (Spec Detail as Model Substitute) — direct successor

X015's premise — that pipeline-generated detail in specs reduces
model-capability requirements (Sonnet matches Opus) — is the direct
successor question to X013 H1 in the spec-automation era. X013's
directional H1 evidence (75% success on 'strong' specs vs 53% on
'adequate') is consistent with X015's hypothesis but doesn't
distinguish "stronger spec" from "stronger model handles weak spec."
X015 is positioned to make that distinction.

### Dropped futures

Three Future Work items from the X013 spec were never built and are
now unnecessary in their original framing:

- **Spec scorer anima.** Was meant to produce structured quality and
  complexity scores from spec text, calibrated against patron
  self-assessment. With patron self-assessment retired, the calibration
  target is gone. A pipeline-rated spec scorer might still be useful
  for X014/X015 but would be designed against agent-output outcomes,
  not patron ratings.
- **Writ-graph revision rate.** Was meant to compute revision rate
  from `revises` / `fixes` link counts in the writ DB. The links
  exist; the computation is straightforward; nothing currently
  consumes it. Available if anyone wants to revive H3 in graph form.
- **Patron assessment tool (`assess-writ` CLI).** Was meant to reduce
  manual log editing. Moot — the manual log is no longer maintained.

## What X013 could not answer

For the publication-record honesty file:

- **Whether spec quality really predicts outcome quality.** The
  directional support exists but the N is too small and the spec
  generator changed mid-experiment. We have a hypothesis worth
  carrying forward, not a finding worth publishing.
- **Whether complexity is a real failure threshold.** Same caveat,
  smaller N. We have a hypothesis to inherit, no clean answer.
- **Whether revision rate is a useful health indicator over time.**
  The cliff signal that *did* emerge isn't this question. The trend-
  over-time question never had its data.
- **Whether failure attribution is tractable.** Untested.

## Connecting threads

For anyone returning to this material later:

- **Frozen baseline:** [`2026-04-30-commission-log-frozen-baseline.yaml`](2026-04-30-commission-log-frozen-baseline.yaml)
- **Identical baseline (X008's copy):** `experiments/X008-patrons-hands/artifacts/2026-04-30-commission-log-frozen-baseline.yaml`
- **Surviving per-commission directories with patron review notes:**
  22 folders under `experiments/data/commissions/<id>/`
- **X008 §Infrastructure Milestones:** the home for the review-rate
  cliff observation going forward
- **X013 instruments:** four design briefs at
  `experiments/X013-commission-outcomes/instruments/` —
  anima-spec-scorer, commission-commission-log-engine,
  commission-patron-assessment, commission-writ-relationships. All
  archival; some have ideas worth lifting if you revisit X014/X015.

## One-line summary

X013 showed directional but inconclusive support for H1 and H2, surfaced
the per-commission review-rate cliff (now living in X008 H5) as its
strongest signal, and was overtaken by spec automation before its
hypotheses could reach statistical confidence. The dataset is preserved;
the questions move to X014, X015, and X008.
