# Add `stuck` status to rigs and writs

Introduce `stuck` as a non-terminal status on both **rigs** and **writs**, and make engine failure cascade through rig → writ as `stuck` rather than `failed`. This creates a non-terminal "needs attention" state that preserves the obligation and the in-progress rig record, instead of collapsing the whole chain into a terminal `failed` state that forces the patron to repost the commission from scratch.

This is a deliberate, minimal down-payment on the multi-rig refactor (`w-mnsx8cz2`): putting `stuck` on the rig table — distinct from the writ's `stuck` — acknowledges that execution-state trouble belongs on the rig, not the writ. When multi-rig lands, rig-level `stuck` becomes the natural input to a computed writ-level "latest rig in trouble, no new rig taken over" signal. The concept survives; only the storage shifts.

**Retry is explicitly out of scope for this commission.** This work establishes the status values, the cascade, and the legal transitions. Building the actual retry mechanism (CLI command, standing order, patron-facing UX) is follow-up work.

## Depends on

This commission depends on the in-flight status-collapse work (`w-mnt63huy-7a45d6db2e4b`, brief: *Collapse writ statuses `ready`/`active`/`waiting` into `open`*). It should not be started until that work has landed and `open` is the live non-terminal writ status. The transition rules and migration steps in this brief assume the `open` vocabulary is already in place.

## Scope

### Writ status

Add `stuck` to the writ status vocabulary as a non-terminal status.

Legal writ transitions:

- `open → stuck` — the most recent rig (or its engine) has ended in trouble; obligation still stands.
- `stuck → open` — a recovery/retry path has taken over; rig execution has resumed under some new attempt. (Retry mechanism is out of scope; the transition must simply be legal so a future retry path can use it.)
- `stuck → failed` — obligation abandoned with lessons.
- `stuck → cancelled` — obligation withdrawn.
- `open → failed` remains legal — not every failure routes through `stuck`. Callers can still mark a writ directly `failed` when there's nothing to recover to.
- `open → cancelled` remains legal as today.

### Rig status

Add `stuck` to the rig status vocabulary as a non-terminal status.

Legal rig transitions:

- `running → stuck` — an engine in this rig has failed (or otherwise ended in an unrecoverable-for-this-rig state) and the rig itself has nowhere to go from here without intervention.
- `stuck → failed` — the rig is abandoned.
- `stuck → cancelled` — the rig is explicitly cancelled.
- No `stuck → running` transition on the rig. A stuck rig stays stuck for its lifetime; recovery happens by spawning a new rig (future multi-rig work), not by resurrecting a stuck one. This keeps the rig-as-attempt semantics clean even before multi-rig lands.

### Cascade on engine failure

When an engine in a rig fails, the Spider's current failure-handling code path must be updated:

- Instead of transitioning the rig to `failed`, transition it to `stuck`.
- Instead of transitioning the associated writ to `failed`, transition it to `stuck`.
- Engine-level handling is unchanged — the failed engine itself still transitions to `failed` as today.
- Event emission must follow the new shape: `rig.stuck`, `writ.stuck` rather than the corresponding `.failed` events.

If a rig ends in any other terminal way (all engines complete successfully, patron-initiated cancel, explicit rig-cancel), the existing transitions are unchanged. The cascade only applies to the engine-failure path.

### Transition from direct rig-cancel / writ-cancel

When a rig is already `stuck`, `nsg rig cancel` should still work and should transition the rig `stuck → cancelled`. (This generalizes the same kind of resilience added by commission `w-mnt2pfr2` for the terminal-writ case.)

Similarly, `nsg writ cancel` and `nsg writ fail` must accept `stuck` as a legal source status.

## Migration

Two parts:

1. **Data migration.** No historical rigs or writs are currently in `stuck` — this is a net-new status. The migration is purely additive: the Clerk's transition validator grows new legal edges; the rig and writ status enums grow a new value. No data rewrite needed.

2. **In-flight work at deploy.** If the daemon is restarted while a rig has a failed engine and the old cascade has already run to `failed`, that state is preserved as-is. Only *new* engine failures after restart use the `stuck` cascade. Do not retroactively rewrite old terminal states.

## Out of scope

- **Retry mechanism of any kind.** No `nsg rig retry`, no `nsg writ retry`, no standing order that auto-spawns a recovery rig, no patron-facing retry UX. This commission only adds the status values, the cascade, and the legal transitions that a future retry mechanism can build on.
- **Patron-visible alerting on `stuck`.** Oculus surfacing, notification channels, vigil/watcher integration — all follow-up work. This commission should ensure Oculus doesn't crash on the new status value (add it to whatever status categorization map already exists) but does not need to build any new UI affordances.
- **Multi-rig refactor.** Rigs remain 1:1 with writs for now. `stuck` on the rig is a single-rig concept in this commission; its role as a computed input to a future multi-rig writ signal is forward-looking design context, not implementation work.
- **Standing-order triggers on `rig.stuck` or `writ.stuck` events.** The events should be emitted cleanly so future standing orders can subscribe, but no standing orders are added in this commission.
- **"Stuck" for non-engine-failure reasons** (timeouts, hangs, zombie detection). Those are separate briefs. Only the engine-failure path cascades to `stuck` in this commission.

## Constraints

- The Clerk's transition validator must accept all the new transitions listed above, and must reject `stuck` as a target for any transition not listed (e.g., `new → stuck` is illegal; `completed → stuck` is illegal).
- `nsg writ list --status stuck` must work.
- `nsg rig list` (or equivalent) must surface the new rig status.
- Consumers that pattern-match on rig or writ status (Oculus categorization, commission-log tooling, the quests skill, the coco agent file, spider dispatch eligibility, the Laboratory's CDC observers) must be updated in the same changeset. Grep is the planning surface.
- The running daemon must pick up the change after restart; no silent half-migration.
- Rig-cancel and writ-cancel paths must accept `stuck` as a legal source.

## Parent / related quests

- **T2** — Writs as obligations, rigs as attempts (multi-rig refactor): `w-mnsx8cz2-63bdd1d4a2d3`. This commission is the "honest bridge" `stuck` signal anticipated in T2's guidance.
- **T2.1** — Writ status model simplification: `w-mnsx90p1-76dc4a15808c`. `stuck` was flagged as a post-`open` follow-up in this quest; this commission ships it.
- **Predecessor commission** — Collapse `ready`/`active`/`waiting` into `open`: `w-mnt63huy-7a45d6db2e4b` (brief, in-flight). Link: `depends-on`.