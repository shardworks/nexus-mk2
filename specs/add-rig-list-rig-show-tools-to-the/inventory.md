# Inventory: Add rig-list + rig-show tools to the Spider

## Summary

Add two new tools (`rig-list`, `rig-show`) to the Spider apparatus, mirroring the Clerk's existing `writ-list`/`writ-show` pattern. This requires: new tool files, new SpiderApi methods (`list`, `show`), barrel export updates, tool registration in the apparatus supportKit, and tests.

---

## Affected Code

### Files to CREATE

1. **`/workspace/nexus/packages/plugins/spider/src/tools/rig-list.ts`** — new tool definition
2. **`/workspace/nexus/packages/plugins/spider/src/tools/rig-show.ts`** — new tool definition

### Files to MODIFY

3. **`/workspace/nexus/packages/plugins/spider/src/tools/index.ts`** — add exports for `rigList` and `rigShow`
   ```typescript
   // Current (2 lines):
   export { default as crawlTool } from './crawl.ts';
   export { default as crawlContinualTool } from './crawl-continual.ts';
   ```

4. **`/workspace/nexus/packages/plugins/spider/src/types.ts`** — extend `SpiderApi` with `list()` and `show()` methods
   ```typescript
   // Current SpiderApi:
   export interface SpiderApi {
     crawl(): Promise<CrawlResult | null>;
   }
   ```

5. **`/workspace/nexus/packages/plugins/spider/src/spider.ts`** — implement `list()` and `show()` on the `api` object; import and register new tools in `supportKit.tools`
   ```typescript
   // Current api object (line 348-361):
   const api: SpiderApi = {
     async crawl(): Promise<CrawlResult | null> { ... },
   };

   // Current tools registration (line 382):
   tools: [crawlTool, crawlContinualTool],

   // Current import (line 42):
   import { crawlTool, crawlContinualTool } from './tools/index.ts';
   ```

6. **`/workspace/nexus/packages/plugins/spider/src/index.ts`** — no change needed unless we want to re-export new types (unlikely for MVP)

7. **`/workspace/nexus/packages/plugins/spider/src/spider.test.ts`** — add tests for `list()` and `show()` API methods

### Types and Interfaces Involved

**SpiderApi** (to extend) — `/workspace/nexus/packages/plugins/spider/src/types.ts`:
```typescript
export interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
}
```

**RigDoc** (queried, not modified) — `/workspace/nexus/packages/plugins/spider/src/types.ts`:
```typescript
export interface RigDoc {
  [key: string]: unknown;
  id: string;
  writId: string;
  status: RigStatus;
  engines: EngineInstance[];
}
```

**RigStatus** — `/workspace/nexus/packages/plugins/spider/src/types.ts`:
```typescript
export type RigStatus = 'running' | 'completed' | 'failed';
```

**EngineInstance** — `/workspace/nexus/packages/plugins/spider/src/types.ts`:
```typescript
export interface EngineInstance {
  id: string;
  designId: string;
  status: EngineStatus;
  upstream: string[];
  givensSpec: Record<string, unknown>;
  yields?: unknown;
  error?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
}
```

**ToolDefinition** (used via `tool()` factory) — `/workspace/nexus/packages/plugins/tools/src/tool.ts`:
```typescript
export function tool<TShape extends ZodShape>(def: ToolInput<TShape>): ToolDefinition<TShape>
```

**Book / ReadOnlyBook** — `/workspace/nexus/packages/plugins/stacks/src/types.ts`:
```typescript
export interface ReadOnlyBook<T extends BookEntry> {
  get(id: string): Promise<T | null>;
  find(query: BookQuery): Promise<T[]>;
  list(options?: ListOptions): Promise<T[]>;
  count(where?: WhereClause | { or: WhereClause[] }): Promise<number>;
}
```

**BookQuery** — `/workspace/nexus/packages/plugins/stacks/src/types.ts`:
```typescript
export type BookQuery = {
  where?: WhereClause | { or: WhereClause[] };
  orderBy?: OrderBy;
} & Pagination;
```

### Existing Test File

**`/workspace/nexus/packages/plugins/spider/src/spider.test.ts`**
- Uses `node:test` (`describe`, `it`, `beforeEach`, `afterEach`)
- Uses `node:assert/strict`
- Has a `buildFixture()` helper that sets up in-memory Stacks + Clerk + Fabricator + Spider + mock Animator
- Tests create writs via `clerk.post()`, then call `spider.crawl()` and inspect rig state via the stacks book directly
- Currently accesses rigs via `stacks.book<RigDoc>('spider', 'rigs')` — the new `list`/`show` methods would be a cleaner API for this

### Rigs Book Setup

The rigs book is created with these indexes (from `spider.ts` line 371):
```typescript
books: {
  rigs: {
    indexes: ['status', 'writId', ['status', 'writId']],
  },
},
```

The Spider holds `rigsBook` as a `Book<RigDoc>` (writable). The new `list`/`show` methods will use this same book handle — they're read operations on an owned book.

---

## Adjacent Patterns (Clerk writ-list/writ-show)

### Pattern 1: Clerk `writ-list` tool — `/workspace/nexus/packages/plugins/clerk/src/tools/writ-list.ts`

