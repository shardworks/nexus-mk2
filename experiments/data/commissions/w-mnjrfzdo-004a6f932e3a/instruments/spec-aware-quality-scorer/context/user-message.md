## Commission Spec

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

## Referenced Files (from spec, pre-commission state)



## Commission Diff

```
 packages/plugins/clerk/src/clerk.test.ts        | 272 +++++++++++++++++++++++-
 packages/plugins/clerk/src/clerk.ts             |  58 +++++
 packages/plugins/clerk/src/index.ts             |   2 +
 packages/plugins/clerk/src/tools/index.ts       |   2 +
 packages/plugins/clerk/src/tools/writ-link.ts   |  23 ++
 packages/plugins/clerk/src/tools/writ-show.ts   |   6 +-
 packages/plugins/clerk/src/tools/writ-unlink.ts |  23 ++
 packages/plugins/clerk/src/types.ts             |  48 +++++
 8 files changed, 432 insertions(+), 2 deletions(-)

diff --git a/packages/plugins/clerk/src/clerk.test.ts b/packages/plugins/clerk/src/clerk.test.ts
index 5486b02..897c05b 100644
--- a/packages/plugins/clerk/src/clerk.test.ts
+++ b/packages/plugins/clerk/src/clerk.test.ts
@@ -15,7 +15,7 @@ import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
 import type { StacksApi } from '@shardworks/stacks-apparatus';
 
 import { createClerk } from './clerk.ts';
-import type { ClerkApi, ClerkConfig } from './types.ts';
+import type { ClerkApi, ClerkConfig, WritLinkDoc } from './types.ts';
 
 // ── Test harness ─────────────────────────────────────────────────────
 
@@ -68,6 +68,9 @@ function setup(options: SetupOptions = {}) {
   memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
     indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
   });
+  memBackend.ensureBook({ ownerId: 'clerk', book: 'links' }, {
+    indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']],
+  });
 
   // Start clerk
   const clerkApparatus = (clerkPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
@@ -575,6 +578,273 @@ describe('Clerk', () => {
     });
   });
 
+  // ── link() ──────────────────────────────────────────────────────
+
+  describe('link()', () => {
+    beforeEach(() => { setup(); });
+
+    it('creates a link between two writs and returns a WritLinkDoc', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+
+      const link = await clerk.link(w1.id, w2.id, 'fixes');
+
+      assert.equal(link.sourceId, w1.id);
+      assert.equal(link.targetId, w2.id);
+      assert.equal(link.type, 'fixes');
+      assert.equal(link.id, `${w1.id}:${w2.id}:fixes`);
+      assert.ok(link.createdAt);
+    });
+
+    it('is idempotent — calling twice returns the same link', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+
+      const first = await clerk.link(w1.id, w2.id, 'fixes');
+      const second = await clerk.link(w1.id, w2.id, 'fixes');
+
+      assert.equal(first.id, second.id);
+      assert.equal(first.createdAt, second.createdAt);
+
+      // Only one document should exist
+      const result = await clerk.links(w1.id);
+      assert.equal(result.outbound.length, 1);
+    });
+
+    it('throws for self-link', async () => {
+      const w = await clerk.post({ title: 'Solo', body: 'Body' });
+      await assert.rejects(
+        () => clerk.link(w.id, w.id, 'fixes'),
+        /Cannot link a writ to itself/,
+      );
+    });
+
+    it('throws when source writ does not exist', async () => {
+      const w2 = await clerk.post({ title: 'Target', body: 'Body' });
+      await assert.rejects(
+        () => clerk.link('w-ghost', w2.id, 'fixes'),
+        /not found/,
+      );
+    });
+
+    it('throws when target writ does not exist', async () => {
+      const w1 = await clerk.post({ title: 'Source', body: 'Body' });
+      await assert.rejects(
+        () => clerk.link(w1.id, 'w-ghost', 'fixes'),
+        /not found/,
+      );
+    });
+
+    it('throws for empty type string', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      await assert.rejects(
+        () => clerk.link(w1.id, w2.id, ''),
+        /non-empty/,
+      );
+    });
+
+    it('throws for whitespace-only type string', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      await assert.rejects(
+        () => clerk.link(w1.id, w2.id, '   '),
+        /non-empty/,
+      );
+    });
+
+    it('accepts various non-empty type strings', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+
+      const l1 = await clerk.link(w1.id, w2.id, 'fixes');
+      const l2 = await clerk.link(w1.id, w2.id, 'retries');
+
+      assert.equal(l1.type, 'fixes');
+      assert.equal(l2.type, 'retries');
+
+      const result = await clerk.links(w1.id);
+      assert.equal(result.outbound.length, 2);
+    });
+
+    it('creates separate links for same pair with different types', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+
+      await clerk.link(w1.id, w2.id, 'fixes');
+      await clerk.link(w1.id, w2.id, 'supersedes');
+
+      const result = await clerk.links(w1.id);
+      assert.equal(result.outbound.length, 2);
+    });
+
+    it('creates links to multiple targets', async () => {
+      const w1 = await clerk.post({ title: 'Source', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Target 2', body: 'Body' });
+      const w3 = await clerk.post({ title: 'Target 3', body: 'Body' });
+
+      await clerk.link(w1.id, w2.id, 'fixes');
+      await clerk.link(w1.id, w3.id, 'retries');
+
+      const r1 = await clerk.links(w1.id);
+      assert.equal(r1.outbound.length, 2);
+
+      const r2 = await clerk.links(w2.id);
+      assert.equal(r2.inbound.length, 1);
+
+      const r3 = await clerk.links(w3.id);
+      assert.equal(r3.inbound.length, 1);
+    });
+
+    it('does not update writ timestamps when linking', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      const before1 = w1.updatedAt;
+      const before2 = w2.updatedAt;
+
+      await clerk.link(w1.id, w2.id, 'fixes');
+
+      const after1 = await clerk.show(w1.id);
+      const after2 = await clerk.show(w2.id);
+      assert.equal(after1.updatedAt, before1);
+      assert.equal(after2.updatedAt, before2);
+    });
+  });
+
+  // ── links() ──────────────────────────────────────────────────────
+
+  describe('links()', () => {
+    beforeEach(() => { setup(); });
+
+    it('returns outbound and inbound links', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      const w3 = await clerk.post({ title: 'Writ 3', body: 'Body' });
+
+      await clerk.link(w1.id, w2.id, 'fixes');
+      await clerk.link(w3.id, w1.id, 'supersedes');
+
+      const result = await clerk.links(w1.id);
+      assert.equal(result.outbound.length, 1);
+      assert.equal(result.outbound[0]!.targetId, w2.id);
+      assert.equal(result.inbound.length, 1);
+      assert.equal(result.inbound[0]!.sourceId, w3.id);
+    });
+
+    it('returns empty arrays for a writ with no links', async () => {
+      const w = await clerk.post({ title: 'Lonely writ', body: 'Body' });
+      const result = await clerk.links(w.id);
+      assert.deepEqual(result, { outbound: [], inbound: [] });
+    });
+
+    it('returns empty arrays for a non-existent writ id', async () => {
+      const result = await clerk.links('w-doesnotexist');
+      assert.deepEqual(result, { outbound: [], inbound: [] });
+    });
+  });
+
+  // ── unlink() ─────────────────────────────────────────────────────
+
+  describe('unlink()', () => {
+    beforeEach(() => { setup(); });
+
+    it('removes an existing link', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      await clerk.link(w1.id, w2.id, 'fixes');
+
+      await clerk.unlink(w1.id, w2.id, 'fixes');
+
+      const result = await clerk.links(w1.id);
+      assert.equal(result.outbound.length, 0);
+    });
+
+    it('is idempotent — no error when link does not exist', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+
+      // No error — link was never created
+      await clerk.unlink(w1.id, w2.id, 'fixes');
+    });
+
+    it('is idempotent — no error when called twice', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      await clerk.link(w1.id, w2.id, 'fixes');
+
+      await clerk.unlink(w1.id, w2.id, 'fixes');
+      await clerk.unlink(w1.id, w2.id, 'fixes'); // second call — no error
+    });
+
+    it('does not affect other links', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      await clerk.link(w1.id, w2.id, 'fixes');
+      await clerk.link(w1.id, w2.id, 'retries');
+
+      await clerk.unlink(w1.id, w2.id, 'fixes');
+
+      const result = await clerk.links(w1.id);
+      assert.equal(result.outbound.length, 1);
+      assert.equal(result.outbound[0]!.type, 'retries');
+    });
+
+    it('does not update writ timestamps when unlinking', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      await clerk.link(w1.id, w2.id, 'fixes');
+      const before1 = (await clerk.show(w1.id)).updatedAt;
+      const before2 = (await clerk.show(w2.id)).updatedAt;
+
+      await clerk.unlink(w1.id, w2.id, 'fixes');
+
+      const after1 = await clerk.show(w1.id);
+      const after2 = await clerk.show(w2.id);
+      assert.equal(after1.updatedAt, before1);
+      assert.equal(after2.updatedAt, before2);
+    });
+  });
+
+  // ── writ-show tool with links ─────────────────────────────────────
+
+  describe('writ-show tool — includes links', () => {
+    beforeEach(() => { setup(); });
+
+    it('includes links key with outbound and inbound arrays', async () => {
+      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
+      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
+      await clerk.link(w1.id, w2.id, 'fixes');
+
+      // Call clerk.show() and clerk.links() like the tool handler does
+      const [writ, links] = await Promise.all([
+        clerk.show(w1.id),
+        clerk.links(w1.id),
+      ]);
+      const result = { ...writ, links };
+
+      assert.equal(result.id, w1.id);
+      assert.equal(result.title, 'Writ 1');
+      assert.ok(Array.isArray(result.links.outbound));
+      assert.ok(Array.isArray(result.links.inbound));
+      assert.equal(result.links.outbound.length, 1);
+      assert.equal(result.links.inbound.length, 0);
+      assert.equal((result.links.outbound[0] as WritLinkDoc).targetId, w2.id);
+    });
+
+    it('returns empty link arrays for a writ with no links', async () => {
+      const w = await clerk.post({ title: 'Solo', body: 'Body' });
+
+      const [writ, links] = await Promise.all([
+        clerk.show(w.id),
+        clerk.links(w.id),
+      ]);
+      const result = { ...writ, links };
+
+      assert.deepEqual(result.links.outbound, []);
+      assert.deepEqual(result.links.inbound, []);
+    });
+  });
+
   // ── Config validation ────────────────────────────────────────────
 
   describe('config: writTypes validation', () => {
diff --git a/packages/plugins/clerk/src/clerk.ts b/packages/plugins/clerk/src/clerk.ts
index 933d79b..1675f2a 100644
--- a/packages/plugins/clerk/src/clerk.ts
+++ b/packages/plugins/clerk/src/clerk.ts
@@ -20,6 +20,8 @@ import type {
   ClerkApi,
   ClerkConfig,
   WritDoc,
+  WritLinkDoc,
+  WritLinks,
   WritStatus,
   PostCommissionRequest,
   WritFilters,
@@ -33,6 +35,8 @@ import {
   writComplete,
   writFail,
   writCancel,
+  writLink,
+  writUnlink,
 } from './tools/index.ts';
 
 // ── Built-in writ types ──────────────────────────────────────────────
@@ -55,6 +59,7 @@ const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled
 
 export function createClerk(): Plugin {
   let writs: Book<WritDoc>;
+  let links: Book<WritLinkDoc>;
 
   // ── Helpers ──────────────────────────────────────────────────────
 
@@ -139,6 +144,53 @@ export function createClerk(): Plugin {
       return writs.count(where);
     },
 
+    async link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc> {
+      if (sourceId === targetId) {
+        throw new Error(`Cannot link a writ to itself: "${sourceId}".`);
+      }
+      if (!type || !type.trim()) {
+        throw new Error('Link type must be a non-empty string.');
+      }
+
+      const source = await writs.get(sourceId);
+      if (!source) {
+        throw new Error(`Writ "${sourceId}" not found.`);
+      }
+      const target = await writs.get(targetId);
+      if (!target) {
+        throw new Error(`Writ "${targetId}" not found.`);
+      }
+
+      const id = `${sourceId}:${targetId}:${type}`;
+      const existing = await links.get(id);
+      if (existing) {
+        return existing;
+      }
+
+      const doc: WritLinkDoc = {
+        id,
+        sourceId,
+        targetId,
+        type,
+        createdAt: new Date().toISOString(),
+      };
+      await links.put(doc);
+      return doc;
+    },
+
+    async links(writId: string): Promise<WritLinks> {
+      const [outbound, inbound] = await Promise.all([
+        links.find({ where: [['sourceId', '=', writId]] }),
+        links.find({ where: [['targetId', '=', writId]] }),
+      ]);
+      return { outbound, inbound };
+    },
+
+    async unlink(sourceId: string, targetId: string, type: string): Promise<void> {
+      const id = `${sourceId}:${targetId}:${type}`;
+      await links.delete(id);
+    },
+
     async transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc> {
       const writ = await writs.get(id);
       if (!writ) {
@@ -183,6 +235,9 @@ export function createClerk(): Plugin {
           writs: {
             indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
           },
+          links: {
+            indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']],
+          },
         },
         tools: [
           commissionPost,
@@ -192,6 +247,8 @@ export function createClerk(): Plugin {
           writComplete,
           writFail,
           writCancel,
+          writLink,
+          writUnlink,
         ],
       },
 
@@ -200,6 +257,7 @@ export function createClerk(): Plugin {
       start(_ctx: StartupContext): void {
         const stacks = guild().apparatus<StacksApi>('stacks');
         writs = stacks.book<WritDoc>('clerk', 'writs');
+        links = stacks.book<WritLinkDoc>('clerk', 'links');
       },
     },
   };
diff --git a/packages/plugins/clerk/src/index.ts b/packages/plugins/clerk/src/index.ts
index 34b02a5..f5bb000 100644
--- a/packages/plugins/clerk/src/index.ts
+++ b/packages/plugins/clerk/src/index.ts
@@ -17,6 +17,8 @@ export {
   type ClerkConfig,
   type WritTypeEntry,
   type WritDoc,
+  type WritLinkDoc,
+  type WritLinks,
   type WritStatus,
   type PostCommissionRequest,
   type WritFilters,
diff --git a/packages/plugins/clerk/src/tools/index.ts b/packages/plugins/clerk/src/tools/index.ts
index 9b8e641..56ee7b3 100644
--- a/packages/plugins/clerk/src/tools/index.ts
+++ b/packages/plugins/clerk/src/tools/index.ts
@@ -5,3 +5,5 @@ export { default as writAccept } from './writ-accept.ts';
 export { default as writComplete } from './writ-complete.ts';
 export { default as writFail } from './writ-fail.ts';
 export { default as writCancel } from './writ-cancel.ts';
+export { default as writLink } from './writ-link.ts';
+export { default as writUnlink } from './writ-unlink.ts';
diff --git a/packages/plugins/clerk/src/tools/writ-link.ts b/packages/plugins/clerk/src/tools/writ-link.ts
new file mode 100644
index 0000000..2528ef8
--- /dev/null
+++ b/packages/plugins/clerk/src/tools/writ-link.ts
@@ -0,0 +1,23 @@
+import { z } from 'zod';
+import { guild } from '@shardworks/nexus-core';
+import { tool } from '@shardworks/tools-apparatus';
+import type { ClerkApi } from '../types.ts';
+
+export default tool({
+  name: 'writ-link',
+  description: 'Link two writs with a typed relationship',
+  instructions:
+    'Creates a directional link from source writ to target writ. ' +
+    'The type describes the relationship (e.g. "fixes", "retries", "supersedes", "duplicates"). ' +
+    'Idempotent — creating the same link twice returns the existing link.',
+  params: {
+    sourceId: z.string().describe('The writ that is the origin of this relationship'),
+    targetId: z.string().describe('The writ that is the target of this relationship'),
+    type: z.string().describe('Relationship type (e.g. "fixes", "retries", "supersedes", "duplicates")'),
+  },
+  permission: 'clerk:write',
+  handler: async (params) => {
+    const clerk = guild().apparatus<ClerkApi>('clerk');
+    return clerk.link(params.sourceId, params.targetId, params.type);
+  },
+});
diff --git a/packages/plugins/clerk/src/tools/writ-show.ts b/packages/plugins/clerk/src/tools/writ-show.ts
index 4a66c23..595e78a 100644
--- a/packages/plugins/clerk/src/tools/writ-show.ts
+++ b/packages/plugins/clerk/src/tools/writ-show.ts
@@ -13,6 +13,10 @@ export default tool({
   permission: 'clerk:read',
   handler: async (params) => {
     const clerk = guild().apparatus<ClerkApi>('clerk');
-    return clerk.show(params.id);
+    const [writ, links] = await Promise.all([
+      clerk.show(params.id),
+      clerk.links(params.id),
+    ]);
+    return { ...writ, links };
   },
 });
diff --git a/packages/plugins/clerk/src/tools/writ-unlink.ts b/packages/plugins/clerk/src/tools/writ-unlink.ts
new file mode 100644
index 0000000..d718e73
--- /dev/null
+++ b/packages/plugins/clerk/src/tools/writ-unlink.ts
@@ -0,0 +1,23 @@
+import { z } from 'zod';
+import { guild } from '@shardworks/nexus-core';
+import { tool } from '@shardworks/tools-apparatus';
+import type { ClerkApi } from '../types.ts';
+
+export default tool({
+  name: 'writ-unlink',
+  description: 'Remove a link between two writs',
+  instructions:
+    'Removes the directional link of the given type from source to target. ' +
+    'Idempotent — no error if the link does not exist.',
+  params: {
+    sourceId: z.string().describe('The writ that is the origin of the relationship'),
+    targetId: z.string().describe('The writ that is the target of the relationship'),
+    type: z.string().describe('Relationship type to remove'),
+  },
+  permission: 'clerk:write',
+  handler: async (params) => {
+    const clerk = guild().apparatus<ClerkApi>('clerk');
+    await clerk.unlink(params.sourceId, params.targetId, params.type);
+    return { ok: true };
+  },
+});
diff --git a/packages/plugins/clerk/src/types.ts b/packages/plugins/clerk/src/types.ts
index cbb8a41..222655f 100644
--- a/packages/plugins/clerk/src/types.ts
+++ b/packages/plugins/clerk/src/types.ts
@@ -116,6 +116,36 @@ declare module '@shardworks/nexus-core' {
   }
 }
 
+// ── Link documents ───────────────────────────────────────────────────
+
+/**
+ * A link document as stored in The Stacks (clerk/links book).
+ */
+export interface WritLinkDoc {
+  /** Index signature required to satisfy BookEntry constraint. */
+  [key: string]: unknown;
+  /** Deterministic composite key: `{sourceId}:{targetId}:{type}`. */
+  id: string;
+  /** The writ that is the origin of this relationship. */
+  sourceId: string;
+  /** The writ that is the target of this relationship. */
+  targetId: string;
+  /** Relationship type — an open string (e.g. "fixes", "retries", "supersedes", "duplicates"). */
+  type: string;
+  /** ISO timestamp when the link was created. */
+  createdAt: string;
+}
+
+/**
+ * Result of querying links for a writ — both directions in one response.
+ */
+export interface WritLinks {
+  /** Links where this writ is the source (this writ → other writ). */
+  outbound: WritLinkDoc[];
+  /** Links where this writ is the target (other writ → this writ). */
+  inbound: WritLinkDoc[];
+}
+
 // ── API ──────────────────────────────────────────────────────────────
 
 /**
@@ -148,4 +178,22 @@ export interface ClerkApi {
    * Validates that the transition is legal.
    */
   transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
+
+  /**
+   * Create a typed directional link from one writ to another.
+   * Both writs must exist. Self-links are rejected. Idempotent — returns
+   * the existing link if the (sourceId, targetId, type) triple already exists.
+   */
+  link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;
+
+  /**
+   * Query all links for a writ — both outbound (this writ is the source)
+   * and inbound (this writ is the target).
+   */
+  links(writId: string): Promise<WritLinks>;
+
+  /**
+   * Remove a link. Idempotent — no error if the link does not exist.
+   */
+  unlink(sourceId: string, targetId: string, type: string): Promise<void>;
 }

```

