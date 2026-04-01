# The Stacks — Conformance Test Specification

Status: **Draft** — defines the test cases any `StacksBackend` implementation must pass

---

## Guiding Principle

The `StacksBackend` interface is the swappable contract. This test suite is backend-agnostic — it runs against the `StacksApi` surface using whatever backend is configured. A backend that passes every test in this document is a conforming implementation. A backend that fails any test is not safe to use in production.

Tests are organized by risk tier:

- **Tier 1 — Data integrity.** Failures here mean data loss or corruption. These are the non-negotiable tests.
- **Tier 2 — Behavioral correctness.** Failures here mean the CDC contract is violated. Cascade logic will malfunction.
- **Tier 3 — Query correctness.** Failures here mean queries return wrong results. Plugins will misbehave.
- **Tier 4 — Edge cases and ergonomics.** Failures here mean surprising behavior in uncommon scenarios.

---

## Tier 1 — Data Integrity

These tests verify that data is not lost, corrupted, or silently mishandled. Every backend must pass all of these.

### 1.1 Basic CRUD round-trip

```
put({ id: 'a', name: 'Alice' })
get('a') → { id: 'a', name: 'Alice' }
```

Verify the document survives serialization/deserialization exactly. No added fields, no dropped fields, no type coercion.

### 1.2 Put is full-replace, not merge

```
put({ id: 'a', name: 'Alice', role: 'admin' })
put({ id: 'a', name: 'Alice' })
get('a') → { id: 'a', name: 'Alice' }
```

The `role` field must be gone. A backend that merges on put instead of replacing is non-conforming.

### 1.3 Document field type preservation

```
put({ id: 'a', count: 0, flag: false, label: '', items: null })
get('a') → { id: 'a', count: 0, flag: false, label: '', items: null }
```

Verify that falsy values survive round-trip. `0` must not become `null`. `false` must not become `0`. `''` must not become `null`. `null` must not become `undefined` or be omitted.

### 1.4 Nested object preservation

```
put({ id: 'a', meta: { tags: ['x', 'y'], nested: { deep: true } } })
get('a') → exact structural match including nested arrays and objects
```

### 1.5 Delete removes the document

```
put({ id: 'a', name: 'Alice' })
delete('a')
get('a') → null
```

### 1.6 Delete is idempotent

```
delete('nonexistent-id') → no error thrown
```

### 1.7 Patch applies top-level fields only

```
put({ id: 'a', name: 'Alice', role: 'admin', score: 10 })
patch('a', { score: 20 })
get('a') → { id: 'a', name: 'Alice', role: 'admin', score: 20 }
```

Unmentioned fields (`name`, `role`) must be untouched. Only `score` changes.

### 1.8 Patch throws on missing document

```
patch('nonexistent', { name: 'Bob' }) → throws
```

Must throw, not silently create. This distinguishes patch from put.

### 1.9 Patch returns the updated document

```
put({ id: 'a', name: 'Alice', score: 10 })
result = patch('a', { score: 20 })
result → { id: 'a', name: 'Alice', score: 20 }
```

### 1.10 Put with identical document is a no-op write (but still valid)

```
put({ id: 'a', name: 'Alice' })
put({ id: 'a', name: 'Alice' })
get('a') → { id: 'a', name: 'Alice' }
```

The second put must succeed and the document must be correct. Whether it fires a CDC event is covered in Tier 2.

---

## Tier 2 — CDC Behavioral Correctness

These tests verify the change data capture contract. Failures here mean cascade handlers and notification handlers will malfunction.

### 2.1 Put (new document) fires `create` event

```
watch('owner', 'book', handler)
put({ id: 'a', name: 'Alice' })
handler received → { type: 'create', entry: { id: 'a', name: 'Alice' } }
```

### 2.2 Put (existing document) fires `update` event with `prev`

```
put({ id: 'a', name: 'Alice' })
watch('owner', 'book', handler)
put({ id: 'a', name: 'Bob' })
handler received → {
  type: 'update',
  entry: { id: 'a', name: 'Bob' },
  prev:  { id: 'a', name: 'Alice' }
}
```

`prev` must reflect the state *before* the write.

### 2.3 Patch fires `update` event with `prev`

