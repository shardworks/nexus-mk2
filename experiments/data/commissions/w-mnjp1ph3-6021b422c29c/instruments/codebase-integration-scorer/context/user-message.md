## Commission Spec

---
author: plan-writer
author_version: 2026-04-03
estimated_complexity: 5
---

# Add rig-list, rig-show, and rig-for-writ tools to the Spider

## Summary

Add read-only query tools to the Spider apparatus — `rig-list`, `rig-show`, and `rig-for-writ` — mirroring the Clerk's `writ-list`/`writ-show` pattern. This includes backing `SpiderApi` methods (`list`, `show`, `forWrit`), a `RigFilters` type, a `createdAt` field on `RigDoc`, barrel re-exports, and tests.

## Current State

The Spider apparatus (`/workspace/nexus/packages/plugins/spider/src/spider.ts`) has a single public API method:

```typescript
// types.ts
export interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
}
```

The Spider registers two tools — `crawl` and `crawlContinual` — both with `spider:write` permission. There are no read-only tools or query methods.

`RigDoc` has no `createdAt` timestamp:

```typescript
// types.ts
export interface RigDoc {
  [key: string]: unknown;
  id: string;
  writId: string;
  status: RigStatus;
  engines: EngineInstance[];
}
```

Rigs are created in `trySpawn()` (spider.ts ~line 318):

```typescript
const rig: RigDoc = {
  id: rigId,
  writId: writ.id,
  status: 'running',
  engines,
};
```

The tools barrel (`/workspace/nexus/packages/plugins/spider/src/tools/index.ts`) exports two tools:

```typescript
export { default as crawlTool } from './crawl.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
```

The package barrel (`/workspace/nexus/packages/plugins/spider/src/index.ts`) re-exports public types but does not include any filter type.

The rigs book is indexed on `['status', 'writId', ['status', 'writId']]`.

## Requirements

- R1: When `SpiderApi.show(id)` is called with a valid rig id, it must return the full `RigDoc`.
- R2: When `SpiderApi.show(id)` is called with an id that does not exist, it must throw an `Error` with message `Rig "{id}" not found.`.
- R3: When `SpiderApi.list()` is called with no filters, it must return up to 20 `RigDoc` objects ordered by `createdAt` descending (newest first).
- R4: When `SpiderApi.list()` is called with a `status` filter, it must return only rigs matching that status.
- R5: When `SpiderApi.list()` is called with `limit` and/or `offset`, it must respect those pagination parameters.
- R6: When `SpiderApi.forWrit(writId)` is called, it must return the single `RigDoc` for that writ, or `null` if no rig exists.
- R7: The `RigDoc` interface must include a `createdAt` field (ISO timestamp string), set at rig spawn time.
- R8: A `rig-show` tool must exist with permission `read`, accepting a required `id` param, delegating to `SpiderApi.show()`.
- R9: A `rig-list` tool must exist with permission `read`, accepting optional `status`, `limit`, and `offset` params, delegating to `SpiderApi.list()`.
- R10: A `rig-for-writ` tool must exist with permission `read`, accepting a required `writId` param, delegating to `SpiderApi.forWrit()`.
- R11: The `RigFilters` type must be defined in `types.ts` and re-exported from the package barrel (`index.ts`).
- R12: All three tools must be registered in the Spider apparatus's `supportKit.tools` array.
- R13: The rigs book indexes must include `createdAt` to support the list ordering.

## Design

### Type Changes

**`/workspace/nexus/packages/plugins/spider/src/types.ts`** — full types after changes:

```typescript
// ── Rig filters ──────────────────────────────────────────────────────

/**
 * Filters for listing rigs.
 */
export interface RigFilters {
  /** Filter by rig status. */
  status?: RigStatus;
  /** Maximum number of results (default: 20). */
  limit?: number;
  /** Number of results to skip. */
  offset?: number;
}

// ── Rig (modified) ──────────────────────────────────────────────────

export interface RigDoc {
  /** Index signature required to satisfy BookEntry constraint. */
  [key: string]: unknown;
  /** Unique rig id. */
  id: string;
  /** The writ this rig is executing. */
  writId: string;
  /** Current rig status. */
  status: RigStatus;
  /** Ordered engine pipeline. */
  engines: EngineInstance[];
  /** ISO timestamp when the rig was created. */
  createdAt: string;
}

// ── SpiderApi (modified) ─────────────────────────────────────────────

export interface SpiderApi {
  /**
   * Execute one step of the crawl loop.
   *
   * Priority ordering: collect > run > spawn.
   * Returns null when no work is available.
   */
  crawl(): Promise<CrawlResult | null>;

  /**
   * Show a rig by id. Throws if not found.
   */
  show(id: string): Promise<RigDoc>;

  /**
   * List rigs with optional filters, ordered by createdAt descending.
   */
  list(filters?: RigFilters): Promise<RigDoc[]>;

  /**
   * Find the rig for a given writ. Returns null if no rig exists.
   */
  forWrit(writId: string): Promise<RigDoc | null>;
}
```

**`/workspace/nexus/packages/plugins/spider/src/index.ts`** — add `RigFilters` to the re-export block:

```typescript
export type {
  EngineStatus,
  EngineInstance,
  RigStatus,
  RigDoc,
  RigFilters,
  CrawlResult,
  SpiderApi,
  SpiderConfig,
  DraftYields,
  SealYields,
} from './types.ts';
```

### Behavior

**`SpiderApi.show(id)`**

- When `id` matches a rig in the rigs book, return the full `RigDoc` (including all engine instances with their yields, givensSpec, errors, etc.).
- When `id` does not match, throw `new Error('Rig "{id}" not found.')` — same error message pattern as the Clerk's `show()`.

**`SpiderApi.list(filters?)`**

- Build a `WhereClause` inline (no helper function):
  - When `filters.status` is provided, add `['status', '=', filters.status]` to the where conditions.
- Resolve `limit` from `filters.limit ?? 20`.
- Resolve `offset` from `filters.offset` (omit from query if undefined).
- Query `rigsBook.find()` with `orderBy: ['createdAt', 'desc']`.
- Return the resulting `RigDoc[]`.

**`SpiderApi.forWrit(writId)`**

- Query `rigsBook.find({ where: [['writId', '=', writId]], limit: 1 })`.
- Return the first result, or `null` if the array is empty.
- Does not throw on miss — 0 results is a valid state (the writ may not have been picked up yet).

**Rig creation (`trySpawn`)** — when spawning a new rig, set `createdAt` to the current ISO timestamp:

```typescript
const rig: RigDoc = {
  id: rigId,
  writId: writ.id,
  status: 'running',
  engines,
  createdAt: new Date().toISOString(),
};
```

**Tool handlers** — each tool is a thin wrapper:

- `rig-show`: calls `guild().apparatus<SpiderApi>('spider').show(params.id)`.
- `rig-list`: calls `guild().apparatus<SpiderApi>('spider').list({ status, limit, offset })`.
- `rig-for-writ`: calls `guild().apparatus<SpiderApi>('spider').forWrit(params.writId)`.

All three tools use `permission: 'read'`.

**Rigs book index** — add `'createdAt'` to the indexes array:

```typescript
books: {
  rigs: {
    indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
  },
},
```

### Non-obvious Touchpoints

1. **`/workspace/nexus/packages/plugins/spider/src/spider.ts` line 315** — the rig object literal in `trySpawn()` must be updated to include `createdAt`. This is separate from the API implementation and easy to miss.

2. **`/workspace/nexus/packages/plugins/spider/src/spider.test.ts`** — existing tests create rigs via `spider.crawl()` (which internally calls `trySpawn`). After this change, all rigs in existing tests will also have `createdAt`. Existing test assertions that compare full rig objects may need adjustment if they use deep equality — verify no existing tests break.

3. **Rigs book indexes** (`spider.ts` line 372) — must add `'createdAt'` to support the `orderBy` in `list()`. This is in the `supportKit.books.rigs` declaration, not in a migration or schema file.

4. **Import of `WhereClause` type** — the `list()` implementation needs to build a `WhereClause` array. The type is imported from `@shardworks/stacks-apparatus`. Check whether `spider.ts` already imports this type (it currently imports `Book` and `ReadOnlyBook` but not `WhereClause`). If not, add it to the existing import statement.

## Validation Checklist

- V1 [R1, R2]: Call `spider.show(validRigId)` — verify it returns the full `RigDoc`. Call `spider.show('nonexistent')` — verify it throws with message containing `"not found"`.
- V2 [R3, R5]: Call `spider.list()` with no filters — verify it returns rigs ordered by `createdAt` descending, capped at 20. Create >20 rigs and verify the default limit applies. Call with `limit: 5` and verify only 5 returned. Call with `offset: 2` and verify results are shifted.
- V3 [R4]: Create rigs in different states (running, completed, failed). Call `spider.list({ status: 'running' })` — verify only running rigs are returned.
- V4 [R6]: Call `spider.forWrit(existingWritId)` — verify it returns the rig. Call `spider.forWrit('no-such-writ')` — verify it returns `null`, not throw.
- V5 [R7]: After spawning a rig via `spider.crawl()`, read the rig from the book and verify `createdAt` is a valid ISO timestamp string.
- V6 [R8, R9, R10, R12]: Verify the Spider apparatus's `supportKit.tools` array contains all five tools (`crawl`, `crawlContinual`, `rig-show`, `rig-list`, `rig-for-writ`). Verify each tool's `name` and `permission` field.
- V7 [R11]: Verify `RigFilters` is exported from `@shardworks/spider-apparatus` (the package barrel `index.ts`).
- V8 [R13]: Verify the rigs book indexes in `supportKit.books.rigs.indexes` include `'createdAt'`.
- V9 [R1, R3, R6, R7]: Run `pnpm build` in the spider package to verify type-correctness. Run `pnpm test` to verify no existing tests break due to the `createdAt` addition.

## Test Cases

Tests use `node:test` and `node:assert/strict`, exercising API methods directly via the existing `buildFixture()` pattern.

**show — happy path:**
Post a writ via `clerk.post()`, crawl to spawn a rig, retrieve the rig id from `spider.list()`, call `spider.show(rigId)`. Assert: returned doc has correct `id`, `writId`, `status`, `engines` array of length 5, and `createdAt` is a string.

**show — not found:**
Call `spider.show('rig-nonexistent')`. Assert: throws an `Error` with message matching `Rig "rig-nonexistent" not found.`.

**list — no filters, default ordering:**
Post two writs and crawl twice to spawn two rigs. Call `spider.list()`. Assert: returns 2 rigs, first rig has a `createdAt` >= second rig's `createdAt` (newest first).

**list — status filter:**
Spawn a rig (status: running). Crawl until the rig completes (or use a fixture that fails an engine to get a failed rig). Call `spider.list({ status: 'running' })`. Assert: only running rigs returned. Call `spider.list({ status: 'completed' })`. Assert: only completed rigs returned.

**list — pagination:**
Spawn 3 rigs. Call `spider.list({ limit: 2 })`. Assert: returns exactly 2. Call `spider.list({ limit: 2, offset: 2 })`. Assert: returns exactly 1.

**list — empty result:**
Call `spider.list()` before any writs are posted. Assert: returns empty array.

**forWrit — happy path:**
Post a writ, crawl to spawn a rig. Call `spider.forWrit(writId)`. Assert: returns the rig with matching `writId`.

**forWrit — no rig exists:**
Post a writ but do not crawl. Call `spider.forWrit(writId)`. Assert: returns `null`.

**forWrit — non-existent writ id:**
Call `spider.forWrit('w-nonexistent')`. Assert: returns `null` (does not throw).

**createdAt is set on spawn:**
Post a writ, record the time, crawl to spawn. Retrieve the rig. Assert: `createdAt` is a valid ISO string, and its Date value is within a reasonable tolerance of the recorded time.

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.

## Commission Diff

```
 packages/plugins/spider/src/index.ts              |   1 +
 packages/plugins/spider/src/spider.test.ts        | 140 +++++++++++++++++++++-
 packages/plugins/spider/src/spider.ts             |  37 +++++-
 packages/plugins/spider/src/tools/index.ts        |   3 +
 packages/plugins/spider/src/tools/rig-for-writ.ts |  23 ++++
 packages/plugins/spider/src/tools/rig-list.ts     |  39 ++++++
 packages/plugins/spider/src/tools/rig-show.ts     |  22 ++++
 packages/plugins/spider/src/types.ts              |  31 +++++
 8 files changed, 291 insertions(+), 5 deletions(-)

diff --git a/packages/plugins/spider/src/index.ts b/packages/plugins/spider/src/index.ts
index d7ae4d5..2585c8f 100644
--- a/packages/plugins/spider/src/index.ts
+++ b/packages/plugins/spider/src/index.ts
@@ -17,6 +17,7 @@ export type {
   EngineInstance,
   RigStatus,
   RigDoc,
+  RigFilters,
   CrawlResult,
   SpiderApi,
   SpiderConfig,
diff --git a/packages/plugins/spider/src/spider.test.ts b/packages/plugins/spider/src/spider.test.ts
index a56d1c8..480edda 100644
--- a/packages/plugins/spider/src/spider.test.ts
+++ b/packages/plugins/spider/src/spider.test.ts
@@ -122,7 +122,7 @@ function buildFixture(
     indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
   });
   memBackend.ensureBook({ ownerId: 'spider', book: 'rigs' }, {
-    indexes: ['status', 'writId', ['status', 'writId']],
+    indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
   });
   memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
     indexes: ['startedAt', 'status'],
@@ -1432,6 +1432,144 @@ describe('Spider', () => {
     });
   });
 
+  // ── show / list / forWrit ─────────────────────────────────────────
+
+  describe('show()', () => {
+    it('returns the full RigDoc for a valid rig id', async () => {
+      const { clerk, spider } = fix;
+      const writ = await postWrit(clerk);
+      await spider.crawl(); // spawn
+
+      const rigs = await spider.list();
+      assert.equal(rigs.length, 1);
+      const rigId = rigs[0].id;
+
+      const rig = await spider.show(rigId);
+      assert.equal(rig.id, rigId);
+      assert.equal(rig.writId, writ.id);
+      assert.equal(rig.status, 'running');
+      assert.equal(rig.engines.length, 5);
+      assert.equal(typeof rig.createdAt, 'string');
+    });
+
+    it('throws with "not found" message for an unknown rig id', async () => {
+      const { spider } = fix;
+      await assert.rejects(
+        () => spider.show('rig-nonexistent'),
+        (err: unknown) => {
+          assert.ok(err instanceof Error);
+          assert.equal(err.message, 'Rig "rig-nonexistent" not found.');
+          return true;
+        },
+      );
+    });
+  });
+
+  describe('list()', () => {
+    it('returns empty array when no rigs exist', async () => {
+      const { spider } = fix;
+      const rigs = await spider.list();
+      assert.deepEqual(rigs, []);
+    });
+
+    it('returns rigs ordered by createdAt descending', async () => {
+      const { stacks, spider } = fix;
+      const book = rigsBook(stacks);
+      const older = new Date(Date.now() - 100).toISOString();
+      const newer = new Date().toISOString();
+      await book.put({ id: 'rig-old', writId: 'w-1', status: 'running', engines: [], createdAt: older });
+      await book.put({ id: 'rig-new', writId: 'w-2', status: 'running', engines: [], createdAt: newer });
+
+      const rigs = await spider.list();
+      assert.equal(rigs.length, 2);
+      // Newest first
+      assert.ok(rigs[0].createdAt >= rigs[1].createdAt);
+    });
+
+    it('filters by status', async () => {
+      const { clerk, spider } = fix;
+      await postWrit(clerk);
+      await spider.crawl(); // spawn (status: running)
+
+      const running = await spider.list({ status: 'running' });
+      assert.equal(running.length, 1);
+      assert.equal(running[0].status, 'running');
+
+      const completed = await spider.list({ status: 'completed' });
+      assert.equal(completed.length, 0);
+    });
+
+    it('respects limit', async () => {
+      const { stacks, spider } = fix;
+      const book = rigsBook(stacks);
+      for (let i = 0; i < 3; i++) {
+        await book.put({ id: `rig-limit-${i}`, writId: `w-${i}`, status: 'running', engines: [], createdAt: new Date().toISOString() });
+      }
+
+      const limited = await spider.list({ limit: 2 });
+      assert.equal(limited.length, 2);
+    });
+
+    it('respects offset', async () => {
+      const { stacks, spider } = fix;
+      const book = rigsBook(stacks);
+      for (let i = 0; i < 3; i++) {
+        await book.put({ id: `rig-offset-${i}`, writId: `w-${i}`, status: 'running', engines: [], createdAt: new Date().toISOString() });
+      }
+
+      const all = await spider.list();
+      assert.equal(all.length, 3);
+
+      const page = await spider.list({ limit: 2, offset: 2 });
+      assert.equal(page.length, 1);
+    });
+  });
+
+  describe('forWrit()', () => {
+    it('returns the rig for a writ that has been spawned', async () => {
+      const { clerk, spider } = fix;
+      const writ = await postWrit(clerk);
+      await spider.crawl(); // spawn
+
+      const rig = await spider.forWrit(writ.id);
+      assert.ok(rig !== null);
+      assert.equal(rig.writId, writ.id);
+    });
+
+    it('returns null when no rig exists for a writ', async () => {
+      const { clerk, spider } = fix;
+      const writ = await postWrit(clerk);
+      // Do not crawl — no rig spawned yet
+
+      const rig = await spider.forWrit(writ.id);
+      assert.equal(rig, null);
+    });
+
+    it('returns null for a non-existent writ id', async () => {
+      const { spider } = fix;
+      const rig = await spider.forWrit('w-nonexistent');
+      assert.equal(rig, null);
+    });
+  });
+
+  describe('createdAt', () => {
+    it('is set to a valid ISO timestamp when a rig is spawned', async () => {
+      const { clerk, spider } = fix;
+      const before = new Date().toISOString();
+      await postWrit(clerk);
+      await spider.crawl(); // spawn
+      const after = new Date().toISOString();
+
+      const rigs = await spider.list();
+      assert.equal(rigs.length, 1);
+      const { createdAt } = rigs[0];
+      assert.equal(typeof createdAt, 'string');
+      assert.ok(!isNaN(new Date(createdAt).getTime()), 'createdAt must be a valid date');
+      assert.ok(createdAt >= before, 'createdAt must not be before spawn');
+      assert.ok(createdAt <= after, 'createdAt must not be after spawn');
+    });
+  });
+
   // ── Walk returns null ──────────────────────────────────────────────
 
   describe('walk() returns null', () => {
diff --git a/packages/plugins/spider/src/spider.ts b/packages/plugins/spider/src/spider.ts
index d63ac73..0554c1d 100644
--- a/packages/plugins/spider/src/spider.ts
+++ b/packages/plugins/spider/src/spider.ts
@@ -18,13 +18,14 @@
 
 import type { Plugin, StartupContext } from '@shardworks/nexus-core';
 import { guild, generateId } from '@shardworks/nexus-core';
-import type { StacksApi, Book, ReadOnlyBook } from '@shardworks/stacks-apparatus';
+import type { StacksApi, Book, ReadOnlyBook, WhereClause } from '@shardworks/stacks-apparatus';
 import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
 import type { FabricatorApi } from '@shardworks/fabricator-apparatus';
 import type { SessionDoc } from '@shardworks/animator-apparatus';
 
 import type {
   RigDoc,
+  RigFilters,
   EngineInstance,
   SpiderApi,
   CrawlResult,
@@ -39,7 +40,7 @@ import {
   sealEngine,
 } from './engines/index.ts';
 
-import { crawlTool, crawlContinualTool } from './tools/index.ts';
+import { crawlTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool } from './tools/index.ts';
 
 // ── Helpers ────────────────────────────────────────────────────────────
 
@@ -320,6 +321,7 @@ export function createSpider(): Plugin {
         writId: writ.id,
         status: 'running',
         engines,
+        createdAt: new Date().toISOString(),
       };
 
       await rigsBook.put(rig);
@@ -358,6 +360,33 @@ export function createSpider(): Plugin {
 
       return null;
     },
+
+    async show(id: string): Promise<RigDoc> {
+      const results = await rigsBook.find({ where: [['id', '=', id]], limit: 1 });
+      if (results.length === 0) {
+        throw new Error(`Rig "${id}" not found.`);
+      }
+      return results[0];
+    },
+
+    async list(filters?: RigFilters): Promise<RigDoc[]> {
+      const where: WhereClause = [];
+      if (filters?.status !== undefined) {
+        where.push(['status', '=', filters.status]);
+      }
+      const limit = filters?.limit ?? 20;
+      return rigsBook.find({
+        where,
+        orderBy: ['createdAt', 'desc'],
+        limit,
+        ...(filters?.offset !== undefined ? { offset: filters.offset } : {}),
+      });
+    },
+
+    async forWrit(writId: string): Promise<RigDoc | null> {
+      const results = await rigsBook.find({ where: [['writId', '=', writId]], limit: 1 });
+      return results[0] ?? null;
+    },
   };
 
   // ── Apparatus ─────────────────────────────────────────────────────
@@ -369,7 +398,7 @@ export function createSpider(): Plugin {
       supportKit: {
         books: {
           rigs: {
-            indexes: ['status', 'writId', ['status', 'writId']],
+            indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
           },
         },
         engines: {
@@ -379,7 +408,7 @@ export function createSpider(): Plugin {
           revise:    reviseEngine,
           seal:      sealEngine,
         },
-        tools: [crawlTool, crawlContinualTool],
+        tools: [crawlTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool],
       },
 
       provides: api,
diff --git a/packages/plugins/spider/src/tools/index.ts b/packages/plugins/spider/src/tools/index.ts
index b497c1b..5324f0d 100644
--- a/packages/plugins/spider/src/tools/index.ts
+++ b/packages/plugins/spider/src/tools/index.ts
@@ -1,2 +1,5 @@
 export { default as crawlTool } from './crawl.ts';
 export { default as crawlContinualTool } from './crawl-continual.ts';
+export { default as rigShowTool } from './rig-show.ts';
+export { default as rigListTool } from './rig-list.ts';
+export { default as rigForWritTool } from './rig-for-writ.ts';
diff --git a/packages/plugins/spider/src/tools/rig-for-writ.ts b/packages/plugins/spider/src/tools/rig-for-writ.ts
new file mode 100644
index 0000000..a6a2de7
--- /dev/null
+++ b/packages/plugins/spider/src/tools/rig-for-writ.ts
@@ -0,0 +1,23 @@
+/**
+ * rig-for-writ tool — find the rig for a given writ.
+ */
+
+import { z } from 'zod';
+import { guild } from '@shardworks/nexus-core';
+import { tool } from '@shardworks/tools-apparatus';
+import type { SpiderApi } from '../types.ts';
+
+export default tool({
+  name: 'rig-for-writ',
+  description: 'Find the rig for a given writ',
+  instructions:
+    'Returns the RigDoc for the given writ id, or null if no rig has been spawned yet.',
+  params: {
+    writId: z.string().describe('The writ id to look up.'),
+  },
+  permission: 'read',
+  handler: async (params) => {
+    const spider = guild().apparatus<SpiderApi>('spider');
+    return spider.forWrit(params.writId);
+  },
+});
diff --git a/packages/plugins/spider/src/tools/rig-list.ts b/packages/plugins/spider/src/tools/rig-list.ts
new file mode 100644
index 0000000..abcd58c
--- /dev/null
+++ b/packages/plugins/spider/src/tools/rig-list.ts
@@ -0,0 +1,39 @@
+/**
+ * rig-list tool — list rigs with optional filters.
+ */
+
+import { z } from 'zod';
+import { guild } from '@shardworks/nexus-core';
+import { tool } from '@shardworks/tools-apparatus';
+import type { SpiderApi, RigStatus } from '../types.ts';
+
+export default tool({
+  name: 'rig-list',
+  description: 'List rigs with optional filters',
+  instructions:
+    'Returns rigs ordered by createdAt descending (newest first). ' +
+    'Optionally filter by status and control pagination with limit and offset.',
+  params: {
+    status: z
+      .enum(['running', 'completed', 'failed'])
+      .optional()
+      .describe('Filter by rig status.'),
+    limit: z
+      .number()
+      .optional()
+      .describe('Maximum number of results (default: 20).'),
+    offset: z
+      .number()
+      .optional()
+      .describe('Number of results to skip.'),
+  },
+  permission: 'read',
+  handler: async (params) => {
+    const spider = guild().apparatus<SpiderApi>('spider');
+    return spider.list({
+      status: params.status as RigStatus | undefined,
+      limit: params.limit,
+      offset: params.offset,
+    });
+  },
+});
diff --git a/packages/plugins/spider/src/tools/rig-show.ts b/packages/plugins/spider/src/tools/rig-show.ts
new file mode 100644
index 0000000..7533211
--- /dev/null
+++ b/packages/plugins/spider/src/tools/rig-show.ts
@@ -0,0 +1,22 @@
+/**
+ * rig-show tool — retrieve a rig by id.
+ */
+
+import { z } from 'zod';
+import { guild } from '@shardworks/nexus-core';
+import { tool } from '@shardworks/tools-apparatus';
+import type { SpiderApi } from '../types.ts';
+
+export default tool({
+  name: 'rig-show',
+  description: 'Retrieve a rig by id',
+  instructions: 'Returns the full RigDoc for the given rig id. Throws if the rig does not exist.',
+  params: {
+    id: z.string().describe('The rig id to look up.'),
+  },
+  permission: 'read',
+  handler: async (params) => {
+    const spider = guild().apparatus<SpiderApi>('spider');
+    return spider.show(params.id);
+  },
+});
diff --git a/packages/plugins/spider/src/types.ts b/packages/plugins/spider/src/types.ts
index c04c1e4..2758ee7 100644
--- a/packages/plugins/spider/src/types.ts
+++ b/packages/plugins/spider/src/types.ts
@@ -67,6 +67,22 @@ export interface RigDoc {
   status: RigStatus;
   /** Ordered engine pipeline. */
   engines: EngineInstance[];
+  /** ISO timestamp when the rig was created. */
+  createdAt: string;
+}
+
+// ── Rig filters ───────────────────────────────────────────────────────
+
+/**
+ * Filters for listing rigs.
+ */
+export interface RigFilters {
+  /** Filter by rig status. */
+  status?: RigStatus;
+  /** Maximum number of results (default: 20). */
+  limit?: number;
+  /** Number of results to skip. */
+  offset?: number;
 }
 
 // ── CrawlResult ────────────────────────────────────────────────────────
@@ -101,6 +117,21 @@ export interface SpiderApi {
    * Returns null when no work is available.
    */
   crawl(): Promise<CrawlResult | null>;
+
+  /**
+   * Show a rig by id. Throws if not found.
+   */
+  show(id: string): Promise<RigDoc>;
+
+  /**
+   * List rigs with optional filters, ordered by createdAt descending.
+   */
+  list(filters?: RigFilters): Promise<RigDoc[]>;
+
+  /**
+   * Find the rig for a given writ. Returns null if no rig exists.
+   */
+  forWrit(writId: string): Promise<RigDoc | null>;
 }
 
 // ── Configuration ─────────────────────────────────────────────────────

```

