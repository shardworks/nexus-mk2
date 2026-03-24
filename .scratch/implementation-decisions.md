# Implementation Decisions — Resolved

All items from the initial implementation review have been resolved. Remaining open items moved to `todo.md`.

## Actions taken

1. **Priority column** — Removed from Ledger schema, dispatch handler, CLI, and implement. Was just an example, not a real schema requirement.
2. **Multiple curricula → single curriculum** — Reverted to single curriculum per anima. Updated instantiate core/handler/CLI/instructions, architecture doc, and base-tools template.
3. **Workshop auto-select** — Moved to `todo.md` under Design.
4. **Codex role filtering** — Implemented in manifest engine: `codex/all.md` included for all animas, `codex/roles/<role>.md` only for animas holding that role. Updated architecture doc.
5. **Module path resolution** — Accepted as-is. Framework implements use package name, guild implements use absolute path.
6. **Worktree repo** — Moved to `todo.md` as urgent.
7. **Migration bootstrapping** — Resolved. `initGuild` no longer creates the ledger directly; the migration engine applies 001-initial-schema.sql. Init sequence: skeleton → bootstrap base tools → apply migrations.
8. **nexus-version** — Noted discrepancy, no action needed.
9. **Publish scope** — Accepted current narrow scope (Ledger-only). Full publish pipeline deferred.