```
put({ id: 'a', name: 'Alice', score: 10 })
watch('owner', 'book', handler)
patch('a', { score: 20 })
handler received → {
  type: 'update',
  entry: { id: 'a', name: 'Alice', score: 20 },
  prev:  { id: 'a', name: 'Alice', score: 10 }
}
```

### 2.4 Delete fires `delete` event with `prev`

```
put({ id: 'a', name: 'Alice' })
watch('owner', 'book', handler)
delete('a')
handler received → {
  type: 'delete',
  id: 'a',
  prev: { id: 'a', name: 'Alice' }
}
```

### 2.5 Delete of nonexistent document fires no event

```
watch('owner', 'book', handler)
delete('nonexistent')
handler received → nothing
```

### 2.6 No events fire when no handlers are registered

```
// No watch() calls
put({ id: 'a', name: 'Alice' })
// Verify no pre-read was performed (backend-level assertion if possible)
```

This tests the optimization: skip the pre-read when no handlers are registered.

### 2.7 Phase 1 handler error rolls back the triggering write

```
watch('owner', 'book', handler, { failOnError: true })
handler = async (event) => { throw new Error('cascade failed') }

put({ id: 'a', name: 'Alice' }) → rejects with error
get('a') → null
```

The document must not exist after a Phase 1 handler failure.

### 2.8 Phase 2 handler error does not roll back the write

```
watch('owner', 'book', handler, { failOnError: false })
handler = async (event) => { throw new Error('notification failed') }

put({ id: 'a', name: 'Alice' }) → resolves successfully
get('a') → { id: 'a', name: 'Alice' }
```

The document must persist despite the Phase 2 handler error.

### 2.9 Phase 1 handlers fire before Phase 2 handlers

```
const order = []
watch('owner', 'book', () => order.push('phase1'), { failOnError: true })
watch('owner', 'book', () => order.push('phase2'), { failOnError: false })

put({ id: 'a', name: 'Alice' })
order → ['phase1', 'phase2']
```

### 2.10 Multiple handlers fire in registration order within each phase

```
const order = []
watch('owner', 'book', () => order.push('p1-first'),  { failOnError: true })
watch('owner', 'book', () => order.push('p1-second'), { failOnError: true })
watch('owner', 'book', () => order.push('p2-first'),  { failOnError: false })
watch('owner', 'book', () => order.push('p2-second'), { failOnError: false })

put({ id: 'a', name: 'Alice' })
order → ['p1-first', 'p1-second', 'p2-first', 'p2-second']
```

### 2.11 Phase 1 handler writes are atomic with the trigger

```
watch('owner', 'books-a', async (event) => {
  const booksB = stacks.book('owner', 'books-b')
  await booksB.put({ id: 'derived', source: event.entry.id })
}, { failOnError: true })

put to books-a: { id: 'a', name: 'Alice' }

get from books-a: 'a' → exists
get from books-b: 'derived' → exists
```

Both documents must exist. If either write fails, neither should persist.

### 2.12 Phase 1 handler failure rolls back handler's writes AND trigger

```
watch('owner', 'books-a', async (event) => {
  const booksB = stacks.book('owner', 'books-b')
  await booksB.put({ id: 'derived', source: event.entry.id })
  throw new Error('cascade failed')
}, { failOnError: true })

put to books-a: { id: 'a', name: 'Alice' } → rejects

get from books-a: 'a' → null
get from books-b: 'derived' → null
```

Both the trigger write and the handler's write must be rolled back.

### 2.13 Cascade handler triggers recursive Phase 1 handlers

```
// Handler on books-a writes to books-b
// Handler on books-b writes to books-c
watch('owner', 'books-a', async (event) => {
  await stacks.book('owner', 'books-b').put({ id: 'b1', from: 'a' })
}, { failOnError: true })

watch('owner', 'books-b', async (event) => {
  await stacks.book('owner', 'books-c').put({ id: 'c1', from: 'b' })
}, { failOnError: true })

put to books-a: { id: 'a1' }

get from books-a: 'a1' → exists
get from books-b: 'b1' → exists
get from books-c: 'c1' → exists
```

All three writes commit atomically.

### 2.14 Recursive cascade failure rolls back entire chain

