**One notable design gap (spec-level, not implementation-level):**

The plan status never transitions from `'reading'` to `'analyzing'` in the pipeline. `plan-init` creates the plan at `'reading'`, `inventory-check` validates inventory and returns without a status update, and the analyst anima-session writes scope/decisions without changing status (R17 prohibits tools from doing so). When `decision-review` runs it checks `plan.status === 'analyzing'` and throws `"unexpected plan status 'reading'"` for anything else.

This gap exists in the **spec** (R14 describes `inventory-check` as "validates…and completes" with no status transition), not in the implementation. The tests mask it by manually setting plans to `status: 'analyzing'`. The real pipeline would fail at the decision-review step.

The natural fix is to have `inventory-check` transition status to `'analyzing'` after successful validation — this is semantically correct (reading phase is confirmed done) and consistent with how the other engines own their status transitions. This should be raised as a follow-up item or corrected in Part 2.

No other logic errors were found. Error messages match the spec's phrasing (`"no codex"`, `"already exists"`, `"no inventory"`). The `composeDetails` function handles all four context/rationale combinations correctly. `decisionSummary` markdown format matches the spec's template.