## Full File Contents (for context)

=== FILE: packages/plugins/clerk/src/clerk.test.ts ===
/**
 * Clerk apparatus tests.
 *
 * Uses in-memory Stacks and a minimal fake guild to test the full writ
 * lifecycle without any external dependencies.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild, GuildConfig } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createClerk } from './clerk.ts';
import type { ClerkApi, ClerkConfig, WritLinkDoc } from './types.ts';

// ── Test harness ─────────────────────────────────────────────────────

let clerk: ClerkApi;

interface SetupOptions {
  clerkConfig?: ClerkConfig;
}

function setup(options: SetupOptions = {}) {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const clerkPlugin = createClerk();

  const apparatusMap = new Map<string, unknown>();

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    settings: { model: 'sonnet' },
    clerk: options.clerkConfig,
  };

  const fakeGuild: Guild = {
    home: '/tmp/fake-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not installed`);
      return api as T;
    },
    config<T>(_pluginId: string): T {
      return {} as T;
    },
    writeConfig() { /* noop */ },
    guildConfig() { return fakeGuildConfig; },
    kits: () => [],
    apparatuses: () => [],
  };

  setGuild(fakeGuild);

  // Start stacks
  const stacksApparatus = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  stacksApparatus.start({ on: () => {} });
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Ensure books exist
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
  });
  memBackend.ensureBook({ ownerId: 'clerk', book: 'links' }, {
    indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']],
  });

  // Start clerk
  const clerkApparatus = (clerkPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  clerkApparatus.start({ on: () => {} });
  clerk = clerkApparatus.provides as ClerkApi;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Clerk', () => {
  afterEach(() => {
    clearGuild();
  });

  // ── post() ───────────────────────────────────────────────────────

  describe('post()', () => {
    beforeEach(() => { setup(); });

    it('creates a writ with ready status and mandate type by default', async () => {
      const writ = await clerk.post({ title: 'Fix the bug', body: 'Details here' });

      assert.ok(writ.id.startsWith('w-'));
      assert.equal(writ.type, 'mandate');
      assert.equal(writ.title, 'Fix the bug');
      assert.equal(writ.body, 'Details here');
      assert.equal(writ.status, 'ready');
      assert.ok(writ.createdAt);
      assert.ok(writ.updatedAt);
      assert.equal(writ.acceptedAt, undefined);
      assert.equal(writ.resolvedAt, undefined);
      assert.equal(writ.resolution, undefined);
      assert.equal(writ.codex, undefined);
    });

    it('requires body field', async () => {
      // TypeScript enforces this at compile time; at runtime the field is required
      const writ = await clerk.post({ title: 'Has body', body: 'Required content' });
      assert.equal(writ.body, 'Required content');
    });

    it('accepts explicit type when it is a built-in type', async () => {
      const writ = await clerk.post({ title: 'A mandate', body: 'Do it', type: 'mandate' });
      assert.equal(writ.type, 'mandate');
    });

    it('persists codex field', async () => {
      const writ = await clerk.post({
        title: 'Do the thing',
        body: 'Detailed instructions here',
        codex: 'artificer',
      });

      assert.equal(writ.codex, 'artificer');
    });

    it('omits codex when not provided', async () => {
      const writ = await clerk.post({ title: 'No codex', body: 'Details' });
      assert.equal(writ.codex, undefined);
    });

    it('uses guild defaultType from clerk config when provided', async () => {
      // mandate is a built-in, so it's always valid as a defaultType
      setup({ clerkConfig: { defaultType: 'mandate' } });
      const writ = await clerk.post({ title: 'Default mandate', body: 'Body' });
      assert.equal(writ.type, 'mandate');
    });

    it('rejects an unknown writ type', async () => {
      await assert.rejects(
        () => clerk.post({ title: 'Test', body: 'Body', type: 'unknown-type' }),
        /Unknown writ type/,
      );
    });

    it('accepts a type declared in clerk writTypes config', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
      const writ = await clerk.post({ title: 'Run errand', body: 'Do it', type: 'errand' });
      assert.equal(writ.type, 'errand');
    });

    it('rejects a type that is not in clerk writTypes', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
      await assert.rejects(
        () => clerk.post({ title: 'Test', body: 'Body', type: 'quest' }),
        /Unknown writ type/,
      );
    });

    it('generates unique ids for each writ', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      assert.notEqual(w1.id, w2.id);
    });

    it('sets createdAt and updatedAt to the same value on creation', async () => {
      const writ = await clerk.post({ title: 'Timestamps', body: 'Body' });
      assert.equal(writ.createdAt, writ.updatedAt);
    });
  });

  // ── show() ───────────────────────────────────────────────────────

  describe('show()', () => {
    beforeEach(() => { setup(); });

    it('throws for a non-existent writ id', async () => {
      await assert.rejects(
        () => clerk.show('w-doesnotexist'),
        /not found/,
      );
    });

    it('retrieves a writ that was just posted', async () => {
      const posted = await clerk.post({ title: 'Show me', body: 'Body' });
      const fetched = await clerk.show(posted.id);

      assert.equal(fetched.id, posted.id);
      assert.equal(fetched.title, 'Show me');
      assert.equal(fetched.status, 'ready');
    });
  });

  // ── list() ───────────────────────────────────────────────────────

  describe('list()', () => {
    beforeEach(() => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
    });

    it('returns all writs when no filters given', async () => {
      await clerk.post({ title: 'Writ A', body: 'Body' });
      await clerk.post({ title: 'Writ B', body: 'Body' });
      await clerk.post({ title: 'Writ C', body: 'Body' });

      const all = await clerk.list();
      assert.equal(all.length, 3);
    });

    it('filters by status', async () => {
      const w1 = await clerk.post({ title: 'Ready writ', body: 'Body' });
      const w2 = await clerk.post({ title: 'Active writ', body: 'Body' });
      await clerk.transition(w2.id, 'active');

      const ready = await clerk.list({ status: 'ready' });
      const active = await clerk.list({ status: 'active' });

      assert.equal(ready.length, 1);
      assert.equal(ready[0]!.id, w1.id);
      assert.equal(active.length, 1);
      assert.equal(active[0]!.id, w2.id);
    });

    it('filters by type', async () => {
      await clerk.post({ title: 'Mandate writ', body: 'Body', type: 'mandate' });
      await clerk.post({ title: 'Errand writ', body: 'Body', type: 'errand' });

      const mandates = await clerk.list({ type: 'mandate' });
      const errands = await clerk.list({ type: 'errand' });

      assert.equal(mandates.length, 1);
      assert.equal(mandates[0]!.type, 'mandate');
      assert.equal(errands.length, 1);
      assert.equal(errands[0]!.type, 'errand');
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await clerk.post({ title: `Writ ${i}`, body: 'Body' });
      }

      const limited = await clerk.list({ limit: 3 });
      assert.equal(limited.length, 3);
    });

    it('respects the offset parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await clerk.post({ title: `Writ ${i}`, body: 'Body' });
      }

      const all = await clerk.list();
      const offset = await clerk.list({ offset: 2 });
      assert.equal(offset.length, 3);
      assert.equal(offset[0]!.id, all[2]!.id);
    });

    it('returns an empty array when no writs match filters', async () => {
      await clerk.post({ title: 'One ready writ', body: 'Body' });
      const completed = await clerk.list({ status: 'completed' });
      assert.equal(completed.length, 0);
    });
  });

  // ── count() ──────────────────────────────────────────────────────

  describe('count()', () => {
    beforeEach(() => { setup(); });

    it('returns total count with no filters', async () => {
      await clerk.post({ title: 'Writ A', body: 'Body' });
      await clerk.post({ title: 'Writ B', body: 'Body' });
      assert.equal(await clerk.count(), 2);
    });

    it('returns 0 when no writs exist', async () => {
      assert.equal(await clerk.count(), 0);
    });

    it('filters by status', async () => {
      const w = await clerk.post({ title: 'Writ', body: 'Body' });
      await clerk.transition(w.id, 'active');

      assert.equal(await clerk.count({ status: 'active' }), 1);
      assert.equal(await clerk.count({ status: 'ready' }), 0);
    });

    it('filters by type', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
      await clerk.post({ title: 'Mandate', body: 'Body', type: 'mandate' });
      await clerk.post({ title: 'Errand', body: 'Body', type: 'errand' });

      assert.equal(await clerk.count({ type: 'mandate' }), 1);
      assert.equal(await clerk.count({ type: 'errand' }), 1);
    });
  });

  // ── transition() — ready → active ───────────────────────────────

  describe('transition() to active', () => {
    beforeEach(() => { setup(); });

    it('transitions a ready writ to active', async () => {
      const writ = await clerk.post({ title: 'Accept me', body: 'Body' });
      const updated = await clerk.transition(writ.id, 'active');

      assert.equal(updated.status, 'active');
      assert.ok(updated.acceptedAt);
      assert.equal(updated.resolvedAt, undefined);
    });

    it('sets updatedAt on transition', async () => {
      const writ = await clerk.post({ title: 'Timestamps', body: 'Body' });
      // Ensure a tiny gap so updatedAt can differ
      await new Promise(r => setTimeout(r, 2));
      const updated = await clerk.transition(writ.id, 'active');
      assert.ok(updated.updatedAt >= writ.updatedAt);
    });

    it('throws if writ does not exist', async () => {
      await assert.rejects(
        () => clerk.transition('w-ghost', 'active'),
        /not found/,
      );
    });

    it('throws if writ is already active', async () => {
      const writ = await clerk.post({ title: 'Active writ', body: 'Body' });
      await clerk.transition(writ.id, 'active');

      await assert.rejects(
        () => clerk.transition(writ.id, 'active'),
        /Cannot transition/,
      );
    });

    it('throws if writ is in a terminal state', async () => {
      const writ = await clerk.post({ title: 'Completed writ', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed', { resolution: 'Done' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'active'),
        /Cannot transition/,
      );
    });
  });

  // ── transition() — active → completed ───────────────────────────

  describe('transition() to completed', () => {
    beforeEach(() => { setup(); });

    it('transitions an active writ to completed', async () => {
      const writ = await clerk.post({ title: 'Complete me', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const completed = await clerk.transition(writ.id, 'completed', { resolution: 'All done' });

      assert.equal(completed.status, 'completed');
      assert.ok(completed.resolvedAt);
      assert.equal(completed.resolution, 'All done');
    });

    it('sets resolution on completed', async () => {
      const writ = await clerk.post({ title: 'With resolution', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const completed = await clerk.transition(writ.id, 'completed', { resolution: 'Task fulfilled' });
      assert.equal(completed.resolution, 'Task fulfilled');
    });

    it('throws when completing a ready writ (must accept first)', async () => {
      const writ = await clerk.post({ title: 'Not yet accepted', body: 'Body' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'completed'),
        /Cannot transition/,
      );
    });

    it('throws when completing a cancelled writ', async () => {
      const writ = await clerk.post({ title: 'Cancelled', body: 'Body' });
      await clerk.transition(writ.id, 'cancelled');

      await assert.rejects(
        () => clerk.transition(writ.id, 'completed'),
        /Cannot transition/,
      );
    });
  });

  // ── transition() — active → failed ──────────────────────────────

  describe('transition() to failed', () => {
    beforeEach(() => { setup(); });

    it('transitions an active writ to failed', async () => {
      const writ = await clerk.post({ title: 'Fail me', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const failed = await clerk.transition(writ.id, 'failed', { resolution: 'Ran out of time' });

      assert.equal(failed.status, 'failed');
      assert.ok(failed.resolvedAt);
      assert.equal(failed.resolution, 'Ran out of time');
    });

    it('sets resolution on failed', async () => {
      const writ = await clerk.post({ title: 'Will fail', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const failed = await clerk.transition(writ.id, 'failed', { resolution: 'Something broke' });
      assert.equal(failed.resolution, 'Something broke');
    });

    it('throws when failing a ready writ', async () => {
      const writ = await clerk.post({ title: 'Not active', body: 'Body' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'failed'),
        /Cannot transition/,
      );
    });

    it('throws when failing a completed writ', async () => {
      const writ = await clerk.post({ title: 'Already done', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed', { resolution: 'Done' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'failed'),
        /Cannot transition/,
      );
    });
  });

  // ── transition() — ready|active → cancelled ──────────────────────

  describe('transition() to cancelled', () => {
    beforeEach(() => { setup(); });

    it('cancels a ready writ', async () => {
      const writ = await clerk.post({ title: 'Cancel me (ready)', body: 'Body' });
      const cancelled = await clerk.transition(writ.id, 'cancelled');

      assert.equal(cancelled.status, 'cancelled');
      assert.ok(cancelled.resolvedAt);
    });

    it('cancels an active writ', async () => {
      const writ = await clerk.post({ title: 'Cancel me (active)', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const cancelled = await clerk.transition(writ.id, 'cancelled');

      assert.equal(cancelled.status, 'cancelled');
      assert.ok(cancelled.resolvedAt);
    });

    it('sets resolution on cancelled when provided', async () => {
      const writ = await clerk.post({ title: 'Cancel with reason', body: 'Body' });
      const cancelled = await clerk.transition(writ.id, 'cancelled', { resolution: 'No longer needed' });
      assert.equal(cancelled.resolution, 'No longer needed');
    });

    it('throws when cancelling a completed writ', async () => {
      const writ = await clerk.post({ title: 'Done', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed', { resolution: 'Done' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'cancelled'),
        /Cannot transition/,
      );
    });

    it('throws when cancelling a failed writ', async () => {
      const writ = await clerk.post({ title: 'Failed', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'failed', { resolution: 'Broke' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'cancelled'),
        /Cannot transition/,
      );
    });

    it('throws when cancelling an already-cancelled writ', async () => {
      const writ = await clerk.post({ title: 'Cancelled twice', body: 'Body' });
      await clerk.transition(writ.id, 'cancelled');

      await assert.rejects(
        () => clerk.transition(writ.id, 'cancelled'),
        /Cannot transition/,
      );
    });
  });

  // ── Full lifecycle ───────────────────────────────────────────────

  describe('full lifecycle', () => {
    beforeEach(() => { setup(); });

    it('happy path: ready → active → completed', async () => {
      const writ = await clerk.post({ title: 'Full lifecycle', body: 'Do it all' });
      assert.equal(writ.status, 'ready');

      const active = await clerk.transition(writ.id, 'active');
      assert.equal(active.status, 'active');
      assert.ok(active.acceptedAt);
      assert.equal(active.resolvedAt, undefined);

      const done = await clerk.transition(writ.id, 'completed', { resolution: 'All finished' });
      assert.equal(done.status, 'completed');
      assert.ok(done.resolvedAt);
      assert.equal(done.resolution, 'All finished');

      // Verify persisted state via show()
      const persisted = await clerk.show(writ.id);
      assert.equal(persisted.status, 'completed');
    });

    it('failure path: ready → active → failed', async () => {
      const writ = await clerk.post({ title: 'Will fail', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const failed = await clerk.transition(writ.id, 'failed', { resolution: 'Something broke' });

      assert.equal(failed.status, 'failed');
      assert.equal(failed.resolution, 'Something broke');

      const persisted = await clerk.show(writ.id);
      assert.equal(persisted.status, 'failed');
    });

    it('cancellation path: ready → cancelled', async () => {
      const writ = await clerk.post({ title: 'Cancelled early', body: 'Body' });
      const cancelled = await clerk.transition(writ.id, 'cancelled');
      assert.equal(cancelled.status, 'cancelled');
    });

    it('updatedAt changes on each mutation', async () => {
      const writ = await clerk.post({ title: 'Track updates', body: 'Body' });
      const t0 = writ.updatedAt;

      await new Promise(r => setTimeout(r, 2));
      const active = await clerk.transition(writ.id, 'active');
      const t1 = active.updatedAt;

      await new Promise(r => setTimeout(r, 2));
      const done = await clerk.transition(writ.id, 'completed', { resolution: 'Done' });
      const t2 = done.updatedAt;

      assert.ok(t1 >= t0);
      assert.ok(t2 >= t1);
    });

    it('transition() strips managed fields from caller-supplied fields', async () => {
      const writ = await clerk.post({ title: 'Sanitize test', body: 'Body' });
      await clerk.transition(writ.id, 'active');

      // Attempt to corrupt id, status, and timestamps via fields
      const done = await clerk.transition(writ.id, 'completed', {
        resolution: 'Legit resolution',
        id: 'w-evil',
        status: 'ready' as const,
        createdAt: '1999-01-01T00:00:00Z',
        updatedAt: '1999-01-01T00:00:00Z',
        acceptedAt: '1999-01-01T00:00:00Z',
        resolvedAt: '1999-01-01T00:00:00Z',
      });

      // Managed fields should NOT be overridden
      assert.equal(done.id, writ.id);
      assert.equal(done.status, 'completed');
      assert.notEqual(done.createdAt, '1999-01-01T00:00:00Z');
      assert.notEqual(done.updatedAt, '1999-01-01T00:00:00Z');
      assert.notEqual(done.resolvedAt, '1999-01-01T00:00:00Z');
      // But resolution should pass through
      assert.equal(done.resolution, 'Legit resolution');
    });
  });

  // ── link() ──────────────────────────────────────────────────────

  describe('link()', () => {
    beforeEach(() => { setup(); });

    it('creates a link between two writs and returns a WritLinkDoc', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });

      const link = await clerk.link(w1.id, w2.id, 'fixes');

      assert.equal(link.sourceId, w1.id);
      assert.equal(link.targetId, w2.id);
      assert.equal(link.type, 'fixes');
      assert.equal(link.id, `${w1.id}:${w2.id}:fixes`);
      assert.ok(link.createdAt);
    });

    it('is idempotent — calling twice returns the same link', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });

      const first = await clerk.link(w1.id, w2.id, 'fixes');
      const second = await clerk.link(w1.id, w2.id, 'fixes');

      assert.equal(first.id, second.id);
      assert.equal(first.createdAt, second.createdAt);

      // Only one document should exist
      const result = await clerk.links(w1.id);
      assert.equal(result.outbound.length, 1);
    });

    it('throws for self-link', async () => {
      const w = await clerk.post({ title: 'Solo', body: 'Body' });
      await assert.rejects(
        () => clerk.link(w.id, w.id, 'fixes'),
        /Cannot link a writ to itself/,
      );
    });

    it('throws when source writ does not exist', async () => {
      const w2 = await clerk.post({ title: 'Target', body: 'Body' });
      await assert.rejects(
        () => clerk.link('w-ghost', w2.id, 'fixes'),
        /not found/,
      );
    });

    it('throws when target writ does not exist', async () => {
      const w1 = await clerk.post({ title: 'Source', body: 'Body' });
      await assert.rejects(
        () => clerk.link(w1.id, 'w-ghost', 'fixes'),
        /not found/,
      );
    });

    it('throws for empty type string', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      await assert.rejects(
        () => clerk.link(w1.id, w2.id, ''),
        /non-empty/,
      );
    });

    it('throws for whitespace-only type string', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      await assert.rejects(
        () => clerk.link(w1.id, w2.id, '   '),
        /non-empty/,
      );
    });

    it('accepts various non-empty type strings', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });

      const l1 = await clerk.link(w1.id, w2.id, 'fixes');
      const l2 = await clerk.link(w1.id, w2.id, 'retries');

      assert.equal(l1.type, 'fixes');
      assert.equal(l2.type, 'retries');

      const result = await clerk.links(w1.id);
      assert.equal(result.outbound.length, 2);
    });

    it('creates separate links for same pair with different types', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });

      await clerk.link(w1.id, w2.id, 'fixes');
      await clerk.link(w1.id, w2.id, 'supersedes');

      const result = await clerk.links(w1.id);
      assert.equal(result.outbound.length, 2);
    });

    it('creates links to multiple targets', async () => {
      const w1 = await clerk.post({ title: 'Source', body: 'Body' });
      const w2 = await clerk.post({ title: 'Target 2', body: 'Body' });
      const w3 = await clerk.post({ title: 'Target 3', body: 'Body' });

      await clerk.link(w1.id, w2.id, 'fixes');
      await clerk.link(w1.id, w3.id, 'retries');

      const r1 = await clerk.links(w1.id);
      assert.equal(r1.outbound.length, 2);

      const r2 = await clerk.links(w2.id);
      assert.equal(r2.inbound.length, 1);

      const r3 = await clerk.links(w3.id);
      assert.equal(r3.inbound.length, 1);
    });

    it('does not update writ timestamps when linking', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      const before1 = w1.updatedAt;
      const before2 = w2.updatedAt;

      await clerk.link(w1.id, w2.id, 'fixes');

      const after1 = await clerk.show(w1.id);
      const after2 = await clerk.show(w2.id);
      assert.equal(after1.updatedAt, before1);
      assert.equal(after2.updatedAt, before2);
    });
  });

  // ── links() ──────────────────────────────────────────────────────

  describe('links()', () => {
    beforeEach(() => { setup(); });

    it('returns outbound and inbound links', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      const w3 = await clerk.post({ title: 'Writ 3', body: 'Body' });

      await clerk.link(w1.id, w2.id, 'fixes');
      await clerk.link(w3.id, w1.id, 'supersedes');

      const result = await clerk.links(w1.id);
      assert.equal(result.outbound.length, 1);
      assert.equal(result.outbound[0]!.targetId, w2.id);
      assert.equal(result.inbound.length, 1);
      assert.equal(result.inbound[0]!.sourceId, w3.id);
    });

    it('returns empty arrays for a writ with no links', async () => {
      const w = await clerk.post({ title: 'Lonely writ', body: 'Body' });
      const result = await clerk.links(w.id);
      assert.deepEqual(result, { outbound: [], inbound: [] });
    });

    it('returns empty arrays for a non-existent writ id', async () => {
      const result = await clerk.links('w-doesnotexist');
      assert.deepEqual(result, { outbound: [], inbound: [] });
    });
  });

  // ── unlink() ─────────────────────────────────────────────────────

  describe('unlink()', () => {
    beforeEach(() => { setup(); });

    it('removes an existing link', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      await clerk.link(w1.id, w2.id, 'fixes');

      await clerk.unlink(w1.id, w2.id, 'fixes');

      const result = await clerk.links(w1.id);
      assert.equal(result.outbound.length, 0);
    });

    it('is idempotent — no error when link does not exist', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });

      // No error — link was never created
      await clerk.unlink(w1.id, w2.id, 'fixes');
    });

    it('is idempotent — no error when called twice', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      await clerk.link(w1.id, w2.id, 'fixes');

      await clerk.unlink(w1.id, w2.id, 'fixes');
      await clerk.unlink(w1.id, w2.id, 'fixes'); // second call — no error
    });

    it('does not affect other links', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      await clerk.link(w1.id, w2.id, 'fixes');
      await clerk.link(w1.id, w2.id, 'retries');

      await clerk.unlink(w1.id, w2.id, 'fixes');

      const result = await clerk.links(w1.id);
      assert.equal(result.outbound.length, 1);
      assert.equal(result.outbound[0]!.type, 'retries');
    });

    it('does not update writ timestamps when unlinking', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      await clerk.link(w1.id, w2.id, 'fixes');
      const before1 = (await clerk.show(w1.id)).updatedAt;
      const before2 = (await clerk.show(w2.id)).updatedAt;

      await clerk.unlink(w1.id, w2.id, 'fixes');

      const after1 = await clerk.show(w1.id);
      const after2 = await clerk.show(w2.id);
      assert.equal(after1.updatedAt, before1);
      assert.equal(after2.updatedAt, before2);
    });
  });

  // ── writ-show tool with links ─────────────────────────────────────

  describe('writ-show tool — includes links', () => {
    beforeEach(() => { setup(); });

    it('includes links key with outbound and inbound arrays', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      await clerk.link(w1.id, w2.id, 'fixes');

      // Call clerk.show() and clerk.links() like the tool handler does
      const [writ, links] = await Promise.all([
        clerk.show(w1.id),
        clerk.links(w1.id),
      ]);
      const result = { ...writ, links };

      assert.equal(result.id, w1.id);
      assert.equal(result.title, 'Writ 1');
      assert.ok(Array.isArray(result.links.outbound));
      assert.ok(Array.isArray(result.links.inbound));
      assert.equal(result.links.outbound.length, 1);
      assert.equal(result.links.inbound.length, 0);
      assert.equal((result.links.outbound[0] as WritLinkDoc).targetId, w2.id);
    });

    it('returns empty link arrays for a writ with no links', async () => {
      const w = await clerk.post({ title: 'Solo', body: 'Body' });

      const [writ, links] = await Promise.all([
        clerk.show(w.id),
        clerk.links(w.id),
      ]);
      const result = { ...writ, links };

      assert.deepEqual(result.links.outbound, []);
      assert.deepEqual(result.links.inbound, []);
    });
  });

  // ── Config validation ────────────────────────────────────────────

  describe('config: writTypes validation', () => {
    it('built-in type mandate is always valid regardless of writTypes config', async () => {
      setup({ clerkConfig: { writTypes: [] } }); // empty writTypes — built-in still works
      const w1 = await clerk.post({ title: 'Mandate', body: 'Body', type: 'mandate' });
      assert.equal(w1.type, 'mandate');
    });

    it('summon is not a built-in type (must be declared)', async () => {
      setup({ clerkConfig: { writTypes: [] } });
      await assert.rejects(
        () => clerk.post({ title: 'Summon', body: 'Body', type: 'summon' }),
        /Unknown writ type/,
      );
    });

    it('declared custom types are accepted', async () => {
      setup({
        clerkConfig: {
          writTypes: [
            { name: 'quest', description: 'A significant task' },
            { name: 'errand', description: 'A small errand' },
          ],
        },
      });
      const w = await clerk.post({ title: 'Go on a quest', body: 'Body', type: 'quest' });
      assert.equal(w.type, 'quest');
    });

    it('undeclared types are rejected even when other custom types exist', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'quest', description: 'A quest' }] } });
      await assert.rejects(
        () => clerk.post({ title: 'Test', body: 'Body', type: 'unknown' }),
        /Unknown writ type/,
      );
    });

    it('defaultType from clerk config is validated against declared types', async () => {
      setup({
        clerkConfig: {
          writTypes: [{ name: 'errand', description: 'A small errand' }],
          defaultType: 'errand',
        },
      });
      const w = await clerk.post({ title: 'Default errand', body: 'Body' });
      assert.equal(w.type, 'errand');
    });
  });
});