```typescript
export default tool({
  name: 'writ-list',
  description: 'List writs with optional filters',
  instructions: '...',
  params: {
    status: z.enum([...]).optional().describe('Filter by writ status'),
    type: z.string().optional().describe('Filter by writ type'),
    limit: z.number().optional().default(20).describe('Maximum results (default: 20)'),
    offset: z.number().optional().describe('Number of results to skip'),
  },
  permission: 'clerk:read',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    return clerk.list({ status, type, limit, offset });
  },
});
```

Key conventions:
- Tool delegates to the apparatus API (`clerk.list(...)`) — tool is a thin wrapper
- Permission uses `plugin:read` format
- Params are all optional with sensible defaults
- `limit` defaults to 20 via `.default(20)`

### Pattern 2: Clerk `writ-show` tool — `/workspace/nexus/packages/plugins/clerk/src/tools/writ-show.ts`

```typescript
export default tool({
  name: 'writ-show',
  description: 'Show full detail for a writ',
  instructions: '...',
  params: {
    id: z.string().describe('Writ id'),
  },
  permission: 'clerk:read',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    return clerk.show(params.id);
  },
});
```

Key conventions:
- Single required param (`id`)
- Throws if not found (via the API method)
- Returns full document

### Pattern 3: Clerk API methods — `/workspace/nexus/packages/plugins/clerk/src/clerk.ts`

```typescript
async show(id: string): Promise<WritDoc> {
  const writ = await writs.get(id);
  if (!writ) throw new Error(`Writ "${id}" not found.`);
  return writ;
},

async list(filters?: WritFilters): Promise<WritDoc[]> {
  const where = buildWhereClause(filters);
  const limit = filters?.limit ?? 20;
  const offset = filters?.offset;
  return writs.find({ where, orderBy: ['createdAt', 'desc'], limit, ...(offset ? { offset } : {}) });
},
```

### Pattern 4: Spider crawl tools — existing tool pattern within Spider

Both `crawl.ts` and `crawl-continual.ts`:
- Import `guild` from `@shardworks/nexus-core`
- Import `tool` from `@shardworks/tools-apparatus`
- Import types from `../types.ts`
- Use `guild().apparatus<SpiderApi>('spider')` to get the API
- Export default a single `tool()` call
- Use `spider:write` permission (new tools would use `spider:read`)

### Pattern 5: Clerk tools barrel — `/workspace/nexus/packages/plugins/clerk/src/tools/index.ts`

```typescript
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
// ... etc
```

Spider barrel mirrors this pattern exactly.

### Pattern 6: Clerk tools registration in apparatus

```typescript
tools: [commissionPost, writShow, writList, writAccept, writComplete, writFail, writCancel],
```

Spider currently: `tools: [crawlTool, crawlContinualTool]`

---

## Data Flow / Pipeline

The tools are read-only — no pipeline to trace. The data path is:

1. **Tool handler** calls `guild().apparatus<SpiderApi>('spider')`
2. **SpiderApi.list()/show()** queries `rigsBook` (the `Book<RigDoc>` handle)
3. **Stacks** returns `RigDoc` or `RigDoc[]`

The `rigsBook` is initialized during `start()` at line 395:
```typescript
rigsBook = stacks.book<RigDoc>('spider', 'rigs');
```

The existing `rigsBook` variable is declared at line 115:
```typescript
let rigsBook: Book<RigDoc>;
```

Both `list()` and `show()` will use the same `rigsBook` handle already available in the closure.

---

## Existing Context

### Spider doc mentions tools

The spider spec (`/workspace/nexus/docs/architecture/apparatus/spider.md`) mentions `crawl` and `crawlContinual` as the Spider's tools. No mention of rig-list/rig-show — this is a new addition.

### Future docs

`/workspace/nexus-mk2/docs/future/outdated-architecture/rig-architecture.md` exists but is in `outdated-architecture/` — likely stale Mk 2.0 content, not relevant.

### No prior commissions

No existing `rig-list` or `rig-show` references found anywhere in the codebase.

---

## Doc/Code Discrepancies

1. **Spider spec says `tools: { walk: ..., crawlContinual: ... }`** (object syntax with `walk` key) but the actual code uses **array syntax** `tools: [crawlTool, crawlContinualTool]` and the tool is named `crawl`, not `walk`. The spec acknowledges naming is TBD ("Final CLI naming TBD"). The code is authoritative.

2. **Spider spec says `requires: ['fabricator', 'clerk', 'stacks']`** but the code has `requires: ['stacks', 'clerk', 'fabricator']` — different order, same set. No functional difference.

3. **Spider spec's `supportKit.engines` uses object syntax** but the code also uses object syntax for engines — consistent. However, **tools use array syntax** in code vs object syntax in spec. Minor doc drift.

---

## Design Observations (for downstream agents)

- The Spider currently has **no read-only API surface at all** — `crawl()` is a write operation. These would be the first read methods.
- The Clerk pattern establishes `{plugin}:read` as the permission convention for read tools.
- The rigs book already has indexes on `status` and `writId` — both useful for rig-list filtering.
- `RigDoc` doesn't have a `createdAt` field (unlike `WritDoc`). Ordering options for list are limited to indexed fields. May need to order by `id` or omit ordering (or add a `createdAt` to RigDoc, but that's scope creep).
- A filter type for rig-list params doesn't exist yet — would need a `RigFilters` interface or inline handling.
