# Task Template: Riggifying a Core Subsystem

**Status:** Draft
**Applies to:** Clockworks, Roster, Writ System, Sessions, and any future core subsystem extraction
**Purpose:** A repeatable task template for extracting functionality from `core/src/legacy/1/` and re-implementing it as a standalone rig package using the Books abstraction.

---

## Background

The legacy core subsystems (writ system, clockworks/events, roster/anima db, sessions) were implemented before the rig model existed. They live in `packages/core/src/legacy/1/` and share a common pattern:

- Open `better-sqlite3` directly via `booksPath(home)`
- Execute raw SQL against the shared `nexus.db`
- Tables are created by numbered SQL migrations in `packages/core/migrations/`
- Functions exported from `legacy/1/` are called by `stdlib` tools, engines, and the framework itself

The target state is a **rig package** that:

- Declares its schema via `Rig.books` (mainspring creates tables at startup — no SQL migrations)
- Accesses data through `ctx.book<T>(name)` and `ctx.rigBook<T>(rigId, name)`
- Exposes its operations as rig tools
- Exports a TypeScript API for internal framework use (the parts that can't be tools)

---

## Candidate Subsystems

| Subsystem | Source module(s) | SQL tables | Proposed rig name |
|---|---|---|---|
| Writ System | `writ.ts` | `writs` | `nexus-writs` |
| Clockworks / Events | `clockworks.ts`, `events.ts` | `events`, `event_dispatches` | `nexus-clockworks` |
| Roster (Anima DB) | `anima.ts`, `instantiate.ts` | `animas`, `anima_compositions`, `roster` | `nexus-roster` |
| Sessions | `session.ts`, `conversation.ts` | `sessions`, `conversations` | `nexus-sessions` |

The **Ledger** referred to in early design docs is the Books storage layer itself (`nexus.db`). It is not a separate subsystem — "ledger" = "books". No separate rig needed.

---

## Task Template

The following steps constitute a complete riggification. They are roughly sequential, but steps 3–5 are often done in parallel.

---

### Step 0: Pre-flight analysis

Before writing any code, answer these questions:

**Schema analysis**
- What SQL tables does this subsystem own?
- What are the column types and constraints? (CHECK constraints, NOT NULL, FKs)
- Which tables have JOIN relationships between them?
- Which columns carry serialized JSON or delimited lists?

**Dependency analysis**
- Which other subsystems does this one call? (e.g., `writ.ts` calls `signalEvent()`)
- Which subsystems call this one? (e.g., `session.ts` calls `createWrit()`)
- Which `stdlib` tools call functions from this module?
- Is this subsystem called from the framework itself (manifest.ts, clockworks runner, etc.) — not just from tools?

**Query analysis**
- List every `SELECT` query pattern: which fields are filtered, sorted, or joined?
- These become the `indexes` in the Book declaration.

**Event analysis**
- Which events does this subsystem signal? (`signalEvent(home, 'writ.ready', ...)`)
- Which events does this subsystem consume (standing orders)?

Capture this analysis as a comment block at the top of the rig's `README.md`.

---

### Step 1: Determine denormalization strategy

The Books API (`Book<T>`) stores JSON documents and supports field-indexed queries. It does **not** support SQL JOINs. Normalized tables must be mapped to one of three strategies:

**Strategy A — Embed (full denormalization)**
Fold related rows into a single document. Best when the related data is:
- Append-mostly (no independent update paths)
- Always fetched together with the parent
- Not queried independently

_Example:_ `anima_compositions` (one-to-one with `animas`) → embedded as `composition: { ... }` inside the anima document.

**Strategy B — Separate books with application join**
Keep two books; join in handler code by fetching from both. Best when:
- Both sides are queried independently
- The relationship is many-to-many or one-to-many
- Write paths are independent

_Example:_ `roster` (anima↔role many-to-many) → separate `roster` book; tools that need role info fetch both books and merge.

**Strategy C — Redundant field index**
Store the join key as a top-level field on the child document so it can be queried without fetching the parent. Best when queries are always on the child side.

_Example:_ `events` have `emitter` and `name` as top-level fields → index both.

Document the chosen strategy for each table relationship in the pre-flight analysis.

---

### Step 2: Define document types

Create `src/types.ts` in the new rig package. For each book:

1. Define the TypeScript document type. `id: string` is **required** as a top-level field (the Books API mandates it).
2. Map SQL columns to fields. Naming conventions:
   - SQL `snake_case` → TypeScript `camelCase`
   - SQL `TEXT NOT NULL DEFAULT (datetime('now'))` → TypeScript `string` (ISO-8601)
   - SQL serialized JSON column → typed field (deserialize on read, serialize on write)
   - SQL serialized comma-delimited TEXT column → `string[]` (split on read, join on write)
3. For embedded sub-documents (Strategy A above), define a nested interface.
4. Annotate which fields map to Book `indexes` — these must be top-level (or one level of dot-notation nesting).

```typescript
// Example: writ document type
export interface WritDoc {
  id: string;             // Books-required
  type: string;           // indexed
  title: string;
  description: string | null;
  status: WritStatus;     // indexed
  parentId: string | null; // indexed
  sessionId: string | null;
  workshop: string | null; // indexed
  sourceType: 'patron' | 'anima' | 'engine';
  sourceId: string | null;
  createdAt: string;      // indexed
  updatedAt: string;
}
```

---

### Step 3: Create the rig package scaffold

```
packages/nexus-<name>/
├── package.json             # name: @shardworks/nexus-<name>
├── tsconfig.json            # extends workspace root tsconfig
├── rig.json                 # rig descriptor (dependencies on other nexus rigs)
├── src/
│   ├── index.ts             # Rig export (default) + public TypeScript API
│   ├── types.ts             # Document types (Step 2)
│   ├── books.ts             # Book declarations for the Rig export
│   └── tools/
│       ├── <tool-name>.ts   # One file per tool
│       └── ...
└── src/index.test.ts        # or test/ directory
```

**`package.json` key fields:**
```json
{
  "name": "@shardworks/nexus-<name>",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "zod": "..."
  }
}
```

**`rig.json`** (if this rig depends on another rig being installed):
```json
{
  "description": "Nexus writ system",
  "dependencies": [
    { "rig": "nexus-clockworks" }
  ]
}
```

---

### Step 4: Declare books in the Rig export

In `src/books.ts`, declare the Book schemas. Each book name is the key; `indexes` lists queryable fields (plain or dot-notation):

```typescript
import type { BookOptions } from '@shardworks/nexus-core';

export const books: Record<string, BookOptions> = {
  writs: {
    indexes: ['type', 'status', 'parentId', 'workshop', 'createdAt'],
  },
};
```

In `src/index.ts`, wire it into the Rig export:

```typescript
import type { Rig } from '@shardworks/nexus-core';
import { books } from './books.js';
import myTool from './tools/my-tool.js';

export default {
  tools: [myTool],
  books,
} satisfies Rig;
```

**Note:** Mainspring creates the SQLite backing tables when the guild starts — no SQL migration files needed.

---

### Step 5: Implement tools

For each exported function in the legacy module, determine its fate:

| Legacy function | Disposition |
|---|---|
| User-facing operations (create, list, show, update, delete) | → tool in `src/tools/` |
| Framework-internal calls (called by manifest, clockworks runner, etc.) | → keep as exported TypeScript function in `src/index.ts` |
| Internal helpers (not exported from the module) | → keep as private helpers in the tool file |

**Tool implementation pattern:**

```typescript
// src/tools/create-writ.ts
import { tool } from '@shardworks/nexus-core';
import { ulid } from 'ulidx';           // ID generation
import { z } from 'zod';
import type { WritDoc } from '../types.js';

export default tool({
  name: 'create-writ',
  description: '...',
  instructions: '...',
  params: { ... },
  handler: async (params, ctx) => {
    const writs = ctx.book<WritDoc>('writs');
    const now = new Date().toISOString();
    const doc: WritDoc = {
      id: ulid(),
      ...params,
      createdAt: now,
      updatedAt: now,
    };
    await writs.put(doc);
    return doc;
  },
});
```

**Cross-rig access pattern** (when this rig's tool needs to read another rig's data):

```typescript
// Reading clockworks events from within the writs rig
const events = ctx.rigBook<EventDoc>('nexus-clockworks', 'events');
const related = await events.find({ where: { writId: params.id } });
```

**Signalling events** from within a riggified rig:

If the subsystem previously called `signalEvent()` from `legacy/1/events.ts` directly, there are two options:
1. **Import from `nexus-clockworks` TypeScript API** — the clockworks rig exports `signalEvent(ctx, name, payload)` as a library function.
2. **Use the Books API directly** — write to the `events` book via `ctx.rigBook('nexus-clockworks', 'events')`. Note: this is read-only, so option 1 is preferred.

The clockworks rig must export a TypeScript function for this; it is not suitable as a tool call.

---

### Step 6: Export the TypeScript API

Some legacy functions are called by the framework internally (not by tools). These need to remain importable after riggification. Export them from `src/index.ts`:

```typescript
// src/index.ts — re-export internal API alongside the Rig default export
export { createWrit, listWrits, getWrit } from './lib/writ-api.js';

export default { tools, books } satisfies Rig;
```

**Rule:** A function should be in the TypeScript API (not a tool) if:
- It is called from the framework's own startup, manifest, or dispatch path
- It is called synchronously from another TypeScript module (not via tool invocation)
- It does not need to be visible to anima agents

---

### Step 7: Update callsites

Once the rig is implemented:

1. **`stdlib` tools:** Delete any stdlib tool that was just a thin wrapper around the legacy function — the rig's own tool replaces it entirely. Other stdlib tools that imported legacy functions now import from the rig package.

2. **Framework internals** (manifest.ts, clockworks runner, init, etc.): Update to call the rig's exported TypeScript API. Remove calls to `legacy/1/` modules.

3. **Core barrel (`core/src/index.ts`):** Remove the re-exports of the legacy functions now owned by the rig.

4. **`core/src/legacy/1/`:** Delete the now-riggified module file.

---

### Step 8: Tests

Follow the pattern established in `packages/mainspring/src/tools/*.test.ts`:

- Tests call tool handlers directly (no CLI layer)
- Use a temporary directory as `home`
- Construct a minimal `RigContext` with a real `BooksDatabase` backed by an in-memory SQLite instance (or a temp file)
- Seed data via `ctx.book<T>(name).put(...)` rather than raw SQL inserts
- Assert via `ctx.book<T>(name).get(...)` or `find(...)` rather than raw SQL selects

For framework-internal functions (TypeScript API surface), test them directly — no context needed.

---

## Common Pitfalls

**No cross-book transactions.** The Books API operates per-book. If two books must be updated atomically (e.g., create a writ AND increment a counter), you need application-level compensation logic or a single denormalized book. In practice most operations are single-book writes — review carefully when you see multi-table transactions in legacy code.

**Serialized arrays in SQL columns.** The legacy code stores arrays as comma-delimited TEXT (e.g., session `roles` column). Book documents store these as real `string[]`. Serialize/deserialize at the boundary, not inside the handler.

**`home`-based APIs vs. context-based APIs.** Legacy functions take `home: string` and open a new DB connection each call. Rig tools receive `ctx: RigContext` which has an already-open connection. Library functions exported for cross-module use (e.g. `signalEvent`) can keep the `home: string` signature if they need to be callable from modules that don't yet have a RigContext. Prefer `ctx: RigContext` for tool handlers; `home: string` is acceptable for library exports.

**Indexed fields must be top-level (or one level deep).** The Books adapter supports dot-notation for queries (`parent.id`), but only one level. Multi-level nesting can't be indexed. If you need to filter on a deeply nested field, promote it to top-level in the document type.

**Event signalling across rig boundaries.** The clockworks rig owns the `events` book. Other rigs that need to signal events must either (a) import `signalEvent` from the clockworks rig's TypeScript API, or (b) write directly to the DB — which is not the Books abstraction. Solution: the clockworks rig must export `signalEvent(ctx, name, payload, emitter)` as a library function, and dependent rigs declare `nexus-clockworks` as a `rig.json` dependency.

---

## Worked Example Outline: `nexus-writs`

| Step | Output |
|---|---|
| Pre-flight | `writs` table → one book. Calls `signalEvent` on create/update. Called by `session.ts` on start/end. |
| Denormalization | `writs` is already a flat table — no joins. Strategy not needed. |
| Document type | `WritDoc` — direct column map, `snake_case → camelCase`. |
| Books declaration | `{ writs: { indexes: ['type', 'status', 'parentId', 'workshop', 'sessionId', 'createdAt'] } }` |
| Tools | `create-writ`, `list-writs`, `show-writ`, `update-writ`, `fail-writ`, `complete-session` (writ lifecycle portion) |
| TypeScript API | `createWrit(ctx, opts)`, `getWrit(ctx, id)` — called by session infrastructure |
| Event signalling | Import `signalEvent` from `nexus-clockworks`; declare dependency in `rig.json` |
| Callsite updates | `stdlib/src/tools/create-writ.ts`, `list-writs.ts`, etc. — delete (rig owns these now); `session.ts` → import from `@shardworks/nexus-writs` |

---

## Riggification Order

The subsystems have dependencies. Riggify in this order to minimize circular dependency risk:

1. **`nexus-clockworks`** (no rig dependencies — signals events, owns the event queue)
2. **`nexus-writs`** (depends on clockworks for event signalling)
3. **`nexus-roster`** (depends on clockworks for `anima.created`, `anima.retired` events)
4. **`nexus-sessions`** (depends on writs + roster)

---

---

## Lessons from `nexus-clockworks` (first riggification)

These were discovered during the first real application of this template.

**`ToolDefinition[]` array type requires a cast.** When assembling the `tools` array in the Rig export using `satisfies Rig`, TypeScript rejects the array because each tool has a specific handler parameter type and `ToolDefinition<ZodShape>` expects `Record<string, unknown>`. The fix: cast the array with `as ToolDefinition[]`. This is a known variance issue with handler contravariance — adding `as ToolDefinition[]` on the array literal is the idiomatic fix.

**`home: string` library functions can coexist cleanly.** `signalEvent(home, ...)` and the other queue functions kept their signatures. They write to the Books tables by knowing the table name constant (`EVENTS_TABLE = 'books_nexus_clockworks_events'`). This works well — callers don't need to change, and the storage layer is correct.

**`markEventProcessed` needs a transaction, not a raw UPDATE.** The naive approach (raw `json_set` SQL) is fragile and SQLite-version-sensitive. A read-modify-write transaction is cleaner and more portable. For atomicity: wrap in `db.transaction(...)`.

**Library functions vs. Books API in tests.** Test setup needs to create the Books tables manually (the same DDL that `reconcileBooks()` would run). Import `EVENTS_TABLE` and `DISPATCHES_TABLE` constants from `lib/db.ts` to construct the `CREATE TABLE` statements — don't hardcode strings. This keeps tests in sync with the implementation if the table name convention ever changes.

**Engine resolution scans `config.rigs` + `node_modules`.** The runner iterates installed rigs, tries to resolve each rig key to a package name (via guild `package.json` dependencies, then by convention as `@shardworks/<key>`), imports the package, and scans its default export for a matching engine. This is best-effort — rig key → package name resolution assumes either the package is a dep of the guild or follows the `@shardworks/<rig-key>` naming convention.

**`@ts-expect-error` placement matters in the daemon.** The dynamic import of `@shardworks/nexus-core` is fine (it's a declared dependency). Only the `@shardworks/claude-code-session-provider` import needs `@ts-expect-error`.

*This spec is a living document. Update it as riggification patterns are discovered during implementation.*