```
// Same setup as 2.13, but the books-b handler throws
watch('owner', 'books-b', async (event) => {
  await stacks.book('owner', 'books-c').put({ id: 'c1', from: 'b' })
  throw new Error('deep cascade failed')
}, { failOnError: true })

put to books-a: { id: 'a1' } → rejects

get from books-a: 'a1' → null
get from books-b: 'b1' → null
get from books-c: 'c1' → null
```

The entire chain — trigger, first cascade, and second cascade — must all roll back.

### 2.15 Phase 2 handlers receive coalesced events, not intermediate states

```
const events = []
watch('owner', 'book', (e) => events.push(e), { failOnError: false })

transaction(async (tx) => {
  const book = tx.book('owner', 'book')
  await book.put({ id: 'a', status: 'draft' })
  await book.put({ id: 'a', status: 'active' })
  await book.put({ id: 'a', status: 'completed' })
})

events.length → 1
events[0].type → 'create'
events[0].entry.status → 'completed'
```

Phase 2 must see exactly one `create` event with the final state, not three events.

### 2.16 Coalescing: create → delete produces no event

```
const events = []
watch('owner', 'book', (e) => events.push(e), { failOnError: false })

transaction(async (tx) => {
  const book = tx.book('owner', 'book')
  await book.put({ id: 'a', name: 'Alice' })
  await book.delete('a')
})

events.length → 0
```

### 2.17 Coalescing: update → delete produces `delete` with pre-transaction `prev`

```
put({ id: 'a', name: 'Alice' })

const events = []
watch('owner', 'book', (e) => events.push(e), { failOnError: false })

transaction(async (tx) => {
  const book = tx.book('owner', 'book')
  await book.put({ id: 'a', name: 'Bob' })    // intermediate state
  await book.delete('a')
})

events.length → 1
events[0].type → 'delete'
events[0].prev.name → 'Alice'   // pre-transaction state, not 'Bob'
```

### 2.18 Coalescing: create → update produces `create` with final state

```
const events = []
watch('owner', 'book', (e) => events.push(e), { failOnError: false })

transaction(async (tx) => {
  const book = tx.book('owner', 'book')
  await book.put({ id: 'a', name: 'Alice' })
  await book.put({ id: 'a', name: 'Bob' })
})

events.length → 1
events[0].type → 'create'
events[0].entry.name → 'Bob'
// No prev field on create events
```

### 2.19 Coalescing: update → update produces single `update` with pre-transaction `prev`

```
put({ id: 'a', name: 'Alice' })

const events = []
watch('owner', 'book', (e) => events.push(e), { failOnError: false })

transaction(async (tx) => {
  const book = tx.book('owner', 'book')
  await book.put({ id: 'a', name: 'Bob' })
  await book.put({ id: 'a', name: 'Charlie' })
})

events.length → 1
events[0].type → 'update'
events[0].prev.name → 'Alice'      // pre-transaction
events[0].entry.name → 'Charlie'   // final
```

---

## Tier 2.5 — Transaction Semantics

These sit between CDC correctness and query correctness. They verify that the transaction model works as specified.

### 2.20 Explicit transaction: all writes are atomic

```
transaction(async (tx) => {
  const book = tx.book('owner', 'book')
  await book.put({ id: 'a', name: 'Alice' })
  await book.put({ id: 'b', name: 'Bob' })
  await book.put({ id: 'c', name: 'Charlie' })
})

get('a') → exists
get('b') → exists
get('c') → exists
```

### 2.21 Explicit transaction: error rolls back all writes

```
try {
  transaction(async (tx) => {
    const book = tx.book('owner', 'book')
    await book.put({ id: 'a', name: 'Alice' })
    await book.put({ id: 'b', name: 'Bob' })
    throw new Error('abort')
  })
} catch (e) { /* expected */ }

get('a') → null
get('b') → null
```

### 2.22 Read-your-writes inside a transaction

```
transaction(async (tx) => {
  const book = tx.book('owner', 'book')
  await book.put({ id: 'a', name: 'Alice' })

  const result = await book.get('a')
  result → { id: 'a', name: 'Alice' }

  const found = await book.find({ where: [['name', '=', 'Alice']] })
  found.length → 1

  const count = await book.count([['name', '=', 'Alice']])
  count → 1
})
```

