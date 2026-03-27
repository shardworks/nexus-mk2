# Potential Dependency: Spec Scorer Anima

**Status: potential dependency — not yet commissioned**

An anima (or anima role) that reads commission spec text and produces structured assessments of spec quality and complexity. Its scores are independent of patron self-assessment and not subject to the pre/post timing contamination problem — they operate on the spec text itself, at any point.

## Why This Matters for X013

X013 depends on spec quality and complexity ratings that are (a) independent of outcome and (b) consistently applied. Patron self-assessment is valuable but retrospectively biased. An anima scorer adds a second signal: objective, consistent, and backfillable. If the two signals converge, confidence in both increases. If they diverge, that divergence is itself data.

Longer term: if the anima scorer is calibrated against empirical outcomes (H1 and H2 results), it could be used to automatically flag or reject deficient specs before dispatch.

## Two Assessments, One Anima

A single anima reads each commission spec and produces two outputs:

### Spec Quality Score

Rate the spec against objective criteria. Output: `strong` | `adequate` | `weak`.

Criteria (applied independently of what the agent will do with the spec):
- **Scope**: Is the boundary of the work clearly defined? Can an agent tell what is and isn't in scope?
- **Event flows**: Are key interactions, triggers, and sequences described?
- **Acceptance criteria**: Is there a stated definition of done?
- **Edge cases**: Are non-obvious cases or failure modes addressed?

Scoring:
- *Strong* — all four present and clear
- *Adequate* — scope and at least one other criterion present; some gaps
- *Weak* — scope ambiguous, or two or more criteria absent

### Complexity Score

Rate the complexity of the work described. Output: a Fibonacci value — 1, 2, 3, 5, 8, 13, or 21.

Heuristics:
- **1–2**: Additive, self-contained, single area of the system, no integration work
- **3–5**: Multiple touch points or moderate cross-system interaction; some integration work
- **8–13**: Core lifecycle, dispatch logic, event chains, or cross-system behavioral changes; significant integration surface
- **21**: System-wide behavioral changes; touches core abstractions or has broad downstream effects

Note: The anima's complexity score uses the same Fibonacci scale as Sean's self-assessment, enabling direct comparison. Divergence between patron-rated and anima-rated complexity is itself a data point.

## Output Format

Results are written to a `specAssessment` field on the writ record:

```
specAssessment: {
  quality: "adequate",
  complexity: 5,
  qualityNotes: "scope clear, acceptance criteria absent",
  assessedAt: <timestamp>,
  anima: <anima name>
}
```

This allows the commission log engine to read scores directly from the writ record rather than requiring a separate file or manual entry.

## Triggering

Two viable approaches — decision deferred to commission design:

1. **Standing order**: Anima triggers on `writ.ready` for patron-sourced writs. Runs before dispatch to the implementing anima. Spec quality score is available before the commission executes.
2. **On-demand tool**: Patron or Coco invokes a `score-spec <id>` tool. More flexible but requires manual invocation.

Option 1 is preferred for X013 (scores are available before outcome, removing timing dependency). Option 2 is a useful fallback for backfilling older commissions.

## What This Commission Would Require

If commissioned, this would likely involve:
- A new anima role (`spec-scorer` or similar) with a curriculum defining the scoring rubrics
- A `specAssessment` field on the writ data model (coordinate with or depends-on the patron assessment commission)
- A standing order binding to `writ.ready` for patron writs, or a `score-spec` tool, or both
- Guild-monitor display of the score alongside other writ metadata

Commission this after the data model is stable — ideally after the patron assessment commission ships, so the writ record structure is settled.