## Full File Contents (for context)

=== FILE: packages/plugins/spider/src/index.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */

import { createSpider } from './spider.ts';

// ── Public types ──────────────────────────────────────────────────────

export type {
  EngineStatus,
  EngineInstance,
  RigStatus,
  RigDoc,
  RigFilters,
  CrawlResult,
  SpiderApi,
  SpiderConfig,
  DraftYields,
  SealYields,
} from './types.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createSpider();

=== FILE: packages/plugins/spider/src/spider.test.ts ===
/**
 * Spider — unit tests.
 *
 * Tests rig lifecycle, walk priority ordering, engine execution (clockwork
 * and quick), failure propagation, and CDC-driven writ transitions.
 *
 * Uses in-memory Stacks backend and mock Guild singleton.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild, generateId } from '@shardworks/nexus-core';
import type { Guild, GuildConfig, LoadedKit, LoadedApparatus, StartupContext } from '@shardworks/nexus-core';

import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createClerk } from '@shardworks/clerk-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';

import { createFabricator } from '@shardworks/fabricator-apparatus';
import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparatus';

import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';

import { createSpider } from './spider.ts';
import type { SpiderApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';

// ── Test bootstrap ────────────────────────────────────────────────────

/**
 * Build a minimal StartupContext that captures and fires events.
 */
function buildCtx(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();
  const ctx: StartupContext = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
  async function fire(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event) ?? []) {
      await h(...args);
    }
  }
  return { ctx, fire };
}

/**
 * Full integration fixture: starts Stacks (memory), Clerk, Fabricator,
 * and Spider. Returns handles to each API plus mock animator controls.
 */
function buildFixture(
  guildConfig: Partial<GuildConfig> = {},
  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string; output?: string } = { status: 'completed' },
): {
  stacks: StacksApi;
  clerk: ClerkApi;
  fabricator: FabricatorApi;
  spider: SpiderApi;
  memBackend: InstanceType<typeof MemoryBackend>;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
  summonCalls: SummonRequest[];
  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) => void;
} {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const clerkPlugin = createClerk();
  const fabricatorPlugin = createFabricator();
  const spiderPlugin = createSpider();

  if (!('apparatus' in stacksPlugin)) throw new Error('stacks must be apparatus');
  if (!('apparatus' in clerkPlugin)) throw new Error('clerk must be apparatus');
  if (!('apparatus' in fabricatorPlugin)) throw new Error('fabricator must be apparatus');
  if (!('apparatus' in spiderPlugin)) throw new Error('spider must be apparatus');

  const stacksApparatus = stacksPlugin.apparatus;
  const clerkApparatus = clerkPlugin.apparatus;
  const fabricatorApparatus = fabricatorPlugin.apparatus;
  const spiderApparatus = spiderPlugin.apparatus;

  const apparatusMap = new Map<string, unknown>();

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    ...guildConfig,
  };

  const fakeGuild: Guild = {
    home: '/tmp/test-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not found`);
      return api as T;
    },
    config<T>(_pluginId: string): T { return {} as T; },
    writeConfig() {},
    guildConfig() { return fakeGuildConfig; },
    kits(): LoadedKit[] { return []; },
    apparatuses(): LoadedApparatus[] { return []; },
  };

  setGuild(fakeGuild);

  // Start stacks with memory backend
  const noopCtx = { on: () => {} };
  stacksApparatus.start(noopCtx);
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Manually ensure all books the Spider and Clerk need
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
  });
  memBackend.ensureBook({ ownerId: 'spider', book: 'rigs' }, {
    indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
  });
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status'],
  });

  // Mock animator — captures summon() calls and writes session docs to Stacks.
  // The session record is written eagerly (synchronous put, fire-and-forget)
  // so the Spider's collect step finds it on the next crawl() call. Engines
  // no longer await handle.result — they return immediately with handle.sessionId.
  let currentSessionOutcome = initialSessionOutcome;
  const summonCalls: SummonRequest[] = [];
  const mockAnimatorApi: AnimatorApi = {
    summon(request: SummonRequest): AnimateHandle {
      summonCalls.push(request);
      const sessionId = generateId('ses', 4);
      const startedAt = new Date().toISOString();
      const outcome = currentSessionOutcome;

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      const endedAt = new Date().toISOString();
      const doc: SessionDoc = {
        id: sessionId,
        status: outcome.status,
        startedAt,
        endedAt,
        durationMs: 0,
        provider: 'mock',
        exitCode: outcome.status === 'completed' ? 0 : 1,
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.output !== undefined ? { output: outcome.output } : {}),
        metadata: request.metadata,
      };
      // Write eagerly — fire and forget. The in-memory backend is sync.
      void sessBook.put(doc);

      const result = Promise.resolve({
        id: sessionId,
        status: outcome.status,
        startedAt,
        endedAt,
        durationMs: 0,
        provider: 'mock',
        exitCode: outcome.status === 'completed' ? 0 : 1,
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.output !== undefined ? { output: outcome.output } : {}),
        metadata: request.metadata,
      } as SessionResult);

      async function* emptyChunks(): AsyncIterable<SessionChunk> {}
      return { sessionId, chunks: emptyChunks(), result };
    },
    animate(): AnimateHandle {
      throw new Error('animate() not used in Spider tests');
    },
  };
  apparatusMap.set('animator', mockAnimatorApi);

  // Start clerk
  clerkApparatus.start(noopCtx);
  const clerk = clerkApparatus.provides as ClerkApi;
  apparatusMap.set('clerk', clerk);

  // Start fabricator with its own ctx so we can fire events
  const { ctx: fabricatorCtx, fire } = buildCtx();
  fabricatorApparatus.start(fabricatorCtx);
  const fabricator = fabricatorApparatus.provides as FabricatorApi;
  apparatusMap.set('fabricator', fabricator);

  // Start spider
  spiderApparatus.start(noopCtx);
  const spider = spiderApparatus.provides as SpiderApi;
  apparatusMap.set('spider', spider);

  // Simulate plugin:initialized for the Spider so the Fabricator scans
  // its supportKit and picks up the five engine designs.
  const spiderLoaded: LoadedApparatus = {
    packageName: '@shardworks/spider-apparatus',
    id: 'spider',
    version: '0.0.0',
    apparatus: spiderApparatus,
  };
  // Fire synchronously — fabricator's handler is sync
  void fire('plugin:initialized', spiderLoaded);

  return {
    stacks, clerk, fabricator, spider, memBackend, fire,
    summonCalls,
    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) {
      currentSessionOutcome = outcome;
    },
  };
}

/** Get the rigs book. */
function rigsBook(stacks: StacksApi) {
  return stacks.book<RigDoc>('spider', 'rigs');
}

/** Post a writ. */
async function postWrit(clerk: ClerkApi, title = 'Test writ', codex?: string): Promise<WritDoc> {
  return clerk.post({ title, body: 'Test body', codex });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Spider', () => {
  let fix: ReturnType<typeof buildFixture>;

  beforeEach(() => {
    fix = buildFixture();
  });

  afterEach(() => {
    clearGuild();
  });

  // ── Fabricator integration ─────────────────────────────────────────

  describe('Fabricator — Spider engine registration', () => {
    it('registers all five engine designs in the Fabricator', () => {
      const { fabricator } = fix;
      assert.ok(fabricator.getEngineDesign('draft'), 'draft engine registered');
      assert.ok(fabricator.getEngineDesign('implement'), 'implement engine registered');
      assert.ok(fabricator.getEngineDesign('review'), 'review engine registered');
      assert.ok(fabricator.getEngineDesign('revise'), 'revise engine registered');
      assert.ok(fabricator.getEngineDesign('seal'), 'seal engine registered');
    });

    it('returns undefined for an unknown engine ID', () => {
      assert.equal(fix.fabricator.getEngineDesign('nonexistent'), undefined);
    });
  });

  // ── walk() idle ────────────────────────────────────────────────────

  describe('walk() — idle', () => {
    it('returns null when there is no work', async () => {
      const result = await fix.spider.crawl();
      assert.equal(result, null);
    });
  });

  // ── Spawn ──────────────────────────────────────────────────────────

  describe('walk() — spawn', () => {
    it('spawns a rig for a ready writ and transitions writ to active', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk);
      assert.equal(writ.status, 'ready');

      const result = await spider.crawl();
      assert.ok(result !== null, 'expected a walk result');
      assert.equal(result.action, 'rig-spawned');
      assert.equal((result as { writId: string }).writId, writ.id);

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
      assert.equal(rigs[0].writId, writ.id);
      assert.equal(rigs[0].status, 'running');
      assert.equal(rigs[0].engines.length, 5);

      // Writ should now be active
      const updatedWrit = await clerk.show(writ.id);
      assert.equal(updatedWrit.status, 'active');
    });

    it('does not spawn a second rig for a writ that already has one', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);

      await spider.crawl(); // spawns rig

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1, 'only one rig should exist');
    });

    it('spawns rigs for the oldest ready writ first (FIFO)', async () => {
      const { clerk, spider } = fix;

      // Small delay to ensure different createdAt timestamps
      const w1 = await postWrit(clerk, 'First writ');
      await new Promise((r) => setTimeout(r, 2));
      const w2 = await postWrit(clerk, 'Second writ');

      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'rig-spawned');
      assert.equal((r1 as { writId: string }).writId, w1.id);

      // Mark rig1 as failed so w2 can spawn
      const rigs = await rigsBook(fix.stacks).list();
      await rigsBook(fix.stacks).patch(rigs[0].id, { status: 'failed' });

      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'rig-spawned');
      assert.equal((r2 as { writId: string }).writId, w2.id);
    });
  });

  // ── Priority ordering ──────────────────────────────────────────────

  describe('walk() — priority ordering: collect > run > spawn', () => {
    it('runs before spawning when a rig already exists', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);

      // Spawn the rig
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'rig-spawned');

      // Second walk should run (not spawn another rig)
      // The draft engine will fail (no codexes), resulting in 'rig-completed'
      const r2 = await spider.crawl();
      assert.notEqual(r2?.action, 'rig-spawned');
      // Only one rig created
      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
    });

    it('collects before running when a running engine has a terminal session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Set draft to running with a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
          : e,
      );
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session
      const sessBook = stacks.book<{ id: string; status: string; startedAt: string; provider: string; [key: string]: unknown }>('animator', 'sessions');
      await sessBook.put({ id: fakeSessionId, status: 'completed', startedAt: new Date().toISOString(), provider: 'test' });

      // Walk should collect (not run implement which has no completed upstream)
      const r = await spider.crawl();
      assert.equal(r?.action, 'engine-completed');
      assert.equal((r as { engineId: string }).engineId, 'draft');
    });
  });

  // ── Engine readiness ───────────────────────────────────────────────

  describe('engine readiness — upstream must complete first', () => {
    it('only the first engine (no upstream) is runnable initially', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();

      // All engines except draft should have upstream
      const draft = rig.engines.find((e: EngineInstance) => e.id === 'draft');
      const implement = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.deepEqual(draft?.upstream, []);
      assert.deepEqual(implement?.upstream, ['draft']);
    });

    it('implement only launches after draft is completed', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft as completed
      const updatedEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig.id, { engines: updatedEngines });

      // Now walk should launch implement (quick engine → 'engine-started', not 'engine-completed')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');
    });
  });

  // ── Quick engine execution (implement) ────────────────────────────

  describe('implement engine execution', () => {
    it('launches session on first walk, then collects yields on second walk', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft so implement can run
      const updatedEngines = rig0.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig0.id, { engines: updatedEngines });

      // Walk: implement launches an Animator session (quick engine → 'engine-started')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [rig1] = await book.list();
      const impl1 = rig1.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl1?.status, 'running', 'engine should be running after launch');
      assert.ok(impl1?.sessionId !== undefined, 'sessionId should be stored');

      // Walk: collect step finds the terminal session and stores yields
      const result2 = await spider.crawl();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'implement');

      const [rig2] = await book.list();
      const impl2 = rig2.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl2?.status, 'completed');
      assert.ok(impl2?.yields !== undefined, 'yields should be stored');
      assert.doesNotThrow(() => JSON.stringify(impl2?.yields));
    });

    it('marks engine and rig failed when engine design is not found', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Inject a bad designId for draft
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'nonexistent-engine' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error?.includes('nonexistent-engine'));
    });
  });

  // ── Yield serialization failure ────────────────────────────────────

  describe('yield serialization failure', () => {
    it('non-serializable engine yields cause engine and rig failure', async () => {
      const { clerk, spider, stacks, fire } = fix;

      // Register an engine design that returns non-JSON-serializable yields
      const badEngine: EngineDesign = {
        id: 'bad-engine',
        async run() {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { status: 'completed' as const, yields: { fn: (() => {}) as any } };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/bad-engine',
        id: 'test-bad',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { 'bad-engine': badEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Patch draft to use the bad engine design
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, designId: 'bad-engine' } : e,
        ),
      });

      const result = await spider.crawl();
      assert.ok(result !== null);
      assert.equal(result.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error !== undefined && draft.error.length > 0, `expected engine to have an error, got: ${draft?.error}`);
    });
  });

  // ── Implement engine — summon args and prompt wrapping ────────────

  describe('implement engine — Animator integration', () => {
    it('calls animator.summon() with role, prompt, cwd, environment, and metadata', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'My commission', 'my-codex');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/the/worktree' } }
            : e,
        ),
      });

      const launchResult = await spider.crawl(); // launch implement
      assert.equal(launchResult?.action, 'engine-started');

      assert.equal(summonCalls.length, 1, 'summon should be called once');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'role defaults to artificer');
      assert.equal(call.cwd, '/the/worktree', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
      assert.deepEqual(call.metadata, { engineId: 'implement', writId: writ.id });
    });

    it('wraps the writ body with a commit instruction', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await clerk.post({ title: 'My writ', body: 'Build the feature.' });
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      const launchResult2 = await spider.crawl(); // launch implement
      assert.equal(launchResult2?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const expectedPrompt = 'Build the feature.\n\nCommit all changes before ending your session.';
      assert.equal(summonCalls[0].prompt, expectedPrompt);
    });

    it('session failure propagates: engine fails → rig fails → writ transitions to failed', async () => {
      const { clerk, spider, stacks, setSessionOutcome } = fix;
      setSessionOutcome({ status: 'failed', error: 'Process exited with code 1' });

      const writ = await postWrit(clerk, 'Failing writ');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await spider.crawl(); // launch implement (session already terminal in Stacks)
      await spider.crawl(); // collect: session failed → engine fails → rig fails

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed', 'rig should be failed');
      const impl = updatedRig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed', 'implement engine should be failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed', 'writ should transition to failed via CDC');
    });

    it('ImplementYields contain sessionId and sessionStatus from the session record', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk, 'Yields test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await spider.crawl(); // launch
      await spider.crawl(); // collect

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      const yields = impl?.yields as Record<string, unknown>;
      assert.ok(typeof yields.sessionId === 'string', 'sessionId should be a string');
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── Quick engine collect ───────────────────────────────────────────

  describe('quick engine — collect', () => {
    it('collects yields from a terminal session in the sessions book', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Simulate: draft completed, implement launched a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x', codexName: 'c', branch: 'b', path: '/p' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session record
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        output?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: 'Session completed successfully',
      });

      // Walk: collect step should find the terminal session
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      assert.ok(impl?.yields !== undefined);
      const yields = impl?.yields as Record<string, unknown>;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });

    it('marks engine and rig failed when session failed', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        error?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'failed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        error: 'Process exited with code 1',
      });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed');
    });

    it('does not collect a still-running session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Session is still running
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      // Nothing to collect, implement is running (no pending with completed upstream),
      // spawn skips (rig exists) → null
      const result = await spider.crawl();
      assert.equal(result, null);
    });
  });

  // ── Failure propagation ────────────────────────────────────────────

  describe('failure propagation', () => {
    it('engine failure → rig failed → writ transitions to failed via CDC', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk);

      await spider.crawl(); // spawn (writ → active)
      const activeWrit = await clerk.show(writ.id);
      assert.equal(activeWrit.status, 'active');

      // Inject bad design to trigger failure
      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'broken' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      // Walk: engine fails → rig fails → CDC → writ fails
      await spider.crawl();

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed');
    });
  });

  // ── Givens/context assembly ────────────────────────────────────────

  describe('givens and context assembly', () => {
    it('each engine receives only the givens it needs', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk, 'My writ');
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const eng = (id: string) => rig.engines.find((e: EngineInstance) => e.id === id)!;

      // draft: { writ } — no role
      assert.ok('writ' in eng('draft').givensSpec, 'draft should have writ');
      assert.ok(!('role' in eng('draft').givensSpec), 'draft should not have role');
      assert.equal((eng('draft').givensSpec.writ as WritDoc).id, writ.id);

      // implement: { writ, role }
      assert.ok('writ' in eng('implement').givensSpec, 'implement should have writ');
      assert.ok('role' in eng('implement').givensSpec, 'implement should have role');
      assert.equal((eng('implement').givensSpec.writ as WritDoc).id, writ.id);

      // review: { writ, role: 'reviewer' }
      assert.ok('writ' in eng('review').givensSpec, 'review should have writ');
      assert.equal(eng('review').givensSpec.role, 'reviewer', 'review role should be hardcoded reviewer');

      // revise: { writ, role }
      assert.ok('writ' in eng('revise').givensSpec, 'revise should have writ');
      assert.ok('role' in eng('revise').givensSpec, 'revise should have role');

      // seal: {}
      assert.deepEqual(eng('seal').givensSpec, {}, 'seal should get empty givensSpec');
    });

    it('role defaults to "artificer" when not configured', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const implementEngine = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(implementEngine?.givensSpec.role, 'artificer');
    });

    it('upstream map is built from completed engine yields', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft + implement as completed
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      const implYields = { sessionId: 'stub', sessionStatus: 'completed' };
      const updatedEngines = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: implYields };
        return e;
      });
      await book.patch(rig.id, { engines: updatedEngines });

      // Walk: review launches a session (quick engine → 'engine-started')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      // Walk: collect step picks up the completed review session
      const result2 = await spider.crawl();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'review');
    });
  });

  // ── Draft engine — baseSha population ──────────────────────────────

  describe('draft engine — baseSha', () => {
    it('includes baseSha in DraftYields when draft is completed', async () => {
      // The draft engine calls execSync('git rev-parse HEAD') which we can't
      // run in test (no real Scriptorium). Verify that baseSha flows through
      // the rig correctly when pre-completed with yields.
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'abc123def' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // Verify baseSha is present in the stored yields
      const [updated] = await book.list();
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'completed');
      const yields = draft?.yields as Record<string, unknown>;
      assert.equal(yields.baseSha, 'abc123def', 'baseSha should be populated in DraftYields');
    });
  });

  // ── Full pipeline ─────────────────────────────────────────────────

  describe('full pipeline', () => {
    it('walks through implement → review → revise → rig completion → writ completed', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk, 'Full pipeline test');

      await spider.crawl(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (real impl would need codexes)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // Walk: implement launches an Animator session (quick engine)
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // Walk: collect step picks up the completed implement session
      const r1c = await spider.crawl();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // Walk: review launches a session (quick engine)
      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // Walk: collect review session
      const r2c = await spider.crawl();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // Walk: revise launches a session (quick engine)
      const r3 = await spider.crawl();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // Walk: collect revise session
      const r3c = await spider.crawl();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // Pre-complete seal (real impl would need codexes)
      const [rig3] = await book.list();
      const sealYields = { sealedCommit: 'abc123', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 5 };
      await book.patch(rig3.id, {
        engines: rig3.engines.map((e: EngineInstance) =>
          e.id === 'seal' ? { ...e, status: 'completed' as const, yields: sealYields } : e,
        ),
        status: 'completed',
      });

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });

    it('walks all 5 engines to rig completion without manual seal patching', async () => {
      const { clerk, spider, stacks, fire } = fix;

      // Register a stub seal engine that doesn't require Scriptorium
      const stubSealEngine: EngineDesign = {
        id: 'seal',
        async run() {
          return {
            status: 'completed' as const,
            yields: { sealedCommit: 'abc', strategy: 'fast-forward' as const, retries: 0, inscriptionsSealed: 1 },
          };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/stub-seal',
        id: 'test-seal',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { seal: stubSealEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      const writ = await postWrit(clerk, 'Full pipeline stub seal');
      await spider.crawl(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (requires Scriptorium — not available in tests)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // implement launches
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // collect implement
      const r1c = await spider.crawl();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // review launches (quick engine)
      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // collect review
      const r2c = await spider.crawl();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // revise launches (quick engine)
      const r3 = await spider.crawl();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // collect revise
      const r3c = await spider.crawl();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // seal runs (stub) — last engine → rig completes
      const r4 = await spider.crawl();
      assert.equal(r4?.action, 'rig-completed');
      assert.equal((r4 as { outcome: string }).outcome, 'completed');

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed', 'writ should transition to completed via CDC');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });
  });

  // ── Review engine — Animator integration ─────────────────────────

  describe('review engine — Animator integration', () => {
    it('calls animator.summon() with reviewer role, draft cwd, and prompt containing spec', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Review integration test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch review
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      assert.equal(summonCalls.length, 1, 'summon should be called once for review');
      const call = summonCalls[0];
      assert.equal(call.role, 'reviewer', 'review engine uses reviewer role');
      assert.equal(call.cwd, '/p', 'cwd is the draft worktree path');
      assert.ok(call.prompt.includes('# Code Review'), 'prompt includes review header');
      assert.ok(call.prompt.includes(writ.body), 'prompt includes writ body (spec)');
      assert.ok(call.prompt.includes('## Instructions'), 'prompt includes instructions section');
      assert.ok(call.prompt.includes('### Overall: PASS or FAIL'), 'prompt includes findings format');
      assert.deepEqual(call.metadata?.mechanicalChecks, [], 'no mechanical checks when not configured');
    });

    it('collects ReviewYields: parses PASS from session.output', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const findings = '### Overall: PASS\n\n### Completeness\nAll requirements met.';
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: findings,
        metadata: { mechanicalChecks: [] },
      });

      const result = await spider.crawl(); // collect review
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'review');

      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.passed, true, 'passed should be true when output contains PASS');
      assert.equal(yields.findings, findings);
      assert.deepEqual(yields.mechanicalChecks, []);
    });

    it('collects ReviewYields: passed is false when output contains FAIL', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        metadata: { mechanicalChecks: [] },
      });

      await spider.crawl(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.passed, false, 'passed should be false when output contains FAIL');
    });

    it('collects ReviewYields: mechanicalChecks retrieved from session.metadata', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const checks: MechanicalCheck[] = [
        { name: 'build', passed: true, output: 'Build succeeded', durationMs: 1200 },
        { name: 'test', passed: false, output: '3 tests failed', durationMs: 4500 },
      ];
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL',
        metadata: { mechanicalChecks: checks },
      });

      await spider.crawl(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.mechanicalChecks.length, 2);
      assert.equal(yields.mechanicalChecks[0].name, 'build');
      assert.equal(yields.mechanicalChecks[0].passed, true);
      assert.equal(yields.mechanicalChecks[1].name, 'test');
      assert.equal(yields.mechanicalChecks[1].passed, false);
    });
  });

  // ── Review engine — mechanical checks ────────────────────────────

  describe('review engine — mechanical checks', () => {
    let mechFix: ReturnType<typeof buildFixture>;

    beforeEach(() => {
      mechFix = buildFixture({
        spider: {
          buildCommand: 'echo "build output"',
          testCommand: 'exit 1',
        },
      });
    });

    afterEach(() => {
      clearGuild();
    });

    it('executes build and test commands; captures pass/fail from exit code', async () => {
      const { clerk, spider, stacks, summonCalls } = mechFix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch review (runs checks first)
      assert.equal(result?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const checks = summonCalls[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.equal(checks.length, 2, 'both build and test checks should run');

      const buildCheck = checks.find((c) => c.name === 'build');
      assert.ok(buildCheck, 'build check should be present');
      assert.equal(buildCheck!.passed, true, 'echo exits 0 → passed');
      assert.ok(buildCheck!.output.includes('build output'), 'output captured from stdout');
      assert.ok(typeof buildCheck!.durationMs === 'number', 'durationMs recorded');

      const testCheck = checks.find((c) => c.name === 'test');
      assert.ok(testCheck, 'test check should be present');
      assert.equal(testCheck!.passed, false, 'exit 1 → failed');
    });

    it('skips checks gracefully when no buildCommand or testCommand configured', async () => {
      const noCmdFix = buildFixture({ spider: {} }); // no buildCommand/testCommand
      const { clerk, spider: w, stacks: s, summonCalls: sc } = noCmdFix;
      await postWrit(clerk);
      await w.crawl(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.crawl(); // launch review
      assert.deepEqual(sc[0].metadata?.mechanicalChecks, [], 'no checks when commands not configured');
      clearGuild();
    });

    it('truncates check output to 4KB', async () => {
      const bigFix = buildFixture({
        spider: { buildCommand: 'python3 -c "print(\'x\' * 8192)"' },
      });
      const { clerk, spider: w, stacks: s, summonCalls: sc } = bigFix;
      await postWrit(clerk);
      await w.crawl(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.crawl(); // launch review (runs check with big output)
      const checks = sc[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.ok(checks[0].output.length <= 4096, `output should be truncated to 4KB, got ${checks[0].output.length} chars`);
      clearGuild();
    });
  });

  // ── Revise engine — Animator integration ─────────────────────────

  describe('revise engine — Animator integration', () => {
    it('calls animator.summon() with role from givens, draft cwd, and writ env', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Revise integration test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS\nAll good.', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch revise
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      assert.equal(summonCalls.length, 1, 'summon called once for revise');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'revise uses role from givens (default artificer)');
      assert.equal(call.cwd, '/p', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
    });

    it('revision prompt includes pass branch when review passed', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Pass branch test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: true,
        findings: '### Overall: PASS\nAll requirements met.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await spider.crawl(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: PASS'), 'prompt includes PASS result');
      assert.ok(prompt.includes('The review passed'), 'prompt includes pass branch instruction');
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('revision prompt includes fail branch when review failed', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Fail branch test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: false,
        findings: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await spider.crawl(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: FAIL'), 'prompt includes FAIL result');
      assert.ok(
        prompt.includes('The review identified issues that need to be addressed'),
        'prompt includes fail branch instruction',
      );
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('ReviseYields: sessionId and sessionStatus collected from session record', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          if (e.id === 'revise') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await spider.crawl(); // collect revise
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      const [updated] = await book.list();
      const reviseEngine = updated.engines.find((e: EngineInstance) => e.id === 'revise');
      const yields = reviseEngine?.yields as { sessionId: string; sessionStatus: string };
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── show / list / forWrit ─────────────────────────────────────────

  describe('show()', () => {
    it('returns the full RigDoc for a valid rig id', async () => {
      const { clerk, spider } = fix;
      const writ = await postWrit(clerk);
      await spider.crawl(); // spawn

      const rigs = await spider.list();
      assert.equal(rigs.length, 1);
      const rigId = rigs[0].id;

      const rig = await spider.show(rigId);
      assert.equal(rig.id, rigId);
      assert.equal(rig.writId, writ.id);
      assert.equal(rig.status, 'running');
      assert.equal(rig.engines.length, 5);
      assert.equal(typeof rig.createdAt, 'string');
    });

    it('throws with "not found" message for an unknown rig id', async () => {
      const { spider } = fix;
      await assert.rejects(
        () => spider.show('rig-nonexistent'),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message, 'Rig "rig-nonexistent" not found.');
          return true;
        },
      );
    });
  });

  describe('list()', () => {
    it('returns empty array when no rigs exist', async () => {
      const { spider } = fix;
      const rigs = await spider.list();
      assert.deepEqual(rigs, []);
    });

    it('returns rigs ordered by createdAt descending', async () => {
      const { stacks, spider } = fix;
      const book = rigsBook(stacks);
      const older = new Date(Date.now() - 100).toISOString();
      const newer = new Date().toISOString();
      await book.put({ id: 'rig-old', writId: 'w-1', status: 'running', engines: [], createdAt: older });
      await book.put({ id: 'rig-new', writId: 'w-2', status: 'running', engines: [], createdAt: newer });

      const rigs = await spider.list();
      assert.equal(rigs.length, 2);
      // Newest first
      assert.ok(rigs[0].createdAt >= rigs[1].createdAt);
    });

    it('filters by status', async () => {
      const { clerk, spider } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn (status: running)

      const running = await spider.list({ status: 'running' });
      assert.equal(running.length, 1);
      assert.equal(running[0].status, 'running');

      const completed = await spider.list({ status: 'completed' });
      assert.equal(completed.length, 0);
    });

    it('respects limit', async () => {
      const { stacks, spider } = fix;
      const book = rigsBook(stacks);
      for (let i = 0; i < 3; i++) {
        await book.put({ id: `rig-limit-${i}`, writId: `w-${i}`, status: 'running', engines: [], createdAt: new Date().toISOString() });
      }

      const limited = await spider.list({ limit: 2 });
      assert.equal(limited.length, 2);
    });

    it('respects offset', async () => {
      const { stacks, spider } = fix;
      const book = rigsBook(stacks);
      for (let i = 0; i < 3; i++) {
        await book.put({ id: `rig-offset-${i}`, writId: `w-${i}`, status: 'running', engines: [], createdAt: new Date().toISOString() });
      }

      const all = await spider.list();
      assert.equal(all.length, 3);

      const page = await spider.list({ limit: 2, offset: 2 });
      assert.equal(page.length, 1);
    });
  });

  describe('forWrit()', () => {
    it('returns the rig for a writ that has been spawned', async () => {
      const { clerk, spider } = fix;
      const writ = await postWrit(clerk);
      await spider.crawl(); // spawn

      const rig = await spider.forWrit(writ.id);
      assert.ok(rig !== null);
      assert.equal(rig.writId, writ.id);
    });

    it('returns null when no rig exists for a writ', async () => {
      const { clerk, spider } = fix;
      const writ = await postWrit(clerk);
      // Do not crawl — no rig spawned yet

      const rig = await spider.forWrit(writ.id);
      assert.equal(rig, null);
    });

    it('returns null for a non-existent writ id', async () => {
      const { spider } = fix;
      const rig = await spider.forWrit('w-nonexistent');
      assert.equal(rig, null);
    });
  });

  describe('createdAt', () => {
    it('is set to a valid ISO timestamp when a rig is spawned', async () => {
      const { clerk, spider } = fix;
      const before = new Date().toISOString();
      await postWrit(clerk);
      await spider.crawl(); // spawn
      const after = new Date().toISOString();

      const rigs = await spider.list();
      assert.equal(rigs.length, 1);
      const { createdAt } = rigs[0];
      assert.equal(typeof createdAt, 'string');
      assert.ok(!isNaN(new Date(createdAt).getTime()), 'createdAt must be a valid date');
      assert.ok(createdAt >= before, 'createdAt must not be before spawn');
      assert.ok(createdAt <= after, 'createdAt must not be after spawn');
    });
  });

  // ── Walk returns null ──────────────────────────────────────────────

  describe('walk() returns null', () => {
    it('returns null when no rigs exist and no ready writs', async () => {
      const result = await fix.spider.crawl();
      assert.equal(result, null);
    });

    it('returns null when the rig has a running engine with no terminal session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Put draft in 'running' with a live session
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
            : e,
        ),
      });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await spider.crawl();
      assert.equal(result, null);
    });
  });
});