=== FILE: packages/plugins/clerk/src/clerk.ts ===
/**
 * The Clerk — writ lifecycle management apparatus.
 *
 * The Clerk manages the lifecycle of writs: lightweight work orders that flow
 * through a fixed status machine (ready → active → completed/failed, or
 * ready/active → cancelled). Each writ has a type, a title, a body, and
 * optional codex and resolution fields.
 *
 * Writ types are validated against the guild config's writTypes field plus the
 * built-in type ('mandate'). An unknown type is rejected at post time.
 *
 * See: docs/architecture/apparatus/clerk.md
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book, WhereClause } from '@shardworks/stacks-apparatus';

import type {
  ClerkApi,
  ClerkConfig,
  WritDoc,
  WritLinkDoc,
  WritLinks,
  WritStatus,
  PostCommissionRequest,
  WritFilters,
} from './types.ts';

import {
  commissionPost,
  writShow,
  writList,
  writAccept,
  writComplete,
  writFail,
  writCancel,
  writLink,
  writUnlink,
} from './tools/index.ts';

// ── Built-in writ types ──────────────────────────────────────────────

const BUILTIN_TYPES = new Set(['mandate']);

// ── Status machine ───────────────────────────────────────────────────

const ALLOWED_FROM: Record<WritStatus, WritStatus[]> = {
  active: ['ready'],
  completed: ['active'],
  failed: ['active'],
  cancelled: ['ready', 'active'],
  ready: [],
};

const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled']);

// ── Factory ──────────────────────────────────────────────────────────

export function createClerk(): Plugin {
  let writs: Book<WritDoc>;
  let links: Book<WritLinkDoc>;

  // ── Helpers ──────────────────────────────────────────────────────

  function resolveClerkConfig(): ClerkConfig {
    return guild().guildConfig().clerk ?? {};
  }

  function resolveWritTypes(): Set<string> {
    const config = resolveClerkConfig();
    const declared = (config.writTypes ?? []).map((entry) => entry.name);
    return new Set([...BUILTIN_TYPES, ...declared]);
  }

  function resolveDefaultType(): string {
    const config = resolveClerkConfig();
    return config.defaultType ?? 'mandate';
  }

  function buildWhereClause(filters?: WritFilters): WhereClause | undefined {
    const conditions: WhereClause = [];
    if (filters?.status) {
      conditions.push(['status', '=', filters.status]);
    }
    if (filters?.type) {
      conditions.push(['type', '=', filters.type]);
    }
    return conditions.length > 0 ? conditions : undefined;
  }

  // ── API ──────────────────────────────────────────────────────────

  const api: ClerkApi = {
    async post(request: PostCommissionRequest): Promise<WritDoc> {
      const type = request.type ?? resolveDefaultType();
      const validTypes = resolveWritTypes();

      if (!validTypes.has(type)) {
        throw new Error(
          `Unknown writ type "${type}". Declared types: ${[...validTypes].join(', ')}.`,
        );
      }

      const now = new Date().toISOString();
      const writ: WritDoc = {
        id: generateId('w', 6),
        type,
        status: 'ready',
        title: request.title,
        body: request.body,
        ...(request.codex !== undefined ? { codex: request.codex } : {}),
        createdAt: now,
        updatedAt: now,
      };

      await writs.put(writ);
      return writ;
    },

    async show(id: string): Promise<WritDoc> {
      const writ = await writs.get(id);
      if (!writ) {
        throw new Error(`Writ "${id}" not found.`);
      }
      return writ;
    },

    async list(filters?: WritFilters): Promise<WritDoc[]> {
      const where = buildWhereClause(filters);
      const limit = filters?.limit ?? 20;
      const offset = filters?.offset;

      return writs.find({
        where,
        orderBy: ['createdAt', 'desc'],
        limit,
        ...(offset !== undefined ? { offset } : {}),
      });
    },

    async count(filters?: WritFilters): Promise<number> {
      const where = buildWhereClause(filters);
      return writs.count(where);
    },

    async link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc> {
      if (sourceId === targetId) {
        throw new Error(`Cannot link a writ to itself: "${sourceId}".`);
      }
      if (!type || !type.trim()) {
        throw new Error('Link type must be a non-empty string.');
      }

      const source = await writs.get(sourceId);
      if (!source) {
        throw new Error(`Writ "${sourceId}" not found.`);
      }
      const target = await writs.get(targetId);
      if (!target) {
        throw new Error(`Writ "${targetId}" not found.`);
      }

      const id = `${sourceId}:${targetId}:${type}`;
      const existing = await links.get(id);
      if (existing) {
        return existing;
      }

      const doc: WritLinkDoc = {
        id,
        sourceId,
        targetId,
        type,
        createdAt: new Date().toISOString(),
      };
      await links.put(doc);
      return doc;
    },

    async links(writId: string): Promise<WritLinks> {
      const [outbound, inbound] = await Promise.all([
        links.find({ where: [['sourceId', '=', writId]] }),
        links.find({ where: [['targetId', '=', writId]] }),
      ]);
      return { outbound, inbound };
    },

    async unlink(sourceId: string, targetId: string, type: string): Promise<void> {
      const id = `${sourceId}:${targetId}:${type}`;
      await links.delete(id);
    },

    async transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc> {
      const writ = await writs.get(id);
      if (!writ) {
        throw new Error(`Writ "${id}" not found.`);
      }

      const allowedFrom = ALLOWED_FROM[to];
      if (!allowedFrom.includes(writ.status)) {
        throw new Error(
          `Cannot transition writ "${id}" to "${to}": status is "${writ.status}", expected one of: ${allowedFrom.join(', ')}.`,
        );
      }

      const now = new Date().toISOString();
      const isTerminal = TERMINAL_STATUSES.has(to);

      // Strip managed fields — callers cannot override id, status, or timestamps
      // controlled by the status machine.
      const { id: _id, status: _status, createdAt: _c, updatedAt: _u,
        acceptedAt: _a, resolvedAt: _r, ...safeFields } = (fields ?? {}) as WritDoc;

      const patch: Partial<Omit<WritDoc, 'id'>> = {
        status: to,
        updatedAt: now,
        ...(to === 'active' ? { acceptedAt: now } : {}),
        ...(isTerminal ? { resolvedAt: now } : {}),
        ...safeFields,
      };

      return writs.patch(id, patch);
    },
  };

  // ── Apparatus ────────────────────────────────────────────────────

  return {
    apparatus: {
      requires: ['stacks'],

      supportKit: {
        books: {
          writs: {
            indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
          },
          links: {
            indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']],
          },
        },
        tools: [
          commissionPost,
          writShow,
          writList,
          writAccept,
          writComplete,
          writFail,
          writCancel,
          writLink,
          writUnlink,
        ],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const stacks = guild().apparatus<StacksApi>('stacks');
        writs = stacks.book<WritDoc>('clerk', 'writs');
        links = stacks.book<WritLinkDoc>('clerk', 'links');
      },
    },
  };
}

=== FILE: packages/plugins/clerk/src/index.ts ===
/**
 * @shardworks/clerk-apparatus — The Clerk.
 *
 * Writ lifecycle management: post commissions, accept work, complete or fail
 * writs, and cancel them at any pre-terminal stage. Writs flow through a fixed
 * status machine and are persisted in The Stacks.
 *
 * See: docs/architecture/apparatus/clerk.md
 */