Uncommitted writes must be visible to reads within the same transaction.

### 2.23 Uncommitted writes are not visible outside the transaction

This test requires concurrency support to verify properly. For single-connection SQLite it's inherently satisfied (serialized access). For multi-connection backends (Postgres), this is critical:

```
// Start transaction A, write, do NOT commit yet
// In a separate context, read the same key
// The uncommitted write must not be visible
```

For SQLite backends, document that this is satisfied by the single-connection model. For future Postgres backends, this test becomes essential.

### 2.24 Implicit transaction spans write + Phase 1 handlers

```
// This is the same as 2.11/2.12 but framed from the implicit transaction perspective.
// A single put() outside an explicit transaction must create an implicit
// transaction that includes the write and all Phase 1 cascade handlers.

// No explicit transaction() call:
put({ id: 'a', name: 'Alice' })
// All Phase 1 handler writes are atomic with this put
```

### 2.25 Nested explicit transactions (if supported) or error on nesting

Decide and test one of:
- Nested `transaction()` calls are flattened into the outer transaction
- Nested `transaction()` calls throw immediately

Either behavior is acceptable but must be documented and tested.

---

## Tier 3 — Query Correctness

These tests verify that the query language returns correct results.

### 3.1 Equality filter

```
put({ id: 'a', status: 'active' })
put({ id: 'b', status: 'cancelled' })

find({ where: [['status', '=', 'active']] }) → [{ id: 'a', ... }]
```

### 3.2 Inequality filter

```
find({ where: [['status', '!=', 'active']] }) → [{ id: 'b', ... }]
```

### 3.3 Range operators with numbers

```
put({ id: 'a', score: 10 })
put({ id: 'b', score: 20 })
put({ id: 'c', score: 30 })

find({ where: [['score', '>', 15]] }) → [b, c]
find({ where: [['score', '>=', 20]] }) → [b, c]
find({ where: [['score', '<', 20]] }) → [a]
find({ where: [['score', '<=', 20]] }) → [a, b]
```

### 3.4 Range operators with strings (lexicographic)

```
put({ id: 'a', name: 'Alice' })
put({ id: 'b', name: 'Bob' })
put({ id: 'c', name: 'Charlie' })

find({ where: [['name', '>', 'Bob']] }) → [Charlie]
find({ where: [['name', '>=', 'Bob']] }) → [Bob, Charlie]
```

### 3.5 LIKE operator

```
put({ id: 'a', name: 'Alice' })
put({ id: 'b', name: 'Alison' })
put({ id: 'c', name: 'Bob' })

find({ where: [['name', 'LIKE', 'Ali%']] }) → [Alice, Alison]
find({ where: [['name', 'LIKE', '_ob']] }) → [Bob]
```

### 3.6 IN operator

```
find({ where: [['id', 'IN', ['a', 'c']]] }) → [Alice, Bob... wait, id 'a' and 'c']
```

More precisely:
```
put({ id: 'a', status: 'active' })
put({ id: 'b', status: 'draft' })
put({ id: 'c', status: 'cancelled' })

find({ where: [['status', 'IN', ['active', 'cancelled']]] }) → [a, c]
```

### 3.7 Empty IN list returns no results

```
find({ where: [['status', 'IN', []]] }) → []
```

Must not error. Must return empty.

### 3.8 IS NULL / IS NOT NULL

```
put({ id: 'a', label: null })
put({ id: 'b', label: 'tagged' })

find({ where: [['label', 'IS NULL']] }) → [a]
find({ where: [['label', 'IS NOT NULL']] }) → [b]
```

### 3.9 IS NULL for missing fields

```
put({ id: 'a', name: 'Alice' })   // no 'label' field at all

find({ where: [['label', 'IS NULL']] }) → [a]
```

A field that was never set must behave as null for IS NULL queries. This is a critical backend conformance point — some backends distinguish between "field is null" and "field is absent."

### 3.10 Multiple conditions are AND-ed

```
put({ id: 'a', status: 'active', score: 30 })
put({ id: 'b', status: 'active', score: 10 })
put({ id: 'c', status: 'draft',  score: 30 })

find({ where: [['status', '=', 'active'], ['score', '>', 20]] }) → [a]
```