=== FILE: packages/plugins/spider/src/spider.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > run > spawn   (priority order)
 *
 * collect — check running engines for terminal session results
 * run     — execute the next pending engine (clockwork inline, quick → launch)
 * spawn   — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 *
 * See: docs/architecture/apparatus/spider.md
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book, ReadOnlyBook, WhereClause } from '@shardworks/stacks-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { FabricatorApi } from '@shardworks/fabricator-apparatus';
import type { SessionDoc } from '@shardworks/animator-apparatus';

import type {
  RigDoc,
  RigFilters,
  EngineInstance,
  SpiderApi,
  CrawlResult,
  SpiderConfig,
} from './types.ts';

import {
  draftEngine,
  implementEngine,
  reviewEngine,
  reviseEngine,
  sealEngine,
} from './engines/index.ts';

import { crawlTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool } from './tools/index.ts';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Check whether a value is JSON-serializable.
 * Non-serializable yields cause engine failure — the Stacks cannot store them.
 */
function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the upstream yields map for a rig: all completed engine yields
 * keyed by engine id. Passed as context.upstream to the engine's run().
 */
function buildUpstreamMap(rig: RigDoc): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const engine of rig.engines) {
    if (engine.status === 'completed' && engine.yields !== undefined) {
      upstream[engine.id] = engine.yields;
    }
  }
  return upstream;
}

/**
 * Find the first pending engine whose entire upstream is completed.
 * Returns null if no runnable engine exists.
 */
function findRunnableEngine(rig: RigDoc): EngineInstance | null {
  for (const engine of rig.engines) {
    if (engine.status !== 'pending') continue;
    const allUpstreamDone = engine.upstream.every((upstreamId) => {
      const dep = rig.engines.find((e) => e.id === upstreamId);
      return dep?.status === 'completed';
    });
    if (allUpstreamDone) return engine;
  }
  return null;
}

/**
 * Produce the five-engine static pipeline for a writ.
 * Each engine receives only the givens it needs.
 * Upstream yields arrive via context.upstream at run time.
 */
function buildStaticEngines(writ: WritDoc, config: SpiderConfig): EngineInstance[] {
  const role = config.role ?? 'artificer';
  const reviewGivens: Record<string, unknown> = {
    writ,
    role: 'reviewer',
    ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
    ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
  };

  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],           givensSpec: { writ } },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],     givensSpec: { writ, role } },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'], givensSpec: reviewGivens },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],    givensSpec: { writ, role } },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],    givensSpec: {} },
  ];
}

// ── Apparatus factory ──────────────────────────────────────────────────

export function createSpider(): Plugin {
  let rigsBook: Book<RigDoc>;
  let sessionsBook: ReadOnlyBook<SessionDoc>;
  let writsBook: ReadOnlyBook<WritDoc>;
  let clerk: ClerkApi;
  let fabricator: FabricatorApi;
  let spiderConfig: SpiderConfig = {};

  // ── Internal crawl operations ─────────────────────────────────────

  /**
   * Mark an engine failed and propagate failure to the rig (same update).
   */
  async function failEngine(
    rig: RigDoc,
    engineId: string,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const updatedEngines = rig.engines.map((e) =>
      e.id === engineId
        ? { ...e, status: 'failed' as const, error: errorMessage, completedAt: now }
        : e,
    );
    await rigsBook.patch(rig.id, {
      engines: updatedEngines,
      status: 'failed',
    });
  }

  /**
   * Phase 1 — collect.
   *
   * Find the first running engine with a sessionId whose session has
   * reached a terminal state. Populate yields and advance the engine
   * (and possibly the rig) to completed or failed.
   */
  async function tryCollect(): Promise<CrawlResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      for (const engine of rig.engines) {
        if (engine.status !== 'running' || !engine.sessionId) continue;

        const session = await sessionsBook.get(engine.sessionId);
        if (!session || session.status === 'running') continue;

        // Terminal session found — collect.
        const now = new Date().toISOString();

        if (session.status === 'failed' || session.status === 'timeout') {
          await failEngine(rig, engine.id, session.error ?? `Session ${session.status}`);
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        // Completed session — assemble yields via engine's collect() or generic default.
        const design = fabricator.getEngineDesign(engine.designId);
        let yields: unknown;
        if (design?.collect) {
          const givens = { ...engine.givensSpec };
          const upstream = buildUpstreamMap(rig);
          const context = { engineId: engine.id, upstream };
          yields = await design.collect(engine.sessionId!, givens, context);
        } else {
          yields = {
            sessionId: session.id,
            sessionStatus: session.status,
            ...(session.output !== undefined ? { output: session.output } : {}),
          };
        }

        if (!isJsonSerializable(yields)) {
          await failEngine(rig, engine.id, 'Session yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const updatedEngines = rig.engines.map((e) =>
          e.id === engine.id
            ? { ...e, status: 'completed' as const, yields, completedAt: now }
            : e,
        );

        const allCompleted = updatedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: updatedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: engine.id };
      }
    }
    return null;
  }

  /**
   * Phase 2 — run.
   *
   * Find the first pending engine in any running rig whose upstream is
   * all completed. Execute it:
   * - Clockwork ('completed') → store yields, mark engine completed,
   *   check for rig completion.
   * - Quick ('launched') → store sessionId, mark engine running.
   */
  async function tryRun(): Promise<CrawlResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      const pending = findRunnableEngine(rig);
      if (!pending) continue;

      const design = fabricator.getEngineDesign(pending.designId);
      if (!design) {
        await failEngine(rig, pending.id, `No engine design found for "${pending.designId}"`);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }

      const now = new Date().toISOString();
      const upstream = buildUpstreamMap(rig);
      const givens = { ...pending.givensSpec };
      const context = { engineId: pending.id, upstream };

      let engineResult: Awaited<ReturnType<typeof design.run>>;
      try {
        // Mark engine as running before executing
        const startedEngines = rig.engines.map((e) =>
          e.id === pending.id ? { ...e, status: 'running' as const, startedAt: now } : e,
        );
        await rigsBook.patch(rig.id, { engines: startedEngines });

        // Re-fetch to get the up-to-date engines list (with startedAt set)
        const updatedRig = { ...rig, engines: startedEngines };

        engineResult = await design.run(givens, context);

        if (engineResult.status === 'launched') {
          // Quick engine — store sessionId, leave engine in 'running'
          const { sessionId } = engineResult;
          const launchedEngines = updatedRig.engines.map((e) =>
            e.id === pending.id
              ? { ...e, status: 'running' as const, sessionId }
              : e,
          );
          await rigsBook.patch(rig.id, { engines: launchedEngines });
          return { action: 'engine-started', rigId: rig.id, engineId: pending.id };
        }

        // Clockwork engine — validate and store yields
        const { yields } = engineResult;
        if (!isJsonSerializable(yields)) {
          await failEngine(updatedRig, pending.id, 'Engine yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const completedAt = new Date().toISOString();
        const completedEngines = updatedRig.engines.map((e) =>
          e.id === pending.id
            ? { ...e, status: 'completed' as const, yields, completedAt }
            : e,
        );
        const allCompleted = completedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: completedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: pending.id };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await failEngine(rig, pending.id, errorMessage);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }
    }
    return null;
  }

  /**
   * Phase 3 — spawn.
   *
   * Find the oldest ready writ with no existing rig. Create a rig and
   * transition the writ to active so the Clerk tracks it as in-progress.
   */
  async function trySpawn(): Promise<CrawlResult | null> {
    // Find ready writs ordered by creation time (oldest first)
    const readyWrits = await writsBook.find({
      where: [['status', '=', 'ready']],
      orderBy: ['createdAt', 'asc'],
      limit: 10,
    });

    for (const writ of readyWrits) {
      // Check for existing rig
      const existing = await rigsBook.find({
        where: [['writId', '=', writ.id]],
        limit: 1,
      });
      if (existing.length > 0) continue;

      const rigId = generateId('rig', 4);
      const engines = buildStaticEngines(writ, spiderConfig);

      const rig: RigDoc = {
        id: rigId,
        writId: writ.id,
        status: 'running',
        engines,
        createdAt: new Date().toISOString(),
      };

      await rigsBook.put(rig);

      // Transition writ to active so Clerk tracks it
      try {
        await clerk.transition(writ.id, 'active');
      } catch (err) {
        // Only swallow state-transition conflicts (writ already moved past 'ready')
        if (err instanceof Error && err.message.includes('transition')) {
          // Race condition — another spider got here first. The rig is already created,
          // so we continue. The writ is already active or beyond.
        } else {
          throw err;
        }
      }

      return { action: 'rig-spawned', rigId, writId: writ.id };
    }

    return null;
  }

  // ── SpiderApi ─────────────────────────────────────────────────────

  const api: SpiderApi = {
    async crawl(): Promise<CrawlResult | null> {
      const collected = await tryCollect();
      if (collected) return collected;

      const ran = await tryRun();
      if (ran) return ran;

      const spawned = await trySpawn();
      if (spawned) return spawned;

      return null;
    },

    async show(id: string): Promise<RigDoc> {
      const results = await rigsBook.find({ where: [['id', '=', id]], limit: 1 });
      if (results.length === 0) {
        throw new Error(`Rig "${id}" not found.`);
      }
      return results[0];
    },

    async list(filters?: RigFilters): Promise<RigDoc[]> {
      const where: WhereClause = [];
      if (filters?.status !== undefined) {
        where.push(['status', '=', filters.status]);
      }
      const limit = filters?.limit ?? 20;
      return rigsBook.find({
        where,
        orderBy: ['createdAt', 'desc'],
        limit,
        ...(filters?.offset !== undefined ? { offset: filters.offset } : {}),
      });
    },

    async forWrit(writId: string): Promise<RigDoc | null> {
      const results = await rigsBook.find({ where: [['writId', '=', writId]], limit: 1 });
      return results[0] ?? null;
    },
  };

  // ── Apparatus ─────────────────────────────────────────────────────

  return {
    apparatus: {
      requires: ['stacks', 'clerk', 'fabricator'],

      supportKit: {
        books: {
          rigs: {
            indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
          },
        },
        engines: {
          draft:     draftEngine,
          implement: implementEngine,
          review:    reviewEngine,
          revise:    reviseEngine,
          seal:      sealEngine,
        },
        tools: [crawlTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        spiderConfig = g.guildConfig().spider ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        clerk = g.apparatus<ClerkApi>('clerk');
        fabricator = g.apparatus<FabricatorApi>('fabricator');

        rigsBook = stacks.book<RigDoc>('spider', 'rigs');
        sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
        writsBook = stacks.readBook<WritDoc>('clerk', 'writs');

        // CDC — Phase 1 cascade on rigs book.
        // When a rig reaches a terminal state, transition the associated writ.
        stacks.watch<RigDoc>(
          'spider',
          'rigs',
          async (event) => {
            if (event.type !== 'update') return;

            const rig = event.entry;
            const prev = event.prev;

            // Only act when status changes to a terminal state
            if (rig.status === prev.status) return;

            if (rig.status === 'completed') {
              // Use seal yields as the resolution summary
              const sealEngine = rig.engines.find((e) => e.id === 'seal');
              const resolution = sealEngine?.yields
                ? JSON.stringify(sealEngine.yields)
                : 'Rig completed';
              await clerk.transition(rig.writId, 'completed', { resolution });
            } else if (rig.status === 'failed') {
              const failedEngine = rig.engines.find((e) => e.status === 'failed');
              const resolution = failedEngine?.error ?? 'Engine failure';
              await clerk.transition(rig.writId, 'failed', { resolution });
            }
          },
          { failOnError: true },
        );
      },
    },
  };
}