import { createClerk } from './clerk.ts';

// ── Clerk API ─────────────────────────────────────────────────────────

export {
  type ClerkApi,
  type ClerkConfig,
  type WritTypeEntry,
  type WritDoc,
  type WritLinkDoc,
  type WritLinks,
  type WritStatus,
  type PostCommissionRequest,
  type WritFilters,
} from './types.ts';

export { createClerk } from './clerk.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createClerk();

=== FILE: packages/plugins/clerk/src/tools/index.ts ===
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
export { default as writAccept } from './writ-accept.ts';
export { default as writComplete } from './writ-complete.ts';
export { default as writFail } from './writ-fail.ts';
export { default as writCancel } from './writ-cancel.ts';
export { default as writLink } from './writ-link.ts';
export { default as writUnlink } from './writ-unlink.ts';

=== FILE: packages/plugins/clerk/src/tools/writ-link.ts ===
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '../types.ts';

export default tool({
  name: 'writ-link',
  description: 'Link two writs with a typed relationship',
  instructions:
    'Creates a directional link from source writ to target writ. ' +
    'The type describes the relationship (e.g. "fixes", "retries", "supersedes", "duplicates"). ' +
    'Idempotent — creating the same link twice returns the existing link.',
  params: {
    sourceId: z.string().describe('The writ that is the origin of this relationship'),
    targetId: z.string().describe('The writ that is the target of this relationship'),
    type: z.string().describe('Relationship type (e.g. "fixes", "retries", "supersedes", "duplicates")'),
  },
  permission: 'clerk:write',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    return clerk.link(params.sourceId, params.targetId, params.type);
  },
});

