---
status: active
---

# X015 — Spec Detail as Model Substitute

## Research Question

Can highly detailed implementation specs — like those produced by the
planning pipeline — reduce the model capability threshold required
for successful commission execution? Specifically: can Sonnet-class
models produce outcomes comparable to Opus-class models when given
sufficiently detailed specs?

## Background

The Nexus planning pipeline (reader → analyst → writer) generates
implementation specs with a level of technical detail far beyond
what a human patron would typically write. These specs include
explicit file inventories, decision registers, scope boundaries,
and implementation guidance — essentially pre-chewing the reasoning
work that an implementing agent would otherwise need to do.

The prevailing assumption is that Opus-class models are required for
implementation because the reasoning demands are high: understanding
codebases, making architectural decisions, handling ambiguous
requirements. But if a spec has already resolved most of that
ambiguity — enumerating the files to touch, the decisions to make,
and the constraints to respect — the remaining work is closer to
translation than reasoning.

If this hypothesis holds, the economic implications are significant.
Sonnet-class models cost roughly 1/5th what Opus costs per token
and run faster. A pipeline that spends $15 on Opus-powered planning
to save $80 on Sonnet-powered implementation (vs. Opus-powered
implementation) would dramatically change the cost calculus for
autonomous commissions.

## Hypotheses

### H1 — Spec Detail Reduces Model Tier Requirements

Commissions with highly detailed specs (planning-pipeline output)
show no significant difference in outcome quality between
Sonnet-class and Opus-class implementing agents. The spec absorbs
the reasoning load that would otherwise require a more capable model.

Outcome quality is measured using the same signals as X013:
`outcome` (requirement satisfaction) and `code_quality_agent`
(autonomous quality scorer composite).

**If true:** The planning pipeline is not just a spec quality tool —
it is a model-tier arbitrage tool. Invest compute in planning (Opus)
to save compute in execution (Sonnet). The total cost per commission
drops substantially.

**If false:** Model capability matters independent of spec detail.
Opus-class models bring something to implementation that detailed
specs cannot substitute for — possibly: codebase navigation
intuition, error recovery, or handling the inevitable gaps between
any spec and reality.

### H2 — Complexity Moderates the Effect

The model-tier equivalence from H1 holds up to a complexity
threshold but breaks down for high-complexity commissions. At
higher complexity (Fibonacci 8+), the gap between spec and reality
widens — more edge cases, more integration surface, more judgment
calls that no spec can fully anticipate — and Sonnet's limitations
become visible.

**If true:** Sonnet is viable for the bulk of commissions (the
1–5 range that dominates the backlog) with Opus reserved for
high-complexity work. This is a dispatch-time routing decision.

**If false (no moderation):** Either Sonnet works across all
complexity tiers (stronger version of H1), or Sonnet fails even
at low complexity (H1 is false).

### H3 — Failure Mode Differs by Model Tier

When Sonnet-class models do fail on detailed specs, their failure
modes cluster differently than Opus failures. Expected pattern:
Sonnet failures concentrate in `execution_error` and `incomplete`
(ran out of capability mid-task) rather than `spec_ambiguous` or
`requirement_wrong` (misunderstood the goal).

**If true:** Sonnet failures are predictable and recoverable —
the kind of failures that retry or staged delivery can handle.
This makes Sonnet a viable default even with an expected higher
failure rate, because the failure cost is low.

**If false:** Sonnet failures are as varied as Opus failures,
suggesting the model capability gap is not about reasoning depth
but something more fundamental.

## Methodology

### Design

Crossed design: (spec detail level) × (model tier). The primary
comparison is planning-pipeline specs dispatched to both Sonnet
and Opus agents on comparable commissions.

**Option A — Paired dispatch:** Same spec dispatched to both model
tiers. Strongest design (controls for spec variation) but doubles
commission volume and requires careful isolation.

**Option B — Alternating assignment:** Commissions alternate between
model tiers. Weaker control but simpler operationally and avoids
the "which result do we ship" problem of paired dispatch.

**Option C — Phase transition:** Run a batch of commissions on
Sonnet after establishing an Opus baseline from X013 data.
Simplest but confounded by time — later commissions may benefit
from accumulated curriculum improvements, not just model choice.

Recommend starting with **Option C** (lowest operational cost,
leverages existing X013 corpus as the Opus baseline) and
escalating to **Option A** for specific high-value comparisons
if initial signal is promising.

### Data Collection

Extends the X013 commission log with one additional field:

| Field | Source | Values | Notes |
|---|---|---|---|
| `model_tier` | auto | opus / sonnet / haiku | Model class used for implementation session |

This field should be derivable from session telemetry (the model
parameter in the session manifest). Backfillable for existing
commissions.

All other fields — outcome, quality scores, complexity, spec
quality — use the existing X013 instruments unchanged.

### Controls

- **Spec quality must be held constant** (or at least measured).
  The hypothesis specifically claims that *detailed* specs enable
  Sonnet. Mountain-quality specs dispatched to Sonnet would test
  a different (and probably false) claim.
- **Complexity should be balanced** across model tiers. If all
  easy commissions go to Sonnet and hard ones to Opus, the
  comparison is meaningless.
- **Curriculum and tooling must be identical** across tiers.
  Same role instructions, same tools, same guild state.

## Depends On

### Required

- **X013 commission log** — provides the outcome tracking
  infrastructure and the Opus baseline corpus.
- **Planning pipeline** — produces the detailed specs that are
  the independent variable. Without planning-pipeline specs,
  there is nothing to test.
- **Session telemetry with model identification** — must be
  able to determine which model tier executed each commission.

### Informing

- **X014 (Technical Spec Quality)** — if X014 finds that
  detailed specs don't even help on Opus, the premise of X015
  collapses. X014 results inform whether X015 is worth running.

## Risks

- **Confounded baselines.** The X013 Opus corpus was generated
  during system bootstrap when specs, curricula, and tooling
  were all evolving. A Sonnet run on the mature system might
  outperform early Opus runs for reasons unrelated to model
  capability. Mitigation: compare only commissions with
  comparable spec quality and complexity ratings.

- **Small N per cell.** A crossed design with two model tiers
  and multiple complexity levels fragments the sample quickly.
  At current commission volumes, meaningful per-cell analysis
  requires patience.

- **Spec quality floor.** If the planning pipeline produces
  specs that are *so* detailed they work on any model, the
  experiment proves the pipeline works but says nothing about
  the model tier question. This is a good problem to have but
  doesn't answer the research question.

- **Model version drift.** "Sonnet" and "Opus" are moving
  targets. Results are bound to specific model versions. A
  finding that "Sonnet 3.5 can't handle complexity 8" may not
  hold for Sonnet 4.0.