=== FILE: packages/plugins/spider/src/tools/index.ts ===
export { default as crawlTool } from './crawl.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
export { default as rigShowTool } from './rig-show.ts';
export { default as rigListTool } from './rig-list.ts';
export { default as rigForWritTool } from './rig-for-writ.ts';

=== FILE: packages/plugins/spider/src/tools/rig-for-writ.ts ===
/**
 * rig-for-writ tool — find the rig for a given writ.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'rig-for-writ',
  description: 'Find the rig for a given writ',
  instructions:
    'Returns the RigDoc for the given writ id, or null if no rig has been spawned yet.',
  params: {
    writId: z.string().describe('The writ id to look up.'),
  },
  permission: 'read',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.forWrit(params.writId);
  },
});

=== FILE: packages/plugins/spider/src/tools/rig-list.ts ===
/**
 * rig-list tool — list rigs with optional filters.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi, RigStatus } from '../types.ts';

export default tool({
  name: 'rig-list',
  description: 'List rigs with optional filters',
  instructions:
    'Returns rigs ordered by createdAt descending (newest first). ' +
    'Optionally filter by status and control pagination with limit and offset.',
  params: {
    status: z
      .enum(['running', 'completed', 'failed'])
      .optional()
      .describe('Filter by rig status.'),
    limit: z
      .number()
      .optional()
      .describe('Maximum number of results (default: 20).'),
    offset: z
      .number()
      .optional()
      .describe('Number of results to skip.'),
  },
  permission: 'read',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.list({
      status: params.status as RigStatus | undefined,
      limit: params.limit,
      offset: params.offset,
    });
  },
});

=== FILE: packages/plugins/spider/src/tools/rig-show.ts ===
/**
 * rig-show tool — retrieve a rig by id.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'rig-show',
  description: 'Retrieve a rig by id',
  instructions: 'Returns the full RigDoc for the given rig id. Throws if the rig does not exist.',
  params: {
    id: z.string().describe('The rig id to look up.'),
  },
  permission: 'read',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.show(params.id);
  },
});

=== FILE: packages/plugins/spider/src/types.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */

// ── Engine instance status ────────────────────────────────────────────

export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';

// ── Engine instance ───────────────────────────────────────────────────

/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Spider assembles `givens` from this directly; upstream yields arrive
 * via `context.upstream` as the escape hatch.
 */
export interface EngineInstance {
  /** Unique identifier within the rig (e.g. 'draft', 'implement'). */
  id: string;
  /** The engine design to look up in the Fabricator. */
  designId: string;
  /** Current execution status. */
  status: EngineStatus;
  /** Engine IDs that must be completed before this engine can run. */
  upstream: string[];
  /** Literal givens values set at rig spawn time. */
  givensSpec: Record<string, unknown>;
  /** Yields from a completed engine run (JSON-serializable). */
  yields?: unknown;
  /** Error message if this engine failed. */
  error?: string;
  /** Session ID from a launched quick engine, used by the collect step. */
  sessionId?: string;
  /** ISO timestamp when execution started. */
  startedAt?: string;
  /** ISO timestamp when execution completed (or failed). */
  completedAt?: string;
}

// ── Rig ──────────────────────────────────────────────────────────────

export type RigStatus = 'running' | 'completed' | 'failed';

/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Spider updates this document
 * in-place as engines run and complete.
 */
export interface RigDoc {
  /** Index signature required to satisfy BookEntry constraint. */
  [key: string]: unknown;
  /** Unique rig id. */
  id: string;
  /** The writ this rig is executing. */
  writId: string;
  /** Current rig status. */
  status: RigStatus;
  /** Ordered engine pipeline. */
  engines: EngineInstance[];
  /** ISO timestamp when the rig was created. */
  createdAt: string;
}

// ── Rig filters ───────────────────────────────────────────────────────

/**
 * Filters for listing rigs.
 */
export interface RigFilters {
  /** Filter by rig status. */
  status?: RigStatus;
  /** Maximum number of results (default: 20). */
  limit?: number;
  /** Number of results to skip. */
  offset?: number;
}

// ── CrawlResult ────────────────────────────────────────────────────────

/**
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' };

// ── SpiderApi ─────────────────────────────────────────────────────────

/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
  /**
   * Execute one step of the crawl loop.
   *
   * Priority ordering: collect > run > spawn.
   * Returns null when no work is available.
   */
  crawl(): Promise<CrawlResult | null>;

  /**
   * Show a rig by id. Throws if not found.
   */
  show(id: string): Promise<RigDoc>;

  /**
   * List rigs with optional filters, ordered by createdAt descending.
   */
  list(filters?: RigFilters): Promise<RigDoc[]>;

  /**
   * Find the rig for a given writ. Returns null if no rig exists.
   */
  forWrit(writId: string): Promise<RigDoc | null>;
}

// ── Configuration ─────────────────────────────────────────────────────

/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
  /**
   * Role to summon for quick engine sessions.
   * Default: 'artificer'.
   */
  role?: string;
  /**
   * Polling interval for crawlContinual tool (milliseconds).
   * Default: 5000.
   */
  pollIntervalMs?: number;
  /**
   * Build command to pass to quick engines.
   */
  buildCommand?: string;
  /**
   * Test command to pass to quick engines.
   */
  testCommand?: string;
}

// ── Engine yield shapes ───────────────────────────────────────────────

/**
 * Yields from the `draft` clockwork engine.
 * The Spider stores these in the engine instance and passes them
 * to downstream engines via context.upstream['draft'].
 */
export interface DraftYields {
  /** The draft's unique id. */
  draftId: string;
  /** Codex this draft belongs to. */
  codexName: string;
  /** Git branch name for the draft. */
  branch: string;
  /** Absolute filesystem path to the draft's worktree. */
  path: string;
  /** HEAD commit SHA at the time the draft was opened. Used by review engine to compute diffs. */
  baseSha: string;
}

/**
 * Yields from the `seal` clockwork engine.
 */
export interface SealYields {
  /** The commit SHA at head of the target branch after sealing. */
  sealedCommit: string;
  /** Git strategy used. */
  strategy: 'fast-forward' | 'rebase';
  /** Number of retry attempts. */
  retries: number;
  /** Number of inscriptions (commits) sealed. */
  inscriptionsSealed: number;
}

/**
 * Yields from the `implement` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ImplementYields {
  /** The Animator session id. */
  sessionId: string;
  /** Terminal status of the session. */
  sessionStatus: 'completed' | 'failed';
}

/**
 * A single mechanical check (build or test) run by the review engine
 * before launching the reviewer session.
 */
export interface MechanicalCheck {
  /** Check name. */
  name: 'build' | 'test';
  /** Whether the command exited with code 0. */
  passed: boolean;
  /** Combined stdout+stderr, truncated to 4KB. */
  output: string;
  /** Wall-clock duration of the check in milliseconds. */
  durationMs: number;
}

/**
 * Yields from the `review` quick engine.
 * Assembled by the Spider's collect step from session.output and session.metadata.
 */
export interface ReviewYields {
  /** The Animator session id. */
  sessionId: string;
  /** Reviewer's overall assessment — true if the review passed. */
  passed: boolean;
  /** Structured markdown findings from the reviewer's final message. */
  findings: string;
  /** Mechanical check results run before the reviewer session. */
  mechanicalChecks: MechanicalCheck[];
}

/**
 * Yields from the `revise` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ReviseYields {
  /** The Animator session id. */
  sessionId: string;
  /** Terminal status of the session. */
  sessionStatus: 'completed' | 'failed';
}

// Augment GuildConfig so `guild().guildConfig().spider` is typed.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    spider?: SpiderConfig;
  }
}



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: packages/plugins/spider/src/tools ===
tree 394cd0a7b9aa8fda78f87b2f496cd0ab3dd5d373:packages/plugins/spider/src/tools

crawl-continual.ts
crawl.ts
index.ts
rig-for-writ.ts
rig-list.ts
rig-show.ts

=== CONTEXT FILE: packages/plugins/spider/src/engines ===
tree 394cd0a7b9aa8fda78f87b2f496cd0ab3dd5d373:packages/plugins/spider/src/engines

draft.ts
implement.ts
index.ts
review.ts
revise.ts
seal.ts

=== CONTEXT FILE: packages/plugins/spider/src/tools/crawl-continual.ts ===
/**
 * crawlContinual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval until stopped or no remaining
 * work exists for the configured number of consecutive idle cycles.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi, SpiderConfig } from '../types.ts';

export default tool({
  name: 'crawlContinual',
  description: "Run the Spider's crawl loop continuously until idle",
  instructions:
    'Polls crawl() in a loop, sleeping between steps when idle. ' +
    'Stops when the configured number of consecutive idle cycles is reached. ' +
    'Returns a summary of all actions taken.',
  params: {
    maxIdleCycles: z
      .number()
      .optional()
      .default(3)
      .describe(
        'Number of consecutive idle crawl() calls before stopping (default: 3)',
      ),
    pollIntervalMs: z
      .number()
      .optional()
      .describe(
        'Override the configured poll interval in milliseconds',
      ),
  },
  permission: 'spider:write',
  handler: async (params) => {
    const g = guild();
    const spider = g.apparatus<SpiderApi>('spider');
    const config = g.guildConfig().spider ?? {} as SpiderConfig;
    const intervalMs = params.pollIntervalMs ?? config.pollIntervalMs ?? 5000;
    const maxIdle = params.maxIdleCycles;

    const actions: unknown[] = [];
    let idleCount = 0;

    while (idleCount < maxIdle) {
      let result: Awaited<ReturnType<typeof spider.crawl>>;
      try {
        result = await spider.crawl();
      } catch (err) {
        console.error('[crawlContinual] crawl() error:', err instanceof Error ? err.message : String(err));
        idleCount++;
        if (idleCount < maxIdle) {
          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
        continue;
      }
      if (result === null) {
        idleCount++;
        if (idleCount < maxIdle) {
          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
      } else {
        idleCount = 0;
        actions.push(result);
      }
    }

    return { actions, totalActions: actions.length };
  },
});

=== CONTEXT FILE: packages/plugins/spider/src/tools/crawl.ts ===
/**
 * crawl tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */

import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'crawl',
  description: "Execute one step of the Spider's crawl loop",
  instructions:
    'Runs a single crawl() step: collect a pending session result, run the next ' +
    'ready engine, or spawn a rig for a ready writ — in that priority order. ' +
    'Returns the action taken, or null if there is nothing to do.',
  params: {},
  permission: 'spider:write',
  handler: async () => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.crawl();
  },
});



## Codebase Structure (surrounding directories)

```
=== TREE: packages/plugins/spider/src/ ===
engines
index.ts
spider.test.ts
spider.ts
tools
types.ts

=== TREE: packages/plugins/spider/src/tools/ ===
crawl-continual.ts
crawl.ts
index.ts
rig-for-writ.ts
rig-list.ts
rig-show.ts


```

## Codebase API Surface (declarations available before this commission)

Scope: all 15 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +132
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 132, reused 132, downloaded 0, added 132, done

devDependencies:
+ @tsconfig/node24 24.0.4
+ typescript 5.9.3

Done in 522ms using pnpm v10.32.1
=== packages/framework/arbor/dist/arbor.d.ts ===
/**
 * Arbor — the guild runtime.
 *
 * `createGuild()` is the single entry point. It reads guild.json, loads all
 * declared plugins, validates dependencies, starts apparatus in order, wires
 * the guild() singleton, and returns the Guild object.
 *
 * The full plugin lifecycle:
 *   1. Load    — imports all declared plugin packages, discriminates kit vs apparatus
 *   2. Validate — checks `requires` declarations, detects circular dependencies
 *   3. Start   — calls start(ctx) on each apparatus in dependency-resolved order
 *   4. Events  — fires `plugin:initialized` after each plugin loads
 *   5. Warn    — advisory warnings for mismatched kit contributions / recommends
 *
 * Pure logic (validation, ordering, events) lives in guild-lifecycle.ts.
 * This file handles I/O and orchestration.
 */
import type { Guild } from '@shardworks/nexus-core';
/**
 * Create and start a guild.
 *
 * Reads guild.json, loads all declared plugins, validates dependencies,
 * starts apparatus in dependency order, and returns the Guild object.
 * Also sets the guild() singleton so apparatus code can access it.
 *
 * @param root - Absolute path to the guild root. Defaults to auto-detection
 *               by walking up from cwd until guild.json is found.
 * @returns The initialized Guild — the same object guild() returns.
 */
export declare function createGuild(root?: string): Promise<Guild>;
//# sourceMappingURL=arbor.d.ts.map
=== packages/framework/arbor/dist/guild-lifecycle.d.ts ===
/**
 * Guild lifecycle — pure logic for plugin validation, ordering, and events.
 *
 * All functions here operate on in-memory data structures (LoadedKit[],
 * LoadedApparatus[], Maps) with no I/O. This makes them independently
 * testable with synthetic fixtures.
 *
 * `createGuild()` in arbor.ts is the orchestrator that performs I/O
 * (config reading, dynamic imports) then delegates to these functions.
 */