=== FILE: packages/plugins/clerk/src/tools/writ-show.ts ===
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '../types.ts';

export default tool({
  name: 'writ-show',
  description: 'Show full detail for a writ',
  instructions: 'Returns the complete writ record including its current status, timestamps, body text, and resolution.',
  params: {
    id: z.string().describe('Writ id'),
  },
  permission: 'clerk:read',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    const [writ, links] = await Promise.all([
      clerk.show(params.id),
      clerk.links(params.id),
    ]);
    return { ...writ, links };
  },
});

=== FILE: packages/plugins/clerk/src/tools/writ-unlink.ts ===
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '../types.ts';

export default tool({
  name: 'writ-unlink',
  description: 'Remove a link between two writs',
  instructions:
    'Removes the directional link of the given type from source to target. ' +
    'Idempotent — no error if the link does not exist.',
  params: {
    sourceId: z.string().describe('The writ that is the origin of the relationship'),
    targetId: z.string().describe('The writ that is the target of the relationship'),
    type: z.string().describe('Relationship type to remove'),
  },
  permission: 'clerk:write',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    await clerk.unlink(params.sourceId, params.targetId, params.type);
    return { ok: true };
  },
});

=== FILE: packages/plugins/clerk/src/types.ts ===
/**
 * Clerk public types.
 *
 * All types exported from @shardworks/clerk-apparatus.
 */

