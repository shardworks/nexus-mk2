# The Stacks — Spec Assessment

Status: **Review document** — accompanies the Stacks API Contract draft

---

## 1. Correctness & Accuracy Issues

### `patch()` return type mismatch

The public `Book<T>.patch()` returns `Promise<T>`, but the backend's `PatchResult` returns `{ entry: BookEntry, prev: BookEntry }`. The apparatus layer must unwrap this, but the spec doesn't describe the translation. Implementers could accidentally surface the raw `PatchResult` to callers. Worth one sentence clarifying the unwrap.

### `HandlerContext` is referenced but never defined

§6.2 uses `HandlerContext` as the second argument to `ChangeHandler<T>`, and §9 says it's scoped to the observing plugin, but the interface never appears. The §6.3 cascade example depends on handlers being able to call `ctx.apparatus<StacksApi>('stacks')` to get transaction-bound book handles. Without a defined shape, this is a gap that will stall implementation.

### Cascade example has an unresolved transaction-binding question

In §6.3, the cascade handler calls `ctx.apparatus<StacksApi>('stacks').book<Writ>(...)` to get a write handle. The spec says Phase 1 handlers receive book handles "bound to the active transaction," but the mechanism by which a freshly-obtained book handle discovers it's inside an active transaction is never described. Either:

- `HandlerContext` should provide transaction-bound book handles directly (mirroring `TransactionContext`), or
- The spec should describe how transaction context propagates through the apparatus lookup (e.g., a thread-local / async-context mechanism)

The example reads correctly but the spec doesn't guarantee it works.

### `InternalQuery` leaks pagination into `count()`

The backend's `count(ref, query)` takes `InternalQuery`, which includes `limit` and `offset`. A count with pagination is semantically ambiguous. The public API correctly restricts `count(where?)` to just a `WhereClause`, but the internal representation should either use a separate type for count queries or document that backends ignore pagination fields on count calls.

---

## 2. Validity & Semantic Problems

### `patch()` throws / `delete()` is silent — intentional but under-documented

`patch()` throws on missing documents; `delete()` is a silent no-op. This asymmetry is defensible (patch implies "I know this exists," delete is idempotent), but the spec doesn't state the rationale. In a plugin ecosystem where multiple authors write against the same API, undocumented asymmetries generate confusion. A one-liner explaining the design choice would help.

### `put()` full-replace creates a silent-clobber data loss vector

If plugin A does `get()` → modify → `put()`, and plugin B writes between the get and the put, A silently overwrites B's changes. The spec acknowledges this implicitly by listing CAS/optimistic locking as "out of scope" and pointing to `transaction()`, but `transaction()` only helps if the developer knows to use it.

In the Nexus context specifically, this matters because LLM-driven agents (Anima) will be issuing writes. An Anima that reads a writ, deliberates, and then puts the result back could easily clobber an intervening status change from a cascade handler or another Anima. The spec should call this out explicitly as a known risk in §7, ideally with a recommended pattern (read-modify-write inside `transaction()`).

### No enforcement of `ownerId` write boundary

The spec says "kits use their own plugin id — this is the write boundary," but nothing prevents any plugin from calling `stacks.book('nexus-ledger', 'writs')` and getting a full write handle. The `readBook()` distinction is purely a TypeScript type-system boundary — erased at runtime. If this is intentional (trust-based, not enforced), the spec should say so explicitly. If enforcement is desired, the apparatus needs the caller's plugin identity injected (e.g., via the context object) to validate at runtime.

---

## 3. Data Corruption & Loss Risks

### Cascade cycle detection is absent — this is a must-fix

The spec says "Cycles are the handler author's responsibility — there is no cycle detection." In a recursive cascade (A's handler updates B, B's handler updates A), this produces infinite recursion inside a single SQLite transaction. SQLite won't save you — the process will stack overflow before any database-level limit kicks in, and while the transaction will roll back, the process may crash.

