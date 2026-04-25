The `event_dispatches` schema includes `noticeType: 'summon' | null`, documented as 'historical; present on summon relay dispatches' (`packages/plugins/clockworks/src/types.ts:148`). With this commission's canonical-only shape, summon becomes a regular relay invocation — the dispatcher writes `noticeType: null` for every relay row uniformly.

The column may pick up a real value if task 5's summon relay decides to set `noticeType: 'summon'` from inside its handler (it can patch its own dispatch row, or the dispatcher could special-case the summon-relay name — unlikely given the brief's emphasis on no special-casing). Otherwise the column is dead schema surface.

Follow-up after task 5 ships: revisit whether to remove the column (schema migration), or repurpose it. Not actionable today; this commission honors the existing schema and writes `noticeType: null` for all rows. Affected files:
- `packages/plugins/clockworks/src/types.ts` (EventDispatchDoc.noticeType field + docs)
- `packages/plugins/clockworks/src/clockworks.ts` (book schema declaration — no current change)