// ── Writ status ──────────────────────────────────────────────────────

/**
 * A writ's position in its lifecycle.
 *
 * Transitions:
 *   ready → active (accept)
 *   active → completed (complete)
 *   active → failed (fail)
 *   ready | active → cancelled (cancel)
 *
 * completed, failed, cancelled are terminal — no further transitions.
 */
export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';

// ── Documents ────────────────────────────────────────────────────────

/**
 * A writ document as stored in The Stacks.
 */
export interface WritDoc {
  /** Index signature required to satisfy BookEntry constraint. */
  [key: string]: unknown;
  /** Unique writ id (`w-{base36_timestamp}{hex_random}`). Sortable by creation time. */
  id: string;
  /** Writ type — must be a type declared in guild config, or a built-in type. */
  type: string;
  /** Current lifecycle status. */
  status: WritStatus;
  /** Short human-readable title. */
  title: string;
  /** Detail text. */
  body: string;
  /** Target codex name. */
  codex?: string;
  /** ISO timestamp when the writ was created. */
  createdAt: string;
  /** ISO timestamp of the last mutation. */
  updatedAt: string;
  /** ISO timestamp when the writ was accepted (transitioned to active). */
  acceptedAt?: string;
  /** ISO timestamp when the writ reached a terminal state. */
  resolvedAt?: string;
  /** Summary of how the writ resolved (set on any terminal transition). */
  resolution?: string;
}

