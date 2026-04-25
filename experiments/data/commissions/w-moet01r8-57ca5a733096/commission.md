`docs/reference/schema.md` lines 188–216 describe the `events` and `event_dispatches` tables with stale id prefixes (`evt-`, `ed-`) and column shapes that don't match the shipped types in `packages/plugins/clockworks/src/types.ts:117-198`:

- Id prefix is `e-<base36_ts>-<hex>` (not `evt-`) and `d-<base36_ts>-<hex>` (not `ed-`). See `EventDoc.id` JSDoc.
- `event_dispatches.handler_type` is `'relay' | 'anima'` in shipped code, while the schema doc says `'engine' or 'anima'`. The doc reflects an even older design where 'engine' was the term.
- `event_dispatches.status` is `'pending' | 'success' | 'error' | 'skipped'` in shipped code; the doc lists only `'success' or 'error'`.
- The 'ID Conventions' table at lines 363–375 lists `evt-` and `ed-` as the canonical prefixes; should be `e-` and `d-`.
- Generated id format note at line 376 ('8 hex characters = 4 random bytes') is wrong for these books — `generateId` for the new `e-`/`d-` schema uses base36-timestamped suffixes, not the random-only prefix-hex format used elsewhere.

Fix: walk the events / event_dispatches columns in schema.md and align against `EventDoc`/`EventDispatchDoc` field-by-field. Update the ID Conventions table to use the new prefix scheme for these entities. Either add a note that the persistence layer is owned by Stacks (not raw SQLite) or remove the SQL DDL framing.