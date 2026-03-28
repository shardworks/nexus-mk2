# Before trip

- Designed 'change notification' system for books: /workspace/nexus-mk2/.scratch/design-book-watchers.md
  - Q1 and Q2 are really one question: what pre-read cost is acceptable? The answer probably falls out from "how important is prev to cascade
   use cases" — if cascades are a first-class use case, prev is nearly mandatory.                                                            
  - Q3 (error semantics) is the one I'd push you hardest to decide consciously. The "fail the write" vs "log and continue" choice has big    
  implications — a buggy clockworks watcher silently blocking all writ mutations would be painful to debug. The per-watcher failOnError flag 
  is in there as an escape hatch worth considering.
  - Q5 (defer declarative watches) I'd just say yes — onInitialize covers everything, sugar can come later.                                  
  - Q6 is probably already "yes" given the cascade example, just confirming.
- Was working on "plugin-fying" project into smaller components
- Unreviewed migration guide: /workspace/nexus-mk2/.scratch/spec-riggify-template.md
- AI generated 'nexus-sessions' rig
  - Not been reviewed yet, but has direct DB access instead of using books API
- AI generated 'nexus-clockworks' rig: /workspace/nexus/packages/nexus-clockworks
  - Not been reviewed yet, but one thing i noticed was it had direct DB access instead of using books API from mainspring
  - Session notes:

```
  What we did                                                     
                                                                                                                       
  - Drafted spec-riggify-template.md — a 10-step task template for extracting core subsystems into standalone rig      
  packages using the Books abstraction. Covers pre-flight analysis, denormalization strategy, document types, package  
  scaffold, Book declarations, tool implementation, TypeScript API surface, callsite updates, and tests.               
  - Applied the spec to create packages/nexus-clockworks/ (1b80790) — the first riggified core subsystem: events API
  library, clockworks runner (with V2 engine resolution via config.rigs + node_modules), daemon control, 8 tools, 51   
  tests passing.
  - Stripped backward compat and migration code (2f94d0e) — V1 config.engines shim, brief verb, guildPackageRoot()     
  wrapper; Steps 7 and 9 removed from the spec.                                                                        
  - Confirmed core is untouched — both commits are additive to packages/nexus-clockworks/ only.
                                                                                                                       
  Decisions made and/or deferred                                                                                       
                                                                                                                       
  - home: string library signatures kept — deliberate API design for cross-module use (not compat code).               
  - No V1 compat, no migration — Sean's direction: all preexisting guilds are decommissioned.
  - Callsite cleanup deferred — stdlib wrappers and core re-exports not yet removed.                                   
                                                                                                                       
  Next steps
                                                                                                                       
  - Callsite cleanup (Step 7): remove stdlib clock/event/signal wrappers, core re-exports, legacy/1/clockworks.ts,     
  legacy/1/events.ts
  - Continue riggification: nexus-writs → nexus-roster → nexus-sessions                                                
  - Publish spec-riggify-template.md once validated end-to-end
```

---

## Books API: Root Cause Analysis and Strategic Reassessment

*Added 2026-03-28 by Coco after investigating why agents consistently introduce direct SQLite/SQL when converting legacy code to rigs.*

### What triggered this analysis

Two first-party rigs (`nexus-clockworks`, `nexus-sessions`) were generated with direct `better-sqlite3` access instead of using `ctx.book()`. This has been observed as a consistent pattern across multiple conversions. Investigation identified two concurrent causes: genuine API limitations and a documentation gap.

---

### Root Cause 1: The Books API has genuine holes

`Book<T>` (accessed via `ctx.book()` and `ctx.rigBook()`) supports:

- `put()` / `get()` / `delete()` — upsert and retrieval by id
- `find(query)` — equality filters only (`WHERE field = ?`), ANDed together
- `list(options?)` — all documents with sorting and pagination
- `count(where?)` — count with equality-only filters

**Operations that force agents to raw SQL:**

| Missing capability | Concrete example |
|---|---|
| LIKE / pattern matching | `listEvents({ name: 'commission.%' })` — wildcards impossible via equality |
| IS NULL / IS NOT NULL | "active sessions" query (`endedAt IS NULL`) |
| Range filters (`>`, `<`, `>=`, `<=`) | Events after a timestamp, sessions exceeding a cost |
| Partial field update (`patch`) | `markEventProcessed` — setting one field without replacing the whole doc requires read-modify-write |
| Compound ordering | `ORDER BY firedAt, rowid` — `orderBy` is single-field only |
| Aggregate queries | Conversation cost totals, token usage sums — no `SUM()`, `AVG()`, `GROUP BY` |
| Transactions | Atomic read-modify-write patterns, multi-document consistency |
| OR conditions | Any disjunction in a where clause |