import type { StartupContext, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';
export type EventHandlerMap = Map<string, Array<(...args: unknown[]) => void | Promise<void>>>;
/**
 * Validate all `requires` declarations and detect circular dependencies.
 * Throws with a descriptive error on the first problem found.
 *
 * Checks:
 * - Apparatus requires: every named dependency must exist (kit or apparatus).
 * - Kit requires: every named dependency must be an apparatus (kits can't
 *   depend on kits).
 * - Cycle detection: no circular dependency chains among apparatuses.
 */
export declare function validateRequires(kits: LoadedKit[], apparatuses: LoadedApparatus[]): void;
/**
 * Sort apparatuses in dependency-resolved order using topological sort.
 * validateRequires() must be called first to ensure the graph is acyclic.
 */
export declare function topoSort(apparatuses: LoadedApparatus[]): LoadedApparatus[];
/**
 * Collect advisory warnings for kit contributions that no apparatus
 * consumes, and for missing recommended apparatuses.
 *
 * Returns an array of warning strings. The caller decides how to emit
 * them (console.warn, logger, etc.).
 */
export declare function collectStartupWarnings(kits: LoadedKit[], apparatuses: LoadedApparatus[]): string[];
/**
 * Build a StartupContext for an apparatus's start() call.
 * The context provides event subscription; handlers are stored in the
 * shared eventHandlers map so fireEvent can invoke them later.
 */
export declare function buildStartupContext(eventHandlers: EventHandlerMap): StartupContext;
/**
 * Fire a lifecycle event, awaiting each handler sequentially.
 */
export declare function fireEvent(eventHandlers: EventHandlerMap, event: string, ...args: unknown[]): Promise<void>;
//# sourceMappingURL=guild-lifecycle.d.ts.map
=== packages/framework/arbor/dist/index.d.ts ===
/**
 * @shardworks/nexus-arbor — guild runtime
 *
 * The arbor is the guild host: plugin loading, dependency validation,
 * apparatus lifecycle management. It does NOT own tool discovery — that
 * belongs to The Instrumentarium (tools-apparatus).
 *
 * Plugin authors never import from arbor — they import from @shardworks/nexus-core.
 * The CLI imports from arbor to create the guild runtime and trigger startup.
 *
 * Package dependency graph:
 *   core   — public SDK, types, tool() factory
 *   arbor  — guild host, createGuild()
 *   cli    — nsg binary, Commander.js, framework commands + Instrumentarium tools
 *   plugins — import from core only
 */
export { createGuild } from './arbor.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/cli.d.ts ===
#!/usr/bin/env node
/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'cli' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */
export {};
//# sourceMappingURL=cli.d.ts.map
=== packages/framework/cli/dist/commands/index.d.ts ===
/**
 * Framework commands — hardcoded CLI commands that work with or without a guild.
 *
 * These are guild lifecycle and plugin management commands that the CLI
 * registers directly, bypassing plugin discovery. They are the CLI's own
 * commands, not tools contributed by kits or apparatus.
 *
 * Plugin-contributed tools are discovered at runtime via The Instrumentarium
 * when a guild is present and the tools apparatus is installed.
 */
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/** All framework commands, typed as the base ToolDefinition for uniform handling. */
export declare const frameworkCommands: ToolDefinition[];
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/commands/init.d.ts ===
/**
 * nsg init — create a new guild.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Writes the minimum viable guild: directory structure, guild.json,
 * package.json, .gitignore. Does NOT git init, install bundles, create
 * the database, or instantiate animas — those are separate steps.
 *
 * After init, the user runs `nsg plugin install` to add capabilities.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=init.d.ts.map
=== packages/framework/cli/dist/commands/plugin.d.ts ===
/**
 * nsg plugin-* — manage guild plugins.
 *
 * Framework commands for plugin lifecycle. Available via CLI only (not MCP).
 *
 * Plugin install/remove are pure npm + guild.json operations. No tool
 * discovery at install time — tools are resolved at runtime by the
 * Instrumentarium via its permission-based model.
 */
import { z } from 'zod';
/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
export declare function detectPackageManager(guildRoot: string): 'npm' | 'pnpm';
export declare const pluginList: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export declare const pluginInstall: import("@shardworks/tools-apparatus").ToolDefinition<{
    source: z.ZodString;
    type: z.ZodOptional<z.ZodEnum<{
        link: "link";
        registry: "registry";
    }>>;
}>;
export declare const pluginRemove: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export declare const pluginUpgrade: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/cli/dist/commands/status.d.ts ===
/**
 * nsg status — guild status.
 *
 * A framework command. Shows guild identity, framework version, and installed plugins
 * separated into apparatuses (running infrastructure) and kits (passive capabilities).
 * Domain-specific status (writ counts, session history, clock state) belongs
 * to plugins, not here.
 *
 * Requires a booted guild — prints a friendly error if run outside one.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=status.d.ts.map
=== packages/framework/cli/dist/commands/test-helpers.d.ts ===
/**
 * Shared test helpers for CLI command tests.
 *
 * Provides guild accessor setup, temp directory management, and minimal
 * guild.json scaffolding. Extracted from status.test.ts, version.test.ts,
 * and plugin.test.ts where these were copy-pasted identically.
 */
/** Set up a minimal guild accessor pointing at the given directory. */
export declare function setupGuildAccessor(home: string): void;
/** Create a temp directory and register it for cleanup. */
export declare function makeTmpDir(prefix: string): string;
/** Write a minimal guild.json to dir, with optional overrides. */
export declare function makeGuild(dir: string, overrides?: Record<string, unknown>): void;
/** Write a guild-root package.json declaring the given npm dependencies. */
export declare function makeGuildPackageJson(dir: string, deps: Record<string, string>): void;
/** Clean up guild state and temp directories. Call from afterEach(). */
export declare function cleanupTestState(): void;
//# sourceMappingURL=test-helpers.d.ts.map
=== packages/framework/cli/dist/commands/upgrade.d.ts ===
/**
 * nsg upgrade — upgrade the guild framework.
 *
 * Stub — upgrade lifecycle not yet designed. Will handle framework version
 * bumps, guild.json schema reconciliation, and plugin-specific upgrade
 * hooks when implemented.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    dryRun: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=upgrade.d.ts.map
=== packages/framework/cli/dist/commands/version.d.ts ===
/**
 * nsg version — show framework and plugin version info.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Always shows framework and Node versions. When run inside a guild,
 * additionally shows installed plugin versions. Gracefully degrades
 * when run outside a guild (no error, just less info).
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=version.d.ts.map
=== packages/framework/cli/dist/helpers.d.ts ===
/**
 * Pure helper functions for CLI command generation.
 *
 * Extracted from program.ts so they can be tested independently
 * without pulling in heavy runtime dependencies (Arbor, Instrumentarium).
 */
import { z } from 'zod';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Convert camelCase key to kebab-case CLI flag.
 * e.g. 'writId' → '--writ-id'
 */
export declare function toFlag(key: string): string;
/**
 * Detect whether a Zod schema accepts booleans (and only booleans).
 * Used to register Commander flags without <value> for boolean params.
 */
export declare function isBooleanSchema(schema: z.ZodTypeAny): boolean;
/**
 * Determine which hyphen prefixes have enough tools to warrant a group.
 *
 * Returns a Set of prefixes that have 2+ tools sharing them.
 * 'plugin-list' + 'plugin-install' → 'plugin' is a group.
 * 'show-writ' alone → 'show' is NOT a group.
 */
export declare function findGroupPrefixes(tools: ToolDefinition[]): Set<string>;
//# sourceMappingURL=helpers.d.ts.map
=== packages/framework/cli/dist/index.d.ts ===
export { VERSION } from '@shardworks/nexus-core';
export { main } from './program.ts';
export { frameworkCommands } from './commands/index.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/program.d.ts ===
/**
 * nsg program — dynamic Commander setup.
 *
 * Two command sources:
 *
 * 1. **Framework commands** — hardcoded in the CLI package (init, status,
 *    version, upgrade, plugin management). Always available, even without
 *    a guild.
 *
 * 2. **Plugin tools** — discovered at runtime via The Instrumentarium
 *    (tools apparatus). Only available when a guild is present and the
 *    tools apparatus is installed.
 *
 * Tool names are auto-grouped when multiple tools share a hyphen prefix:
 * 'plugin-list' + 'plugin-install' → 'nsg plugin list' / 'nsg plugin install'.
 * A tool like 'show-writ' stays flat ('nsg show-writ') since no other tool
 * starts with 'show-'.
 */
export declare function main(): Promise<void>;
//# sourceMappingURL=program.d.ts.map
=== packages/framework/core/dist/guild-config.d.ts ===
/** A custom event declaration in guild.json clockworks.events. */
export interface EventDeclaration {
    /** Human-readable description of what this event means. */
    description?: string;
    /** Optional payload schema hint (not enforced in Phase 1). */
    schema?: Record<string, string>;
}
/** A standing order — a registered response to an event. */
export type StandingOrder = {
    on: string;
    run: string;
} | {
    on: string;
    summon: string;
    prompt?: string;
} | {
    on: string;
    brief: string;
};
/** The clockworks configuration block in guild.json. */
export interface ClockworksConfig {
    /** Custom event declarations. */
    events?: Record<string, EventDeclaration>;
    /** Standing orders — event → action mappings. */
    standingOrders?: StandingOrder[];
}
/** Guild-level settings — operational flags and preferences. */
export interface GuildSettings {
    /**
     * Default LLM model for anima sessions (e.g. 'sonnet', 'opus').
     * Replaces the top-level `model` field from GuildConfig V1.
     */
    model?: string;
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified. Set to `false` to require explicit
     * migration via `nsg guild upgrade-books`.
     */
    autoMigrate?: boolean;
}
/**
 * Guild configuration.
 *
 * The plugin-centric model: plugins are npm packages; capabilities (tools, engines,
 * training content) are declared by plugins and discovered dynamically at runtime.
 * Framework-level keys (`name`, `nexus`, `plugins`, `settings`) are defined here;
 * all other top-level keys are plugin configuration sections, keyed by plugin id.
 */
export interface GuildConfig {
    /** Guild name — used as the guildhall npm package name. */
    name: string;
    /** Installed Nexus framework version. */
    nexus: string;
    /** Installed plugin ids (derived from npm package names). Always present; starts empty. */
    plugins: string[];
    /** Clockworks configuration — events, standing orders. */
    clockworks?: ClockworksConfig;
    /** Guild-level settings — operational flags and preferences. Includes default model. */
    settings?: GuildSettings;
}
/**
 * Create the default guild.json content for a new guild.
 * All collections start empty. The default model is stored in settings.
 */
export declare function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig;
/** Read and parse guild.json from the guild root. */
export declare function readGuildConfig(home: string): GuildConfig;
/** Write guild.json to the guild root. */
export declare function writeGuildConfig(home: string, config: GuildConfig): void;
/** Resolve the path to guild.json in the guild root. */
export declare function guildConfigPath(home: string): string;
//# sourceMappingURL=guild-config.d.ts.map
=== packages/framework/core/dist/guild.d.ts ===
/**
 * Guild — the process-level singleton for accessing guild infrastructure.
 *
 * All plugin code — apparatus start(), tool handlers, engine handlers,
 * relay handlers, CDC handlers — imports `guild()` to access apparatus APIs,
 * plugin config, the guild root path, and the loaded plugin graph.
 *
 * Arbor creates the Guild instance before starting apparatus and registers
 * it via `setGuild()`. The instance is backed by live data structures
 * (e.g. the provides Map) that are populated progressively as apparatus start.
 *
 * See: docs/architecture/plugins.md
 */
import type { GuildConfig } from './guild-config.ts';
import type { LoadedKit, LoadedApparatus } from './plugin.ts';
/**
 * Runtime access to guild infrastructure.
 *
 * Available after Arbor creates the instance (before apparatus start).
 * One instance per process.
 */
export interface Guild {
    /** Absolute path to the guild root (contains guild.json). */
    readonly home: string;
    /**
     * Retrieve a started apparatus's provides object by plugin id.
     *
     * Throws if the apparatus is not installed or has no `provides`.
     * During startup, only apparatus that have already started are visible
     * (dependency ordering guarantees declared deps are started first).
     */
    apparatus<T>(name: string): T;
    /**
     * Read a plugin's configuration section from guild.json.
     *
     * Returns `guild.json[pluginId]` cast to `T`. Returns `{}` if no
     * section exists. The generic parameter is a cast — the framework
     * does not validate config shape.
     */
    config<T = Record<string, unknown>>(pluginId: string): T;
    /**
     * Write a plugin's configuration section to guild.json.
     *
     * Updates `guild.json[pluginId]` with `value` and writes the file
     * to disk. Also updates the in-memory config so subsequent reads
     * reflect the change.
     *
     * For framework-level keys (name, nexus, plugins, settings), use
     * the standalone `writeGuildConfig()` function instead.
     */
    writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void;
    /**
     * Read the full parsed guild.json.
     *
     * Escape hatch for framework-level fields (name, nexus, plugins,
     * settings) that don't belong to any specific plugin.
     */
    guildConfig(): GuildConfig;
    /** Snapshot of all loaded kits (including apparatus supportKits). */
    kits(): LoadedKit[];
    /** Snapshot of all started apparatuses. */
    apparatuses(): LoadedApparatus[];
}
/**
 * Get the active guild instance.
 *
 * Throws with a clear message if called before Arbor has initialized
 * the guild (e.g. at module import time, before startup begins).
 */
export declare function guild(): Guild;
/**
 * Set the guild instance. Called by Arbor before starting apparatus.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function setGuild(g: Guild): void;
/**
 * Clear the guild instance. Called by Arbor at shutdown or in tests.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function clearGuild(): void;
//# sourceMappingURL=guild.d.ts.map
=== packages/framework/core/dist/id.d.ts ===
/**
 * Generate a sortable, prefixed ID.
 *
 * Format: `{prefix}-{base36_timestamp}-{hex_random}`
 *
 * The timestamp component (Date.now() in base36) gives lexicographic sort
 * order by creation time. The random suffix prevents collisions without
 * coordination.
 *
 * @param prefix     Short, type-identifying string (e.g. `w`, `ses`, `turn`)
 * @param randomByteCount  Number of random bytes; produces 2× hex digits (default 6 → 12 hex chars)
 */
export declare function generateId(prefix: string, randomByteCount?: number): string;
//# sourceMappingURL=id.d.ts.map
=== packages/framework/core/dist/index.d.ts ===
export declare const VERSION: string;
export { type Kit, type Apparatus, type Plugin, type LoadedKit, type LoadedApparatus, type LoadedPlugin, type StartupContext, isKit, isApparatus, isLoadedKit, isLoadedApparatus, } from './plugin.ts';
export { type Guild, guild, setGuild, clearGuild, } from './guild.ts';
export { findGuildRoot, nexusDir, worktreesPath, clockPidPath, clockLogPath, } from './nexus-home.ts';
export { derivePluginId, readGuildPackageJson, resolvePackageNameForPluginId, resolveGuildPackageEntry, } from './resolve-package.ts';
export { type GuildConfig, createInitialGuildConfig, readGuildConfig, writeGuildConfig, type EventDeclaration, type StandingOrder, type ClockworksConfig, type GuildSettings, guildConfigPath, } from './guild-config.ts';
export { generateId } from './id.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/core/dist/nexus-home.d.ts ===
/**
 * Find the guild root by walking up from a starting directory looking for guild.json.
 *
 * This replaces the old NEXUS_HOME env var approach. The guild root IS the
 * guildhall — a regular git clone with guild.json at the root.
 *
 * @param startDir - Directory to start searching from (defaults to cwd).
 * @throws If no guild.json is found before reaching the filesystem root.
 */
export declare function findGuildRoot(startDir?: string): string;
/** Path to the .nexus framework-managed directory. */
export declare function nexusDir(home: string): string;
/** Path to the top-level worktrees directory (for writ worktrees). */
export declare function worktreesPath(home: string): string;
/** Path to the clockworks daemon PID file. */
export declare function clockPidPath(home: string): string;
/** Path to the clockworks daemon log file. */
export declare function clockLogPath(home: string): string;
//# sourceMappingURL=nexus-home.d.ts.map
=== packages/framework/core/dist/plugin.d.ts ===
/**
 * Plugin system — core types for the Kit/Apparatus model.
 *
 * Plugins come in two kinds:
 * - Kit:       passive package contributing capabilities to consuming apparatuses.
 *              No lifecycle, no running state. Read at load time.
 * - Apparatus: package contributing persistent running infrastructure.
 *              Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * See: docs/architecture/plugins.md
 */
/** A kit as tracked by the Arbor runtime. */
export interface LoadedKit {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly kit: Kit;
}
/** An apparatus as tracked by the Arbor runtime. */
export interface LoadedApparatus {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly apparatus: Apparatus;
}
/** Union of loaded kit and loaded apparatus. */
export type LoadedPlugin = LoadedKit | LoadedApparatus;
/**
 * Startup context passed to an apparatus's start(ctx).
 *
 * Provides lifecycle-event subscription — the only capability that is
 * meaningful only during startup. All other guild access (apparatus APIs,
 * config, home path, loaded plugins) goes through the `guild()` singleton,
 * which is available during start() and in all handlers.
 *
 * See: docs/architecture/plugins.md
 */
export interface StartupContext {
    /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
    on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void;
}
/**
 * A kit — passive package contributing capabilities to consuming apparatuses.
 * Open record: contribution fields (engines, relays, tools, etc.) are defined
 * by the apparatus packages that consume them. `requires` and `recommends` are
 * the only framework-level fields.
 *
 * `requires`: apparatus names whose runtime APIs this kit's contributions depend
 *   on at handler invocation time. Hard startup validation failure if a declared
 *   apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced.
 */
export type Kit = {
    requires?: string[];
    recommends?: string[];
    [key: string]: unknown;
};
/**
 * An apparatus — package contributing persistent running infrastructure.
 * Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * `requires`: apparatus names that must be started before this apparatus's
 *   start() runs. Determines start ordering. Hard startup validation failure
 *   if a declared apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced — the apparatus starts
 *   regardless. Use for soft dependencies needed by optional API methods
 *   (e.g. The Animator recommends The Loom for summon(), but animate()
 *   works without it).
 *
 * `provides`: the runtime API object this apparatus exposes to other plugins.
 *   Retrieved via guild().apparatus<T>(name). Created at manifest-definition time,
 *   populated during start.
 *
 * `supportKit`: kit contributions this apparatus exposes to consuming apparatuses.
 *   Treated identically to standalone kit contributions by consumers.
 *
 * `consumes`: kit contribution field types this apparatus scans for and registers.
 *   Enables framework startup warnings when kits contribute types with no consumer.
 */
export type Apparatus = {
    requires?: string[];
    recommends?: string[];
    provides?: unknown;
    start: (ctx: StartupContext) => void | Promise<void>;
    stop?: () => void | Promise<void>;
    supportKit?: Kit;
    consumes?: string[];
};
/**
 * The discriminated union plugin type. A plugin is either a kit or an apparatus.
 * The plugin name is always inferred from the npm package name at load time —
 * it is never declared in the manifest.
 */
export type Plugin = {
    kit: Kit;
} | {
    apparatus: Apparatus;
};
/** Type guard: is this value a kit plugin export? */
export declare function isKit(obj: unknown): obj is {
    kit: Kit;
};
/** Type guard: is this value an apparatus plugin export? */
export declare function isApparatus(obj: unknown): obj is {
    apparatus: Apparatus;
};
/** Type guard: narrows a LoadedPlugin to LoadedKit. */
export declare function isLoadedKit(p: LoadedPlugin): p is LoadedKit;
/** Type guard: narrows a LoadedPlugin to LoadedApparatus. */
export declare function isLoadedApparatus(p: LoadedPlugin): p is LoadedApparatus;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/core/dist/resolve-package.d.ts ===
/**
 * Package resolution utilities for guild-installed npm packages.
 *
 * Resolves entry points from the guild's node_modules by reading package.json
 * exports maps directly. Needed because guild plugins are ESM-only packages
 * and createRequire() can't resolve their exports.
 *
 * Also owns:
 * - derivePluginId — canonical npm package name → plugin id derivation
 */
/**
 * Derive the guild-facing plugin id from an npm package name.
 *
 * Convention:
 * - `@shardworks/nexus-ledger`      → `nexus-ledger`   (official scope stripped)
 * - `@shardworks/books-apparatus`   → `books`           (descriptor suffix stripped)
 * - `@acme/my-plugin`               → `acme/my-plugin`  (third-party: drop @ only)
 * - `my-relay-kit`                  → `my-relay`        (descriptor suffix stripped)
 * - `my-plugin`                     → `my-plugin`       (unscoped: unchanged)
 *
 * The `@shardworks` scope is the official Nexus namespace — its plugins are
 * referenced by bare name in guild.json, CLI commands, and config keys.
 * Third-party scoped packages retain the scope as a prefix (without @) to
 * prevent collisions between `@acme/foo` and `@other/foo`.
 *
 * Descriptor suffixes (`-plugin`, `-apparatus`, `-kit`) are stripped after
 * scope resolution so that package naming conventions don't leak into ids.
 */
export declare function derivePluginId(packageName: string): string;
/**
 * Read a package.json from the guild's node_modules.
 * Returns the parsed JSON and version. Falls back gracefully.
 */
export declare function readGuildPackageJson(guildRoot: string, pkgName: string): {
    version: string;
    pkgJson: Record<string, unknown> | null;
};
/**
 * Resolve the npm package name for a plugin id by consulting the guild's root package.json.
 *
 * Scans all dependencies and runs `derivePluginId()` on each to find the
 * package whose derived id matches. This correctly handles descriptor
 * suffixes (-kit, -apparatus, -plugin) that derivePluginId strips.
 *
 * When multiple packages derive to the same id (unlikely but possible),
 * prefers @shardworks-scoped packages over third-party ones.
 *
 * Returns null if no matching dependency is found.
 */
export declare function resolvePackageNameForPluginId(guildRoot: string, pluginId: string): string | null;
/**
 * Resolve the entry point for a guild-installed package.
 *
 * Reads the package's exports map to find the ESM entry point.
 * Returns an absolute path suitable for dynamic import().
 */
export declare function resolveGuildPackageEntry(guildRoot: string, pkgName: string): string;
//# sourceMappingURL=resolve-package.d.ts.map
=== packages/plugins/animator/dist/animator.d.ts ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export declare function createAnimator(): Plugin;
//# sourceMappingURL=animator.d.ts.map
=== packages/plugins/animator/dist/index.d.ts ===
/**
 * @shardworks/animator-apparatus — The Animator.
 *
 * Session launch and telemetry recording: takes an AnimaWeave from The Loom,
 * launches an AI process via a session provider, monitors it until exit, and
 * records the result to The Stacks.
 *
 * See: docs/specification.md (animator)
 */
export { type AnimatorApi, type AnimateHandle, type AnimateRequest, type SummonRequest, type SessionResult, type SessionChunk, type TokenUsage, type SessionDoc, type AnimatorConfig, type AnimatorSessionProvider, type SessionProviderConfig, type SessionProviderResult, } from './types.ts';
export { createAnimator } from './animator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/index.d.ts ===
/**
 * Animator tool re-exports.
 */
export { default as sessionList } from './session-list.ts';
export { default as sessionShow } from './session-show.ts';
export { default as summon } from './summon.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/session-list.d.ts ===
/**
 * session-list tool — list recent sessions with optional filters.
 *
 * Queries The Animator's `sessions` book in The Stacks.
 * Returns session summaries ordered by startedAt descending (newest first).
 *
 * See: docs/specification.md (animator § session-list tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        timeout: "timeout";
        running: "running";
    }>>;
    provider: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=session-list.d.ts.map
=== packages/plugins/animator/dist/tools/session-show.d.ts ===
/**
 * session-show tool — show full detail for a single session by id.
 *
 * Reads the complete session record from The Animator's `sessions` book
 * in The Stacks, including tokenUsage, metadata, and all indexed fields.
 *
 * See: docs/specification.md (animator § session-show tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=session-show.d.ts.map
=== packages/plugins/animator/dist/tools/summon.d.ts ===
/**
 * summon tool — dispatch an anima session from the CLI.
 *
 * High-level entry point: composes context via The Loom (passing the
 * role for system prompt composition), then launches a session via
 * The Animator. The work prompt goes directly to the provider.
 *
 * Usage:
 *   nsg summon --prompt "Build the frobnicator" --role artificer
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    prompt: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=summon.d.ts.map
=== packages/plugins/animator/dist/types.d.ts ===
/**
 * The Animator — public types.
 *
 * These types form the contract between The Animator apparatus and all
 * callers (summon relay, nsg consult, etc.). No implementation details.
 *
 * See: docs/specification.md (animator)
 */
import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
/** A chunk of output from a running session. */
export type SessionChunk = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    tool: string;
} | {
    type: 'tool_result';
    tool: string;
};
export interface AnimateRequest {
    /**
     * Optional pre-generated session id. When provided, the Animator uses
     * this id instead of generating a new one. Used by summon() to make the
     * session id available on the handle before the Loom weave resolves.
     */
    sessionId?: string;
    /** The anima weave from The Loom (composed identity context). */
    context: AnimaWeave;
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     * This bypasses The Loom — it is not a composition concern.
     */
    prompt?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     * If provided, the session provider resumes the existing conversation
     * rather than starting a new one.
     */
    conversationId?: string;
    /**
     * Caller-supplied metadata recorded alongside the session.
     * The Animator stores this as-is — it does not interpret the contents.
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     *
     * Either way, the return shape is the same: `{ chunks, result }`.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
export interface SessionResult {
    /** Unique session id (generated by The Animator). */
    id: string;
    /** Terminal status. */
    status: 'completed' | 'failed' | 'timeout';
    /** When the session started (ISO-8601). */
    startedAt: string;
    /** When the session ended (ISO-8601). */
    endedAt: string;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
    /** Provider name (e.g. 'claude-code'). */
    provider: string;
    /** Numeric exit code from the provider process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Conversation id (for multi-turn resume). */
    conversationId?: string;
    /** Session id from the provider (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage from the provider, if available. */
    tokenUsage?: TokenUsage;
    /** Cost in USD from the provider, if available. */
    costUsd?: number;
    /** Caller-supplied metadata, recorded as-is. */
    metadata?: Record<string, unknown>;
    /**
     * The final assistant text from the session.
     * Extracted by the Animator from the provider's transcript.
     * Useful for programmatic consumers that need the session's conclusion
     * without parsing the full transcript (e.g. the Spider's review collect step).
     */
    output?: string;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface SummonRequest {
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     */
    prompt: string;
    /**
     * The role to summon (e.g. 'artificer', 'scribe').
     * Passed to The Loom for context composition and recorded in session metadata.
     */
    role?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     */
    conversationId?: string;
    /**
     * Additional metadata to record alongside the session.
     * Merged with auto-generated metadata (trigger: 'summon', role).
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
/** The return value from animate() and summon(). */
export interface AnimateHandle {
    /**
     * Session ID, available immediately after launch — before the session
     * completes. Callers that only need to know the session was launched
     * (e.g. quick engines returning `{ status: 'launched', sessionId }`)
     * can return without awaiting `result`.
     */
    sessionId: string;
    /**
     * Async iterable of output chunks from the session. When streaming is
     * disabled (the default), this iterable completes immediately with no
     * items. When streaming is enabled, it yields chunks as the session
     * produces output.
     */
    chunks: AsyncIterable<SessionChunk>;
    /**
     * Promise that resolves to the final SessionResult after the session
     * completes (or fails/times out) and the result is recorded to The Stacks.
     */
    result: Promise<SessionResult>;
}
export interface AnimatorApi {
    /**
     * Summon an anima — compose context via The Loom and launch a session.
     *
     * This is the high-level "make an anima do a thing" entry point.
     * Internally calls The Loom for context composition (passing the role),
     * then animate() for session launch and recording. The work prompt
     * bypasses the Loom and goes directly to the provider.
     *
     * Requires The Loom apparatus to be installed. Throws if not available.
     *
     * Auto-populates session metadata with `trigger: 'summon'` and `role`.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    summon(request: SummonRequest): AnimateHandle;
    /**
     * Animate a session — launch an AI process with the given context.
     *
     * This is the low-level entry point for callers that compose their own
     * AnimaWeave (e.g. The Parlour for multi-turn conversations).
     *
     * Records the session result to The Stacks before `result` resolves.
     *
     * Set `streaming: true` on the request to receive output chunks as the
     * session runs. When streaming is disabled (default), the `chunks`
     * iterable completes immediately with no items.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    animate(request: AnimateRequest): AnimateHandle;
}
/**
 * A session provider — pluggable backend that knows how to launch and
 * communicate with a specific AI system.
 *
 * Implemented as an apparatus plugin whose `provides` object satisfies
 * this interface. The Animator discovers the provider via guild config:
 * `guild.json["animator"]["sessionProvider"]` names the plugin id.
 *
 * The provider always returns `{ chunks, result }` — the same shape as
 * AnimateHandle. When `config.streaming` is true, the provider MAY yield
 * output chunks as the session runs. When false (or when the provider
 * does not support streaming), the chunks iterable completes immediately
 * with no items. The Animator does not branch on streaming capability —
 * it passes the flag through and trusts the provider to do the right thing.
 */
export interface AnimatorSessionProvider {
    /** Human-readable name (e.g. 'claude-code'). */
    name: string;
    /**
     * Launch a session. Returns `{ chunks, result }` synchronously.
     *
     * The `result` promise resolves when the AI process exits.
     * The `chunks` async iterable yields output when `config.streaming`
     * is true and the provider supports streaming; otherwise it completes
     * immediately with no items.
     *
     * Providers that don't support streaming simply ignore the flag and
     * return empty chunks — no separate method needed.
     */
    launch(config: SessionProviderConfig): {
        chunks: AsyncIterable<SessionChunk>;
        result: Promise<SessionProviderResult>;
    };
}
export interface SessionProviderConfig {
    /** System prompt for the AI process. May be undefined if composition is not yet implemented. */
    systemPrompt?: string;
    /** Initial user message (e.g. writ description). */
    initialPrompt?: string;
    /** Model to use (from guild settings). */
    model: string;
    /** Optional conversation id for resume. */
    conversationId?: string;
    /** Working directory for the session. */
    cwd: string;
    /**
     * Enable streaming output. When true, the provider should yield output
     * chunks as the session produces them. When false (default), the chunks
     * iterable should complete immediately with no items.
     *
     * Providers that don't support streaming may ignore this flag.
     */
    streaming?: boolean;
    /**
     * Resolved tools for this session. When present, the provider should
     * configure an MCP server with these tool definitions.
     *
     * The Loom resolves role → permissions → tools via the Instrumentarium.
     * The Animator passes them through from the AnimaWeave.
     */
    tools?: ResolvedTool[];
    /**
     * Merged environment variables to spread into the spawned process.
     * The Animator merges identity-layer (weave) and task-layer (request)
     * variables before passing them here — task layer wins on collision.
     */
    environment?: Record<string, string>;
}
/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
export type TranscriptMessage = Record<string, unknown>;
export interface SessionProviderResult {
    /** Exit status. */
    status: 'completed' | 'failed' | 'timeout';
    /** Numeric exit code from the process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Provider's session id (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage, if the provider can report it. */
    tokenUsage?: TokenUsage;
    /** Cost in USD, if the provider can report it. */
    costUsd?: number;
    /** The session's full transcript — array of NDJSON message objects. */
    transcript?: TranscriptMessage[];
    /**
     * The final assistant text from the session.
     * Extracted from the last assistant message's text content blocks.
     * Undefined if the session produced no assistant output.
     */
    output?: string;
}
/**
 * The session document stored in The Stacks' `sessions` book.
 * Includes all SessionResult fields plus the `id` required by BookEntry.
 */
export interface SessionDoc {
    id: string;
    /**
     * Session status. Initially written as `'running'` when the session is
     * launched (Step 2), then updated to a terminal status (`'completed'`,
     * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
     * The `'running'` state is transient — it only exists between Steps 2 and 5.
     * `SessionResult.status` only includes terminal states.
     */
    status: 'running' | 'completed' | 'failed' | 'timeout';
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    provider: string;
    exitCode?: number;
    error?: string;
    conversationId?: string;
    providerSessionId?: string;
    tokenUsage?: TokenUsage;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    /** The final assistant text from the session. */
    output?: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/**
 * The transcript document stored in The Stacks' `transcripts` book.
 * One record per session — 1:1 relationship with SessionDoc.
 */
export interface TranscriptDoc {
    /** Same as the session id. */
    id: string;
    /** Full NDJSON transcript from the session. */
    messages: TranscriptMessage[];
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
    /**
     * Plugin id of the apparatus that implements AnimatorSessionProvider.
     * The Animator looks this up via guild().apparatus() at animate-time.
     * Defaults to 'claude-code' if not specified.
     */
    sessionProvider?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        animator?: AnimatorConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/claude-code/dist/index.d.ts ===
/**
 * Claude Code Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider for the
 * Claude Code CLI. The Animator discovers this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "claude-code"
 *
 * Launches sessions via the `claude` CLI in autonomous mode (--print)
 * with --output-format stream-json for structured telemetry.
 *
 * Key design choice: uses async spawn() instead of spawnSync().
 * This is required for stream-json transcript parsing, timeout enforcement,
 * and future concurrent session support.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { SessionChunk } from '@shardworks/animator-apparatus';
/**
 * Extract the final assistant text from a transcript.
 *
 * Walks the transcript backwards to find the last `assistant` message
 * and concatenates its text content blocks.
 *
 * @internal Exported for testing only.
 */
export declare function extractFinalAssistantText(transcript: Record<string, unknown>[]): string | undefined;
/**
 * Create the Claude Code session provider apparatus.
 *
 * The apparatus has no startup logic — it just provides the
 * AnimatorSessionProvider implementation. The Animator looks it up
 * via guild().apparatus('claude-code').
 */
export declare function createClaudeCodeProvider(): Plugin;
declare const _default: Plugin;
export default _default;
export { createMcpServer, startMcpHttpServer } from './mcp-server.ts';
export type { McpHttpHandle } from './mcp-server.ts';
/** Parsed result from stream-json output. @internal */
export interface StreamJsonResult {
    exitCode: number;
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    providerSessionId?: string;
}
/**
 * Parse a single NDJSON message from stream-json output.
 *
 * Returns parsed chunks for streaming and accumulates data into the
 * provided accumulators (transcript, metrics).
 *
 * @internal Exported for testing only.
 */
export declare function parseStreamJsonMessage(msg: Record<string, unknown>, acc: {
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: StreamJsonResult['tokenUsage'];
    providerSessionId?: string;
}): SessionChunk[];
/**
 * Process NDJSON buffer, calling handler for each complete line.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export declare function processNdjsonBuffer(buffer: string, handler: (msg: Record<string, unknown>) => void): string;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/claude-code/dist/mcp-server.d.ts ===
/**
 * MCP Tool Server — serves guild tools as typed MCP tools during anima sessions.
 *
 * Two entry points:
 *
 * 1. **`createMcpServer(tools)`** — library function. Takes an array of
 *    ToolDefinitions (already resolved by the Instrumentarium) and returns
 *    a configured McpServer.
 *
 * 2. **`startMcpHttpServer(tools)`** — starts an in-process HTTP server
 *    serving the MCP tool set via Streamable HTTP on an ephemeral localhost
 *    port. Returns a handle with the URL (for --mcp-config) and a close()
 *    function for cleanup.
 *
 * The MCP server is one-per-session. The claude-code provider owns the
 * lifecycle — starts before the Claude process, stops after it exits.
 *
 * See: docs/architecture/apparatus/claude-code.md
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Handle returned by startMcpHttpServer().
 *
 * Provides the URL for --mcp-config and a close() function for cleanup.
 */
export interface McpHttpHandle {
    /** URL for --mcp-config (e.g. "http://127.0.0.1:PORT/mcp"). */
    url: string;
    /** Shut down the HTTP server and MCP transport. */
    close(): Promise<void>;
}
/**
 * Create and configure an MCP server with the given tools.
 *
 * Each tool's Zod param schema is registered directly with the MCP SDK
 * (which handles JSON Schema conversion). The handler is wrapped to
 * validate params via Zod and format the result as MCP tool output.
 *
 * Tools with `callableBy` set that does not include `'anima'` are
 * filtered out. Tools without `callableBy` are included (available
 * to all callers by default).
 */
export declare function createMcpServer(tools: ToolDefinition[]): Promise<McpServer>;
/**
 * Start an in-process HTTP server serving the MCP tool set via SSE.
 *
 * Uses the MCP SDK's SSE transport: the client GETs /sse to establish
 * the event stream, then POSTs messages to /message. Claude Code's
 * --mcp-config expects `type: "sse"` for HTTP-based MCP servers.
 *
 * The server binds to 127.0.0.1 only — not network-accessible.
 *
 * Returns a handle with the URL (for --mcp-config) and a close() function.
 * The caller is responsible for calling close() after the session exits.
 *
 * Each session gets its own server instance. Concurrent sessions get
 * independent servers on different ports.
 */
export declare function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle>;
//# sourceMappingURL=mcp-server.d.ts.map
=== packages/plugins/clerk/dist/clerk.d.ts ===
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
import type { Plugin } from '@shardworks/nexus-core';
export declare function createClerk(): Plugin;
//# sourceMappingURL=clerk.d.ts.map
=== packages/plugins/clerk/dist/index.d.ts ===
/**
 * @shardworks/clerk-apparatus — The Clerk.
 *
 * Writ lifecycle management: post commissions, accept work, complete or fail
 * writs, and cancel them at any pre-terminal stage. Writs flow through a fixed
 * status machine and are persisted in The Stacks.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
export { type ClerkApi, type ClerkConfig, type WritTypeEntry, type WritDoc, type WritStatus, type PostCommissionRequest, type WritFilters, } from './types.ts';
export { createClerk } from './clerk.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/commission-post.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    title: z.ZodString;
    body: z.ZodString;
    type: z.ZodOptional<z.ZodString>;
    codex: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=commission-post.d.ts.map
=== packages/plugins/clerk/dist/tools/index.d.ts ===
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
export { default as writAccept } from './writ-accept.ts';
export { default as writComplete } from './writ-complete.ts';
export { default as writFail } from './writ-fail.ts';
export { default as writCancel } from './writ-cancel.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-accept.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-accept.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-cancel.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=writ-cancel.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-complete.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-complete.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-fail.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-fail.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-list.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        ready: "ready";
        active: "active";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>>;
    type: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=writ-list.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-show.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-show.d.ts.map
=== packages/plugins/clerk/dist/types.d.ts ===
/**
 * Clerk public types.
 *
 * All types exported from @shardworks/clerk-apparatus.
 */
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
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        clerk?: ClerkConfig;
    }
}
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
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/codexes/dist/git.d.ts ===
/**
 * Lightweight git helper — typed wrapper around child_process.execFile.
 *
 * All git operations in the Scriptorium go through this module for
 * safety (no shell injection) and consistent error handling.
 */
export interface GitResult {
    stdout: string;
    stderr: string;
}
export declare class GitError extends Error {
    readonly command: string[];
    readonly stderr: string;
    readonly exitCode: number | null;
    constructor(message: string, command: string[], stderr: string, exitCode: number | null);
}
/**
 * Run a git command with typed error handling.
 *
 * @param args - git subcommand and arguments (e.g. ['clone', '--bare', url])
 * @param cwd - working directory for the command
 */
export declare function git(args: string[], cwd?: string): Promise<GitResult>;
/**
 * Resolve the default branch of a bare clone by reading HEAD.
 *
 * Returns the branch name (e.g. 'main'), not the full ref.
 */
export declare function resolveDefaultBranch(bareClonePath: string): Promise<string>;
/**
 * Get the commit SHA at the tip of a branch in a bare clone.
 */
export declare function resolveRef(bareClonePath: string, ref: string): Promise<string>;
/**
 * Check if a branch has commits ahead of another branch.
 * Returns the number of commits ahead.
 */
export declare function commitsAhead(bareClonePath: string, branch: string, base: string): Promise<number>;
//# sourceMappingURL=git.d.ts.map
=== packages/plugins/codexes/dist/index.d.ts ===
/**
 * @shardworks/codexes-apparatus — The Scriptorium.
 *
 * Guild codex management: bare clone registry, draft binding lifecycle
 * (git worktrees), sealing (ff-only merge or rebase+ff), and push.
 * Default export is the apparatus plugin.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export type { ScriptoriumApi, CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, PushRequest, SealResult, CodexesConfig, CodexesSettings, CodexConfigEntry, } from './types.ts';
export { createScriptorium } from './scriptorium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/scriptorium-core.d.ts ===
/**
 * The Scriptorium — core logic.
 *
 * Manages the codex registry (bare clones), draft binding lifecycle
 * (worktrees), and sealing (ff-only merge or rebase+ff). All git
 * operations go through the git helper for safety.
 *
 * Draft tracking is in-memory — drafts are reconstructed from
 * filesystem state at startup and maintained in memory during the
 * process lifetime.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, SealResult, PushRequest, ScriptoriumApi } from './types.ts';
export declare class ScriptoriumCore {
    private codexes;
    private drafts;
    private maxMergeRetries;
    private draftRoot;
    private get home();
    private codexesDir;
    private bareClonePath;
    private draftWorktreePath;
    start(): void;
    /**
     * Load a codex from config. Checks for existing bare clone;
     * initiates background clone if missing.
     */
    private loadCodex;
    /**
     * Reconcile in-memory draft tracking with filesystem state.
     * Scans the worktree directories and rebuilds the draft map.
     */
    private reconcileDrafts;
    /**
     * Ensure a codex's bare clone is ready. Blocks if a background
     * clone is in progress. Throws if the codex is unknown or clone failed.
     */
    private ensureReady;
    private performClone;
    /**
     * Advance refs/heads/<branch> to the remote's position if the remote is
     * strictly ahead of the local sealed binding.
     *
     * This handles commits pushed to the remote outside the Scriptorium:
     * if the remote has advanced past the local sealed binding, sealing must
     * rebase the draft onto the remote position — not the stale local one.
     *
     * If the local sealed binding is already ahead of (or equal to) the remote
     * (e.g. contains unpushed seals from contention scenarios), it is kept.
     */
    private advanceToRemote;
    private performFetch;
    createApi(): ScriptoriumApi;
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    list(): Promise<CodexRecord[]>;
    show(name: string): Promise<CodexDetail>;
    remove(name: string): Promise<void>;
    fetchCodex(name: string): Promise<void>;
    push(request: PushRequest): Promise<void>;
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    seal(request: SealRequest): Promise<SealResult>;
    private draftsForCodex;
    private toCodexRecord;
}
//# sourceMappingURL=scriptorium-core.d.ts.map
=== packages/plugins/codexes/dist/scriptorium.d.ts ===
/**
 * The Scriptorium — apparatus implementation.
 *
 * Wires together the ScriptoriumCore (git operations, draft lifecycle)
 * and exposes the ScriptoriumApi as the `provides` object. Tools are
 * contributed via supportKit.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createScriptorium(): Plugin;
//# sourceMappingURL=scriptorium.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-add.d.ts ===
/**
 * codex-add tool — register an existing git repository as a guild codex.
 *
 * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the entry
 * to guild.json. Blocks until the clone completes.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    remoteUrl: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-add.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-list.d.ts ===
/**
 * codex-list tool — list all registered codexes.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=codex-list.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-push.d.ts ===
/**
 * codex-push tool — push a branch to the codex's remote.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=codex-push.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-remove.d.ts ===
/**
 * codex-remove tool — remove a codex from the guild.
 *
 * Abandons all active drafts, removes the bare clone, and removes
 * the entry from guild.json. Does NOT delete the remote repository.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-remove.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-show.d.ts ===
/**
 * codex-show tool — show details of a specific codex including active drafts.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-show.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-abandon.d.ts ===
/**
 * draft-abandon tool — abandon a draft binding.
 *
 * Removes the git worktree and branch. Fails if the draft has
 * unsealed inscriptions unless force: true.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodString;
    force: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-abandon.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-list.d.ts ===
/**
 * draft-list tool — list active draft bindings.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-list.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-open.d.ts ===
/**
 * draft-open tool — open a draft binding on a codex.
 *
 * Creates an isolated git worktree for concurrent work. Fetches from
 * the remote before branching to ensure freshness.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
    startPoint: z.ZodOptional<z.ZodString>;
    associatedWith: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-open.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-seal.d.ts ===
/**
 * draft-seal tool — seal a draft into the codex.
 *
 * Incorporates the draft's inscriptions into the sealed binding via
 * ff-only merge. If ff is not possible, rebases and retries. Fails
 * hard on conflicts — no merge commits, no auto-resolution.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    sourceBranch: z.ZodString;
    targetBranch: z.ZodOptional<z.ZodString>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    keepDraft: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-seal.d.ts.map
=== packages/plugins/codexes/dist/tools/index.d.ts ===
/**
 * Scriptorium tool re-exports.
 */
export { default as codexAdd } from './codex-add.ts';
export { default as codexList } from './codex-list.ts';
export { default as codexShow } from './codex-show.ts';
export { default as codexRemove } from './codex-remove.ts';
export { default as codexPush } from './codex-push.ts';
export { default as draftOpen } from './draft-open.ts';
export { default as draftList } from './draft-list.ts';
export { default as draftAbandon } from './draft-abandon.ts';
export { default as draftSeal } from './draft-seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/types.d.ts ===
/**
 * The Scriptorium — type definitions.
 *
 * All public types for the codexes apparatus: the ScriptoriumApi
 * (provides interface), supporting record types, and request/result
 * types for draft lifecycle and sealing operations.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export interface CodexRecord {
    /** Codex name — unique within the guild. */
    name: string;
    /** Remote repository URL. */
    remoteUrl: string;
    /** Whether the bare clone exists and is healthy. */
    cloneStatus: 'ready' | 'cloning' | 'error';
    /** Number of active drafts for this codex. */
    activeDrafts: number;
}
export interface CodexDetail extends CodexRecord {
    /** Default branch name on the remote (e.g. 'main'). */
    defaultBranch: string;
    /** Timestamp of last fetch. */
    lastFetched: string | null;
    /** Active drafts for this codex. */
    drafts: DraftRecord[];
}
export interface DraftRecord {
    /** Unique draft id (ULID). */
    id: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for this draft. */
    branch: string;
    /** Absolute filesystem path to the draft's working directory (git worktree). */
    path: string;
    /** When the draft was opened. */
    createdAt: string;
    /** Optional association — e.g. a writ id. */
    associatedWith?: string;
}
export interface OpenDraftRequest {
    /** Codex to open the draft for. */
    codexName: string;
    /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
    branch?: string;
    /**
     * Starting point — branch, tag, or commit to branch from.
     * Default: remote HEAD (the codex's default branch).
     */
    startPoint?: string;
    /** Optional association metadata (e.g. writ id). */
    associatedWith?: string;
}
export interface AbandonDraftRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch name of the draft to abandon. */
    branch: string;
    /** Force abandonment even if the draft has unsealed inscriptions. */
    force?: boolean;
}
export interface SealRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch to seal (the draft's branch). */
    sourceBranch: string;
    /** Target branch (the sealed binding). Default: codex's default branch. */
    targetBranch?: string;
    /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
    maxRetries?: number;
    /** Keep the draft after successful sealing. Default: false. */
    keepDraft?: boolean;
}
export interface SealResult {
    /** Whether sealing succeeded. */
    success: boolean;
    /** Strategy used: 'fast-forward' or 'rebase'. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts needed (0 = first try). */
    retries: number;
    /** The commit SHA at head of target after sealing. */
    sealedCommit: string;
    /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
    inscriptionsSealed: number;
}
export interface PushRequest {
    /** Codex name. */
    codexName: string;
    /**
     * Branch to push. Default: codex's default branch.
     */
    branch?: string;
}
export interface CodexesConfig {
    settings?: CodexesSettings;
    registered?: Record<string, CodexConfigEntry>;
}
export interface CodexesSettings {
    /** Max rebase-retry attempts during sealing under contention. Default: 3. */
    maxMergeRetries?: number;
    /** Directory where draft worktrees are created, relative to guild root. Default: '.nexus/worktrees'. */
    draftRoot?: string;
}
export interface CodexConfigEntry {
    /** The remote URL of the codex's git repository. */
    remoteUrl: string;
}
export interface ScriptoriumApi {
    /**
     * Register an existing repository as a codex.
     * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
     * entry to the `codexes` config section in `guild.json`.
     * Blocks until the clone completes.
     */
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    /**
     * List all registered codexes with their status.
     */
    list(): Promise<CodexRecord[]>;
    /**
     * Show details for a single codex, including active drafts.
     */
    show(name: string): Promise<CodexDetail>;
    /**
     * Remove a codex from the guild. Abandons all active drafts,
     * removes the bare clone from `.nexus/codexes/`, and removes the
     * entry from `guild.json`. Does NOT delete the remote repository.
     */
    remove(name: string): Promise<void>;
    /**
     * Fetch latest refs from the remote for a codex's bare clone.
     * Called automatically before draft creation and sealing; can
     * also be invoked manually.
     */
    fetch(name: string): Promise<void>;
    /**
     * Push a branch to the codex's remote.
     * Pushes the specified branch (default: codex's default branch)
     * to the bare clone's configured remote. Does not force-push.
     */
    push(request: PushRequest): Promise<void>;
    /**
     * Open a draft binding on a codex.
     *
     * Creates a new git branch from `startPoint` (default: the codex's
     * sealed binding) and checks it out as an isolated worktree under
     * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
     * before branching to ensure freshness.
     *
     * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
     * Rejects with a clear error if a draft with the same branch name
     * already exists for this codex.
     */
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    /**
     * List active drafts, optionally filtered by codex.
     */
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    /**
     * Abandon a draft — remove the draft's worktree and git branch.
     * Fails if the draft has unsealed inscriptions unless `force: true`.
     * The inscriptions persist in the git reflog but the draft is no
     * longer active.
     */
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    /**
     * Seal a draft — incorporate its inscriptions into the sealed binding.
     *
     * Git strategy: fast-forward merge only. If ff is not possible,
     * rebases the draft branch onto the target and retries. Retries up
     * to `maxRetries` times (default: from settings.maxMergeRetries)
     * to handle contention from concurrent sealing. Fails hard if the
     * rebase produces conflicts — no auto-resolution, no merge commits.
     *
     * On success, abandons the draft (unless `keepDraft: true`).
     */
    seal(request: SealRequest): Promise<SealResult>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/dispatch/dist/dispatch.d.ts ===
/**
 * The Dispatch — interim work runner.
 *
 * Bridges the Clerk (which tracks obligations) and the session machinery
 * (which runs animas). Finds the oldest ready writ and executes it:
 * opens a draft binding, composes context, launches a session, and handles
 * the aftermath (seal the draft, transition the writ).
 *
 * This apparatus is temporary rigging — designed to be retired when the
 * full rigging system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Dispatch apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['clerk', 'codexes', 'animator']`
 * - `recommends: ['loom']` — used indirectly via Animator.summon()
 * - `provides: DispatchApi` — the dispatch API
 * - `supportKit` — contributes the `dispatch-next` tool
 */
export declare function createDispatch(): Plugin;
//# sourceMappingURL=dispatch.d.ts.map
=== packages/plugins/dispatch/dist/index.d.ts ===
/**
 * @shardworks/dispatch-apparatus — The Dispatch.
 *
 * Interim work runner: finds the oldest ready writ and executes it through
 * the guild's session machinery. Opens a draft binding on the target codex,
 * summons an anima via The Animator, and handles the aftermath (seal the
 * draft, transition the writ). Disposable — retired when the full rigging
 * system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export { type DispatchApi, type DispatchRequest, type DispatchResult, } from './types.ts';
export { createDispatch } from './dispatch.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/tools/dispatch-next.d.ts ===
/**
 * dispatch-next tool — find the oldest ready writ and dispatch it.
 *
 * The primary entry point for running guild work. Picks the oldest ready
 * writ (FIFO order), opens a draft on its codex (if any), summons an anima
 * to fulfill it, and transitions the writ to completed or failed based on
 * the session outcome.
 *
 * Usage:
 *   nsg dispatch-next
 *   nsg dispatch-next --role scribe
 *   nsg dispatch-next --dry-run
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    role: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export default _default;
//# sourceMappingURL=dispatch-next.d.ts.map
=== packages/plugins/dispatch/dist/tools/index.d.ts ===
/**
 * Dispatch tool re-exports.
 */
export { default as dispatchNext } from './dispatch-next.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/types.d.ts ===
/**
 * The Dispatch — public types.
 *
 * These types form the contract between The Dispatch apparatus and all
 * callers (CLI, clockworks). No implementation details.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export interface DispatchApi {
    /**
     * Find the oldest ready writ and execute it.
     *
     * The full dispatch lifecycle:
     *   1. Query the Clerk for the oldest ready writ
     *   2. Transition the writ to active
     *   3. Open a draft binding on the writ's codex (if specified)
     *   4. Summon an anima session with the writ context as prompt
     *   5. Wait for session completion
     *   6. On success: seal the draft, push, transition writ to completed
     *   7. On failure: abandon the draft, transition writ to failed
     *
     * Returns null if no ready writs exist.
     *
     * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
     * skipped — the session runs in the guild home directory with
     * no codex binding.
     */
    next(request?: DispatchRequest): Promise<DispatchResult | null>;
}
export interface DispatchRequest {
    /** Role to summon. Default: 'artificer'. */
    role?: string;
    /** If true, find and report the writ but don't dispatch. */
    dryRun?: boolean;
}
export interface DispatchResult {
    /** The writ that was dispatched. */
    writId: string;
    /** The session id (from the Animator). Absent if dryRun. */
    sessionId?: string;
    /** Terminal writ status after dispatch. Absent if dryRun. */
    outcome?: 'completed' | 'failed';
    /** Resolution text set on the writ. Absent if dryRun. */
    resolution?: string;
    /** Whether this was a dry run. */
    dryRun: boolean;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/fabricator/dist/fabricator.d.ts ===
/**
 * The Fabricator — guild engine design registry apparatus.
 *
 * Scans installed engine designs from kit contributions and apparatus supportKits,
 * and serves them to the Spider on demand.
 *
 * The Fabricator does not execute engines. It is a pure query service:
 * designs in, designs out.
 */
import type { Plugin } from '@shardworks/nexus-core';
/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
    /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
    engineId: string;
    /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
    upstream: Record<string, unknown>;
}
/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Spider polls for completion.
 */