// ── Requests ─────────────────────────────────────────────────────────

/**
 * Request to post a new commission (create a writ).
 */
export interface PostCommissionRequest {
  /**
   * Writ type. Defaults to the guild's configured defaultType, or "mandate"
   * if no default is configured. Must be a valid declared type.
   */
  type?: string;
  /** Short human-readable title describing the work. */
  title: string;
  /** Detail text. */
  body: string;
  /** Optional target codex name. */
  codex?: string;
}

// ── Filters ──────────────────────────────────────────────────────────

/**
 * Filters for listing writs.
 */
export interface WritFilters {
  /** Filter by status. */
  status?: WritStatus;
  /** Filter by writ type. */
  type?: string;
  /** Maximum number of results (default: 20). */
  limit?: number;
  /** Number of results to skip. */
  offset?: number;
}

// ── Configuration ───────────────────────────────────────────────

/**
 * A writ type entry declared in clerk config.
 */
export interface WritTypeEntry {
  /** The writ type name (e.g. "mandate", "task", "bug"). */
  name: string;
  /** Optional human-readable description of this writ type. */
  description?: string;
}

/**
 * Clerk apparatus configuration — lives under the `clerk` key in guild.json.
 */
export interface ClerkConfig {
  /** Additional writ type declarations. The built-in type "mandate" is always valid. */
  writTypes?: WritTypeEntry[];
  /** Default writ type when commission-post is called without a type (default: "mandate"). */
  defaultType?: string;
}

