# Inventory: writ-parentchild-relationships

## Brief Summary

Add a first-class parent/child relationship between writs — structured, DAG-shaped (each child has zero or one parents; parents have zero or more children). Parent status is derived from child states via CDC. Key behaviors: parent goes into a "waiting" status while children are active; when all children complete the parent transitions back to ready; if any child fails all siblings are cancelled and the parent fails.

---

## Affected Code

### Primary package: `packages/plugins/clerk/`

#### `packages/plugins/clerk/src/types.ts`
**Will be heavily modified.** All core public types live here.

Current `WritDoc` (full signature):
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

Current `WritStatus`:
```typescript
export type WritStatus = 'new' | 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
```

Current `PostCommissionRequest`:
```typescript
export interface PostCommissionRequest {
  type?: string;
  title: string;
  body: string;
  codex?: string;
  draft?: boolean;
}
```

Current `WritFilters`:
```typescript
export interface WritFilters {
  status?: WritStatus;
  type?: string;
  limit?: number;
  offset?: number;
}
```

Current `WritLinkDoc` (arbitrary typed links, separate concern from parent/child):
```typescript
export interface WritLinkDoc {
  [key: string]: unknown;
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  createdAt: string;
}
```

Current `ClerkApi` (full interface):
```typescript
export interface ClerkApi {
  post(request: PostCommissionRequest): Promise<WritDoc>;
  show(id: string): Promise<WritDoc>;
  list(filters?: WritFilters): Promise<WritDoc[]>;
  count(filters?: WritFilters): Promise<number>;
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
  link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;
  links(writId: string): Promise<WritLinks>;
  unlink(sourceId: string, targetId: string, type: string): Promise<void>;
}
```

**New additions needed:**
- `parentId?: string` on `WritDoc` (null = root writ)
- `childCount?: number` denormalized on `WritDoc` (maintained by clerk)
- `'waiting'` (or `'pending'`) added to `WritStatus`
- New ClerkApi methods for parent/child management:
  - `setParent(childId: string, parentId: string): Promise<WritDoc>` — or `decompose(parentId, children)` pattern
  - `children(parentId: string, filters?: WritFilters): Promise<WritDoc[]>` — query children of a parent
- New `PostCommissionRequest` field: `parentId?: string`

#### `packages/plugins/clerk/src/clerk.ts`
**Will be heavily modified.** Core logic lives here.

Current `ALLOWED_FROM` state machine:
```typescript
const ALLOWED_FROM: Record<WritStatus, WritStatus[]> = {
  ready: ['new'],
  active: ['ready'],
  completed: ['active'],
  failed: ['active'],
  cancelled: ['new', 'ready', 'active'],
  new: [],
};
```

Current `TERMINAL_STATUSES`:
```typescript
const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled']);
```

**New additions needed:**
- Add `'waiting'` to `WritStatus` in ALLOWED_FROM — `waiting: ['ready', 'new']`; `ready: ['new', 'waiting']`
- Add `'waiting'` to `TERMINAL_STATUSES`? — No, it is NOT terminal (it can transition back).
- CDC `watch()` registration on the `clerk/writs` book (inside `start()`) to react to child status changes:
  - Phase 1 handler (failOnError: true) — runs inside the transaction, so sibling cancellations and parent failure join the same tx
- `api.post()` needs to handle `parentId` — validate parent exists, set parentId field, increment parent's childCount
- New api methods: `setParent()`, `children()`, potentially `decompose()`
- Books schema: `writs` book index on `parentId` needed
- The `supportKit.books.writs.indexes` array needs `'parentId'` added

Current books schema in `supportKit`:
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

#### `packages/plugins/clerk/src/tools/index.ts`
**Will be modified** to export new tools.

Current exports:
```typescript
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
export { default as writAccept } from './writ-accept.ts';
export { default as writComplete } from './writ-complete.ts';
export { default as writFail } from './writ-fail.ts';
export { default as writCancel } from './writ-cancel.ts';
export { default as writPublish } from './writ-publish.ts';
export { default as writLink } from './writ-link.ts';
export { default as writUnlink } from './writ-unlink.ts';
```

