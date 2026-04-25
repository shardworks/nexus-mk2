With this commission, two apparatus — Stacks (schema reconciliation) and Clockworks (CDC auto-wiring) — perform the same enumeration: walk `ctx.kits('books')` with a `typeof value !== 'object'` guard. A third apparatus that needs the same walk (hypothetically: a books-introspection tool, or the review-loop indexing pass) would be the third copy.

Optionally extract the enumeration into a helper in `@shardworks/nexus-core` or `@shardworks/stacks-apparatus`, e.g. `iterateBookContributions(ctx): Iterable<{ ownerId, bookName, schema }>`. Would centralize the malformed-entry policy and make it easy to add behaviors (e.g. 'skip clockworks-owned books' as a filter option).

Not required for this commission; noting so future refactoring can consolidate. Tracked alongside the 'plugin id ownership' observation `w-modgu1tv` which suggests a similar consolidation around ownerId.

Files:
- `packages/plugins/stacks/src/stacks.ts:68-77` (reconcileSchemas)
- `packages/plugins/clockworks/src/clockworks.ts:128-140` (new auto-wiring loop)
- Potentially `packages/framework/core/src/plugin.ts` (helper)