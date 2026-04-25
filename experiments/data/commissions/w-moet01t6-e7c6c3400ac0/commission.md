`packages/plugins/clockworks/src/writ-lifecycle-observer.ts:225-228` intentionally emits both `commission.sealed` AND `commission.completed` on every root-mandate completion. The observer's own comment notes: 'Documenting the sealed/completed duplicate is a follow-up observation; this commission ships both as the catalog enumerates them.'

The parent commission documents the duplicate (decision D3 in this plan). This observation tracks the actual cleanup: collapse to one canonical name. The commission needs to:
- Pick the canonical (`commission.sealed` is recommended — aligns with `commission.posted` / `commission.failed` past-tense framing and the standing-order examples in `docs/architecture/clockworks.md`).
- Update the writ-lifecycle-observer to emit only the chosen one.
- Update the canonical event catalog and any standing-order examples that reference the dropped name.
- Audit `guild.json` files in test fixtures and any in-codex docs that wire orders to the dropped name.

The observer's own writ (`w-modf5t4q-7f67314f3d15`) and its associated commission decisions (D5 on the parent observation set) record the motivation. Cleanup is small but cross-cutting — worth its own commission.