export type EngineRunResult = {
    status: 'completed';
    yields: unknown;
} | {
    status: 'launched';
    sessionId: string;
};
/**
 * An engine design — the unit of work the Fabricator catalogues and the
 * Spider executes. Kit authors import this type from @shardworks/fabricator-apparatus.
 */
export interface EngineDesign {
    /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
    id: string;
    /**
     * Execute this engine.
     *
     * @param givens   — the engine's declared inputs, assembled by the Spider.
     * @param context  — minimal execution context: engine id and upstream yields.
     */
    run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
    /**
     * Assemble yields from a completed session.
     *
     * Called by the Spider's collect step when a quick engine's session
     * reaches a terminal state. The engine looks up whatever it needs
     * via guild() — same dependency pattern as run().
     *
     * @param sessionId — the session to collect yields from (primary input).
     * @param givens    — same givens that were passed to run().
     * @param context   — same execution context that was passed to run().
     *
     * If not defined, the Spider uses a generic default:
     *   { sessionId, sessionStatus, output? }
     *
     * Only relevant for quick engines (those that return { status: 'launched' }).
     * Clockwork engines return yields directly from run().
     */
    collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
    /**
     * Look up an engine design by ID.
     * Returns the design if registered, undefined otherwise.
     */
    getEngineDesign(id: string): EngineDesign | undefined;
}
/**
 * Create the Fabricator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['engines']` — scans kit/supportKit contributions
 * - `provides: FabricatorApi` — the engine design registry API
 */