A simple depth counter (max cascade depth, configurable, default 16) would make this safe. The implementation cost is trivial: increment a counter in the transaction context before invoking each Phase 1 handler, throw if it exceeds the limit. This is the single highest-priority fix in the spec.

### Create→delete coalescing can orphan side effects

If a Phase 1 handler creates a document and a later Phase 1 handler deletes it in the same transaction, Phase 2 observers see no event. This is logically correct (net effect is nothing), but if the first Phase 1 handler triggered side effects beyond the database (e.g., queued work, notified an external system), those effects are now orphaned with no corresponding cleanup event. The spec should note this as a known consequence of coalescing.

### No watcher cleanup mechanism

Handlers are registered via `watch()` but there is no `unwatch()`. If an apparatus is stopped and restarted during development (hot reload), stale handlers could accumulate. For production (process lifecycle = watcher lifecycle) this is fine, but worth noting as a development ergonomics gap.

---

## 4. Flexibility & Usability

### Strengths

The query language hits a good sweet spot — more expressive than key-value equality, less complex than a full query builder. The tuple-based predicates with explicit operators are easy to read and hard to misuse. The `IN` operator, `LIKE`, null checks, and dot-notation for nested fields cover the overwhelming majority of document store query patterns.

The cross-plugin read boundary (`readBook`) is clean. It makes data ownership legible without requiring message-passing for simple reads — important in Nexus where the Ordinator needs to inspect writ state owned by the Ledger.

The transaction model is well-designed for the cascade use case. Implicit transactions that span a write and all its Phase 1 handlers mean that developers who don't think about transactions still get atomic cascades. Explicit transactions for multi-document writes are available but not required for the common case.

### Gaps

**No aggregation primitives.** Every summary or dashboard query requires fetching all documents and computing in-memory. For the Nexus Ledger this is probably fine in v1 (writs and sessions are unlikely to exceed low thousands), but if any book grows to tens of thousands of documents, `list()` followed by application-level reduce becomes painful. A `distinct(field)` or `groupCount(field)` would cover the 80% case without breaking the abstraction.

**Offset-based pagination degrades on large result sets.** Offset pagination requires scanning and discarding rows. Cursor-based pagination (keyset pagination on `id` or the sort field) would be more robust, but is a reasonable thing to defer for v1.

**No `exists()` convenience method.** The spec suggests `get(id) !== null` or `count(where) > 0` for existence checks. Both work but are slightly wasteful — `get()` fetches the full payload, `count()` scans all matches. A dedicated `exists(id)` that does a single indexed lookup would be trivially cheap to add.

---

## 5. Does the CDC Two-Phase Model Add Value for Nexus?

Short answer: **yes, significantly, but only Phase 1.** Phase 2 is useful but replaceable.

### Where Phase 1 (cascade handlers) is load-bearing

The Nexus domain has several cascade relationships that are fundamental to correctness, not just convenience:

**Writ lifecycle propagation.** When a Commission is cancelled, all child Writs must be cancelled. When a parent Writ is cancelled, non-terminal children must be cancelled. These cancellations must be atomic with the triggering write — if child cancellation fails, the parent cancellation must not persist. This is not eventually-consistent-safe. A parent that shows "cancelled" while its children continue executing is a corrupt state that Anima will act on incorrectly.

**Session cleanup on Writ completion.** When a Writ reaches a terminal state, associated sessions should be marked accordingly. If this happens outside the write transaction, there's a window where an Anima could pick up a session for a completed writ and begin work that will be immediately discarded.

**Referential integrity across books.** The Ledger owns writs and sessions as separate books. A writ deletion that doesn't atomically clean up sessions leaves dangling references. Without transactional CDC, every consumer of session data must defensively check whether the parent writ still exists — pushing complexity into every reader instead of handling it once at the write boundary.

These are all cases where **the cascade must succeed or fail atomically with the trigger**. That's exactly what Phase 1 provides. Without it, you'd need to either:

1. Move all cascade logic into the write call itself (violating separation of concerns — the Ledger's `put()` call would need to know about every downstream consumer), or
2. Accept eventual consistency and build compensating transactions everywhere (dramatically increasing complexity for every plugin that reads writ state).

### Where Phase 2 (notification handlers) is convenient but replaceable

Phase 2 handles post-commit notification: Clockworks event emission, telemetry, audit logging. These are fire-and-forget by nature. You could replace Phase 2 with:

- A simple event emitter that fires after each write completes
- A polling mechanism where Clockworks checks for changes on a timer
- An explicit `emit()` call at each write site

Phase 2's value is that it's *automatic* — any write through the Stacks API generates notification without the write site needing to know about it. This is meaningful for plugin extensibility (a third-party plugin can observe changes without modifying the writer), but it's not a correctness requirement the way Phase 1 is.

---

## 6. What Happens with Less Robust CDC?

### Scenario A: CDC with no transaction integration (post-commit only)

Drop Phase 1 entirely. All CDC handlers fire after commit, like Phase 2. Cascade writes become independent transactions.

**Impact on Nexus:** Writ cancellation becomes non-atomic. The parent writ is cancelled and committed. Then the cascade handler runs and cancels children one at a time. If the process crashes between cancelling child 2 and child 3, you have a partially-cancelled tree. Every reader of writ state must now handle this intermediate state. The Ordinator, when evaluating writ graphs, must treat "parent cancelled but children still active" as a valid (if transient) state and either wait or trigger its own cleanup.

This is workable but significantly increases the complexity of every component that reads writ state. The cascade correctness guarantee moves from "the data layer handles it" to "every consumer must be defensive." For a multi-agent system where Anima are making decisions based on writ state, defensive reads are especially important and especially easy to get wrong.

**What you'd need to add:** A reconciliation loop that periodically scans for inconsistent states and repairs them. Essentially a crond-style job that does what the cascade handler would have done, but after the fact. This is the eventual-consistency pattern — valid, but more moving parts.

### Scenario B: No CDC at all — explicit calls at write sites

Remove the `watch()` mechanism entirely. Every write site that needs cascade behavior calls the downstream logic directly.

**Impact on Nexus:** The Ledger's writ update method must explicitly call session cleanup, child writ cancellation, Clockworks notification, and any other downstream effect. Adding a new downstream consumer requires modifying the Ledger's write path. Cross-plugin extensibility is gone — a third-party plugin cannot react to writ changes without the Ledger knowing about it.

This is the simplest model and it works for a closed system with a known set of plugins. The Nexus vocabulary has a finite set of cascades today. But it means that the Stacks is just a data store, and all coordination logic lives in the plugins themselves. The "Books as infrastructure with reactive behavior" value proposition disappears.

For v1 with a small plugin set this is viable. It becomes painful when you want the Herald to observe changes without modifying the Ledger, or when a community-contributed plugin wants to react to writ lifecycle events.

---

## 7. Alternatives Analysis

### Could we use an off-the-shelf offering and skip custom persistence entirely?

The CRUD and query portions of the Stacks spec are commodity. The unique value is the CDC orchestration layer — specifically Phase 1 transactional cascades. Here's how each alternative maps to the Nexus requirements:

### 7.1 RxDB

**What it gives you:** Reactive document storage with change streams, pluggable backends (including SQLite), schema versioning, conflict handling, real-time queries via observables.

**Friction points for Nexus:**

- **Schema versioning conflicts with "no migrations."** RxDB requires explicit schema versions and migration strategies when fields change. The Stacks spec deliberately avoids this — additive-only schema changes with no migration machinery. You'd be fighting RxDB's opinions here.
- **No transactional CDC.** RxDB's change streams fire post-commit. You cannot make a cascade handler's writes atomic with the triggering write. This means Scenario A from §6 — non-atomic cascades, eventual consistency, defensive readers.
- **Revision-based conflict resolution adds overhead Nexus doesn't need.** RxDB tracks `_rev` fields and supports conflict resolution strategies designed for multi-master replication. Nexus is single-writer-per-book by design. The revision machinery is pure overhead.
- **The reactive query system (observables) is powerful but heavy.** RxDB recomputes query results on every change. For Nexus's use case (point reads and targeted queries, not live-updating dashboards), this is wasted work.
- **Dependency weight.** RxDB pulls in a significant dependency tree. For a system that's already embedding a full LLM orchestration stack, adding another heavy runtime dependency has cost.

**Verdict:** RxDB would work for the data layer but you'd be fighting its opinions on schema versioning and building the cascade layer yourself anyway. Net savings over the custom approach are small.

### 7.2 LokiJS / SylvieJS

**What it gives you:** In-memory document store with persistence adapters, dynamic views, change events, simple query syntax.

**Friction points for Nexus:**

- **In-memory first, persistence second.** LokiJS keeps the entire dataset in memory and periodically flushes to disk. For small datasets this is fine; for anything that grows beyond available memory, it's a hard wall. Nexus's writ and session history could grow indefinitely.
- **Persistence adapters are fragile.** The flush-to-disk model means a crash between flushes loses data. SQLite's WAL gives you crash-safe writes by default. You'd be trading a well-understood durability model for a weaker one.
- **No real transaction support.** LokiJS has no concept of atomic multi-document writes. Cascade atomicity is impossible at the storage layer — you'd build it yourself on top.
- **Change events are post-mutation, not transactional.** Same limitation as RxDB — no Phase 1 equivalent.
- **Project health.** LokiJS is effectively unmaintained. SylvieJS is a community fork with limited adoption. Betting Nexus's persistence on a low-activity fork is a maintenance risk.

**Verdict:** Wrong model for Nexus. The in-memory-first design and weak durability guarantees are disqualifying for a system that manages long-running agent work.

### 7.3 PouchDB / CouchDB Protocol

**What it gives you:** Document store with a built-in changes feed (CDC for free), multi-version concurrency control, replication, conflict resolution, Mango query language.

**Friction points for Nexus:**

- **The `_rev` field violates "no envelope."** Every document gets a revision token managed by PouchDB. Plugins would need to work around it or accept framework-managed metadata in their documents. This directly contradicts Design Goal 1.
- **Changes feed is post-commit only.** The changes feed is designed for replication, not transactional cascades. No mechanism to make a reactive handler's writes atomic with the trigger.
- **Heavyweight runtime.** PouchDB in Node.js uses LevelDB under the hood by default. Adding a LevelDB instance alongside whatever other storage Nexus uses is redundant complexity. The SQLite adapter exists but is a second-class citizen.
- **Conflict resolution is designed for distributed systems.** PouchDB's conflict model assumes multiple writers that may be offline. Nexus is a single-process, single-writer system. The conflict machinery adds complexity without value.
- **Mango queries are roughly equivalent to the Stacks query language.** No advantage here — you'd get similar expressiveness with more overhead.

**Verdict:** The changes feed is attractive but comes bundled with a distributed-systems conflict model that Nexus doesn't need. The envelope requirement (`_rev`) is a direct conflict with the spec's design goals.

### 7.4 SQLite directly with a thin wrapper

**What it gives you:** Proven durability, ACID transactions, `json_extract()` for document queries, excellent Node.js support via better-sqlite3.

**Friction points for Nexus:**

- **You still build the CDC layer.** SQLite gives you transactions but not change notification. The two-phase CDC model, event coalescing, and handler dispatch are all custom code regardless.
- **You still build the document abstraction.** Translating between JSON documents and SQLite rows with `json_extract()` queries is exactly what the Stacks SQLite backend does. The thin wrapper *is* the Stacks backend.
- **Query builder needed.** Without something like Kysely or Drizzle, you're concatenating SQL strings with json_extract paths — error-prone and hard to type-check.

**Verdict:** This is essentially what the Stacks spec describes, minus the API layer and CDC orchestration. The "alternative" and the custom approach converge — the question is just how much structure you put around the SQLite calls.

### 7.5 Kysely or Drizzle as the query layer inside a custom backend

**What it gives you:** Type-safe query building, migration support (optional), good SQLite support.

**This isn't an alternative to the Stacks — it's an implementation strategy for the SQLite backend.** Instead of hand-writing SQL string construction in the `StacksBackend` implementation, use Kysely or Drizzle to generate the queries. The Stacks API, Book handles, CDC orchestration, and transaction coordination remain custom. The query builder replaces only the lowest layer — translating `InternalQuery` to SQL.

**Verdict:** Worth considering as an implementation detail of the SQLite adapter. Doesn't change the architectural decision about whether to build the Stacks.

### 7.6 Summary matrix

| Alternative | Document semantics | Transactions | Transactional CDC | No envelope | Plugin extensibility | Nexus fit |
|---|---|---|---|---|---|---|
| Custom Stacks | ✅ | ✅ | ✅ | ✅ | ✅ | Best fit |
| RxDB | ✅ | Partial | ❌ | ❌ (`_rev`) | ✅ (observables) | Poor — fights design goals |
| LokiJS/SylvieJS | ✅ | ❌ | ❌ | ✅ | Partial | Poor — durability risk |
| PouchDB | ✅ | Partial | ❌ | ❌ (`_rev`) | ✅ (changes feed) | Poor — wrong concurrency model |
| Raw SQLite | Storage only | ✅ | Build it yourself | ✅ | Build it yourself | Converges with custom approach |
| Kysely/Drizzle | Query layer only | ✅ (via SQLite) | Build it yourself | ✅ | Build it yourself | Useful inside the custom backend |

---

## 8. Are Transactional Cascades Undermined by Side Effects?

This is the right question to pressure-test the design. If Phase 1 handlers routinely produce side effects that escape the database, then rolling back the transaction doesn't truly roll back the operation — you get a "leaky" atomicity guarantee that's arguably worse than no guarantee at all, because it creates a false sense of safety.

### Mapping Nexus's actual cascade handlers to side-effect categories

To assess this concretely, consider what Phase 1 handlers in Nexus would actually do:

**Pure database cascades (fully covered by transaction rollback):**

- Writ status propagation — parent cancelled → children cancelled. All writes go through `Book.put()` within the same transaction. Rollback fully reverses everything.
- Session state updates on writ completion — mark associated sessions as terminal. Database writes within the Stacks.
- Anima lifecycle transitions triggered by writ state changes — Wellspring → Aspirant promotion, Active → Retired on session end. Database writes.
- Referential integrity cleanup — writ deletion cascading to session cleanup. Database writes.

**External side effects that are naturally Phase 2 concerns:**

- Clockworks event emission — already spec'd as `failOnError: false`. Fires after commit. Not in the transaction.
- Herald publishing notifications — fire-and-forget by design. Post-commit.
- Telemetry and audit logging — append-only, post-commit.
- Triggering new Anima sessions (e.g., spawning a child agent) — this is work dispatch, not data consistency. It belongs after the data is committed, not during the transaction.

**The critical observation:** In the Nexus domain, the things that need to be atomic with the trigger are almost exclusively database state mutations within the Stacks. The things that produce non-database side effects are almost exclusively notification and dispatch — work that should happen *after* the data is settled, not during the transaction.

This isn't a coincidence. It follows from the architecture: the Stacks is the single source of truth for all persistent state. Cascades *maintain consistency within that source of truth*. External systems react to the *result* of that consistency, not to intermediate states.

### Where the boundary could get blurry

There are a few scenarios where a Phase 1 handler *might* be tempted to produce external side effects:

**Scenario: A cascade handler that sends a message to an Anima mid-cascade.** For instance, a handler that detects a writ cancellation and immediately tells the active Anima to stop work. If this fires inside the transaction and the transaction later rolls back, the Anima received a spurious cancellation.

**The correct design response:** This should be a Phase 2 handler, not Phase 1. The Anima should be notified *after* the cancellation is committed. If the Anima is mid-execution when the notification arrives, it checks writ state (which is now committed) and winds down. The transactional boundary protects data consistency; the notification boundary handles coordination.

**Scenario: A cascade handler that writes to an external system (e.g., updates a GitHub issue status).** If the write succeeds but the transaction rolls back, the external system is out of sync.

**The correct design response:** External system synchronization is always a Phase 2 concern. The Stacks transaction covers the Stacks. External systems get eventual consistency via post-commit handlers, with their own idempotency and retry logic.

### The design principle

The two-phase split is not just a convenience — it's a **forcing function that separates concerns correctly.** Phase 1 is for data consistency within the Stacks. Phase 2 is for everything else. If a developer is tempted to put external side effects in a Phase 1 handler, that's a design smell, and the `failOnError` flag makes the choice explicit.

The risk isn't that transactional cascades are "overwhelmed" by side effects — it's that a developer *misclassifies* a side-effecting handler as Phase 1. The spec should include guidance on this (a brief "which phase should I use?" decision framework), but the architecture itself is sound. The atomicity guarantee covers exactly the domain where it matters (data consistency) and explicitly excludes the domain where it can't help (external effects).

### What if you dropped Phase 1 and made everything post-commit?

To make the tradeoff concrete: without Phase 1, the writ cancellation cascade from §6.3 becomes:

1. Parent writ is cancelled and committed.
2. Post-commit handler fires, queries for children, cancels them one by one (each its own transaction).
3. If the process crashes after cancelling child 2 of 5, children 3–5 remain active with a cancelled parent.
4. A reconciliation job must exist to detect and repair this state.
5. Every component that reads writ state must handle "parent cancelled, children still active" as a valid transient state.
6. The Ordinator's dependency graph evaluation must account for inconsistent subtrees.

This is the eventual-consistency version. It works. Distributed systems do it all the time. But it pushes complexity into every reader and requires a reconciliation mechanism that the transactional approach makes unnecessary. For a single-process, single-database system like Nexus, choosing eventual consistency when you *could* have strong consistency is giving up a guarantee for no benefit.

---

## 9. Recommendation

Build the Stacks as specified, with these amendments:

1. **Add cascade depth limiting** (§3, issue 1 from the corruption risks). A configurable max depth with a sensible default (16) prevents infinite recursion in cascade handlers. Trivial to implement, critical for safety.

2. **Define `HandlerContext`** explicitly. Show the interface, clarify how transaction-bound book handles are obtained inside Phase 1 handlers.

3. **Add a "which phase?" decision guide** to §6.2. One paragraph: "Use Phase 1 when your handler's writes must succeed or fail with the trigger. Use Phase 2 for notification, dispatch, and external system synchronization. If your Phase 1 handler produces effects outside the Stacks, it probably belongs in Phase 2."

4. **Document the `put()` clobber risk** in §7 with a recommended pattern (`transaction()` for read-modify-write).

5. **Consider Kysely or Drizzle** inside the SQLite backend implementation to avoid hand-written SQL string construction. This is an implementation detail, not an architectural change.

The total custom code is roughly 800–1200 lines for the apparatus + SQLite backend. The CDC orchestration layer (transaction coordination, event buffering, coalescing, two-phase dispatch) is perhaps 400 of those lines. That's a reasonable investment for the guarantees it provides — especially given that no off-the-shelf alternative offers transactional CDC, and the alternatives that come closest (RxDB, PouchDB) bring envelope requirements and concurrency models that conflict with the Stacks' design goals.