This is acknowledged in the framework's own code. From `nexus-clockworks/src/lib/db.ts`:

> *"Library functions in this rig use raw SQLite access... they need direct SQL for operations that the Books API doesn't support (e.g. partial updates for markEventProcessed, LIKE filters for listEvents)."*

So the Books API is genuinely insufficient for any rig with non-trivial query needs.

---

### Root Cause 2: Agents don't know the Books API exists

The documentation inventory tells the story:

- **`building-tools.md`** — teaches `tool()`. Features `booksPath(home)` in the "common imports" table as a utility to resolve the raw SQLite path — **actively inviting direct access**.
- **`building-engines.md`** — teaches `engine()`. Shows calling framework functions like `showWrit`, `listWrits` from `@shardworks/nexus-core`. No Books API mention.
- **`core-api.md`** — no mention of `ctx.book()`, `RigContext`, `Book<T>`, or the Books API surface. Mentions `booksPath(home)` only as a path resolver.
- **`mainspring/README.md`** — has the Books API fully documented (book store, cross-rig access, schema reconciliation), but it is an internal developer doc, not an agent-facing guide.

**There is no guide that explains:**
- What a `Rig` export is (vs. a bare `tool()` or `engine()` export)
- How to declare `books` in the Rig export
- How to use `ctx.book<T>(name)` and `ctx.rigBook<T>(rigId, name)`
- When raw SQL is legitimately needed vs. when the Books API suffices

Additionally, both first-party rigs (`nexus-clockworks`, `nexus-sessions`) use raw SQL as their storage pattern. Agents reading these as reference implementations for "how a rig manages its data" copy the pattern. The `lib/db.ts` module in each rig makes raw SQL look like the canonical approach.

---

### Will the Books API always be deficient?

**Yes — by design, and that's not necessarily wrong. But the question is whether the design is at the right level.**

The Books API is a document-store abstraction over SQLite. Its core design choices are:

1. **Schema-by-index-declaration**: rig authors declare which fields they want to query on; mainspring creates the backing table and indexes additively. No SQL schema knowledge required.
2. **JSON blobs as documents**: all data is stored as `content TEXT` (JSON). The document shape evolves freely without schema migrations — changing a document's fields just means writing different JSON.
3. **Equality-only query surface**: the API intentionally exposes a simple predicate language that can be explained in plain English: "find all writs where status equals ready."

These choices produce meaningful guarantees:
- **No migrations for content changes**: adding a new field to your document type requires no migration, no ALTER TABLE, no deploy coordination. Just start writing the new field.
- **Additive-only schema changes**: adding a new book or index is always safe. Nothing destructive happens automatically.
- **SQL injection prevention**: field names are validated against a safe allowlist before interpolation; all values are parameterized.
- **Cross-rig read contracts**: `rigBook()` provides a clean read-only access boundary between rigs that doesn't require knowledge of the other rig's table structure.

**The inherent tradeoff**: a document-store abstraction will *always* be expressively weaker than raw SQL. You cannot provide LIKE, JOINs, window functions, and aggregates through an equality-filter API without rebuilding a query language. The more operators you add to `BookQuery`, the more you're building a shadow SQL layer — one that's less capable than SQL and harder to reason about than SQL.

The question isn't "how do we make the Books API as powerful as SQL?" The question is: **is the abstraction at the right level, and are we offering the right escape hatches?**

---

### Aggressive analysis: Books API value, tradeoffs, and alternatives

#### The genuine value

1. **No-migrations semantics for document content** — this is the Books API's strongest argument. When rig authors change their document shapes (add fields, rename fields, restructure nested objects), they never need a migration. This matters enormously in a multi-rig, multi-version environment. Without it, each riggification requires careful migration planning.

2. **Additive schema management** — adding a new book or index is zero-risk. The table is created if absent; the index is created if absent. Nothing is ever dropped. This is genuinely useful for production systems where schema changes are dangerous.