#### `packages/plugins/clerk/src/index.ts`
**Will be modified** to export new types and tools.

#### `packages/plugins/clerk/src/tools/commission-post.ts`
**May be modified** to accept `parentId` param.

#### New tool files to create:
- `packages/plugins/clerk/src/tools/writ-children.ts` — list children of a writ
- `packages/plugins/clerk/src/tools/writ-set-parent.ts` — assign a parent to a writ (or inline in commission-post only?)
- Possibly `packages/plugins/clerk/src/tools/writ-decompose.ts` — batch create children under a parent

#### `packages/plugins/clerk/src/clerk.test.ts`
**Will have new test cases.** Existing tests are pattern: describe blocks per API method, use MemoryBackend + fake guild, all in one big file. 18497 tokens, extensive.

---

### Adjacent: `packages/plugins/spider/`

#### `packages/plugins/spider/src/spider.ts`
**Likely needs review, possibly minor modification.**

The Spider's `trySpawn()` queries for `status = 'ready'` writs:
```typescript
const readyWrits = await writsBook.find({
  where: [['status', '=', 'ready']],
  orderBy: ['createdAt', 'asc'],
  limit: 10,
});
```
A parent in `'waiting'` status will NOT be found by this query — correct behavior. No change needed here unless we want the Spider to refuse to spawn a writ that has non-terminal children (defensive guard).

Spider's CDC handler on `spider/rigs` book (Phase 1) transitions the writ when a rig completes:
```typescript
stacks.watch<RigDoc>('spider', 'rigs', async (event) => {
  if (event.type !== 'update') return;
  const rig = event.entry;
  const prev = event.prev;
  if (rig.status === prev.status) return;

  if (rig.status === 'completed') {
    await clerk.transition(rig.writId, 'completed', { resolution });
  } else if (rig.status === 'failed') {
    await clerk.transition(rig.writId, 'failed', { resolution });
  }
}, { failOnError: true });
```
When the Spider transitions a child writ to `completed` or `failed`, the Clerk's own CDC watcher on the `clerk/writs` book will fire (Phase 1, same transaction) to handle parent/sibling rollup. The chain: Spider CDC → `clerk.transition(child, 'completed')` → Clerk CDC watches writs book → handles parent/siblings. This cascade works because Stacks supports multi-level Phase 1 cascades (up to MAX_CASCADE_DEPTH=16).

#### `packages/plugins/spider/src/block-types/writ-status.ts`
**Possibly needs review.** Currently checks `TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])`. If `'waiting'` is added, a parent writ in `'waiting'` status is NOT terminal, so the block stays pending — which is correct behavior. No code change needed.

---

### Adjacent: `packages/plugins/stacks/`

The Stacks layer requires **no changes**. The CDC system already supports:
- Phase 1 handlers (failOnError: true) — run inside the transaction, handler writes join the same tx
- Cascade CDC — handler writes trigger further CDC handlers (up to depth 16)
- `stacks.transaction()` — can be used to batch multiple writes atomically

---

## State Machine — Current

```
new → ready (publish)
new → cancelled
ready → active (accept)
active → completed
active → failed
new | ready | active → cancelled

Terminal: completed, failed, cancelled
```

---

## State Machine — Proposed Extension

The clerk.md doc describes a `pending` status for the future:
> ready → pending (when children are created via decompose())
> pending → completed (when all children complete — may be automatic)
> pending → failed (when a child fails)
> pending → cancelled

The brief calls this `'waiting'` or `'pending'` and says:
> "when all children for a parent are completed, the parent should transition from pending/waiting into the **ready** state"

Note: the brief says parent → `ready` (not `completed`), so the Spider re-picks it up. The clerk.md doc says parent → `completed`. **This is a discrepancy** between the brief and the forward-looking doc. The brief takes precedence.

A sketch of the new state machine for parent writs:

```
new     → waiting  (when children are added while writ is in 'new' state)
ready   → waiting  (when children are added to a ready writ / decompose)
waiting → ready    (when all children reach terminal status as 'completed')
waiting → failed   (when any child fails)
waiting → cancelled (explicit cancellation)
```

For child writs, no new states — they use the normal lifecycle. The CDC handler watches child status transitions.

---

## CDC Architecture for Parent/Child

The implementation should register a Phase 1 CDC watcher on `clerk/writs` during the Clerk's `start()` method:

```typescript
stacks.watch<WritDoc>('clerk', 'writs', async (event) => {
  if (event.type !== 'update') return;
  const writ = event.entry;
  const prev = event.prev;
  if (writ.status === prev.status) return;
  if (!TERMINAL_STATUSES.has(writ.status)) return; // only act on terminal transitions

  const parentId = writ.parentId;
  if (!parentId) return; // not a child

  // 1. Find all siblings (other children of the same parent)
  // 2. If child failed → cancel non-terminal siblings, fail parent
  // 3. If child completed → check if all siblings are terminal (all completed)
  //    → if so, transition parent to ready
}, { failOnError: true });
```

The writes in the handler (sibling cancellations, parent transition) join the same backend transaction since it's a Phase 1 handler. When the Spider transitions a child writ → completed/failed via `clerk.transition()`, it starts a transaction. That transaction fires Phase 1 CDC on `clerk/writs`, which cascades into sibling/parent updates — all atomic.

---

## Book Schema / Index Requirements

The `clerk/writs` book needs a new index on `parentId` to efficiently query children of a parent:

```typescript
books: {
  writs: {
    indexes: [
      'status', 'type', 'createdAt', 'parentId',
      ['status', 'type'], ['status', 'createdAt'], ['parentId', 'status']
    ],
  },
  ...
}
```

---

## Existing Tools Pattern

All tool files follow this pattern:
```typescript
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '../types.ts';

export default tool({
  name: 'tool-name',
  description: '...',
  instructions: '...',
  params: { /* zod schema */ },
  permission: 'clerk:read' | 'clerk:write',
  handler: async (params) => {
    const clerk = guild().apparatus<ClerkApi>('clerk');
    return clerk.someMethod(params);
  },
});
```

New tools for parent/child will follow the same pattern.

---

## Existing Test Pattern

Tests in `clerk.test.ts` use:
- `MemoryBackend` from `@shardworks/stacks-apparatus/testing`
- `createStacksApparatus` for the stacks plugin
- `createClerk()` for the clerk plugin
- Fake `Guild` object wired via `setGuild()` / `clearGuild()`
- `describe` + `it` with `beforeEach` / `afterEach`
- Node's built-in `assert` (strict mode)
- Tests are grouped by method/feature in nested `describe` blocks

---

## Comparable Implementations

### Existing arbitrary links (`WritLinkDoc`)
The current link system (unstructured typed links) shows how cross-writ relationships are stored in a separate `links` book. Parent/child should NOT use this book — they require faster querying (find all children of a parent) and structured semantics. Parent relationship should be a first-class field on WritDoc (`parentId`).

### Spider's CDC handler (rig → writ)
The Spider registers a Phase 1 CDC watcher on `spider/rigs` that calls `clerk.transition()`. This is the exact pattern the new parent/child rollup handler should follow — register in `start()`, watch a book, fire atomic cascade writes from inside the handler.

