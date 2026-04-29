# Deferred-petition staleness diagnostic

## Intent

When the Reckoner defers a petition for a structural reason that won't self-clear without external action, the petition is **stalled**. This design specifies how staleness is detected, where it surfaces, and what the system does about it.

The motivating case: a `dependency_failed` deferral. The dependent writ has reached terminal-failure; the petition's writ is held in `new` indefinitely (recoverable) until the failed dep is recovered or the petition is withdrawn. Without a stalled signal, these accumulate invisibly.

## Scope (v0)

**In scope.** Detect petitions deferred for `dependency_failed`; expose the stalled condition as derived metadata in `writ.status['reckoner']`; CDC-listener-driven update of that snapshot off the Reckonings book.

**Out of scope.** Active intervention (auto-decline, priority nudging); operator-configurable thresholds; named Clockworks events for petition transitions; cycle detection in the Reckoner's hot path; staleness flagging for `dependency_pending`, `queue_depth` (a.k.a. `wip_cap`), `priority`, `time_hold`, `patron_policy`, or `other` defer reasons.

## Decisions

### 1. Surface — `writ.status['reckoner']` snapshot, derived via CDC handler

A live snapshot of the Reckoner's consideration state lives on the writ at `status['reckoner']`, written via Clerk's sanctioned `setWritStatus(writId, 'reckoner', value)` helper (transactional read-modify-write, sibling sub-slots preserved).

The Reckonings journal stays unchanged — it remains the authoritative decision history. Staleness is **derived** from the journal, not embedded in journal rows. A future Sentinel apparatus can subscribe to the same channel without modifying the journal contract.

#### Snapshot shape

```typescript
interface ReckonerStatus {
  /** Most recent decision the Reckoner made about this writ. */
  decision: 'accepted' | 'deferred' | 'declined' | 'no-op';

  /** Populated iff decision === 'deferred'. */
  deferReason?: ReckoningDeferReason;

  /** Running counters across all deferrals on this writ. */
  deferCount?: number;
  firstDeferredAt?: string;  // ISO timestamp
  lastDeferredAt?: string;   // ISO timestamp

  /** Stalled flag — true iff threshold rule for the current deferReason fires. */
  stalled?: boolean;
  stalledReason?: 'dependency_failed';  // expandable; v0 only this
  stalledSince?: string;                 // ISO timestamp; first tick stalled

  /** Bookkeeping. */
  lastEvaluatedAt: string;  // ISO timestamp; matches the journal row's consideredAt
}
```

The block is rewritten in full on every relevant CDC event (the Reckoner handler is its only writer, so wholesale replacement is safe).

### 2. Thresholds — hardcoded per-defer-reason; v0 flags only `dependency_failed`

| `deferReason` | Stalled threshold | Rationale |
|---|---|---|
| `dependency_failed` | 1 tick (immediate) | Dep won't recover without external action; no point waiting |
| `dependency_pending` | not flagged | Real dependencies can take days; staleness here is normal, not pathological |
| `queue_depth` | not flagged | Petition is being considered, just losing capacity contention; not stalled |
| `priority` | not flagged | Same logic as queue_depth |
| `time_hold` | not flagged | Petition is intentionally waiting on wall-clock; not stalled |
| `patron_policy` | not flagged | Operator-set hold; not pathological |
| `other` | not flagged | Unknown; conservative non-flagging |

Threshold metric is `defer_count`. ISO-timestamped fields (`first_deferred_at`, `last_deferred_at`) live in the snapshot for query/display, but the gate is the count.

Configurability is parked. If a real operator need surfaces, the same path the cadence-config click (c-moixb74x) walks applies here.

### 3. Action — pure observation

No auto-decline. No priority nudging. No state mutation on the petition or writ beyond the snapshot block.

The parent click already chose to keep `dependency_failed` petitions recoverable (writ stays in `new`); active intervention here would conflict with that. Staleness surfaces the problem; the operator (or, eventually, vision-keeper) decides what to do.

### 4. Ownership — Reckoner kit ships a CDC handler

The detection logic lives in a Reckoner-kit-contributed CDC handler subscribed to `book.reckoner.reckonings.created`. Critical path of the tick — score, transition, append journal row — stays narrow. Snapshot maintenance is cross-cutting, handled outside the critical loop.

#### Handler flow

```
on book.reckoner.reckonings.created:
  let row = event.entry as ReckoningDoc
  let writ = await clerk.getWrit(row.writId)
  let prior = writ.status?.reckoner as ReckonerStatus | undefined

  let next = computeNextStatus(prior, row)   // pure function

  await clerk.setWritStatus(row.writId, 'reckoner', next)
```

`computeNextStatus(prior, row)` is a pure function:

- Carries `firstDeferredAt` forward from `prior` (preserves first-seen-as-deferred timestamp across deferrals).
- Computes `stalled` per the threshold table.
- Sets `stalledSince` to `row.consideredAt` on the false → true transition; preserves it across continued-stalled rows; clears it (and `stalled`) on transition to a non-stalled state.
- Wholesale-replaces the snapshot.

