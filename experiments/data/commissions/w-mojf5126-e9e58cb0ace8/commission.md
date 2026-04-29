After the staleness diagnostic ships, the running deferral counters (`deferCount`, `firstDeferredAt`, `lastDeferredAt`) live on `writ.status['reckoner']` rather than on the journal row. Their same-named optional fields on `ReckoningDoc` (declared in `packages/plugins/reckoner/src/types.ts:354–359`) and described in `docs/architecture/reckonings-book.md` (lines 252–266 and 474–516) become dead schema with no writer.

Follow-up commission should:

- Remove `deferCount?`, `firstDeferredAt?`, and `lastDeferredAt?` from the `ReckoningDoc` interface in `types.ts`.
- Update `docs/architecture/reckonings-book.md` to drop the row-side counter description (any remaining references after the staleness commission's inline doc updates) and reflect the snapshot location as the single source of truth.
- Audit consumers typing against `ReckoningDoc` for any reads of those fields (none expected today — the dependency-aware-consideration commission left them unwired, and `runDependencyGate` does not read them — but verify before deletion).
- Decide separately on the wake-up companions `deferUntil?` and `deferSignal?`: those are documented as reserved-for-future event-driven wake-up (per `apparatus/reckoner.md` and `reckonings-book.md`) and should likely stay as forward-compat reservations until a real wake-up mechanism earns them.

This is a follow-up because the row-schema change widens the blast radius of the staleness diagnostic itself — it touches every `ReckoningDoc` consumer (schema doc, indexes commentary, historical-archive narrative) and is independent of whether the snapshot mechanism works correctly. Deferring keeps the staleness commission focused on snapshot delivery and gives the curator a clean handle to schedule the cleanup once the new diagnostic has bedded in.

Decision lineage: see plan decision **D20** (`lift-followup` selected over `remove-now` and `leave-reserved`).