### 3.11 Dot-notation for nested fields

```
put({ id: 'a', parent: { id: 'p1' } })
put({ id: 'b', parent: { id: 'p2' } })

find({ where: [['parent.id', '=', 'p1']] }) → [a]
```

### 3.12 Sort ascending and descending

```
put({ id: 'a', score: 30 })
put({ id: 'b', score: 10 })
put({ id: 'c', score: 20 })

find({ orderBy: ['score', 'asc'] }) → [b, c, a]
find({ orderBy: ['score', 'desc'] }) → [a, c, b]
```

### 3.13 Multi-field sort

```
put({ id: 'a', status: 'active', score: 20 })
put({ id: 'b', status: 'active', score: 10 })
put({ id: 'c', status: 'draft',  score: 30 })

find({ orderBy: [['status', 'asc'], ['score', 'desc']] }) → [a, b, c]
```

### 3.14 Pagination: limit

```
put 5 documents
find({ limit: 2 }) → exactly 2 results
```

### 3.15 Pagination: limit + offset

```
put({ id: 'a', score: 10 })
put({ id: 'b', score: 20 })
put({ id: 'c', score: 30 })

find({ orderBy: ['score', 'asc'], limit: 2, offset: 1 }) → [b, c]
```

### 3.16 Count without predicate

```
put 3 documents
count() → 3
```

### 3.17 Count with predicate

```
put({ id: 'a', status: 'active' })
put({ id: 'b', status: 'draft' })
put({ id: 'c', status: 'active' })

count([['status', '=', 'active']]) → 2
```

### 3.18 List returns all documents

```
put 3 documents
list() → 3 documents
```

### 3.19 List respects orderBy and pagination

```
list({ orderBy: ['id', 'asc'], limit: 2 }) → first 2 by id
```

### 3.20 Field name validation rejects dangerous input

```
find({ where: [['status; DROP TABLE--', '=', 'x']] }) → throws immediately
find({ where: [['name"', '=', 'x']] }) → throws immediately
find({ where: [['valid.field', '=', 'x']] }) → does not throw
find({ where: [['under_score', '=', 'x']] }) → does not throw
```

Characters outside `[A-Za-z0-9_.-]` must be rejected before reaching the query engine.

---

## Tier 4 — Edge Cases and Ergonomics

### 4.1 Cross-plugin read isolation

```
// Plugin A owns 'tasks'
const writeHandle = stacks.book<Task>('plugin-a', 'tasks')
const readHandle  = stacks.readBook<Task>('plugin-a', 'tasks')

writeHandle.put({ id: 'a', title: 'test' })
readHandle.get('a') → { id: 'a', title: 'test' }

// readHandle must NOT expose put, patch, or delete
// (This is a compile-time check, but runtime verification is also good)
```

### 4.2 Books are isolated by owner + name

```
stacks.book('plugin-a', 'items').put({ id: 'x', name: 'A-item' })
stacks.book('plugin-b', 'items').put({ id: 'x', name: 'B-item' })

stacks.book('plugin-a', 'items').get('x') → { id: 'x', name: 'A-item' }
stacks.book('plugin-b', 'items').get('x') → { id: 'x', name: 'B-item' }
```

Same book name under different owners must be completely independent.

### 4.3 Watch registration after writes throws

```
put({ id: 'a', name: 'Alice' })
watch('owner', 'book', handler) → throws
```

Per the spec, watch must be called during startup before any writes.

### 4.4 Large document round-trip

```
// Create a document with a large nested structure (e.g. 100KB of JSON)
put({ id: 'big', data: generateLargeNestedObject() })
get('big') → exact structural match
```

Verify no truncation or serialization limits.

### 4.5 Special characters in string values

```
put({ id: 'a', name: "O'Brien", note: 'Line1\nLine2', data: '{"json":"in a string"}' })
get('a') → exact match including quotes, newlines, embedded JSON strings
```

### 4.6 Boolean and numeric type fidelity in queries

```
put({ id: 'a', active: true, count: 0 })
put({ id: 'b', active: false, count: 1 })

find({ where: [['active', '=', true]] }) → [a] only
find({ where: [['active', '=', false]] }) → [b] only
find({ where: [['count', '=', 0]] }) → [a] only
```

