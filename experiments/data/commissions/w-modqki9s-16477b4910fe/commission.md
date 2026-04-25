**Site:** `packages/plugins/clerk/src/types.ts` declares `WritPhase` includes `'cancelled'` as a terminal state. `clerk.ts` cascades non-terminal children to `cancelled` with the resolution string `CASCADE_PARENT_TERMINATION_RESOLUTION` when their parent fails or is cancelled.

**Why this matters now:** The catalog and brief enumerate four writ-lifecycle events: ready, completed, stuck, failed. Cancellation is silent. This commission's D3 honors the brief and emits nothing for cancelled, but cascade-cancelled children are common (every failed/cancelled parent produces them) and operators wiring `mandate.failed` standing orders would lose visibility into which children got auto-cancelled.

**Resolution options for a follow-up commission:**
  - Add `{type}.cancelled` to the catalog and emit on cascade-cancellation. Standing orders can then audit the cascade.
  - Document that cancelled is intentionally silent; cascade-cancelled children are recoverable from the parent's resolution string and the writ's own resolution field.
  - Reuse `{type}.failed` for cancellation (semantically misleading; rejected here).

The right answer depends on whether operators actually need standing-order visibility into cascade cancellation.