The handler runs uniformly on every Reckonings row regardless of `outcome` — including `'no-op'` rows. The pure function handles the `no-op` case naturally: `deferCount` doesn't advance on `no-op`, so `stalled` doesn't recompute, but `lastEvaluatedAt` bumps forward to reflect that the Reckoner did look at the petition. No special-casing in the handler.

### 5. Lifecycle interaction — pure metadata

Staleness does not change petition state, writ phase, or journal contents. It is observation only.

A petition can transition out of stalled via:

- **Acceptance** — dep cleared, `deferReason` no longer applies. Snapshot updates with `decision: 'accepted'`, no stalled flag.
- **Decline / withdrawal** — petitioner gives up. Snapshot updates with `decision: 'declined'`.
- **Reason change** — failed dep recovered, deferReason flips from `dependency_failed` to `dependency_pending` (no longer stalled). Snapshot updates; `stalledSince` cleared.

No explicit `petition.fresh` event needed — consumers wanting "no longer stalled" derive it from the snapshot transition.

## Implementation surface

### What ships

This commission introduces the Reckoner-side observation pipeline: a `ReckonerStatus` type, a CDC handler subscribed to `book.reckoner.reckonings.created`, and the `computeNextStatus` pure function the handler uses to derive the snapshot. Defer-row emission and the `dependency_failed` / `dependency_pending` defer reasons are introduced by the in-flight dependency-aware-consideration commission and are out of scope here.

### Sequencing

This commission **depends on** the dependency-aware-consideration commission landing — without defer-row emission, there's nothing for the staleness handler to react to. Wire a `depends-on` link from this writ to that one.

### Behavioral cases the design depends on

- A `dependency_failed` defer row produces a snapshot with `decision: 'deferred'`, `deferReason: 'dependency_failed'`, `stalled: true`, `stalledSince` = the row's `consideredAt`.
- A second `dependency_failed` defer row on the same writ preserves the original `stalledSince` (does not advance it on continued staleness).
- A `dependency_pending` defer row produces a snapshot with `stalled: false` even when the prior snapshot had `stalled: true` — the false→stalled and stalled→false transitions both update the flag, and the latter clears `stalledSince`.
- A `'no-op'` row updates `lastEvaluatedAt` but does not advance `deferCount` or change `stalled`. The handler does not special-case `no-op`; the pure function handles it uniformly.
- An `accepted` row produces a snapshot with `decision: 'accepted'`, `stalled: false`, `stalledSince` cleared.
- Two CDC events arriving close together produce a coherent snapshot — Clerk's `setWritStatus` is transactional read-modify-write, and the handler writes the full snapshot per event.
- A petitioner-initiated withdrawal (direct `clerk.transition` to `cancelled`, bypassing the Reckoner) produces no Reckonings row, so the snapshot lags. Consumers cross-check `writ.phase` before trusting the snapshot — same convention as for any apparatus-owned status block. The Reckoner apparatus doc names this expectation.

## Open questions for follow-up commissions

1. **Initial snapshot population.** When a writ is first considered, is the prior snapshot guaranteed absent, or do we need to handle stale snapshots from a prior session? Probably the former (apparatus restart preserves writs but Reckonings reset is unusual), but worth a defensive check in the implementer's hands.
2. **Should the snapshot persist past terminal phases?** Clerk's `status` slot survives terminal phase transitions per design. For a completed writ, `status['reckoner']` becomes a historical record of how the Reckoner saw it. That's fine; flagging only.
3. **Snapshot lag on petitioner-initiated withdrawal.** When a petitioner withdraws via direct `clerk.transition(writId, 'cancelled', …)`, no Reckonings row is written (per the journal contract — withdrawal bypasses the Reckoner). The snapshot will lag with `decision: 'deferred'` even though the writ has moved to `cancelled`. Acceptable for v0 — consumers cross-check `writ.phase` before trusting the snapshot, same as for any apparatus-owned status block. Documenting the cross-check expectation in the apparatus doc is part of this commission's scope.
4. **Future named events.** Tracked separately under sibling click **c-moj6mjep** (named Clockworks events for petition transitions). Out of scope here.

## Vocabulary

- **stalled** — a petition deferred for a reason that won't self-resolve (v0: `dependency_failed`). Replaces "stale" / "stuck" — neither fit (`stale` implies neglect-by-time; `stuck` collides with the writ-phase `stuck`). Carries the same connotation as `stuck` ("blocked, won't move without intervention") without the writ-phase collision.
- **`status['reckoner']`** — the Reckoner-owned observation slot on the writ. Live snapshot; rewritten on every relevant CDC event by the Reckoner kit's handler.
- **stalledSince** — ISO timestamp marking the moment the snapshot first transitioned `stalled: false → true`. Cleared on the inverse transition.

## References

- Source click: **c-moixpj1l** (deferred-petition staleness diagnostic).
- Parent click: **c-moiwnmoc** (Reckoner dependency-aware consideration — concluded; introduces the defer-row emission and `dependency_failed` / `dependency_pending` reasons this commission consumes).
- Sibling click for future named events: **c-moj6mjep**.
- Reckonings book design: `docs/architecture/reckonings-book.md` (Reckoner journal contract).
- Reckoner apparatus contract: `docs/architecture/apparatus/reckoner.md`.