export declare function createFabricator(): Plugin;
//# sourceMappingURL=fabricator.d.ts.map
=== packages/plugins/fabricator/dist/index.d.ts ===
/**
 * @shardworks/fabricator-apparatus — The Fabricator.
 *
 * Guild engine design registry: scans kit contributions, stores engine designs
 * by ID, and provides the FabricatorApi for design lookup.
 *
 * The EngineDesign, EngineRunContext, and EngineRunResult types live here
 * canonically — kit authors import from this package to contribute engines.
 */
export type { EngineDesign, EngineRunContext, EngineRunResult, } from './fabricator.ts';
export type { FabricatorApi } from './fabricator.ts';
export { createFabricator } from './fabricator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/index.d.ts ===
/**
 * @shardworks/loom-apparatus — The Loom.
 *
 * Session context composition: weaves role instructions, curricula, and
 * temperaments into an AnimaWeave that The Animator can consume to
 * launch AI sessions.
 *
 * See: docs/specification.md (loom)
 */
export { type LoomApi, type WeaveRequest, type AnimaWeave, type LoomConfig, type RoleDefinition, createLoom, } from './loom.ts';
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        loom?: LoomConfig;
    }
}
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/loom.d.ts ===
/**
 * The Loom — session context composition apparatus.
 *
 * The Loom owns system prompt assembly. Given a role name, it produces
 * an AnimaWeave — the composed identity context that The Animator uses
 * to launch a session. The work prompt (what the anima should do) is
 * not the Loom's concern; it bypasses the Loom and goes directly to
 * the Animator.
 *
 * The Loom resolves the role's permission grants from guild.json, then
 * calls the Instrumentarium to resolve the permission-gated tool set.
 * Tools are returned on the AnimaWeave so the Animator can pass them
 * to the session provider for MCP server configuration.
 *
 * See: docs/specification.md (loom)
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
export interface WeaveRequest {
    /**
     * The role to weave context for (e.g. 'artificer', 'scribe').
     *
     * When provided, the Loom resolves role → permissions from guild.json,
     * then calls the Instrumentarium to resolve the permission-gated tool set.
     * Tools are returned on the AnimaWeave.
     *
     * When omitted, no tool resolution occurs — the AnimaWeave has no tools.
     */
    role?: string;
}
/**
 * The output of The Loom's weave() — the composed anima identity context.
 *
 * Contains the system prompt (produced by the Loom from the anima's
 * identity layers) and the resolved tool set for the role. The work
 * prompt is not part of the weave — it goes directly to the Animator.
 */
export interface AnimaWeave {
    /**
     * The system prompt for the AI process. Composed from guild charter,
     * tool instructions, and role instructions. Undefined when no
     * composition layers produce content.
     */
    systemPrompt?: string;
    /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
    tools?: ResolvedTool[];
    /** Environment variables derived from role identity (e.g. git author/committer). */
    environment?: Record<string, string>;
}
/** The Loom's public API, exposed via `provides`. */
export interface LoomApi {
    /**
     * Weave an anima's session context.
     *
     * Given a role name, produces an AnimaWeave containing the composed
     * system prompt and the resolved tool set. The system prompt is assembled
     * from the guild charter, tool instructions (for the resolved tool set),
     * and role instructions — in that order.
     *
     * Tool resolution is active: if a role is provided and the Instrumentarium
     * is installed, the Loom resolves role → permissions → tools.
     */
    weave(request: WeaveRequest): Promise<AnimaWeave>;
}
/** Role definition in guild.json under the Loom's plugin section. */
export interface RoleDefinition {
    /** Permission grants in `plugin:level` format. */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. Default: false.
     */
    strict?: boolean;
}
/** Loom configuration from guild.json. */
export interface LoomConfig {
    /** Role definitions keyed by role name. */
    roles?: Record<string, RoleDefinition>;
}
/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `provides: LoomApi` — the context composition API
 */
export declare function createLoom(): Plugin;
//# sourceMappingURL=loom.d.ts.map
=== packages/plugins/parlour/dist/index.d.ts ===
/**
 * @shardworks/parlour-apparatus — The Parlour.
 *
 * Multi-turn conversation management: creates conversations, registers
 * participants, orchestrates turns (with streaming), enforces turn limits,
 * and ends conversations. Delegates session launch to The Animator and
 * context composition to The Loom.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
export { type ParlourApi, type ConversationDoc, type TurnDoc, type ParticipantRecord, type Participant, type CreateConversationRequest, type CreateConversationResult, type ParticipantDeclaration, type TakeTurnRequest, type TurnResult, type ConversationChunk, type ConversationSummary, type ConversationDetail, type TurnSummary, type ListConversationsOptions, } from './types.ts';
export { createParlour } from './parlour.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/parlour.d.ts ===
/**
 * The Parlour — multi-turn conversation management apparatus.
 *
 * Manages two kinds of conversation:
 * - consult: a human talks to an anima
 * - convene: multiple animas hold a structured dialogue
 *
 * The Parlour orchestrates turns — it decides when and for whom to call
 * The Animator, and tracks conversation state in The Stacks. It does not
 * launch sessions itself (delegates to The Animator) or assemble prompts
 * (delegates to The Loom).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Parlour apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks', 'animator', 'loom']` — conversation orchestration
 * - `provides: ParlourApi` — the conversation management API
 * - `supportKit` — contributes `conversations` + `turns` books + management tools
 */
export declare function createParlour(): Plugin;
//# sourceMappingURL=parlour.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-end.d.ts ===
/**
 * conversation-end tool — end an active conversation.
 *
 * Sets conversation status to 'concluded' or 'abandoned'.
 * Idempotent — no error if the conversation is already ended.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    reason: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        concluded: "concluded";
        abandoned: "abandoned";
    }>>>;
}>;
export default _default;
//# sourceMappingURL=conversation-end.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-list.d.ts ===
/**
 * conversation-list tool — list conversations with optional filters.
 *
 * Queries The Parlour's conversations via the ParlourApi.
 * Returns conversation summaries ordered by createdAt descending (newest first).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        concluded: "concluded";
        abandoned: "abandoned";
    }>>;
    kind: z.ZodOptional<z.ZodEnum<{
        consult: "consult";
        convene: "convene";
    }>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=conversation-list.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-show.d.ts ===
/**
 * conversation-show tool — show full detail for a conversation.
 *
 * Returns the complete conversation record including all turns,
 * participant list, and aggregate cost.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=conversation-show.d.ts.map
=== packages/plugins/parlour/dist/tools/index.d.ts ===
/**
 * Parlour tool re-exports.
 */
export { default as conversationList } from './conversation-list.ts';
export { default as conversationShow } from './conversation-show.ts';
export { default as conversationEnd } from './conversation-end.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/types.d.ts ===
/**
 * The Parlour — public types.
 *
 * These types form the contract between The Parlour apparatus and all
 * callers (CLI consult command, clockworks convene handlers, etc.).
 * No implementation details.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { SessionResult, SessionChunk } from '@shardworks/animator-apparatus';
export interface ConversationDoc {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    eventId: string | null;
    participants: ParticipantRecord[];
    /** Stored once at creation — all turns must use the same cwd for --resume. */
    cwd: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface ParticipantRecord {
    /** Stable participant id (generated at creation). */
    id: string;
    kind: 'anima' | 'human';
    name: string;
    /** Anima id, resolved at creation time. Null for human participants. */
    animaId: string | null;
    /**
     * Provider session id for --resume. Updated after each turn so
     * the next turn can continue the provider's conversation context.
     */
    providerSessionId: string | null;
}
/**
 * Internal turn record stored in the turns book.
 * One entry per takeTurn() call — both human and anima turns.
 */
export interface TurnDoc {
    id: string;
    conversationId: string;
    turnNumber: number;
    participantId: string;
    participantName: string;
    participantKind: 'anima' | 'human';
    /** The message passed to this turn (human message or inter-turn context). */
    message: string | null;
    /** Session id from The Animator (null for human turns). */
    sessionId: string | null;
    startedAt: string;
    endedAt: string | null;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface CreateConversationRequest {
    /** Conversation kind. */
    kind: 'consult' | 'convene';
    /** Seed topic or prompt. Used as the initial message for the first turn. */
    topic?: string;
    /** Maximum allowed turns (anima turns only). Null = unlimited. */
    turnLimit?: number;
    /** Participants in the conversation. */
    participants: ParticipantDeclaration[];
    /** Working directory — persists for the conversation's lifetime. */
    cwd: string;
    /** Triggering event id, for conversations started by clockworks. */
    eventId?: string;
}
export interface ParticipantDeclaration {
    kind: 'anima' | 'human';
    /** Display name. For anima participants, this is the anima name
     *  used to resolve identity via The Loom at turn time. */
    name: string;
}
export interface CreateConversationResult {
    conversationId: string;
    participants: Participant[];
}
export interface Participant {
    id: string;
    name: string;
    kind: 'anima' | 'human';
}
export interface TakeTurnRequest {
    conversationId: string;
    participantId: string;
    /** The message for this turn. For consult: the human's message.
     *  For convene: typically assembled by the caller, or omitted to
     *  let The Parlour assemble it automatically. */
    message?: string;
}
export interface TurnResult {
    /** The Animator's session result for this turn. Null for human turns. */
    sessionResult: SessionResult | null;
    /** Turn number within the conversation (1-indexed). */
    turnNumber: number;
    /** Whether the conversation is still active after this turn. */
    conversationActive: boolean;
}
/** A chunk of output from a conversation turn. */
export type ConversationChunk = SessionChunk | {
    type: 'turn_complete';
    turnNumber: number;
    costUsd?: number;
};
export interface ConversationSummary {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    participants: Participant[];
    /** Computed from turn records. */
    turnCount: number;
    /** Aggregate cost across all turns. */
    totalCostUsd: number;
}
export interface ConversationDetail extends ConversationSummary {
    turns: TurnSummary[];
}
export interface TurnSummary {
    sessionId: string | null;
    turnNumber: number;
    participant: string;
    message: string | null;
    startedAt: string;
    endedAt: string | null;
}
export interface ListConversationsOptions {
    status?: 'active' | 'concluded' | 'abandoned';
    kind?: 'consult' | 'convene';
    limit?: number;
}
export interface ParlourApi {
    /**
     * Create a new conversation.
     *
     * Sets up conversation and participant records. Does NOT take a first
     * turn — that's a separate call to takeTurn().
     */
    create(request: CreateConversationRequest): Promise<CreateConversationResult>;
    /**
     * Take a turn in a conversation.
     *
     * For anima participants: weaves context via The Loom, assembles the
     * inter-turn message, and calls The Animator to run a session. Returns
     * the session result. For human participants: records the message as
     * context for the next turn (no session launched).
     *
     * Throws if the conversation is not active or the turn limit is reached.
     */
    takeTurn(request: TakeTurnRequest): Promise<TurnResult>;
    /**
     * Take a turn with streaming output.
     *
     * Same as takeTurn(), but yields ConversationChunks as the session
     * produces output. Includes a turn_complete chunk at the end.
     */
    takeTurnStreaming(request: TakeTurnRequest): {
        chunks: AsyncIterable<ConversationChunk>;
        result: Promise<TurnResult>;
    };
    /**
     * Get the next participant in a conversation.
     *
     * For convene: returns the next anima in round-robin order.
     * For consult: returns the anima participant (human turns are implicit).
     * Returns null if the conversation is not active or the turn limit is reached.
     */
    nextParticipant(conversationId: string): Promise<Participant | null>;
    /**
     * End a conversation.
     *
     * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
     * disconnect). Idempotent — no error if already ended.
     */
    end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>;
    /**
     * List conversations with optional filters.
     */
    list(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
    /**
     * Show full detail for a conversation.
     */
    show(conversationId: string): Promise<ConversationDetail | null>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/spider/dist/engines/draft.d.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const draftEngine: EngineDesign;
export default draftEngine;
//# sourceMappingURL=draft.d.ts.map
=== packages/plugins/spider/dist/engines/implement.d.ts ===
/**
 * Implement engine — quick (Animator-backed).
 *
 * Summons an anima to do the commissioned work. Wraps the writ body with
 * a commit instruction, then calls animator.summon() with the draft
 * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
 * so the Spider's collect step can poll for completion on subsequent walks.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const implementEngine: EngineDesign;
export default implementEngine;
//# sourceMappingURL=implement.d.ts.map
=== packages/plugins/spider/dist/engines/index.d.ts ===
export { default as draftEngine } from './draft.ts';
export { default as implementEngine } from './implement.ts';
export { default as reviewEngine } from './review.ts';
export { default as reviseEngine } from './revise.ts';
export { default as sealEngine } from './seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/engines/review.d.ts ===
/**
 * Review engine — quick (Animator-backed).
 *
 * Runs mechanical checks (build/test) synchronously in the draft worktree,
 * then summons a reviewer anima to assess the implementation against the spec.
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can call this engine's collect() method on subsequent crawls.
 *
 * Collect method:
 *   - Reads session.output as the reviewer's structured markdown findings
 *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
 *   - Retrieves mechanicalChecks from session.metadata
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviewEngine: EngineDesign;
export default reviewEngine;
//# sourceMappingURL=review.d.ts.map
=== packages/plugins/spider/dist/engines/revise.d.ts ===
/**
 * Revise engine — quick (Animator-backed).
 *
 * Summons an anima to address review findings. If the review passed, the
 * prompt instructs the anima to confirm and exit without unnecessary changes.
 * If the review failed, the prompt directs the anima to address each item
 * in the findings and commit the result.
 *
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can store ReviseYields on completion.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviseEngine: EngineDesign;
export default reviseEngine;
//# sourceMappingURL=revise.d.ts.map
=== packages/plugins/spider/dist/engines/seal.d.ts ===
/**
 * Seal engine — clockwork.
 *
 * Seals the draft binding via the Scriptorium. Reads the draft branch
 * from context.upstream['draft'] (the DraftYields from the draft engine).
 * Returns SealYields with the sealed commit info.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const sealEngine: EngineDesign;
export default sealEngine;
//# sourceMappingURL=seal.d.ts.map
=== packages/plugins/spider/dist/index.d.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */
export type { EngineStatus, EngineInstance, RigStatus, RigDoc, CrawlResult, SpiderApi, SpiderConfig, DraftYields, SealYields, } from './types.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/spider.d.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > run > spawn   (priority order)
 *
 * collect — check running engines for terminal session results
 * run     — execute the next pending engine (clockwork inline, quick → launch)
 * spawn   — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 *
 * See: docs/architecture/apparatus/spider.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createSpider(): Plugin;
//# sourceMappingURL=spider.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-continual.d.ts ===
/**
 * crawlContinual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval until stopped or no remaining
 * work exists for the configured number of consecutive idle cycles.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    maxIdleCycles: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pollIntervalMs: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=crawl-continual.d.ts.map
=== packages/plugins/spider/dist/tools/crawl.d.ts ===
/**
 * crawl tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=crawl.d.ts.map
=== packages/plugins/spider/dist/tools/index.d.ts ===
export { default as crawlTool } from './crawl.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/types.d.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';
/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Spider assembles `givens` from this directly; upstream yields arrive
 * via `context.upstream` as the escape hatch.
 */
export interface EngineInstance {
    /** Unique identifier within the rig (e.g. 'draft', 'implement'). */
    id: string;
    /** The engine design to look up in the Fabricator. */
    designId: string;
    /** Current execution status. */
    status: EngineStatus;
    /** Engine IDs that must be completed before this engine can run. */
    upstream: string[];
    /** Literal givens values set at rig spawn time. */
    givensSpec: Record<string, unknown>;
    /** Yields from a completed engine run (JSON-serializable). */
    yields?: unknown;
    /** Error message if this engine failed. */
    error?: string;
    /** Session ID from a launched quick engine, used by the collect step. */
    sessionId?: string;
    /** ISO timestamp when execution started. */
    startedAt?: string;
    /** ISO timestamp when execution completed (or failed). */
    completedAt?: string;
}
export type RigStatus = 'running' | 'completed' | 'failed';
/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Spider updates this document
 * in-place as engines run and complete.
 */
export interface RigDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique rig id. */
    id: string;
    /** The writ this rig is executing. */
    writId: string;
    /** Current rig status. */
    status: RigStatus;
    /** Ordered engine pipeline. */
    engines: EngineInstance[];
}
/**
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type CrawlResult = {
    action: 'engine-completed';
    rigId: string;
    engineId: string;
} | {
    action: 'engine-started';
    rigId: string;
    engineId: string;
} | {
    action: 'rig-spawned';
    rigId: string;
    writId: string;
} | {
    action: 'rig-completed';
    rigId: string;
    writId: string;
    outcome: 'completed' | 'failed';
};
/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
    /**
     * Execute one step of the crawl loop.
     *
     * Priority ordering: collect > run > spawn.
     * Returns null when no work is available.
     */
    crawl(): Promise<CrawlResult | null>;
}
/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
    /**
     * Role to summon for quick engine sessions.
     * Default: 'artificer'.
     */
    role?: string;
    /**
     * Polling interval for crawlContinual tool (milliseconds).
     * Default: 5000.
     */
    pollIntervalMs?: number;
    /**
     * Build command to pass to quick engines.
     */
    buildCommand?: string;
    /**
     * Test command to pass to quick engines.
     */
    testCommand?: string;
}
/**
 * Yields from the `draft` clockwork engine.
 * The Spider stores these in the engine instance and passes them
 * to downstream engines via context.upstream['draft'].
 */
export interface DraftYields {
    /** The draft's unique id. */
    draftId: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for the draft. */
    branch: string;
    /** Absolute filesystem path to the draft's worktree. */
    path: string;
    /** HEAD commit SHA at the time the draft was opened. Used by review engine to compute diffs. */
    baseSha: string;
}
/**
 * Yields from the `seal` clockwork engine.
 */
export interface SealYields {
    /** The commit SHA at head of the target branch after sealing. */
    sealedCommit: string;
    /** Git strategy used. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts. */
    retries: number;
    /** Number of inscriptions (commits) sealed. */
    inscriptionsSealed: number;
}
/**
 * Yields from the `implement` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ImplementYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
/**
 * A single mechanical check (build or test) run by the review engine
 * before launching the reviewer session.
 */
export interface MechanicalCheck {
    /** Check name. */
    name: 'build' | 'test';
    /** Whether the command exited with code 0. */
    passed: boolean;
    /** Combined stdout+stderr, truncated to 4KB. */
    output: string;
    /** Wall-clock duration of the check in milliseconds. */
    durationMs: number;
}
/**
 * Yields from the `review` quick engine.
 * Assembled by the Spider's collect step from session.output and session.metadata.
 */
export interface ReviewYields {
    /** The Animator session id. */
    sessionId: string;
    /** Reviewer's overall assessment — true if the review passed. */
    passed: boolean;
    /** Structured markdown findings from the reviewer's final message. */
    findings: string;
    /** Mechanical check results run before the reviewer session. */
    mechanicalChecks: MechanicalCheck[];
}
/**
 * Yields from the `revise` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ReviseYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        spider?: SpiderConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/stacks/dist/backend.d.ts ===
/**
 * StacksBackend — persistence abstraction for The Stacks.
 *
 * All SQLite-specific types stay behind this interface. The apparatus
 * and all consuming plugins depend only on these types. Backend
 * implementations (SQLite, in-memory) implement this interface.
 *
 * See: docs/specification.md §8
 */
