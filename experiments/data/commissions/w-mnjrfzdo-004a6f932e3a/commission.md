---
author: plan-writer
author_version: 2026-04-03
estimated_complexity: 5
---

# Add Relationships Between Writs

## Summary

Add typed, directional links between writs to the Clerk apparatus. A link records that one writ has a named relationship to another (e.g. "w-abc fixes w-xyz"). Links are stored in a separate Stacks book, queried bidirectionally, surfaced in `writ-show`, and removable via `writ-unlink`.

## Current State

The Clerk apparatus (`@shardworks/clerk-apparatus`) manages writs — flat work items with a status lifecycle. There are no inter-writ relationships of any kind. Each writ is an independent document.

**Key files:**

`/workspace/nexus/packages/plugins/clerk/src/types.ts` — The `WritDoc` interface:
```typescript
export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;
  status: WritStatus;
  title: string;
  body: string;
  codex?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}
```

`/workspace/nexus/packages/plugins/clerk/src/types.ts` — The `ClerkApi` interface:
```typescript
export interface ClerkApi {
  post(request: PostCommissionRequest): Promise<WritDoc>;
  show(id: string): Promise<WritDoc>;
  list(filters?: WritFilters): Promise<WritDoc[]>;
  count(filters?: WritFilters): Promise<number>;
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
}
```

`/workspace/nexus/packages/plugins/clerk/src/clerk.ts` — The apparatus factory. Declares one Stacks book (`writs`) and seven tools. The `supportKit.books` declaration:
```typescript
supportKit: {
  books: {
    writs: {
      indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
    },
  },
  tools: [commissionPost, writShow, writList, writAccept, writComplete, writFail, writCancel],
},
```

`/workspace/nexus/packages/plugins/clerk/src/tools/writ-show.ts` — Returns `clerk.show(params.id)` directly:
```typescript
handler: async (params) => {
  const clerk = guild().apparatus<ClerkApi>('clerk');
  return clerk.show(params.id);
},
```

`/workspace/nexus/packages/plugins/clerk/src/tools/index.ts` — Barrel export of all seven tools.

`/workspace/nexus/packages/plugins/clerk/src/index.ts` — Package entry point, exports types and the default plugin instance.

`/workspace/nexus/packages/plugins/clerk/src/clerk.test.ts` — ~627 lines of tests using `node:test`, `assert/strict`, and in-memory Stacks via `MemoryBackend`. Test harness creates a fake guild with `setGuild()`, starts Stacks and Clerk, and calls `memBackend.ensureBook()` for the `writs` book.

## Requirements

- R1: The Clerk must store directional links between writs in a separate Stacks book named `links`, owned by `clerk`.
- R2: Each link document must contain `id`, `sourceId`, `targetId`, `type`, and `createdAt` fields.
- R3: The link `id` must be a deterministic composite key of the form `{sourceId}:{targetId}:{type}`.
- R4: The `ClerkApi` must expose a `link(sourceId, targetId, type)` method that creates a link between two writs.
- R5: When `link()` is called, both the source and target writ IDs must be validated to exist. The method must throw if either writ is not found.
- R6: When `link()` is called with `sourceId === targetId`, the method must throw.
- R7: The `type` parameter must accept any non-empty string.
- R8: When `link()` is called with a (sourceId, targetId, type) triple that already exists, the method must return the existing link document without error (idempotent).
- R9: The `ClerkApi` must expose a `links(writId)` method that returns `{ outbound: WritLinkDoc[], inbound: WritLinkDoc[] }` — all links where the writ is the source (outbound) or the target (inbound).
- R10: The `ClerkApi` must expose an `unlink(sourceId, targetId, type)` method that removes a link. The method must be idempotent — no error if the link does not exist.
- R11: A `writ-link` tool must be created with parameters `sourceId`, `targetId`, and `type`, calling `clerk.link()`.
- R12: A `writ-unlink` tool must be created with parameters `sourceId`, `targetId`, and `type`, calling `clerk.unlink()`.
- R13: The `writ-show` tool must display both outbound and inbound links alongside the writ data. The tool handler must call `clerk.show()` and `clerk.links()` and return a composed result.
- R14: Creating or removing a link must not update the `updatedAt` timestamp on either writ.
- R15: The new types `WritLinkDoc` and `WritLinks` must be exported from the package entry point.

## Design

### Type Changes

Add to `/workspace/nexus/packages/plugins/clerk/src/types.ts`:

```typescript
/**
 * A link document as stored in The Stacks (clerk/links book).
 */
export interface WritLinkDoc {
  /** Index signature required to satisfy BookEntry constraint. */
  [key: string]: unknown;
  /** Deterministic composite key: `{sourceId}:{targetId}:{type}`. */
  id: string;
  /** The writ that is the origin of this relationship. */
  sourceId: string;
  /** The writ that is the target of this relationship. */
  targetId: string;
  /** Relationship type — an open string (e.g. "fixes", "retries", "supersedes", "duplicates"). */
  type: string;
  /** ISO timestamp when the link was created. */
  createdAt: string;
}

/**
 * Result of querying links for a writ — both directions in one response.
 */
export interface WritLinks {
  /** Links where this writ is the source (this writ → other writ). */
  outbound: WritLinkDoc[];
  /** Links where this writ is the target (other writ → this writ). */
  inbound: WritLinkDoc[];
}
```

Modify `ClerkApi` in the same file — add three methods:

```typescript
export interface ClerkApi {
  // ... existing methods unchanged ...

  /**
   * Create a typed directional link from one writ to another.
   * Both writs must exist. Self-links are rejected. Idempotent — returns
   * the existing link if the (sourceId, targetId, type) triple already exists.
   */
  link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;

  /**
   * Query all links for a writ — both outbound (this writ is the source)
   * and inbound (this writ is the target).
   */
  links(writId: string): Promise<WritLinks>;

  /**
   * Remove a link. Idempotent — no error if the link does not exist.
   */
  unlink(sourceId: string, targetId: string, type: string): Promise<void>;
}
```

### Behavior

#### Link creation (`link()`)

1. When `sourceId === targetId`, throw: `Cannot link a writ to itself: "{sourceId}".`
2. When `type` is empty (zero-length or whitespace-only after trimming), throw: `Link type must be a non-empty string.`
3. Validate source writ exists: call `writs.get(sourceId)`. If null, throw: `Writ "{sourceId}" not found.`
4. Validate target writ exists: call `writs.get(targetId)`. If null, throw: `Writ "{targetId}" not found.`
5. Construct the deterministic ID: `` `${sourceId}:${targetId}:${type}` ``
6. Check if the link already exists: call `links.get(id)`. If found, return the existing document (idempotent path).
7. Create the link document: `{ id, sourceId, targetId, type, createdAt: new Date().toISOString() }`.
8. Call `links.put(doc)`.
9. Return the created document.

Validation order matters: self-link check and type validation are cheap guards that run before any I/O.

#### Link querying (`links()`)

1. Query outbound: `links.find({ where: [['sourceId', '=', writId]] })`.
2. Query inbound: `links.find({ where: [['targetId', '=', writId]] })`.
3. Return `{ outbound, inbound }`.

No existence check on `writId` — querying links for a non-existent writ returns `{ outbound: [], inbound: [] }`. This is consistent with how `list()` returns an empty array for filters matching no writs, and avoids an unnecessary read.

#### Link removal (`unlink()`)

1. Construct the deterministic ID: `` `${sourceId}:${targetId}:${type}` ``
2. Call `links.delete(id)`.
3. Return void. Stacks `delete()` is a silent no-op if the document does not exist, so this is naturally idempotent.

No validation of writ existence on unlink — the caller may be cleaning up links to writs that have been removed from the system. No validation of type — the deterministic ID handles specificity.

#### `writ-show` tool composition

The `writ-show` tool handler changes from:
```typescript
handler: async (params) => {
  const clerk = guild().apparatus<ClerkApi>('clerk');
  return clerk.show(params.id);
},
```
to:
```typescript
handler: async (params) => {
  const clerk = guild().apparatus<ClerkApi>('clerk');
  const [writ, links] = await Promise.all([
    clerk.show(params.id),
    clerk.links(params.id),
  ]);
  return { ...writ, links };
},
```

The `links` key is added to the returned object alongside the writ fields. This is the tool's composed view — `clerk.show()` itself remains pure and returns only `WritDoc`.

The `show()` API method is unchanged — it still throws if the writ is not found, and the parallel `links()` call for a non-existent writ would return empty arrays. But since `show()` throws first, the error propagation is correct.

#### Book declaration

The Clerk's `supportKit.books` adds a second book:

```typescript
books: {
  writs: {
    indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
  },
  links: {
    indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']],
  },
},
```

