---
author: plan-writer
estimated_complexity: 13
---

# Writ Parent/Child Relationships

## Summary

Add a first-class parent/child relationship to writs via a `parentId` field on `WritDoc`, a new `'waiting'` status for parents with non-terminal children, and CDC-driven cascading that atomically propagates child completion/failure upward to parents and parent cancellation/failure downward to children.

## Current State

### Types (`packages/plugins/clerk/src/types.ts`)

```typescript
export type WritStatus = 'new' | 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';

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

export interface PostCommissionRequest {
  type?: string;
  title: string;
  body: string;
  codex?: string;
  draft?: boolean;
}

export interface WritFilters {
  status?: WritStatus;
  type?: string;
  limit?: number;
  offset?: number;
}
```

### State machine (`packages/plugins/clerk/src/clerk.ts`)

```typescript
const ALLOWED_FROM: Record<WritStatus, WritStatus[]> = {
  ready: ['new'],
  active: ['ready'],
  completed: ['active'],
  failed: ['active'],
  cancelled: ['new', 'ready', 'active'],
  new: [],
};

const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled']);
```

### Current `post()` behavior

`post()` validates the writ type, builds a `WritDoc`, calls `writs.put(writ)`, and returns. No parent-awareness. No transaction wrapping (the `put()` creates an implicit single-write transaction).

### Current `transition()` behavior

`transition()` reads the writ, validates the status transition against `ALLOWED_FROM`, builds a patch with `status`, `updatedAt`, and conditional timestamp fields (`acceptedAt` on active, `resolvedAt` on terminal), then calls `writs.patch()`. No parent/child cascade logic.

### Current `start()` behavior

`start()` obtains Stacks API, initializes book handles for `clerk/writs` and `clerk/links`, resolves writ type configuration from guild config and kit entries. No CDC watchers are registered.

### Book indexes (`supportKit.books`)

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

### Tool status enum (`packages/plugins/clerk/src/tools/writ-list.ts`)

```typescript
status: z.enum(['ready', 'active', 'completed', 'failed', 'cancelled']).optional()
```

Missing `'new'` (pre-existing bug). Missing `'waiting'` (new status).

### `writ-show` tool (`packages/plugins/clerk/src/tools/writ-show.ts`)

Returns `{ ...writ, links }` — fetches writ and links in parallel. No parent/children context.

### `commission-post` tool (`packages/plugins/clerk/src/tools/commission-post.ts`)

Accepts `title`, `body`, `type?`, `codex?`, `draft?`. No `parentId` param.

### Spider interaction (`packages/plugins/spider/src/spider.ts`)

- `trySpawn()` queries `where: [['status', '=', 'ready']]` — only `'ready'` writs.
- Spider CDC on `spider/rigs` (Phase 1) calls `clerk.transition(rig.writId, 'completed'|'failed')` when a rig reaches terminal state. This transition fires CDC on `clerk/writs`.

No Spider code changes are required for this feature. Writs in `'waiting'` status are invisible to `trySpawn()` by construction.

## Requirements

- R1: `WritDoc` must have an optional `parentId?: string` field. Absent on root writs. Immutable after creation.
- R2: `WritStatus` must include `'waiting'` as a seventh status value. `'waiting'` is non-terminal.
- R3: The `ALLOWED_FROM` state machine must be:
  ```
  ready: ['new', 'waiting']
  active: ['ready']
  completed: ['active']
  failed: ['active', 'waiting']
  cancelled: ['new', 'ready', 'active', 'waiting']
  waiting: ['new', 'ready']
  new: []
  ```
- R4: `PostCommissionRequest` must accept an optional `parentId?: string`. When provided, `post()` must validate the parent exists, is in status `new`, `ready`, or `waiting`, inherit the parent's `codex` if the request's `codex` is undefined, walk the ancestor chain to prevent cycles (including self-parenting), create the child writ, and — if the parent is in `new` or `ready` — transition the parent to `waiting`. All within a single Stacks transaction.
- R5: When a child writ transitions to a terminal status (`completed`, `failed`, or `cancelled`), a Phase 1 CDC handler must check the parent:
  - If the child's new status is `failed` and the parent is in `waiting`: transition the parent to `failed` with resolution `'Child "<childId>" failed: <child resolution>'`.
  - If the child's new status is `completed` or `cancelled`: query all children of the parent. If all are in terminal status and none are `failed`, transition the parent from `waiting` to `ready`.
