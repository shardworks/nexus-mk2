# The Stacks — Merged Spec Findings

Consolidated from two independent reviews of `docs/architecture/apparatus/stacks.md`.

---

## A. Must/Should Change for v1

These are issues that will cause implementation ambiguity, data corruption risk, or API misuse if shipped as-is. Fix before building.

### A1. Add cascade depth limiting

**Severity: Must-fix (data safety)**

The spec explicitly punts cycle detection: "Cycles are the handler author's responsibility." A recursive Phase 1 cascade (A updates B, B's handler updates A) produces infinite recursion inside an open SQLite transaction. The process stack-overflows before any DB-level safeguard kicks in.

**Fix:** Add a `MAX_CASCADE_DEPTH` counter (default 16, configurable) to the transaction context. Increment on each Phase 1 handler re-entry; throw if exceeded. Implementation cost is a single integer and one conditional per handler invocation.

### A2. Define `HandlerContext` interface

**Severity: Must-fix (spec completeness)**

`HandlerContext` is the second argument to every `ChangeHandler<T>` and is referenced in §6.2, §6.3, and §9 — but its interface never appears in the spec. The cascade example depends on `ctx.apparatus<StacksApi>('stacks')` returning transaction-bound book handles, but the mechanism is unspecified.

**Fix:** Add the `HandlerContext` interface definition. Either:
- Mirror `TransactionContext` (provide `book()` / `readBook()` directly, already bound to the active transaction), or
- Define it as a scoped `GuildContext` variant and specify how the transaction propagates through `ctx.apparatus()` lookups (e.g., async-local storage, explicit parameter).

The first option is simpler and avoids the transaction-propagation question entirely.

### A3. Specify how Phase 1 handlers get transaction-bound book handles

**Severity: Must-fix (correctness)**

Related to A2 but distinct. The §6.3 cascade example calls `ctx.apparatus<StacksApi>('stacks').book<Writ>(...)` to get a write handle. The spec says Phase 1 handlers receive handles "bound to the active transaction," but never describes the binding mechanism.

If `HandlerContext` provides `book()` / `readBook()` directly (as suggested in A2), this is resolved — the handler doesn't go through `apparatus()` at all, and the example should be updated to reflect that.

### A4. Fix `WhereCondition<T>` field name typing

**Severity: Should-fix (developer experience)**

`WhereCondition<T>` uses `keyof T & string` for the field position. This only covers top-level keys. Dot-notation paths like `'parent.id'` don't satisfy `keyof T` unless `T` literally declares a key named `'parent.id'`, forcing callers to cast. The existing `core/book.ts` avoids this with `Record<string, unknown>`.

**Fix:** Use `string` for the field position (with runtime validation via the existing `SAFE_FIELD_RE` allowlist), or invest in a recursive `Paths<T>` utility type. The former is pragmatic; the latter is elegant but complex. Given that runtime validation already exists and is necessary regardless of the type, `string` is the right call for v1.

### A5. Document the `put()` clobber risk explicitly

**Severity: Should-fix (documentation)**

`get()` → modify → `put()` without a transaction silently overwrites concurrent changes. The spec mentions CAS as "out of scope" and points to `transaction()`, but doesn't call out the risk directly. In the Nexus context this matters specifically because LLM-driven agents will issue writes — an Anima that reads a writ, deliberates (taking time), then puts the result back could easily clobber an intervening cascade.

**Fix:** Add a callout in §7 (Writes section) with the recommended pattern: wrap read-modify-write in `transaction()`. One paragraph.

### A6. Document `patch()` / `delete()` asymmetry rationale

**Severity: Should-fix (documentation)**

`patch()` throws on missing documents; `delete()` is a silent no-op. The asymmetry is defensible (patch implies "I know this exists"; delete is idempotent) but undocumented. In a plugin ecosystem, undocumented asymmetries create confusion.

**Fix:** One sentence in each method's JSDoc explaining the design choice.

### A7. Fix `InternalQuery` leaking pagination into `count()`

**Severity: Should-fix (API hygiene)**

The backend's `count(ref, query)` takes `InternalQuery`, which includes `limit` and `offset`. A count with pagination is semantically ambiguous. The public API correctly restricts `count()` to just `WhereClause`, but the internal type should match.

**Fix:** Either use a separate `InternalCountQuery` type (just `where`), or document that backends must ignore pagination fields on count calls.

### A8. Clarify `patch()` return type translation

**Severity: Should-fix (spec completeness)**

The public `Book<T>.patch()` returns `Promise<T>`, but the backend's `PatchResult` returns `{ entry: BookEntry, prev: BookEntry }`. The apparatus layer must unwrap this. One sentence clarifying the translation prevents implementers from accidentally surfacing the raw result.

### A9. Add "which phase?" decision guide to §6.2

**Severity: Should-fix (documentation)**

The two-phase model is powerful but requires developers to correctly classify their handlers. The spec describes what each phase does but doesn't guide the choice.

**Fix:** One paragraph: "Use Phase 1 when your handler's writes must succeed or fail atomically with the trigger. Use Phase 2 for notification, dispatch, and external system synchronization. If your Phase 1 handler produces effects outside the Stacks, it probably belongs in Phase 2."

### A10. Tighten pagination type

**Severity: Minor (type safety)**

The `| {}` branch for no-pagination means any object satisfies it, so `{ limit: undefined, offset: 5 }` is technically valid. The existing `core/book.ts` uses `{ limit?: never; offset?: never }` which is tighter.

**Fix:** Use the existing pattern: `{ limit?: never; offset?: never }`.

### A11. Note `ownerId` write boundary is trust-based

**Severity: Should-fix (documentation)**

Nothing prevents a plugin from calling `stacks.book('nexus-ledger', 'writs')` to get a full write handle for someone else's book. The `readBook()` distinction is a TypeScript compile-time boundary, erased at runtime. If this is intentional (trust-based, not enforced), say so. If enforcement is desired, the apparatus needs caller identity injected via context.

**Fix:** Add a note to §3 stating the boundary is trust-based at the type level. Runtime enforcement can be deferred — but the design decision should be explicit.

---

## B. Deferrable Improvements

Good ideas that aren't blocking for v1. Track for future versions.

### B1. Bulk write operations (`putMany()`, bulk delete)

Inserting 100 documents = 100 individual `put()` calls, 100 pre-reads for CDC, 100 handler invocations. Inside a `transaction()` this is atomic but slow. A `putMany()` that batches pre-reads and fires coalesced CDC events would be a significant performance win for data seeding and batch operations.

### B2. Compound index declarations

`indexes: ['status', 'createdAt']` creates two single-field indexes. A query filtering on `status` and sorting by `createdAt` can only use one. Compound index syntax (e.g., `indexes: [['status', 'createdAt']]`) would let the backend create multi-column indexes. The primary Nexus use case — writs filtered by status, sorted by date — benefits directly.

### B3. `exists()` / `any()` convenience method

`get(id) !== null` fetches the full payload; `count(where) > 0` scans all matches. A dedicated `exists(id)` with `LIMIT 1` would be trivially cheap. Low priority but easy to add.

### B4. Cursor-based pagination

Offset pagination requires scanning and discarding rows, degrading on large result sets. Keyset pagination (on `id` or the sort field) would be more robust. Fine to defer — Nexus datasets are small for now.

### B5. Aggregation primitives

Every summary query requires fetching all documents and computing in-memory. A `distinct(field)` or `groupCount(field)` would cover the 80% case without breaking the abstraction. Defer until a book grows large enough to make `list()` + reduce painful.

### B6. OR query support

Currently: "run two queries, merge in application code." This pushes deduplication, re-sorting, and re-pagination to every callsite that needs OR. Acceptable for v1 — revisit if OR queries prove common.

### B7. Deep-merge `patch()`

Already noted as out of scope for v1 in the spec. Nested objects are "fully supported as document content," so the gap will surface, but `put()` with full document is a workable escape hatch.

### B8. Streaming / cursor reads for large result sets

`find()` returns `T[]` — entire result set in memory. No async iterator or cursor option. Fine while datasets are small. Add when a book exceeds low thousands of documents.

### B9. Watcher cleanup (`unwatch()`)

No mechanism to deregister handlers. For production (process lifecycle = watcher lifecycle) this is fine. For hot-reload during development, stale handlers could accumulate. Low priority.

### B10. Create→delete coalescing side-effect orphaning

If a Phase 1 handler creates a document and a later Phase 1 handler deletes it in the same transaction, Phase 2 observers see no event — logically correct (net effect is nothing). But if the first handler triggered non-database side effects, those effects are orphaned. Worth noting in the spec as a known consequence; no design change needed.

### B11. Phase 2 notification durability

If the process exits between commit and Phase 2 handler execution, notifications are lost. For Clockworks event emission, this means a write can commit without its corresponding event firing. Acceptable if Clockworks can poll or recover, but worth documenting as a known gap.

### B12. Consider Kysely or Drizzle inside the SQLite backend

Use a typed query builder instead of hand-written SQL string construction in the `StacksBackend` implementation. This is an implementation detail, not an architectural change — doesn't affect the public API or the spec. Evaluate during implementation.

---

## Addendum: Alternatives Landscape

The CRUD and query portions of the Stacks spec are commodity. The differentiating requirement is **transactional CDC** — specifically Phase 1 cascade handlers whose writes are atomic with the triggering write. No off-the-shelf offering provides this.

| Alternative | Doc store | ACID txns | Transactional CDC | No envelope | Embeddable | Verdict |
|---|---|---|---|---|---|---|
| **RxDB** | Yes | Partial | No (post-commit only) | No (`_rev`, schema versions) | Yes | Fights design goals; schema versioning contradicts no-migrations; you'd still build the cascade layer |
| **PouchDB** | Yes | Partial | No (changes feed is post-commit) | No (`_rev`) | Yes (LevelDB) | Wrong concurrency model; revision tracking is overhead for single-writer; envelope requirement conflicts with spec |
| **LokiJS / SylvieJS** | Yes | No | No | Yes | Yes (in-memory) | No transactions = no cascade atomicity; in-memory-first = durability risk; project effectively unmaintained |
| **Fireproof** | Yes | Partial | No | No (CRDT metadata) | Yes | CRDT model solves distributed problem Nexus doesn't have; immutable ledger = unbounded storage growth |
| **Raw SQLite** | Storage only | Yes | Build it yourself | Yes | Yes | Converges with the custom approach — you'd build the same abstraction; this *is* the Stacks backend |
| **Kysely / Drizzle** | Query layer | Via SQLite | Build it yourself | Yes | Via SQLite | Useful *inside* the SQLite backend implementation, not a replacement for the Stacks architecture |

**The gap every alternative shares:** None offers CDC handlers that execute *inside* the write transaction with their writes joining the same atomic unit. Every alternative's change notification is post-commit, which means cascade integrity requires either (a) eventual consistency + reconciliation jobs, or (b) inlining all cascade logic at the write site. Both are strictly worse for the Nexus use case than the two-phase model.

**Recommendation:** Build the Stacks as specified with the A-category fixes applied. The total implementation is ~800-1200 lines. The unique value — transactional cascade CDC — doesn't exist off the shelf, and the alternatives that come closest bring envelope requirements and concurrency models that conflict with the design goals.