Indexes on `sourceId` and `targetId` enable efficient bidirectional queries. Compound indexes `['sourceId', 'type']` and `['targetId', 'type']` support filtered queries if needed in the future.

#### Book handle initialization

In `createClerk()`, the `links` book handle must be initialized alongside `writs`:

```typescript
let writs: Book<WritDoc>;
let links: Book<WritLinkDoc>;

// in start():
start(_ctx: StartupContext): void {
  const stacks = guild().apparatus<StacksApi>('stacks');
  writs = stacks.book<WritDoc>('clerk', 'writs');
  links = stacks.book<WritLinkDoc>('clerk', 'links');
},
```

#### Tools

**`writ-link`** tool:
- Name: `writ-link`
- Description: `Link two writs with a typed relationship`
- Instructions: `Creates a directional link from source writ to target writ. The type describes the relationship (e.g. "fixes", "retries", "supersedes", "duplicates"). Idempotent — creating the same link twice returns the existing link.`
- Params: `sourceId: z.string()`, `targetId: z.string()`, `type: z.string()`
- Permission: `clerk:write`
- Handler calls `clerk.link(params.sourceId, params.targetId, params.type)`

**`writ-unlink`** tool:
- Name: `writ-unlink`
- Description: `Remove a link between two writs`
- Instructions: `Removes the directional link of the given type from source to target. Idempotent — no error if the link does not exist.`
- Params: `sourceId: z.string()`, `targetId: z.string()`, `type: z.string()`
- Permission: `clerk:write`
- Handler calls `clerk.unlink(params.sourceId, params.targetId, params.type)` and returns `{ ok: true }`

### Non-obvious Touchpoints

- **`src/tools/index.ts`** — The barrel export must add `writLink` and `writUnlink` entries, following the existing pattern (`export { default as writLink } from './writ-link.ts'`).
- **`src/index.ts`** — The package entry point must add `type WritLinkDoc` and `type WritLinks` to its type exports.
- **`src/clerk.ts` tool registration** — The `supportKit.tools` array must include the two new tool imports.
- **`src/clerk.test.ts` test harness** — The `setup()` function must call `memBackend.ensureBook({ ownerId: 'clerk', book: 'links' }, { indexes: [...] })` alongside the existing `ensureBook` call for `writs`. Without this, the links book won't exist in the test environment.

### Dependencies

None. The existing Stacks Book API provides all required storage operations. No new framework capabilities are needed.

## Validation Checklist

- V1 [R1, R2, R3]: Create a link via the API. Read it back from `links.get('{sourceId}:{targetId}:{type}')`. Verify all fields (`id`, `sourceId`, `targetId`, `type`, `createdAt`) are present and correctly shaped. Verify the ID matches the deterministic format.
- V2 [R4, R5]: Call `link()` with a non-existent sourceId — verify it throws with "not found". Call with a non-existent targetId — same check. Call with two valid writ IDs — verify it returns a `WritLinkDoc`.
- V3 [R6]: Call `link(id, id, 'fixes')` where both arguments are the same writ ID. Verify it throws with "Cannot link a writ to itself".
- V4 [R7]: Call `link()` with type `'my-custom-type'` — verify it succeeds. Call with an empty string `''` — verify it throws. Call with a whitespace-only string `'  '` — verify it throws.
- V5 [R8]: Call `link(a, b, 'fixes')` twice with the same arguments. Verify both calls return a `WritLinkDoc` with the same `id` and `createdAt`. Verify only one document exists in the links book.
- V6 [R9]: Create links `a→b (fixes)`, `a→c (retries)`, `d→a (supersedes)`. Call `links(a)`. Verify `outbound` contains the first two links and `inbound` contains the third.
- V7 [R9]: Call `links('w-nonexistent')`. Verify it returns `{ outbound: [], inbound: [] }` without throwing.
- V8 [R10]: Call `unlink(a, b, 'fixes')` for an existing link. Verify `links.get('{a}:{b}:fixes')` returns null afterward. Call `unlink(a, b, 'fixes')` again — verify no error (idempotent).
- V9 [R10]: Call `unlink()` for a link that never existed. Verify no error.
- V10 [R11]: Verify a tool named `writ-link` exists in the Clerk's `supportKit.tools` array with `permission: 'clerk:write'` and params `sourceId`, `targetId`, `type`.
- V11 [R12]: Verify a tool named `writ-unlink` exists in the Clerk's `supportKit.tools` array with `permission: 'clerk:write'` and params `sourceId`, `targetId`, `type`.
- V12 [R13]: Call the `writ-show` tool handler. Verify the returned object contains both the writ fields (`id`, `title`, `status`, etc.) and a `links` key with `outbound` and `inbound` arrays.
- V13 [R14]: Record `updatedAt` for two writs before linking. Call `link()`. Re-read both writs via `show()`. Verify `updatedAt` has not changed on either.
- V14 [R15]: Verify that `WritLinkDoc` and `WritLinks` are exported from `src/index.ts` (can be checked by grep or by importing in a test).

