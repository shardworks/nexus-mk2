# Reckoner dependency-aware consideration

## Intent

Extend the Reckoner's per-petition evaluator so that it reads outbound `depends-on` links during consideration and defers any petition whose direct dependency targets haven't all reached terminal-success. Deferred petitions stay in the writ's `new` phase and don't count against WIP. Dependent petitions naturally release in topological order as their dependencies clear, without ever holding WIP slots while waiting.

## Motivation

The Reckoner accepts petitions by transitioning the underlying writ from `new` to its writ-type's active phase (e.g. `open` for mandates), at which point the writ counts against the WIP cap. Without dependency awareness at the petition layer, the Reckoner can accept a batch of dependent writs whose dependencies are still pending petitions, fill the WIP cap with gated writs sitting in `open`, and starve the dependencies of acceptance capacity — a classic WIP-cap deadlock.

Spider's existing dispatch-time gating on `depends-on` doesn't help here: Spider only fires after acceptance, so by the time it sees the dependency-blocked writs they're already counted against WIP. The fix has to live at the consideration layer.

This commission resolves Concern 3 from c-moivk7pd (Option A, "Reckoner-aware dependencies"). The shape was selected over three alternatives: topological priority bonuses (only shifts probability, doesn't eliminate the deadlock), Spider-flagging-back-to-Reckoner (cross-layer coordination, rejected by c-mof657j4), and decline-and-re-emit (pushes bookkeeping onto petitioners, hostile to recursive vision-keeper cascades).

## Non-negotiable decisions

### The Reckoner reads `depends-on` links during consideration

Each petition's evaluation pass loads outbound links of `kind = 'depends-on'` from the Clerk's link store. The kind is namespace-free (Clerk-contributed) per the rename commission this work depends on. No reading of `spider.follows` — that name is gone by the time this lands.

Source: c-moiwnmoc, c-moiwnzw6.

### Three target classifications, read from writ-type config

For each `depends-on` target, the evaluator resolves the target writ's current phase and classifies it via the writ-type config — not via hardcoded phase names. A phase is:

- **cleared** — `terminal: true` AND `success: true` in the writ-type-config classification. The dependency completed successfully.
- **failed** — `terminal: true` AND `success: false`. The dependency reached a terminal phase that wasn't success.
- **gating** — anything else (still in an active or initial classification).

This generalizes across writ types without hardcoding phase names per type. It is consistent with how the existing `resolveActiveTargetPhase` helper reads the same writ-type config for active-phase resolution (per c-moivk7pd's Concern 1 resolution).

For v0, `cancelled` is treated as a terminal-success classification (mirroring Spider's existing released set). Cancelling a dependency is intentional, and there's no semantic reason for a dependent petition to be poisoned by it.

Source: c-moiwnmoc Q2.

### Aggregation: failed-state takes precedence

Across the full set of a petition's `depends-on` targets, the evaluator aggregates with failed-state precedence:

- **Any target failed** → defer with `defer_reason = 'dependency_failed'`, regardless of whether other targets are still gating. The failed signal must surface immediately so the petitioner can react; gating targets that may still resolve favorably don't mask a failure that's already certain.
- **Otherwise, any target gating** → defer with `defer_reason = 'dependency_pending'`.
- **All cleared** → petition is eligible for the rest of the acceptance evaluation (capacity check, priority comparison, etc.).

Source: c-moiwnmoc Q2.

### No auto-decline on failed dependencies

Even when a dependency is terminally failed, the Reckoner does not decline the dependent petition. The petition stays deferred (not declined). The dependent writ stays in `new` (recoverable). The petitioner — informed via the Reckonings log entry and, eventually, the staleness diagnostic — chooses how to react: re-petition after fixing dependencies (swap the failed dep for a substitute, retry the dep, remove the link), withdraw the petition, or leave it for operator inspection.

Auto-declining was rejected because `declined` is terminal in the petition lifecycle (per c-modaqnpt) and would force re-creation rather than re-petition. The dependent's intent is preserved; only its scheduling is paused.

Source: c-moiwnmoc Q2.

### Dangling references defer (mirror Spider)

If a `depends-on` target writ doesn't resolve in the link store, treat it as gating and defer with `defer_reason = 'dependency_pending'` — matching Spider's existing behavior. Out-of-order authoring (creating a dependent before its dependency, especially within multi-writ Stacks transactions) and follower-consistency lag are both transient conditions; neither should bake failure semantics into the petition.

Source: c-moiwnmoc Q3.

### Polling-tick wake-up only

Deferred petitions wake up on the next Reckoner tick. No event-driven triggers, no CDC subscription on writ-completion events, no use of `defer_signal`. Dependency wake-up is just another defer reason that gets re-evaluated each tick — same path as `defer_until` time-based holds.

This matches the v0 polling-only scheduling decision (c-mod9a54n). Worst-case latency between a dependency clearing and a dependent being accepted is one tick (60s default). `defer_signal` remains reserved for a future event-based wake-up but is not wired here.

Source: c-mod9a54n, c-moiwnmoc Q1.

### No explicit cycle detection in the consideration loop

The Reckoner does not detect cycles in the `depends-on` graph. The deferral mechanism handles cycles implicitly: every member of a cycle has a non-terminal dep, every member stays deferred, and the WIP cap is preserved. Spider continues to fail-loud on cycles post-accept as defense-in-depth, but if the Reckoner is doing its job a cycle never reaches accept anyway.

Pathologies that fall out of this — cycles, persistently dangling references, `dependency_failed` petitions awaiting petitioner action — are surfaced by the deferred-petition staleness diagnostic, designed under a separate sibling click (c-moixpj1l) and not in scope here.

Source: c-moiwnmoc Q4.

### `defer_reason` enum extension

Add two values to the `defer_reason` enum defined in c-modaqnpt:

- `dependency_pending` — at least one target is still gating; petition will re-evaluate next tick.
- `dependency_failed` — at least one target reached a terminal-non-success phase; petition is deferred awaiting petitioner action. Takes precedence over `dependency_pending` when both conditions hold.

No other changes to the petition shape — `defer_until`, `defer_signal`, `defer_count`, `first_deferred_at`, `last_deferred_at`, `defer_note` all remain as defined in c-modaqnpt.

Source: c-modaqnpt, c-moiwnmoc.

## Behavioral cases that must hold

- **All deps cleared** — petition proceeds to the rest of the acceptance evaluation; not deferred for dependency reasons.
- **One dep gating, others cleared** — petition deferred with `dependency_pending`.
- **One dep failed, others cleared** — petition deferred with `dependency_failed`.
- **Mix of failed and gating** — petition deferred with `dependency_failed` (failed wins).
- **Dangling target reference** — treated as gating; petition deferred with `dependency_pending`.
- **No `depends-on` links at all** — petition skips the dependency check entirely; not deferred for dependency reasons.
- **2-cycle (A `depends-on` B, B `depends-on` A)** — both petitions stay deferred indefinitely; neither is accepted; WIP cap is unaffected.
- **Dependency clears between ticks** — petition is accepted on the very next tick after its last gating dep reaches a terminal-success phase.
- **Cancelled dependency** — treated as cleared (success classification in v0).
- **Reckonings log row** — every consideration outcome (accept, defer, decline) emits a row, including the new `dependency_pending` / `dependency_failed` defer paths.

## Out of scope

- **Deferred-petition staleness diagnostic.** The mechanism that surfaces petitions stuck in `deferred` (cycle detection, dangling-target escalation, `dependency_failed` notification). Tracked under sibling click c-moixpj1l; will be commissioned separately.
- **Event-driven wake-up via `defer_signal`.** Reserved for a future iteration once polling latency is shown to be a real shortcoming. Don't wire CDC subscriptions or completion-event handlers here.
- **Petition decline mechanism design.** The `declined` terminal state is defined in c-modaqnpt; this commission does not invoke it for any of the new defer paths.
- **Spider-side gating changes.** Spider's existing dispatch-time gating on `depends-on` continues unchanged. This commission lives entirely at the Reckoner consideration layer.
- **Multi-hop dependency reasoning.** Only direct outbound `depends-on` targets are evaluated. Transitive dependency analysis is out of scope.

## References

- c-moiwnmoc — design click for this commission.
- c-moivk7pd — parent click; this commission resolves its Concern 3.
- c-mod9a54n — polling-only scheduling decision (v0 Reckoner trigger model).
- c-modaqnpt — deferred-petition metadata shape; this commission extends its `defer_reason` enum.
- c-moiw5wkv — Reckoner tick relay; the dependency evaluator hooks into the per-petition evaluation invoked by the tick.
- c-mod99ris — Reckoner umbrella click.
- c-mof657j4 — no-cross-layer-coordination principle (rationale for rejecting Spider-flag-back design alternative).
- c-moixpj1l — deferred-petition staleness diagnostic (out-of-scope follow-up).

## Dependencies

This commission has a `depends-on` link to the rename writ that introduces `depends-on` as a Clerk-contributed link kind and migrates all existing `spider.follows` references. Implementation here assumes that work has shipped — the Reckoner reads `kind = 'depends-on'` from day one and never reads `spider.follows`.