- R6: When a parent writ transitions to any terminal status (`completed`, `failed`, or `cancelled`), the same CDC handler must find all non-terminal children and transition each to `cancelled` with resolution `'Automatically cancelled due to sibling failure'`. (Note: for parent cancellation/failure, the resolution text describes the cause — the children are cancelled because the parent reached a terminal state.)
- R7: The `commission-post` tool must accept an optional `parentId` param.
- R8: The `writ-list` tool's status enum must include all seven statuses: `'new'`, `'ready'`, `'active'`, `'waiting'`, `'completed'`, `'failed'`, `'cancelled'`. The tool must accept an optional `parentId` param. `WritFilters` must include `parentId?: string`.
- R9: The `writ-show` tool must include in its response: the `parentId` from the writ (already present on doc), a `parent` object (`{ id, title, status }` or `null`), and a `children` object with `{ summary: Record<WritStatus, number>, items: Array<{ id, title, status }> }`.
- R10: The `writs` book indexes must include `'parentId'` and `['parentId', 'status']`.
- R11: `TERMINAL_STATUSES` must remain `{ 'completed', 'failed', 'cancelled' }` — `'waiting'` must NOT be in this set.
- R12: `transition()` must not set `resolvedAt` or `acceptedAt` when transitioning to `'waiting'`. The existing `isTerminal` check already handles this since `'waiting'` is not terminal.
- R13: No changes to any file in `packages/plugins/spider/`.

## Design

### Type Changes

**`packages/plugins/clerk/src/types.ts`**

```typescript
export type WritStatus = 'new' | 'ready' | 'active' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;
  status: WritStatus;
  title: string;
  body: string;
  codex?: string;
  /** Parent writ id. Absent on root writs. Immutable after creation. */
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface PostCommissionRequest {
  type?: string;
  title: string;
  body: string;
  codex?: string;
  draft?: boolean;
  /** Create this writ as a child of the specified parent writ. */
  parentId?: string;
}

export interface WritFilters {
  status?: WritStatus;
  type?: string;
  /** Filter to children of this parent writ. */
  parentId?: string;
  limit?: number;
  offset?: number;
}
```

The `ClerkApi` interface does not change shape — `post()` already takes `PostCommissionRequest`, `list()` already takes `WritFilters`. The new fields flow through the existing signatures. No new methods are added.

### Behavior

#### State machine (`packages/plugins/clerk/src/clerk.ts`)

```typescript
const ALLOWED_FROM: Record<WritStatus, WritStatus[]> = {
  ready: ['new', 'waiting'],
  active: ['ready'],
  completed: ['active'],
  failed: ['active', 'waiting'],
  cancelled: ['new', 'ready', 'active', 'waiting'],
  waiting: ['new', 'ready'],
  new: [],
};

const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled']);
```

`'waiting'` is non-terminal. `resolvedAt` is not set when entering `waiting`. `ALLOWED_FROM['waiting']` lists `['new', 'ready']` — only pre-active statuses.

#### Ancestor validation helper

A new helper function in `clerk.ts`:

```typescript
const CHILD_ALLOWED_PARENT_STATUSES = new Set<WritStatus>(['new', 'ready', 'waiting']);
```

When `post()` receives a `parentId`:
1. Read the parent writ. If not found → throw `'Parent writ "<parentId>" not found.'`
2. If parent status is not in `CHILD_ALLOWED_PARENT_STATUSES` → throw `'Cannot add children to writ "<parentId>": status is "<status>", expected one of: new, ready, waiting.'`
3. Walk the ancestor chain: starting from the parent, follow `parentId` upward. If the proposed child's `id` is encountered in the chain (impossible for creation since id hasn't been assigned yet — but the check must reject `parentId === id` which is the self-parenting case). In practice, the newly generated child id won't match any ancestor, but validate `request.parentId !== <generatedId>` as a defensive check.
4. If the parent has a `codex` and the request's `codex` is `undefined`, copy the parent's `codex` to the child.

#### `post()` changes

When `request.parentId` is set, `post()` wraps the entire operation in `stacks.transaction()`:

```
stacks.transaction(async (tx) => {
  1. Validate parent (exists, valid status, cycle check) — reads use the transaction
  2. Build child WritDoc (with parentId, inherited codex)
  3. writs.put(child)
  4. If parent.status is 'new' or 'ready':
       api.transition(parentId, 'waiting')
     // If parent is already 'waiting', skip — it's already waiting
})
```

The `transition()` call inside the transaction will fire the CDC handler (if any), but since the parent is transitioning to `waiting` (a non-terminal status), the CDC handler's checks for terminal status changes won't match. No cascade occurs here.

When `request.parentId` is NOT set, `post()` behaves exactly as today — no transaction wrapper needed.

The `stacks` reference is needed inside `post()`. It must be captured in the `createClerk()` closure alongside the existing `writs` and `links` book handles. Add a `let stacks: StacksApi;` variable set in `start()`.

#### `buildWhereClause()` changes

Add `parentId` handling:

```typescript
if (filters?.parentId) {
  conditions.push(['parentId', '=', filters.parentId]);
}
```

#### `transition()` managed-fields stripping

The existing destructuring of managed fields in `transition()`:
```typescript
const { id: _id, status: _status, createdAt: _c, updatedAt: _u,
  acceptedAt: _a, resolvedAt: _r, ...safeFields } = (fields ?? {}) as WritDoc;
```

Add `parentId` to the stripped set — callers cannot change parentId via transition():
```typescript
const { id: _id, status: _status, createdAt: _c, updatedAt: _u,
  acceptedAt: _a, resolvedAt: _r, parentId: _p, ...safeFields } = (fields ?? {}) as WritDoc;
```

This ensures parentId immutability through the transition() API path.

#### CDC handler registration (`start()`)

In `start()`, after initializing book handles and before the method returns, register a Phase 1 CDC watcher:

```typescript
stacks.watch<WritDoc>('clerk', 'writs', async (event) => {
  if (event.type !== 'update') return;

  const writ = event.entry as WritDoc;
  const prev = event.prev as WritDoc;

  // Only act on status changes
  if (writ.status === prev.status) return;

  // ── Upward cascade: child → parent ──
  if (writ.parentId && TERMINAL_STATUSES.has(writ.status)) {
    await handleChildTerminal(writ);
  }

  // ── Downward cascade: parent → children ──
  if (TERMINAL_STATUSES.has(writ.status)) {
    await handleParentTerminal(writ);
  }
}, { failOnError: true });
```

**`handleChildTerminal(writ)`** — when a child reaches a terminal status:

1. Read the parent: `const parent = await writs.get(writ.parentId)`.
2. If parent is not in `'waiting'` status, return early. (Parent might have already been transitioned by a prior cascade event, or parent might be in a non-waiting status if it was manually transitioned.)
3. If `writ.status === 'failed'`:
   - Transition parent to `failed`: `api.transition(parent.id, 'failed', { resolution: 'Child "<writ.id>" failed: <writ.resolution ?? "unknown">' })`.
   - Return. (The parent's failure will trigger `handleParentTerminal` via recursive CDC, which will cancel the remaining children.)
4. If `writ.status === 'completed'` or `writ.status === 'cancelled'`:
   - Query all children of the parent: `writs.find({ where: [['parentId', '=', parent.id]] })`.
   - Check: are ALL children in a terminal status? `children.every(c => TERMINAL_STATUSES.has(c.status))`
   - Check: are NONE failed? `!children.some(c => c.status === 'failed')`
   - If both checks pass: `api.transition(parent.id, 'ready')`.

**`handleParentTerminal(writ)`** — when a writ reaches a terminal status, cancel its non-terminal children:

1. Query children: `writs.find({ where: [['parentId', '=', writ.id]] })`.
2. If no children, return.
3. For each child where `!TERMINAL_STATUSES.has(child.status)`:
   - `api.transition(child.id, 'cancelled', { resolution: 'Automatically cancelled due to sibling failure' })`.
   - Each child cancellation fires CDC → the handler re-enters for that child. Since `'cancelled'` is terminal and D19 says cancelled children only trigger the completion rollup check (not failure cascade), the handler will call `handleChildTerminal` which checks if the parent is in `waiting` — but the parent is already in a terminal status, so the early return in step 2 of `handleChildTerminal` exits immediately. No infinite loop.

**Cascade depth analysis:** A failure at leaf level: child fails (depth 1) → parent fails via `handleChildTerminal` (depth 2) → sibling children cancelled via `handleParentTerminal` (depth 3 each). Each sibling cancellation triggers `handleChildTerminal` which returns early (depth 4). For a 3-level hierarchy, worst case is approximately `2 + 2 * max_siblings_per_level` — well within the Stacks cascade depth limit of 16 for reasonable hierarchies.

#### Book indexes (`supportKit.books`)

```typescript
books: {
  writs: {
    indexes: [
      'status', 'type', 'createdAt', 'parentId',
      ['status', 'type'], ['status', 'createdAt'], ['parentId', 'status'],
    ],
  },
  links: {
    indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']],
  },
},
```

#### `commission-post` tool (`packages/plugins/clerk/src/tools/commission-post.ts`)

Add `parentId` param:

```typescript
params: {
  title: z.string().describe('Short human-readable title describing the work'),
  body: z.string().describe('Detail text or description'),
  type: z.string().optional().describe('Writ type (default: guild defaultType or "mandate")'),
  codex: z.string().optional().describe('Target codex name'),
  draft: z.boolean().optional().describe(
    'When true, create the writ in new (draft) status instead of ready. ' +
    'Draft writs must be published before they enter the execution queue.',
  ),
  parentId: z.string().optional().describe(
    'Create this writ as a child of the specified parent writ. ' +
    'The parent must be in new, ready, or waiting status. ' +
    'If the parent is in new or ready, it will be transitioned to waiting.',
  ),
},
```

Handler passes `parentId: params.parentId` to `clerk.post()`.

Update `description` and `instructions` to mention parent/child support.

#### `writ-list` tool (`packages/plugins/clerk/src/tools/writ-list.ts`)

Update status enum and add parentId:

```typescript
params: {
  status: z
    .enum(['new', 'ready', 'active', 'waiting', 'completed', 'failed', 'cancelled'])
    .optional()
    .describe('Filter by writ status'),
  type: z.string().optional().describe('Filter by writ type'),
  parentId: z.string().optional().describe('Filter to children of this parent writ'),
  limit: z.number().optional().default(20).describe('Maximum results (default: 20)'),
  offset: z.number().optional().describe('Number of results to skip'),
},
```

Handler passes `parentId: params.parentId` to `clerk.list()`.

#### `writ-show` tool (`packages/plugins/clerk/src/tools/writ-show.ts`)

Enrich response with parent and children context:

```typescript
handler: async (params) => {
  const clerk = guild().apparatus<ClerkApi>('clerk');
  const [writ, links] = await Promise.all([
    clerk.show(params.id),
    clerk.links(params.id),
  ]);

  // Parent context
  let parent: { id: string; title: string; status: WritStatus } | null = null;
  if (writ.parentId) {
    const parentWrit = await clerk.show(writ.parentId);
    parent = { id: parentWrit.id, title: parentWrit.title, status: parentWrit.status };
  }

  // Children context
  const childWrits = await clerk.list({ parentId: writ.id, limit: 1000 });
  const summary: Record<string, number> = {};
  const items: Array<{ id: string; title: string; status: WritStatus }> = [];
  for (const child of childWrits) {
    summary[child.status] = (summary[child.status] ?? 0) + 1;
    items.push({ id: child.id, title: child.title, status: child.status });
  }

  return {
    ...writ,
    links,
    parent,
    children: { summary, items },
  };
},
```

### Non-obvious Touchpoints

- **`packages/plugins/clerk/src/index.ts`**: No new exports needed. `WritStatus` already covers `'waiting'` after the type change. `PostCommissionRequest` and `WritFilters` already cover the new fields. No new types are introduced.
- **`packages/plugins/clerk/src/clerk.test.ts`**: The test harness `setupCore()` (line 81) calls `memBackend.ensureBook()` with the writs book index list. This must be updated to include `'parentId'` and `['parentId', 'status']` to match the new `supportKit.books.writs.indexes`.
- **`docs/architecture/apparatus/clerk.md`**: The status machine diagram, `WritStatus` type, `WritDoc` interface, `PostCommissionRequest`, `WritFilters`, and the "Future: Writ Hierarchy" / "Future: Clockworks Integration" sections all need updating. The "Future: Writ Hierarchy" section should be replaced with the implemented design.

## Validation Checklist

- V1 [R1]: Create a writ with `parentId` via `clerk.post({ ..., parentId: parent.id })`. Verify the returned `WritDoc` has `parentId` set. Create a writ without `parentId`. Verify `parentId` is `undefined`.

- V2 [R2, R3, R11]: Verify `WritStatus` union includes `'waiting'`. Verify `ALLOWED_FROM` matches the specified map exactly. Verify `TERMINAL_STATUSES` is `{ 'completed', 'failed', 'cancelled' }` — does NOT include `'waiting'`. Verify `transition(id, 'waiting')` succeeds from `new` and `ready`. Verify `transition(id, 'waiting')` fails from `active`, `completed`, `failed`, `cancelled`.

- V3 [R4]: Create a parent writ in `ready` status. Create a child with `parentId`. Verify: child is created, parent status changed to `'waiting'`, child has parent's codex if not specified. Verify the entire operation is atomic (if child creation fails, parent stays in `ready`). Create a second child under the same (now `waiting`) parent. Verify parent stays `waiting`.

- V4 [R4]: Attempt to create a child under a non-existent parent. Verify error: `'Parent writ "<id>" not found.'`. Attempt to create a child under an `active` parent. Verify error: `'Cannot add children to writ ...: status is "active"...'`. Attempt to create a child under a `completed` parent. Verify error.

- V5 [R4]: Create a parent. Create a child with explicit `codex: 'my-codex'`. Verify child has `codex: 'my-codex'` (not inherited). Create a parent with `codex: 'parent-codex'`. Create a child without specifying codex. Verify child has `codex: 'parent-codex'` (inherited).

- V6 [R5]: Create a parent (goes to `waiting`). Create 3 children. Complete all 3 children. Verify parent status is `'ready'`.

- V7 [R5]: Create a parent. Create 2 children. Complete child 1. Cancel child 2. Verify parent transitions to `'ready'` (all terminal, none failed).

- V8 [R5]: Create a parent. Create 2 children. Fail child 1. Verify parent status is `'failed'` with resolution `'Child "<child1Id>" failed: <resolution>'`. Verify child 2 is `'cancelled'` with resolution `'Automatically cancelled due to sibling failure'`.

- V9 [R5, R6]: Create a 3-level hierarchy: grandparent → parent (child of grandparent) → child (child of parent). Fail the leaf child. Verify: parent is `failed`, grandparent is `failed`, all non-terminal writs in the tree are cancelled.

- V10 [R6]: Create a parent in `waiting` (with children). Cancel the parent. Verify all non-terminal children are cancelled with resolution `'Automatically cancelled due to sibling failure'`.

- V11 [R6]: Create a parent. Make parent `active` (transition `ready` first if needed — but per the state machine, children can't be added to `active` parents, so: create parent in `ready`, add children → parent goes to `waiting`, complete all children → parent goes to `ready`, accept parent → `active`, complete parent → `completed`). Verify children are NOT cancelled when parent completes (completed is terminal but children were already all terminal from step above). This validates that downward cascade only cancels *non-terminal* children.

- V12 [R7]: Call the `commission-post` tool handler with a `parentId` param. Verify it passes through to `clerk.post()` and the child is created.

- V13 [R8]: Call the `writ-list` tool handler with `status: 'waiting'`. Verify it filters correctly. Call with `status: 'new'`. Verify it filters correctly. Call with `parentId: '<parentId>'`. Verify only children of that parent are returned.

- V14 [R9]: Call `writ-show` on a writ that is a child with siblings. Verify response includes `parent: { id, title, status }` and `children: { summary, items }`. Call on a root writ with no children. Verify `parent` is `null` and `children.items` is empty.

- V15 [R10]: Verify the `supportKit.books.writs.indexes` array includes `'parentId'` and `['parentId', 'status']`.

- V16 [R12]: Transition a writ to `waiting`. Verify `resolvedAt` is `undefined` and `acceptedAt` is not set by the waiting transition.

- V17 [R13]: Verify no files in `packages/plugins/spider/` are modified. Run: `git diff --name-only | grep spider` should return empty.

- V18 [R4]: Verify self-parenting is rejected: attempt `post({ ..., parentId: <same-id> })` — since the id is generated inside `post()`, test that `parentId` pointing to itself is structurally impossible (the id doesn't exist yet). More usefully, create writ A, create writ B as child of A. Verify creating a writ C as child of B with the intent to then somehow make A a child of C is impossible (parentId is immutable, no re-parenting API).

## Test Cases

### Happy path — child creation and codex inheritance
- Create parent (ready). Post child with parentId → child created, parent status = `waiting`.
- Post child with parentId, no codex, parent has codex `'foo'` → child inherits `codex: 'foo'`.
- Post child with explicit codex `'bar'`, parent has codex `'foo'` → child has `codex: 'bar'`.

### Happy path — completion rollup
- Parent with 1 child. Complete the child → parent goes to `ready`.
- Parent with 3 children. Complete all 3 → parent goes to `ready`.
- Parent with 2 children. Complete child 1, cancel child 2 → parent goes to `ready` (all terminal, none failed).

### Happy path — full lifecycle
- Create parent (ready) → add children → parent goes to `waiting` → complete all children → parent goes to `ready` → accept parent → `active` → complete parent → `completed`.

### Failure cascade
- Parent with 3 children, child 1 active, child 2 ready, child 3 active. Fail child 1 → parent `failed`, children 2 and 3 `cancelled`.
- Parent with 1 child. Fail the child → parent `failed`.
- 3-level hierarchy. Fail leaf → parent failed, grandparent failed, all non-terminal writs cancelled.

### Cancellation cascade (downward)
- Parent in `waiting`, 2 non-terminal children. Cancel parent → both children cancelled.
- Parent in `waiting`, 1 child completed, 1 child active. Cancel parent → active child cancelled, completed child unchanged.
- Fail a parent explicitly (writ-fail on a writ that happens to be in `active` with children that were already added while in `ready` and whose children have since completed, so parent went `waiting` → `ready` → `active`) → children are already terminal, no cancellation occurs.

### Edge cases — child creation validation
- Post child with non-existent parentId → error `'Parent writ "<id>" not found.'`
- Post child with parent in `active` status → error `'Cannot add children to writ ...'`
- Post child with parent in `completed` status → error.
- Post child with parent in `failed` status → error.
- Post child with parent in `cancelled` status → error.

### Edge cases — waiting status
- Add children to a parent already in `waiting` → parent stays `waiting`.
- Cancel a `waiting` parent directly → parent cancelled, children cancelled.
- Transition a `new` (draft) parent explicitly to `waiting` via `transition(id, 'waiting')` → succeeds.
- Transition a `ready` parent to `waiting` explicitly → succeeds.
- Transition an `active` parent to `waiting` → fails.

### Edge cases — completion rollup nuances
- Parent with 2 children. Cancel both (no completions, no failures) → all terminal, none failed → parent transitions to `ready`.
- Parent with 2 children. One child completed. Then add a 3rd child (parent still `waiting`). 3rd child not yet terminal → parent stays `waiting`. Complete 2nd child, complete 3rd child → parent goes `ready`.
- Rapid sequential: 3 children all transition to completed in close succession. Each completion's CDC fires; only the last one sees all siblings terminal and triggers the parent transition. Verify no double-transition error.

### Edge cases — parentId immutability
- Verify that calling `transition(childId, 'active', { parentId: 'other' })` does NOT change the child's parentId — the managed-fields stripping removes it.

### Edge cases — atomicity
- Post a child where the parent is in `ready`. If the child creation fails (e.g., invalid writ type), verify the parent remains in `ready` (transaction rolled back).
- In a failure cascade, if cancelling a sibling throws (should not happen with valid state machine, but test defense), verify the entire cascade rolls back (parent stays `waiting`, failed child rolls back to its pre-failure status).

### Tool tests
- `commission-post` with parentId → child created.
- `writ-list` with `status: 'new'` → filters correctly.
- `writ-list` with `status: 'waiting'` → filters correctly.
- `writ-list` with `parentId` → returns only children of that parent.
- `writ-show` on a parent with children → response has `parent: null`, `children: { summary: { ready: 2 }, items: [...] }`.
- `writ-show` on a child → response has `parent: { id, title, status }`, `children: { summary: {}, items: [] }`.
- `writ-show` on a root writ with no children → `parent: null`, `children: { summary: {}, items: [] }`.