## Test Cases

### link() — happy path
- Create two writs. Call `link(w1.id, w2.id, 'fixes')`. Expect a `WritLinkDoc` with `sourceId === w1.id`, `targetId === w2.id`, `type === 'fixes'`, a valid ISO `createdAt`, and `id === '{w1.id}:{w2.id}:fixes'`.

### link() — idempotent duplicate
- Create two writs. Call `link(w1.id, w2.id, 'fixes')` twice. Expect both calls to return the same `id` and `createdAt`. Count documents in links book with `sourceId === w1.id` — expect 1.

### link() — self-link rejected
- Create one writ. Call `link(w.id, w.id, 'fixes')`. Expect error matching `/Cannot link a writ to itself/`.

### link() — non-existent source
- Call `link('w-ghost', w2.id, 'fixes')` where `w-ghost` does not exist. Expect error matching `/not found/`.

### link() — non-existent target
- Call `link(w1.id, 'w-ghost', 'fixes')` where `w-ghost` does not exist. Expect error matching `/not found/`.

### link() — empty type rejected
- Create two writs. Call `link(w1.id, w2.id, '')`. Expect error matching `/non-empty/`.

### link() — whitespace-only type rejected
- Create two writs. Call `link(w1.id, w2.id, '   ')`. Expect error matching `/non-empty/`.

### link() — various type strings accepted
- Create two writs. Call `link(w1.id, w2.id, 'fixes')`, then `link(w1.id, w2.id, 'retries')`. Both succeed. Call `links(w1.id)` — expect two outbound links with different types.

### link() — multiple links between same writs with different types
- Create two writs. Link `w1→w2` with type `'fixes'` and `w1→w2` with type `'supersedes'`. Both succeed as separate links (different deterministic IDs). `links(w1.id).outbound` has length 2.

### link() — multiple targets from one source
- Create writs w1, w2, w3. Link `w1→w2 (fixes)` and `w1→w3 (retries)`. `links(w1.id).outbound` has length 2. `links(w2.id).inbound` has length 1. `links(w3.id).inbound` has length 1.

### links() — both directions
- Create writs w1, w2, w3. Link `w1→w2 (fixes)`, `w3→w1 (supersedes)`. Call `links(w1.id)`. Expect `outbound` contains the `w1→w2` link; `inbound` contains the `w3→w1` link.

### links() — writ with no links
- Create a writ. Call `links(w.id)`. Expect `{ outbound: [], inbound: [] }`.

### links() — non-existent writ ID
- Call `links('w-doesnotexist')`. Expect `{ outbound: [], inbound: [] }` — no error.

### unlink() — removes existing link
- Create two writs and a link. Call `unlink(w1.id, w2.id, 'fixes')`. Call `links(w1.id)` — expect empty outbound.

### unlink() — idempotent on non-existent link
- Create two writs (no link). Call `unlink(w1.id, w2.id, 'fixes')`. Expect no error.

### unlink() — does not affect other links
- Create writs w1, w2. Link `w1→w2` with types `'fixes'` and `'retries'`. Call `unlink(w1.id, w2.id, 'fixes')`. Call `links(w1.id)` — expect one outbound link with type `'retries'`.

### unlink() — does not update writ timestamps
- Create two writs and a link. Record `updatedAt` on both writs. Call `unlink()`. Re-read both writs — `updatedAt` unchanged.

### link() — does not update writ timestamps
- Create two writs. Record `updatedAt` on both. Call `link()`. Re-read both writs — `updatedAt` unchanged.

### writ-show tool — includes links in output
- Create two writs. Link `w1→w2 (fixes)`. Call `writ-show` tool handler with `w1.id`. Expect returned object has all writ fields AND a `links` key with `outbound` containing one link and `inbound` being empty.

### writ-show tool — writ with no links has empty arrays
- Create a writ. Call `writ-show` tool handler. Expect `links.outbound` and `links.inbound` are both empty arrays.