### Stacks conformance test 2.13 (cascade CDC)
Demonstrates that Phase 1 CDC handlers can trigger further Phase 1 handlers in a chain (A writes → B's CDC fires → C gets written), all within one transaction. This is how the Spider CDC → Clerk CDC → parent/sibling cascade works.

---

## Doc/Code Discrepancies

1. **clerk.md "Kit Interface" section** says "The Clerk does not consume kit contributions. No `consumes` declaration." The actual code has `consumes: ['writTypes']` in the apparatus declaration and fully processes kit writType contributions. The doc is stale.

2. **clerk.md Future "Writ Hierarchy" — Completion Rollup** says:
   > "All children `completed` → parent auto-transitions to `completed`"
   
   The brief says:
   > "when all children for a parent are completed, the parent should transition from pending/waiting into the **ready** state"
   
   The brief (most recent patron intent) wins. Parent → `ready` (not `completed`) when all children complete. This is a significant semantic difference: parent goes back into the queue for the Spider to pick up.

3. **clerk.md "Kit Interface" section** missing `writ-link` and `writ-unlink` in the supportKit tools list (they were added after the doc was written). Minor stale doc.

---

## Open Questions / Scratch Notes

- **Brief says "DAG"** but also "each child having zero or one parents." A DAG with in-degree ≤ 1 per node is actually a forest/tree. No node can have two parents. The DAG framing just means cycles are forbidden — the underlying structure is a set of trees.

- **`decompose()` vs `parentId` on `post()`**: The clerk.md doc describes a `decompose()` method that creates multiple children atomically. The brief doesn't specify an API — it only describes the semantics. Options: (a) `parentId` field on `PostCommissionRequest` (create one child at a time); (b) a `decompose(parentId, children[])` batch method; (c) both. This is a key API design decision.

- **`childCount` denormalization**: The clerk.md doc mentions `childCount` on WritDoc. This is needed to efficiently check "does this parent have any children?" and "are all children terminal?" without a full table scan. Must be maintained atomically — increment on child creation, no decrement needed (children are never deleted).

- **Parent writ in `new` (draft) status with children**: If a patron creates a draft parent and then adds children, what happens? The parent might stay `new` while children are created (no immediate transition to `waiting`). Children can be created in any status. This edge case needs design resolution.

- **Cancelling a parent**: When a parent is cancelled, should children be auto-cancelled? The brief doesn't say. The clerk.md doc doesn't address this direction (it only addresses children affecting parents). This is a design decision for the analyst.

- **Spider concern**: Spider's `trySpawn()` queries `status = 'ready'` — writs in `waiting` status won't be spawned. A parent writ in `waiting` status has no rig. When it transitions back to `ready`, the Spider will pick it up on the next crawl. This seems correct but should be confirmed in the spec.

- **`writ-list` tool filtering**: Should the `writ-list` tool's `status` filter enum be extended to include `'waiting'`? Currently it's hardcoded to `z.enum(['ready', 'active', 'completed', 'failed', 'cancelled'])` — this would need to be updated.

- **`writ-show` tool**: Currently returns `{ ...writ, links }`. Should it also return parent/children info? Likely yes, for useful display.

---

## File Map Summary

| File | Action |
|------|--------|
| `packages/plugins/clerk/src/types.ts` | Modify — WritDoc (parentId, childCount), WritStatus (add 'waiting'), ClerkApi (new methods), PostCommissionRequest (parentId) |
| `packages/plugins/clerk/src/clerk.ts` | Modify — ALLOWED_FROM, TERMINAL_STATUSES, post() (parentId support), new API methods, CDC watch registration, book indexes |
| `packages/plugins/clerk/src/tools/commission-post.ts` | Modify — add parentId param |
| `packages/plugins/clerk/src/tools/writ-show.ts` | Modify — include parent/children in output |
| `packages/plugins/clerk/src/tools/writ-list.ts` | Modify — add 'waiting' to status enum filter |
| `packages/plugins/clerk/src/tools/index.ts` | Modify — add new tool exports |
| `packages/plugins/clerk/src/index.ts` | Modify — export new types/tools |
| `packages/plugins/clerk/src/clerk.test.ts` | Modify — new test cases for parent/child logic |
| `packages/plugins/clerk/src/tools/writ-children.ts` | Create — list children of a writ |
| `packages/plugins/clerk/src/tools/writ-set-parent.ts` | Possibly create — set parent on existing writ |
| `packages/plugins/spider/src/block-types/writ-status.ts` | Review only — likely no change needed |
| `packages/plugins/spider/src/spider.ts` | Review only — no change likely needed |
| `docs/architecture/apparatus/clerk.md` | Update — reflect new parent/child design |