3. **Cross-rig read isolation** — `rigBook()` makes inter-rig data access explicit and read-only. This is a clean architectural boundary that raw SQL access destroys: with raw SQL, any rig can `UPDATE` any table.

4. **Injection safety** — field names are allowlisted, values are parameterized. Rig authors writing raw SQL often forget one of these; the Books API handles both.

5. **Cognitive simplicity** — for truly simple CRUD patterns, `ctx.book<Writ>('writs').put(writ)` and `ctx.book<Writ>('writs').find({ where: { status: 'ready' } })` are much cleaner than the equivalent SQL boilerplate. The abstraction earns its keep for the simple case.

#### The genuine weaknesses

1. **Expressively crippled** — equality-only filters with single-field ordering cover maybe 60% of real query patterns. The 40% that require LIKE, IS NULL, range comparisons, aggregates, or multi-field sorts are forced to raw SQL. This means agents learn to reach past the abstraction for anything non-trivial.

2. **In-memory post-filtering is a silent footgun** — when agents can't express a filter in the Books API, many do `list()` everything and filter in TypeScript. For small collections this works; for large ones it's a memory/performance problem with no warning at the call site.

3. **No patch semantics** — `put()` replaces the whole document. Any partial update requires read-modify-write, and without transaction support in the Books API, this is not atomic. Agents either accept the race condition or go to raw SQL.

4. **The abstraction is invisible until you hit its wall** — rig authors don't discover these limitations until they try to write a query the API doesn't support. At that point they've already invested in the pattern and the path of least resistance is to bypass the whole API rather than use it for some operations and raw SQL for others.

5. **First-party rigs are bad examples** — `nexus-clockworks` and `nexus-sessions` both use raw SQL. These are the natural reference implementations for rig authors. The abstraction is undercut by its own primary users.

6. **It's a document store bolted onto a relational database** — SQLite *is* relational, and the Books API actively prevents using relational features. When a rig's data has natural relational structure (events → dispatches, conversations → participants → turns), the document model requires duplication, denormalization, or post-query assembly — all of which raw SQL handles natively.

#### Alternative approaches

**Option A: Extend the Books API with richer predicates (incremental)**

Add the most common missing operators to `BookQuery` using a structured operator format:

```typescript
type WhereValue =
  | unknown              // equality
  | { $like: string }    // LIKE
  | { $null: true }      // IS NULL
  | { $notNull: true }   // IS NOT NULL
  | { $gt: unknown }     // >
  | { $lt: unknown }     // <
  | { $in: unknown[] };  // IN list

type WhereClause = Record<string, WhereValue>;
```

Add `patch(id, Partial<T>)` for atomic partial updates. Add multi-field `orderBy: [string, 'asc' | 'desc'][]`. Keep no-migrations semantics because the table structure doesn't change.

*Verdict*: Covers the common cases without abandoning the abstraction. Risk: ends up as a shadow SQL layer — complex to implement, harder to document than SQL itself, and still not expressive enough for aggregates or JOINs. Every new operator requested creates pressure to add another. You're building MongoDB's query language on top of SQLite.

**Option B: Tiered access — Books API + `ctx.rawRead()`**

Keep the Books API for writes (preserving injection safety and the cross-rig write contract). Add a `ctx.rawRead<T>(sql, params)` escape hatch for arbitrary SELECT queries against the guild's database.

```typescript
// Complex reads: explicit escape hatch
const rows = await ctx.rawRead<EventDoc>(
  `SELECT content FROM books_nexus_clockworks_events
   WHERE json_extract(content, '$.name') LIKE ?
   ORDER BY json_extract(content, '$.firedAt') ASC, rowid ASC`,
  ['commission.%']
);

// Writes: Books API only
await ctx.book<Event>('events').put(event);
```

*Verdict*: Pragmatic and honest about the abstraction's limits. Preserves the write boundary (no rig can corrupt another rig's data via the escape hatch since it's SELECT-only). No-migrations semantics hold because rig authors never define tables. Downside: `rawRead()` requires knowing the `books_*` table naming scheme and writing `json_extract()` paths — it's still raw SQL and all its footguns. Also makes the "use Books API" advice feel hollow: "here's the abstraction, also here's the real thing."

**Option C: Expose a typed query builder (Kysely-style)**

Integrate a query builder that's aware of the `books_*` table structure and generates type-safe SQL without string interpolation. Could enforce that rig authors only touch their own rig's tables.

