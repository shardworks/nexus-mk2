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