# Commission: Rig — Database Seams

> **Stub.** Depends on `commission-rig-plugin-install.md` shipping first.
> See `commission-rig.md` for full north star context.

Introduce `BooksDatabase` as a clean, URL-based database abstraction in `core`. Inject it into tool handler contexts via `rig`. Plugin authors program against the interface; the adapter (SQLite, PostgreSQL, etc.) is selected by rig at runtime from `guild.json`.

## Rough Scope

- `BooksDatabase` interface and `SqlResult` type defined in `core`
- `HandlerContext` updated: `{ home: string, booksDatabase: BooksDatabase }`
- `guild.json` gains optional `database` field (URL string); defaults to `file:.nexus/nexus.db`
- `rig` reads the `database` URL at startup, constructs the appropriate adapter, injects it into every handler invocation
- Initial adapter: `better-sqlite3` wrapped in resolved promises (async-compatible)
- Future adapters (libsql, pg) keyed to URL scheme — not in scope for this commission
- `tool()` factory updated to surface `booksDatabase` in context type

## Key Decisions (to be refined at commission time)

- `BooksDatabase.execute(sql, args)` is the single method for now; `transaction()` deferred
- Interface shape compatible with libsql client for future familiarity
- `rig` owns adapter instantiation — plugin authors never import database drivers
- `core` defines the interface only; no database dependency in `core`