import type { BookEntry, BookSchema, Scalar } from './types.ts';
export interface BookRef {
    ownerId: string;
    book: string;
}
export interface BackendOptions {
    home: string;
}
export interface PutResult {
    created: boolean;
    prev?: BookEntry;
}
export interface PatchResult {
    entry: BookEntry;
    prev: BookEntry;
}
export interface DeleteResult {
    found: boolean;
    prev?: BookEntry;
}
export type InternalCondition = {
    field: string;
    op: 'eq' | 'neq';
    value: Scalar;
} | {
    field: string;
    op: 'gt' | 'gte' | 'lt' | 'lte';
    value: number | string;
} | {
    field: string;
    op: 'like';
    value: string;
} | {
    field: string;
    op: 'in';
    values: Scalar[];
} | {
    field: string;
    op: 'isNull' | 'isNotNull';
};
export interface InternalQuery {
    where?: InternalCondition[];
    orderBy?: Array<{
        field: string;
        dir: 'asc' | 'desc';
    }>;
    limit?: number;
    offset?: number;
}
/** Narrowed query type for count() — conditions only, no pagination. */
export interface CountQuery {
    where?: InternalCondition[];
}
export interface BackendTransaction {
    put(ref: BookRef, entry: BookEntry, opts?: {
        withPrev: boolean;
    }): PutResult;
    patch(ref: BookRef, id: string, fields: Record<string, unknown>): PatchResult;
    delete(ref: BookRef, id: string, opts?: {
        withPrev: boolean;
    }): DeleteResult;
    get(ref: BookRef, id: string): BookEntry | null;
    find(ref: BookRef, query: InternalQuery): BookEntry[];
    count(ref: BookRef, query: CountQuery): number;
    commit(): void;
    rollback(): void;
}
export interface StacksBackend {
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=backend.d.ts.map
=== packages/plugins/stacks/dist/cdc.d.ts ===
/**
 * CDC registry — handler registration, event buffering, and coalescing.
 *
 * Two-phase execution model:
 * - Phase 1 (failOnError: true):  runs INSIDE the transaction
 * - Phase 2 (failOnError: false): runs AFTER commit with coalesced events
 *
 * See: docs/specification.md (stacks § CDC)
 */
import type { BookEntry, ChangeEvent, ChangeHandler, WatchOptions } from './types.ts';
interface WatcherEntry {
    handler: ChangeHandler;
    failOnError: boolean;
}
export interface BufferedEvent {
    ref: string;
    ownerId: string;
    book: string;
    docId: string;
    type: 'create' | 'update' | 'delete';
    entry?: BookEntry;
    prev?: BookEntry;
}
/**
 * Coalesce buffered events per-document.
 *
 * Rules:
 *   create                    → create (final state)
 *   create → update(s)        → create (final state)
 *   create → delete           → (no event)
 *   update(s)                 → update (first prev, final state)
 *   update(s) → delete        → delete (first prev)
 *   delete                    → delete (prev)
 */
export declare function coalesceEvents(buffer: BufferedEvent[]): ChangeEvent<BookEntry>[];
export declare class CdcRegistry {
    private readonly watchers;
    private locked;
    /**
     * Register a CDC handler for a book.
     * Must be called before any writes (enforced by `locked` flag).
     */
    watch(ownerId: string, bookName: string, handler: ChangeHandler, options?: WatchOptions): void;
    /** Mark the registry as locked — called on first write. */
    lock(): void;
    /** Check if any handlers are registered for a book (controls pre-read). */
    hasWatchers(ownerId: string, bookName: string): boolean;
    /** Get Phase 1 handlers (failOnError: true) for a book. */
    getPhase1Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /** Get Phase 2 handlers (failOnError: false) for a book. */
    getPhase2Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /**
     * Fire Phase 1 handlers for a single event. Throws on handler error
     * (caller is responsible for rolling back the transaction).
     */
    firePhase1(ownerId: string, bookName: string, event: ChangeEvent<BookEntry>): Promise<void>;
    /**
     * Fire Phase 2 handlers for coalesced events. Errors are logged, not thrown.
     */
    firePhase2(events: ChangeEvent<BookEntry>[]): Promise<void>;
}
export {};
//# sourceMappingURL=cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/helpers.d.ts ===
/**
 * Conformance test helpers — create a StacksApi from a bare backend,
 * bypassing the guild startup machinery.
 *
 * Each test gets a fresh backend + API instance. No state leaks.
 */
import type { StacksBackend, BookRef } from '../backend.ts';
import type { BookEntry, StacksApi, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, WatchOptions } from '../types.ts';
export interface TestStacks {
    stacks: StacksApi;
    backend: StacksBackend;
    /** Ensure a book exists (bypasses kit contribution flow). */
    ensureBook(ownerId: string, bookName: string, schema?: {
        indexes?: (string | string[])[];
    }): void;
}
export declare function createTestStacks(backendFactory: () => StacksBackend): TestStacks;
export declare function seedDocument(backend: StacksBackend, ref: BookRef, entry: BookEntry): void;
export declare function collectEvents<T extends BookEntry = BookEntry>(stacks: StacksApi, ownerId: string, bookName: string, options?: WatchOptions): ChangeEvent<T>[];
export interface PutCall {
    ref: BookRef;
    entry: BookEntry;
    withPrev: boolean;
}
/**
 * Wraps a backend factory to record put() calls on transactions,
 * so tests can verify whether withPrev was requested.
 */
export declare function spyingBackendFactory(factory: () => StacksBackend): {
    factory: () => StacksBackend;
    putCalls: PutCall[];
};
/** Assert the event is a `create` and check its fields. */
export declare function assertCreateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is CreateEvent<BookEntry>;
/** Assert the event is an `update` and check its fields. */
export declare function assertUpdateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is UpdateEvent<BookEntry>;
/** Assert the event is a `delete` and check its fields. */
export declare function assertDeleteEvent(event: ChangeEvent<BookEntry>, expected: {
    id: string;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is DeleteEvent<BookEntry>;
export declare const OWNER = "test-owner";
export declare const BOOK = "testbook";
export declare const REF: BookRef;
//# sourceMappingURL=helpers.d.ts.map
=== packages/plugins/stacks/dist/conformance/suite.d.ts ===
/**
 * Stacks conformance test suite — parametric registration.
 *
 * Exports a single function that registers all conformance tiers
 * against a given backend factory. Each backend test file calls
 * this with its own factory function.
 */
import type { StacksBackend } from '../backend.ts';
export declare function runConformanceSuite(suiteName: string, backendFactory: () => StacksBackend): void;
//# sourceMappingURL=suite.d.ts.map
=== packages/plugins/stacks/dist/conformance/testable-stacks.d.ts ===
/**
 * Testable Stacks — a minimal StacksApi wired directly to a backend,
 * without requiring the guild startup machinery.
 *
 * Uses the same StacksCore as the production apparatus, ensuring
 * behavioral identity by construction.
 */
import type { StacksBackend } from '../backend.ts';
import type { StacksApi } from '../types.ts';
export declare function createTestableStacks(backend: StacksBackend): StacksApi;
//# sourceMappingURL=testable-stacks.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier1-data-integrity.d.ts ===
/**
 * Tier 1 — Data Integrity conformance tests.
 *
 * Failures here mean data loss or corruption. Non-negotiable.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier1DataIntegrity(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier1-data-integrity.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2-cdc.d.ts ===
/**
 * Tier 2 — CDC Behavioral Correctness conformance tests.
 *
 * Failures here mean the CDC contract is violated.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier2Cdc(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2-cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2.5-transactions.d.ts ===
/**
 * Tier 2.5 — Transaction Semantics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier25Transactions(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2.5-transactions.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier3-queries.d.ts ===
/**
 * Tier 3 — Query Correctness conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier3Queries(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier3-queries.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier4-edge-cases.d.ts ===
/**
 * Tier 4 — Edge Cases and Ergonomics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier4EdgeCases(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier4-edge-cases.d.ts.map
=== packages/plugins/stacks/dist/field-utils.d.ts ===
/**
 * Shared field access and order-by utilities.
 *
 * Used by both the apparatus-level logic (stacks-core.ts) and the
 * memory backend (memory-backend.ts). Kept in a minimal module with
 * no heavy dependencies.
 */
import type { BookEntry, OrderBy } from './types.ts';
/**
 * Access a potentially nested field via dot-notation (e.g. "parent.id").
 */
export declare function getNestedField(obj: BookEntry | Record<string, unknown>, field: string): unknown;
/**
 * Normalize the public OrderBy type into a uniform array of { field, dir }.
 *
 * Does NOT validate field names — callers are responsible for ensuring
 * fields have already been validated (e.g. via translateQuery) before
 * reaching this point. translateQuery calls validateFieldName after
 * normalizing because it sits at the untrusted-input boundary.
 */
export declare function normalizeOrderBy(orderBy: OrderBy): Array<{
    field: string;
    dir: 'asc' | 'desc';
}>;
/**
 * Compare two entries by a list of order-by entries.
 *
 * Shared by the memory backend's sortEntries and the apparatus-level
 * OR query re-sort in stacks-core.ts. Null values sort before non-null
 * in ascending order, after non-null in descending order.
 */
export declare function compareByOrderEntries(a: BookEntry | Record<string, unknown>, b: BookEntry | Record<string, unknown>, orderEntries: Array<{
    field: string;
    dir: 'asc' | 'desc';
}>): number;
//# sourceMappingURL=field-utils.d.ts.map
=== packages/plugins/stacks/dist/index.d.ts ===
/**
 * @shardworks/stacks-apparatus — The Stacks apparatus.
 *
 * Guild persistence layer: NoSQL document store with CDC, transactions,
 * and swappable backend. Default export is the apparatus plugin.
 *
 * See: docs/specification.md
 */
export type { StacksConfig, BookEntry, BookSchema, Book, ReadOnlyBook, Scalar, WhereCondition, WhereClause, OrderEntry, OrderBy, Pagination, BookQuery, ListOptions, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, ChangeHandler, WatchOptions, StacksApi, TransactionContext, } from './types.ts';
export type { StacksBackend, BackendTransaction, BackendOptions, BookRef, InternalQuery, InternalCondition, CountQuery, PutResult, PatchResult, DeleteResult, } from './backend.ts';
export { createStacksApparatus } from './stacks.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/stacks/dist/memory-backend.d.ts ===
/**
 * In-memory StacksBackend for tests.
 *
 * Exported via `@shardworks/stacks-apparatus/testing`. No SQLite dependency.
 * Implements the same contract as the SQLite backend.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare class MemoryBackend implements StacksBackend {
    private store;
    open(_options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, _schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=memory-backend.d.ts.map
=== packages/plugins/stacks/dist/query.d.ts ===
/**
 * Query translation — public WhereClause tuples → InternalQuery.
 *
 * Validates field names against a safe allowlist, then maps the
 * user-facing operator strings to the backend's internal enum.
 */
import type { BookQuery, WhereClause } from './types.ts';
import type { InternalCondition, InternalQuery } from './backend.ts';
export declare function validateFieldName(field: string): string;
export declare function translateQuery(query: BookQuery): InternalQuery;
/**
 * Translate a WhereClause into conditions only (no pagination fields).
 * OR clauses are handled at the apparatus level — this only handles AND.
 */
export declare function translateWhereClause(where?: WhereClause | {
    or: WhereClause[];
}): {
    where?: InternalCondition[];
};
//# sourceMappingURL=query.d.ts.map
=== packages/plugins/stacks/dist/sqlite-backend.d.ts ===
/**
 * SQLite backend for The Stacks — backed by better-sqlite3.
 *
 * Implements the StacksBackend interface. All SQLite-specific details
 * (json_extract, table naming, WAL mode) are encapsulated here.
 *
 * Documents are stored as JSON blobs in a `content` TEXT column.
 * Field queries use json_extract() against declared indexes.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare function tableName(ref: BookRef): string;
export declare class SqliteBackend implements StacksBackend {
    private db;
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
    private requireDb;
}
//# sourceMappingURL=sqlite-backend.d.ts.map
=== packages/plugins/stacks/dist/stacks-core.d.ts ===
/**
 * Stacks core — shared implementation logic for both the production
 * apparatus (stacks.ts) and the testable harness (testable-stacks.ts).
 *
 * This module contains ALL read/write/transaction/CDC logic. The two
 * consumer modules only add their own wiring: the apparatus adds guild()
 * startup and plugin schema reconciliation; the testable harness adds
 * nothing (just exposes createApi() directly).
 *
 * This ensures behavioral identity by construction, not by copy-paste.
 */
import type { BookRef, StacksBackend } from './backend.ts';
import type { BookEntry, BookQuery, StacksApi, TransactionContext, WhereClause } from './types.ts';
export declare class StacksCore {
    readonly backend: StacksBackend;
    private readonly cdc;
    private activeTx;
    constructor(backend: StacksBackend);
    createApi(): StacksApi;
    runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
    private createTransactionContext;
    doPut(ref: BookRef, entry: BookEntry): Promise<void>;
    private doPutInTx;
    doPatch(ref: BookRef, id: string, fields: Record<string, unknown>): Promise<BookEntry>;
    private doPatchInTx;
    doDelete(ref: BookRef, id: string): Promise<void>;
    private doDeleteInTx;
    doGet(ref: BookRef, id: string): BookEntry | null;
    doFind(ref: BookRef, query: BookQuery): Promise<BookEntry[]>;
    /**
     * OR queries: run each branch as a separate backend query, deduplicate
     * by id, re-sort, and paginate the merged result set.
     *
     * V1 trade-off: when called outside an active transaction, each branch
     * opens its own throwaway read transaction. For synchronous backends
     * like better-sqlite3, the data can't change between branches so this
     * is safe. A hypothetical async backend could see different snapshots
     * per branch, producing inconsistent results — a known limitation
     * documented in the spec's implementation notes.
     *
     * Performance note: each branch is a separate backend query. count()
     * with OR cannot use the backend's efficient count path since
     * deduplication requires knowing which IDs overlap. Acceptable for v1.
     */
    private doFindOr;
    doCount(ref: BookRef, where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
    private requireTx;
}
//# sourceMappingURL=stacks-core.d.ts.map
=== packages/plugins/stacks/dist/stacks.d.ts ===
/**
 * The Stacks — apparatus implementation.
 *
 * Wires together the backend, CDC registry, and transaction model
 * to provide the StacksApi `provides` object. All core read/write/
 * transaction logic lives in stacks-core.ts.
 *
 * See: docs/specification.md
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { StacksBackend } from './backend.ts';
export declare function createStacksApparatus(backend?: StacksBackend): Plugin;
//# sourceMappingURL=stacks.d.ts.map
=== packages/plugins/stacks/dist/types.d.ts ===
/**
 * The Stacks — public API types.
 *
 * These types form the contract between The Stacks apparatus and all
 * consuming plugins. No SQLite types, no implementation details.
 *
 * See: docs/specification.md
 */
/** Plugin configuration stored at guild.json["stacks"]. */
export interface StacksConfig {
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified.
     */
    autoMigrate?: boolean;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        stacks?: StacksConfig;
    }
}
/** Every document stored in a book must satisfy this constraint. */
export type BookEntry = {
    id: string;
} & Record<string, unknown>;
/**
 * Schema declaration for a single book in a kit's `books` contribution.
 *
 * `indexes` is a list of fields to create efficient query indexes for.
 * Field names use plain notation ('status') or dot-notation for nested
 * fields ('parent.id'). The Stacks translates internally.
 */
export interface BookSchema {
    indexes?: (string | string[])[];
}
export type Scalar = string | number | boolean | null;
export type WhereCondition = [field: string, op: '=' | '!=', value: Scalar] | [field: string, op: '>' | '>=' | '<' | '<=', value: number | string] | [field: string, op: 'LIKE', value: string] | [field: string, op: 'IN', value: Scalar[]] | [field: string, op: 'IS NULL' | 'IS NOT NULL'];
export type WhereClause = WhereCondition[];
export type OrderEntry = [field: string, direction: 'asc' | 'desc'];
export type OrderBy = OrderEntry | OrderEntry[];
export type Pagination = {
    limit: number;
    offset?: number;
} | {
    limit?: never;
    offset?: never;
};
export type BookQuery = {
    where?: WhereClause | {
        or: WhereClause[];
    };
    orderBy?: OrderBy;
} & Pagination;
export type ListOptions = {
    orderBy?: OrderBy;
} & Pagination;
/** Read-only view of a book — returned by `readBook()` for cross-plugin access. */
export interface ReadOnlyBook<T extends BookEntry> {
    get(id: string): Promise<T | null>;
    find(query: BookQuery): Promise<T[]>;
    list(options?: ListOptions): Promise<T[]>;
    count(where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
}
/** Writable book handle — returned by `book()` for own-plugin access. */
export interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
    /**
     * Upsert a document. Creates if `entry.id` is new; replaces entirely
     * if it already exists. Fires a `create` or `update` CDC event.
     */
    put(entry: T): Promise<void>;
    /**
     * Partially update a document. Merges top-level fields into the existing
     * document. Throws if the document does not exist. Returns the updated
     * document. Fires an `update` CDC event.
     */
    patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
    /**
     * Delete a document by id. Silent no-op if it does not exist.
     * Fires a `delete` CDC event only if the document existed.
     */
    delete(id: string): Promise<void>;
}
export interface CreateEvent<T extends BookEntry> {
    type: 'create';
    ownerId: string;
    book: string;
    entry: T;
}
export interface UpdateEvent<T extends BookEntry> {
    type: 'update';
    ownerId: string;
    book: string;
    entry: T;
    prev: T;
}
export interface DeleteEvent<T extends BookEntry> {
    type: 'delete';
    ownerId: string;
    book: string;
    id: string;
    prev: T;
}
export type ChangeEvent<T extends BookEntry> = CreateEvent<T> | UpdateEvent<T> | DeleteEvent<T>;
export type ChangeHandler<T extends BookEntry = BookEntry> = (event: ChangeEvent<T>) => Promise<void> | void;
export interface WatchOptions {
    /**
     * Controls when the handler runs relative to the transaction commit.
     *
     * true  (default) — Phase 1: runs INSIDE the transaction. Handler writes
     *   join the same transaction. If the handler throws, everything rolls back.
     *
     * false — Phase 2: runs AFTER the transaction commits. Errors are logged
     *   as warnings but do not affect committed data.
     *
     * @default true
     */
    failOnError?: boolean;
}
export interface TransactionContext {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
}
export interface StacksApi {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
    watch<T extends BookEntry>(ownerId: string, bookName: string, handler: ChangeHandler<T>, options?: WatchOptions): void;
    transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/tools/dist/index.d.ts ===
/**
 * @shardworks/tools-apparatus — The Instrumentarium.
 *
 * Guild tool registry: scans kit contributions, resolves permission-gated
 * tool sets, and provides the InstrumentariumApi for tool lookup and resolution.
 *
 * The tool() factory and ToolDefinition type live here canonically.
 *
 * See: docs/specification.md (instrumentarium)
 */
export { type ToolCaller, type ToolDefinition, tool, isToolDefinition, } from './tool.ts';
export { type InstrumentariumApi, type ResolvedTool, type ResolveOptions, } from './instrumentarium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/tools/dist/instrumentarium.d.ts ===
/**
 * The Instrumentarium — guild tool registry apparatus.
 *
 * Scans installed tools from kit contributions and apparatus supportKits,
 * resolves permission-gated tool sets on demand, and serves as the single
 * source of truth for "what tools exist and who can use them."
 *
 * The Instrumentarium is role-agnostic — it receives an already-resolved
 * permissions array from the Loom and returns the matching tool set.
 * Role definitions and permission grants are owned by the Loom.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ToolDefinition, ToolCaller } from './tool.ts';
/** A resolved tool with provenance metadata. */
export interface ResolvedTool {
    /** The tool definition (name, description, params schema, handler). */
    definition: ToolDefinition;
    /** Plugin id of the kit or apparatus that contributed this tool. */
    pluginId: string;
}
/** Options for resolving a permission-gated tool set. */
export interface ResolveOptions {
    /**
     * Permission grants in `plugin:level` format.
     * Supports wildcards: `plugin:*`, `*:level`, `*:*`.
     */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. When false (default),
     * permissionless tools are included unconditionally.
     */
    strict?: boolean;
    /** Filter by invocation caller. Tools with no callableBy pass all callers. */
    caller?: ToolCaller;
}
/** The Instrumentarium's public API, exposed via `provides`. */
export interface InstrumentariumApi {
    /**
     * Resolve the tool set for a given set of permissions.
     *
     * Evaluates each registered tool against the permission grants:
     * - Tools with a `permission` field: included if any grant matches
     * - Permissionless tools: always included (default) or gated by `strict`
     * - Caller filtering applied last
     */
    resolve(options: ResolveOptions): ResolvedTool[];
    /**
     * Find a single tool by name. Returns null if not installed.
     */
    find(name: string): ResolvedTool | null;
    /**
     * List all installed tools, regardless of permissions.
     */
    list(): ResolvedTool[];
}
/**
 * Create the Instrumentarium apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['tools']` — scans kit/supportKit contributions
 * - `provides: InstrumentariumApi` — the tool registry API
 */
export declare function createInstrumentarium(): Plugin;
//# sourceMappingURL=instrumentarium.d.ts.map
=== packages/plugins/tools/dist/tool.d.ts ===
/**
 * Tool SDK — the primary authoring interface for module-based tools.
 *
 * Use `tool()` to define a typed tool with Zod parameter schemas.
 * The returned definition is what the MCP engine imports and registers as a tool,
 * what the CLI uses to auto-generate subcommands, and what engines import directly.
 *
 * A package can export a single tool or an array of tools:
 *
 * @example Single tool
 * ```typescript
 * import { tool } from '@shardworks/tools-apparatus';
 * import { z } from 'zod';
 *
 * export default tool({
 *   name: 'lookup',
 *   description: 'Look up an anima by name',
 *   instructionsFile: './instructions.md',
 *   params: {
 *     name: z.string().describe('Anima name'),
 *   },
 *   handler: async ({ name }) => {
 *     const { home } = guild();
 *     return { found: true, status: 'active' };
 *   },
 * });
 * ```
 *
 * @example Tool collection
 * ```typescript
 * export default [
 *   tool({ name: 'commission', description: '...', params: {...}, handler: ... }),
 *   tool({ name: 'signal', description: '...', params: {...}, handler: ... }),
 * ];
 * ```
 */
import { z } from 'zod';
type ZodShape = Record<string, z.ZodType>;
/**
 * The caller types a tool can be invoked by.
 * - `'cli'` — accessible via `nsg` commands (human-facing)
 * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
 * - `'library'` — accessible programmatically via direct import
 *
 * Defaults to all caller types if `callableBy` is unspecified.
 */
export type ToolCaller = 'cli' | 'anima' | 'library';
/**
 * A fully-defined tool — the return type of `tool()`.
 *
 * The MCP engine uses `.params.shape` to register the tool's input schema,
 * `.description` for the tool description, and `.handler` to execute calls.
 * The CLI uses `.params` to auto-generate Commander options.
 * Engines call `.handler` directly.
 */
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
    /** Tool name — used for resolution when a package exports multiple tools. */
    readonly name: string;
    readonly description: string;
    /** Per-tool instructions injected into the anima's session context (inline text). */
    readonly instructions?: string;
    /**
     * Path to an instructions file, relative to the package root.
     * Resolved by the manifest engine at session time.
     * Mutually exclusive with `instructions`.
     */
    readonly instructionsFile?: string;
    /**
     * Caller types this tool is available to.
     * Always a normalized array. Absent means available to all callers.
     */
    readonly callableBy?: ToolCaller[];
    /**
     * Permission level required to invoke this tool. Matched against role grants.
     *
     * Format: a freeform string chosen by the tool author. Conventional names:
     * - `'read'` — query/inspect operations
     * - `'write'` — create/update operations
     * - `'delete'` — destructive operations
     * - `'admin'` — configuration and lifecycle operations
     *
     * Plugins are free to define their own levels.
     * If omitted, the tool is permissionless — included by default in non-strict
     * mode, excluded in strict mode unless the role grants `plugin:*` or `*:*`.
     */
    readonly permission?: string;
    readonly params: z.ZodObject<TShape>;
    readonly handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
}
/** Input to `tool()` — instructions are either inline text or a file path, not both. */
type ToolInput<TShape extends ZodShape> = {
    name: string;
    description: string;
    params: TShape;
    handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
    /**
     * Caller types this tool is available to.
     * Accepts a single caller or an array. Normalized to an array in the returned definition.
     */
    callableBy?: ToolCaller | ToolCaller[];
    /**
     * Permission level required to invoke this tool.
     * See ToolDefinition.permission for details.
     */
    permission?: string;
} & ({
    instructions?: string;
    instructionsFile?: never;
} | {
    instructions?: never;
    instructionsFile?: string;
});
/**
 * Define a Nexus tool.
 *
 * This is the primary SDK entry point for module-based tools. Pass a
 * name, description, a params object of Zod schemas, and a handler function.
 * The framework handles the rest — MCP registration, CLI generation, validation.
 *
 * The handler receives one argument:
 * - `params` — the validated input, typed from your Zod schemas
 *
 * To access guild infrastructure (apparatus, config, home path), import
 * `guild` from `@shardworks/nexus-core` and call `guild()` inside the handler.
 *
 * Return any JSON-serializable value. The MCP engine wraps it as tool output;
 * the CLI prints it; engines use it directly.
 *
 * Instructions can be provided inline or as a file path:
 * - `instructions: 'Use this tool when...'` — inline text
 * - `instructionsFile: './instructions.md'` — resolved at manifest time
 */
export declare function tool<TShape extends ZodShape>(def: ToolInput<TShape>): ToolDefinition<TShape>;
/** Type guard: is this value a ToolDefinition? */
export declare function isToolDefinition(obj: unknown): obj is ToolDefinition;
export {};
//# sourceMappingURL=tool.d.ts.map
=== packages/plugins/tools/dist/tools/tools-list.d.ts ===
/**
 * tools-list — administrative view of all tools installed in the guild.
 *
 * Lists the full registry with optional filters for caller type, permission
 * level, and contributing plugin. This is an inventory tool, not a
 * permission-resolved view — use MCP native tool listing for that.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Summary returned for each tool in the list. */
export interface ToolSummary {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
}
export declare function createToolsList(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    caller: z.ZodOptional<z.ZodEnum<{
        cli: "cli";
        anima: "anima";
        library: "library";
    }>>;
    permission: z.ZodOptional<z.ZodString>;
    plugin: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=tools-list.d.ts.map
=== packages/plugins/tools/dist/tools/tools-show.d.ts ===
/**
 * tools-show — show full details for a single tool.
 *
 * Returns name, description, plugin, permission, callableBy, parameter
 * schema, and instructions for the named tool. Returns null if not found.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Parameter info derived from the Zod schema. */
export interface ParamInfo {
    type: string;
    description: string | null;
    optional: boolean;
}
/** Full detail returned for a single tool. */
export interface ToolDetail {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
    params: Record<string, ParamInfo>;
    instructions: string | null;
}
export declare function createToolsShow(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    name: z.ZodString;
}>;
//# sourceMappingURL=tools-show.d.ts.map