// Augment GuildConfig so `guild().guildConfig().clerk` is typed without
// requiring a manual type parameter at the call site.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    clerk?: ClerkConfig;
  }
}

// ── Link documents ───────────────────────────────────────────────────

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

// ── API ──────────────────────────────────────────────────────────────

/**
 * The Clerk's runtime API — retrieved via guild().apparatus<ClerkApi>('clerk').
 */
export interface ClerkApi {
  /**
   * Post a new commission, creating a writ in 'ready' status.
   * Validates the writ type against declared types in guild config.
   */
  post(request: PostCommissionRequest): Promise<WritDoc>;

  /**
   * Show a writ by id. Throws if not found.
   */
  show(id: string): Promise<WritDoc>;

  /**
   * List writs with optional filters, ordered by createdAt descending.
   */
  list(filters?: WritFilters): Promise<WritDoc[]>;

  /**
   * Count writs matching optional filters.
   */
  count(filters?: WritFilters): Promise<number>;

  /**
   * Transition a writ to a new status, optionally setting additional fields.
   * Validates that the transition is legal.
   */
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;

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



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: packages/plugins/clerk/src/tools ===
tree 90ebfc69268488dfa2e9c19a77bfb66c6c3ba8b0:packages/plugins/clerk/src/tools

commission-post.ts
index.ts
writ-accept.ts
writ-cancel.ts
writ-complete.ts
writ-fail.ts
writ-link.ts
writ-list.ts
writ-show.ts
writ-unlink.ts

=== CONTEXT FILE: packages/plugins/clerk/src/tools/commission-post.ts ===
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '../types.ts';

export default tool({
  name: 'commission-post',
  description: 'Post a new commission, creating a writ in ready status',
  instructions:
    'Creates a new writ and places it in ready status awaiting acceptance. ' +
    'The writ type must be a type declared in the guild config, or the built-in type "mandate". ' +
    'If type is omitted, the guild\'s configured default type is used (defaults to "mandate").',
  params: {
    title: z.string().describe('Short human-readable title describing the work'),
    body: z.string().describe('Detail text or description'),
    type: z.string().optional().describe('Writ type (default: guild defaultType or "mandate")'),
    codex: z.string().optional().describe('Target codex name'),
  },
  permission: 'clerk:write',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    return clerk.post({
      title: params.title,
      body: params.body,
      type: params.type,
      codex: params.codex,
    });
  },
});

=== CONTEXT FILE: packages/plugins/clerk/src/tools/writ-list.ts ===
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '../types.ts';

export default tool({
  name: 'writ-list',
  description: 'List writs with optional filters',
  instructions:
    'Returns writ summaries ordered by createdAt descending (newest first). ' +
    'Filter by status or type to narrow results.',
  params: {
    status: z
      .enum(['ready', 'active', 'completed', 'failed', 'cancelled'])
      .optional()
      .describe('Filter by writ status'),
    type: z.string().optional().describe('Filter by writ type'),
    limit: z.number().optional().default(20).describe('Maximum results (default: 20)'),
    offset: z.number().optional().describe('Number of results to skip'),
  },
  permission: 'clerk:read',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    return clerk.list({
      status: params.status,
      type: params.type,
      limit: params.limit,
      offset: params.offset,
    });
  },
});

=== CONTEXT FILE: packages/plugins/clerk/src/tools/writ-cancel.ts ===
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '../types.ts';

export default tool({
  name: 'writ-cancel',
  description: 'Cancel a writ, transitioning it from ready or active to cancelled',
  instructions:
    'Cancels the writ. Both ready and active writs can be cancelled. ' +
    'Optionally record a resolution explaining why. ' +
    'Returns the updated writ.',
  params: {
    id: z.string().describe('Writ id'),
    resolution: z.string().optional().describe('Optional summary of why the writ was cancelled'),
  },
  permission: 'clerk:write',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    return clerk.transition(
      params.id,
      'cancelled',
      params.resolution !== undefined ? { resolution: params.resolution } : undefined,
    );
  },
});



## Codebase Structure (surrounding directories)

```
=== TREE: packages/plugins/clerk/src/ ===
clerk.test.ts
clerk.ts
index.ts
tools
types.ts

=== TREE: packages/plugins/clerk/src/tools/ ===
commission-post.ts
index.ts
writ-accept.ts
writ-cancel.ts
writ-complete.ts
writ-fail.ts
writ-link.ts
writ-list.ts
writ-show.ts
writ-unlink.ts


```
