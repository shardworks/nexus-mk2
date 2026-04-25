The monorepo has three sources that imply different verb tense for book-CDC-derived event names:

- `docs/architecture/clockworks.md:77,95` — past tense (`book.<owner>.<book>.created/updated/deleted`) in prose; present-tense `${event.type}` in the code sketch at line 86.
- `packages/plugins/stacks/docs/specification.md:478` — past tense (`book.nexus-ledger.writs.updated`).
- `packages/plugins/stacks/src/types.ts:110-131` — CDC `type` field is literally `'create' | 'update' | 'delete'` (present tense) at the API level.
- `docs/reference/event-catalog.md` (if it exists) likely does not list `book.*` events at all.

Once this commission ships and pins the tense (see D2 — recommend past tense), a single-pass doc update across all three sources keeps them consistent. Include the operator-facing plugin id fix (`nexus-ledger` → `clerk`) from obs `w-modgu1ew` at the same time if that observation hasn't already closed.

Files:
- `docs/architecture/clockworks.md`
- `packages/plugins/stacks/docs/specification.md`
- `docs/reference/event-catalog.md` (add `book.*` section if missing)