This is a critical SQLite conformance test. SQLite stores booleans as integers (0/1). The backend must ensure that `true` matches `true`, not `1`, and `false` matches `false`, not `0` — or at minimum, the behavior must be consistent and documented.

### 4.7 Concurrent implicit transactions (future backends)

For SQLite with single-connection better-sqlite3 this is N/A (serialized). For async backends, verify:

```
// Two concurrent put() calls to different documents
// Both must succeed, neither must block indefinitely
Promise.all([
  book.put({ id: 'a', name: 'Alice' }),
  book.put({ id: 'b', name: 'Bob' }),
])
get('a') → exists
get('b') → exists
```

### 4.8 Empty book operations

```
// Fresh book, no documents written
get('nonexistent') → null
find({ where: [['status', '=', 'active']] }) → []
list() → []
count() → 0
```

### 4.9 Index creation is additive

```
ensureBook(ref, { indexes: ['status'] })
// Write some data
ensureBook(ref, { indexes: ['status', 'createdAt'] })
// 'status' index must still work
// 'createdAt' index must now work
// No data loss
```

### 4.10 Cascade depth limiting (if implemented per assessment recommendation)

```
// Create a self-referencing cascade handler
watch('owner', 'book', async (event) => {
  if (event.type === 'update') {
    await book.put({ ...event.entry, counter: (event.entry.counter ?? 0) + 1 })
  }
}, { failOnError: true })

put({ id: 'a', counter: 0 }) → should throw with max-depth error, not stack overflow
get('a') → null (rolled back)
```

---

## Implementation Notes

### Test harness structure

Each tier should be runnable independently. The recommended structure:

```
tests/
  conformance/
    tier1-data-integrity.test.ts
    tier2-cdc.test.ts
    tier2.5-transactions.test.ts
    tier3-queries.test.ts
    tier4-edge-cases.test.ts
  helpers/
    setup.ts          # creates a fresh StacksApi with the backend under test
    fixtures.ts       # shared test data factories
```

The `setup.ts` helper should accept a `StacksBackend` factory function, so the same suite runs against SQLite, in-memory, or any future backend:

```typescript
export function createTestSuite(backendFactory: () => StacksBackend) {
  // Each test gets a fresh backend instance
  // Books are created fresh per test
  // No state leaks between tests
}
```

### What to test at the backend level vs. the apparatus level

Most tests in this document target the `StacksApi` surface — the apparatus layer that wraps the backend. This is correct because conformance is defined at the API boundary, not the storage boundary.

However, a few tests benefit from backend-level assertions:

- **2.6 (no pre-read when no handlers registered):** Requires instrumenting the backend to verify that `put()` was called with `withPrev: false`.
- **2.23 (isolation of uncommitted writes):** Requires concurrent access, only meaningful for multi-connection backends.
- **4.9 (additive indexes):** May require inspecting backend schema state.

For these, consider a small set of backend-specific tests that supplement the conformance suite.

### CDC testing pattern

Most CDC tests follow the same pattern:

1. Set up books and seed data
2. Register watchers with event collectors
3. Perform writes
4. Assert on collected events (type, count, field values, ordering)

Extract this into a helper:

```typescript
function collectEvents<T extends BookEntry>(
  stacks: StacksApi,
  ownerId: string,
  bookName: string,
  options?: WatchOptions,
): { events: ChangeEvent<T>[], handler: ChangeHandler<T> }
```

### The coalescing table as a test matrix

§6.4's coalescing table defines exactly 8 mutation sequences. Tests 2.15–2.19 cover 5 of them. The full matrix:

| Sequence | Expected event | Covered by |
|---|---|---|
| create | `create` (final) | 2.1 |
| create → update | `create` (final) | 2.18 |
| create → update → update | `create` (final) | 2.15 |
| create → delete | no event | 2.16 |
| update | `update` (prev=pre-tx, entry=final) | 2.2 |
| update → update | `update` (prev=pre-tx, entry=final) | 2.19 |
| update → delete | `delete` (prev=pre-tx) | 2.17 |
| delete | `delete` (prev=pre-tx) | 2.4 |

All 8 rows should be explicit test cases. Add the missing `create → update` standalone test.