*Verdict*: Attractive in theory. In practice, Kysely requires TypeScript-level table type definitions — a full schema in types — which reintroduces schema overhead just at the TypeScript level rather than the SQL level. It doesn't eliminate migration concerns; it shifts schema from SQL files to `.ts` files. Adds a significant dependency and learning curve. Probably the worst tradeoff of the options: the complexity of a full ORM without eliminating the migration problem.

**Option D: Abandon the Books API for rigs, embrace raw SQL with guardrails**

Accept that the abstraction is too thin to be worth maintaining as a primary API. Teach rig authors to use `better-sqlite3` directly against their own `books_*` tables. Provide a `lib/db.ts` template as part of the rig scaffold. Document conventions that say "only query tables owned by your rig."

The no-migrations semantic is preserved: rig authors still declare their books in the `Rig` export for mainspring to create tables. They query via raw SQL.

*Verdict*: This is what the first-party rigs currently do. It's pragmatic. The downside is the loss of the cross-rig read contract (`rigBook()` disappears) and injection safety becomes each author's problem. It also makes the `Rig` / `Book` declaration feel like a table-creation ceremony with no accompanying query abstraction — which is what it currently is for first-party rigs. Honest, but not a good long-term position.

**Option E: Structured predicate list as the surface (hybrid — recommended)**

Design an intermediate API that exposes document-store semantics with an explicit operator format — closer to SQL's capability without being SQL, and without building a shadow query language:

```typescript
// Tuples: [field, operator, value]
ctx.book<T>('events').query({
  where: [
    ['name', 'LIKE', 'commission.%'],
    ['processed', '=', false],
    ['firedAt', '>', cutoff],
  ],
  orderBy: [['firedAt', 'ASC'], ['id', 'ASC']],
  limit: 100,
});
```

Field validation and parameterization happen internally. Operators are an explicit enum. This is not ORM-building — it's exposing the SQL operator set through a safe predicate tuple. Aggregates and JOINs stay out of scope, but `rawRead()` remains available as an explicit escape hatch.

*Verdict*: The most honest design. It's clearly a thin safety layer over SQL rather than a different abstraction. The predicate format is learnable, documentable, and maps directly to what it compiles to. Expands the Books API's coverage from ~60% to ~90% of real patterns. Implementation is a modest expansion of the query builder in `book-store.ts`. Still needs a `rawRead()` escape hatch for the remaining 10% (aggregates, JOINs, multi-table queries).

---

### Recommended path

The Books API's core value — **no-migrations semantics and additive schema management** — is real and worth preserving. But the equality-only predicate layer is too thin for production use. Agents are hitting its wall immediately and routing around the entire abstraction, which defeats the purpose.

**The line to hold**: writes always go through the Books API. That's where injection safety and the cross-rig write boundary live. The no-migrations semantic survives because rig authors never `CREATE TABLE` or `ALTER TABLE` — mainspring owns that from the `books` declaration in the Rig export.

**The line to abandon**: the idea that the Books API will ever be the only storage interface, or that it needs to be. It's the right default and the right constraint for writes. It's not expressive enough to be the only read surface, and pretending otherwise just pushes agents to bypass it entirely.

**Short term (unblock riggification):**

1. Write `docs/guides/building-rigs.md` — an agent-facing guide covering the `Rig` export, `books` declarations, `ctx.book()`, cross-rig access via `rigBook()`, and an explicit section on "when raw SQL is legitimate." This addresses the documentation gap that is the primary immediate driver.

2. Remove `booksPath(home)` from the "common imports" table in `building-tools.md`, or add a clear "internal rig infrastructure only — do not use in rig handlers" callout.

**Medium term (fix the API):**

3. Expand `BookQuery` with Option E's structured predicate approach: expose `LIKE`, `IS NULL`, `IS NOT NULL`, range operators, and multi-field `orderBy`. Add `patch(id, fields)` for atomic partial updates. This expands Books API coverage from ~60% to ~90% of real patterns.

4. Add `ctx.rawRead<T>(sql, params)` — SELECT-only escape hatch explicitly for aggregates and JOINs. Document it as the last resort, not the first tool.

5. Update `nexus-clockworks` and `nexus-sessions` to use the Books API (once extended) for operations it can express, moving raw SQL to only the genuinely unsupported cases (LIKE, multi-field ordering). This turns the first-party rigs into correct reference implementations.