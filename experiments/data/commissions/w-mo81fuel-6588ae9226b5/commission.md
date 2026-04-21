# Author the patron decision-fill engine's operational prompt

## Intent

The decision-fill engine — the patron-layer step inside the Astrolabe plan-and-ship rig, commissioned as w-mo4bke5x-0a1d273bbb19 — currently runs with a default system prompt. It has no framing for how to select among plan decisions, how to calibrate confidence, when to abstain, or what work is out of its lane.

This commission authors the engine's tailored operational prompt. The prompt wraps the role file (already injected via the `vars.astrolabe.patronRole` template variable established by the prior commission) with mode-specific discipline that tells the engine how to *act*, not what to *believe*.

## Motivation

Two kinds of content live in different places for the patron engines:

- The **role file** (taste — a principle bank) is injected as `patronRole` and is shared across engines.
- The **engine prompt** (mode-specific discipline — how to answer, when to abstain, how to calibrate confidence, what stays out of lane) is per-engine.

The split is deliberate: a second engine (Distiller-interview) reuses the same role file with opposite-signed discipline. Taste is shared; mode differs per job.

Today every plan passing through the Astrolabe runs this engine on an untailored default — an ongoing quality gap on a load-bearing decision surface.

## Non-negotiable decisions

### 1. Exactly one option per open PlanDecision

The engine visits each **open** PlanDecision (see 5) and records one option selection in the per-decision patron section (alongside the existing `recommendation` and `rationale` fields). No multi-select, no hedged "maybe this," no refusal beyond graceful abstain (see 2).

### 2. Abstain is a graceful low-confidence pass-through

When no role-file principle speaks to a decision, the engine records a low-confidence selection (or an explicit abstain marker, per the existing schema) and moves on. Unfilled or low-confidence decisions fall through to the downstream decision-review engine; the decision-fill engine never blocks, errors, or retries on a decision it can't confidently answer.

### 3. Confidence calibration is principle-structural, not content-aware

Confidence is derived from the structure of principle firing, not from content judgment:

- **High** — exactly one principle fires and its recommendation is unambiguous.
- **Medium** — multiple principles fire with conflicting recommendations. The engine picks one, records the conflict in its reasoning, and marks medium.
- **Low** — no principle speaks; the engine abstains (see 2).

No content-aware confidence ("this feels tricky" / "the domain is unfamiliar"). Structural only. Rationale: confidence is consumed downstream as a routing signal for decision-review; keeping it structural makes the signal legible and auditable.

### 4. Single-pass, no retries

The engine runs once per plan, processes each open decision once, and emits. No revisiting, no refinement loop, no retry on low confidence. Retry semantics live upstream (retry primitives) and downstream (decision-review).

### 5. Do not re-decide pre-empted decisions

The planner has already marked each decision as `pre-empted` (planner-filled, no patron input needed) or `open` (awaiting patron). The engine processes *only* open decisions. Pre-empted decisions are left untouched; the engine does not re-evaluate the planner's call.

### 6. Do not audit the plan against the codebase

The engine is a principle-applier, not a plan-auditor. It does not open files, check implementation feasibility, or second-guess the planner's technical framing. Those concerns belong elsewhere (interactive review, dedicated audit engines). The engine's world is: role file + decisions + options.

### 7. The engine's output shape stays contract-stable

The per-decision patron section already has a shape established by w-mo4bke5x. This commission changes *what the engine writes* (better selections, better reasoning, calibrated confidence), not *the shape of the record*. Downstream consumers (decision-review, Oculus display, observability surfaces) should see no contract break.

## Out of scope

- **The Distiller-interview engine prompt.** Opposite-signed mode discipline (commit-to-confidence-or-fail, not abstain-gracefully). Tracked separately; separate commission.
- **The role file itself.** Landed and validated; injected via `vars.astrolabe.patronRole`. Do not modify as part of this work.
- **Retry and re-dispatch mechanics.** Single-pass for MVP. Per-decision sessions and bounded retries are tracked as post-MVP work.
- **Plan auditing behavior.** Out by design decision 6.
- **Planner contract changes.** The planner's pre-empted/open marking is the input contract; do not alter planner behavior to accommodate the engine.
- **Role-file discovery or distribution mechanics.** The `vars.astrolabe.patronRole` template-variable pipeline is already in place; reuse, don't redesign.

## References

- c-mo5s5g4w — design click for this commission; mode-discipline enumeration.
- c-mo81527r — ongoing patron-agent refinement umbrella (parent of future bank-revision work).
- c-mo4blbm3 — role-file authoring (concluded; role file landed and validated).
- c-mo56iaza — principle-refinement interview (concluded; principles marked 'good enough for now').