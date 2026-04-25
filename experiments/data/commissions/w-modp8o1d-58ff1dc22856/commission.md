This commission's dispatcher exposes a single drain operation: `ClockworksApi.processEvents()` which sweeps all pending events. Task 6's brief explicitly requires a per-event-id surface: `nsg clock tick [id]` processes one specific event.

The per-id surface is task 6's design responsibility (per decision D1), but it implies the dispatcher will need a second method or an option parameter when task 6 lands. Likely shape: `ClockworksApi.processEvent(eventId): Promise<DispatchSummary>` as a peer method, or `processEvents({ eventId? })` taking a single-id filter.

This commission's `processEvents()` is the natural primitive that the per-id variant will compose on (or factor out from). Task 6 should not need to rewrite the dispatcher core — just expose a more granular entry point.

Follow-up: task 6 author should consider extracting the per-event work into a private helper (e.g. `dispatchOne(event, orders, ...)`) inside `dispatcher.ts` if not already done, so the per-id wrapper is straightforward. Affected files (future):
- `packages/plugins/clockworks/src/dispatcher.ts` (refactor surface for task 6)
- `packages/plugins/clockworks/src/types.ts` (ClockworksApi extension)