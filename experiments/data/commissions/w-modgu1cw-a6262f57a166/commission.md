Lifted from the planning run of "Clockworks apparatus skeleton" (w-modf5t4q-7f67314f3d15). Each numbered observation below is a draft mandate ready for curator promotion.

1. Correct architecture docs that use stale `nexus-clockworks` plugin id
2. Update index.md to remove 'not yet extracted' language for Clockworks
3. Reconcile event catalog (event-catalog.md) against clockworks.md event list
4. Declared-but-unused `clockPidPath` / `clockLogPath` helpers in nexus-core
5. `EventDeclaration.schema` is documented but unenforced
6. `StandingOrder` discriminated union misses the `run: ... + params` canonical form
7. The `nsg clock` namespace auto-grouping has no namespace-level help text
8. Arbor never calls `apparatus.stop()` — the lifecycle hook is declared but ignored
9. Book owner id convention is informal and un-enforced
