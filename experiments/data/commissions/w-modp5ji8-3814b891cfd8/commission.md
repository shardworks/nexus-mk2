The Clockworks auto-wiring is the first framework-level feature that writes back to a book from inside a Phase-2 handler (`emit()` → `events.put()`). Stacks' per-transaction cascade-depth guard (`packages/plugins/stacks/src/stacks-core.ts:39` `MAX_CASCADE_DEPTH = 16`) only covers cascades within a single transaction. A Phase-2 handler opens a fresh transaction when it writes, bypassing the depth counter entirely. This means a Phase-2 handler that writes to a book watched by another Phase-2 handler (or by itself) will loop unboundedly.

This commission dodges the immediate hazard by D3's carve-out on `clockworks/events`, but the general hazard remains: future apparatus that register Phase-2 cascades can still create loops. A proper fix is either:

1. A cross-transaction cascade counter in Stacks (scoped by `AsyncLocalStorage` or similar) that tracks Phase-2 re-entrance depth and throws after N.
2. A structural ban: Phase-2 handlers must not write to watched books (documented in the Stacks spec). Currently undocumented.
3. A lint-time or test-harness check (conformance tier) that detects Phase-2 re-entrance and fails.

Files:
- `packages/plugins/stacks/src/stacks-core.ts` — `runTransaction()` / `doPut()` / `doPatch()` / `doDelete()` all open new transactions on re-entry.
- `packages/plugins/stacks/docs/specification.md` §6.3 — Phase-2 semantics section.

Not blocking this commission, but the observation stacks behind the first real framework-level Phase-2 writer shipping. Worth elevating before the daemon (task 10) lands additional Phase-2 writers.