**Where:** `packages/plugins/reckoner/src/reckoner.ts:1015-1018`.

**What:** `runScheduler()` currently swallows scheduler-emitted `outcome: 'defer'` decisions silently:

```typescript
if (decision.outcome === 'defer') {
  // No transition, no row. v0 defer means absence-of-row signal.
  return;
}
```

**Why this matters:** The architecture doc (`docs/architecture/reckonings-book.md` §"Defer reasons" and §"No-op Handling") describes deferred rows as load-bearing for downstream consumers (the future staleness diagnostic, per-vision-relation timeline queries, deferCount running counters). Once this commission's `dependency_pending` / `dependency_failed` paths start emitting deferred rows, the scheduler-emitted defer path becomes the ONLY scheduler-driven decision that doesn't write a row — a quiet asymmetry between 'Reckoner-internal defers (audit-row-emitting)' and 'scheduler-emitted defers (silent)'. A future scheduler that wants to communicate `defer_reason: 'priority'` or `'queue_depth'` (both already declared in `ReckoningDeferReason`) will discover its decisions vanish without a trace.

**Why not fix in this commission:** The brief is scoped to the dependency-aware path. Extending scheduler-emitted defers to write rows requires wiring the `SchedulerDecision` shape to carry a `deferReason` discriminator (it doesn't today), which is a separate consumer-facing change that touches the always-approve scheduler's contract.

**Suggested follow-up:** Add a `deferReason?: ReckoningDeferReason` field to `SchedulerDecision`; when set on a `defer` outcome, the apparatus writes a deferred Reckonings row using the supplied reason. Default the field to `'other'` to preserve current behaviour for existing callers. The always-approve scheduler is not affected (it never emits defer).