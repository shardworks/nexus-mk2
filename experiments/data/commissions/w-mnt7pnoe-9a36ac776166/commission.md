# Collapse Writ Statuses: ready/active/waiting → open

## Summary

Replace the `ready`, `active`, and `waiting` writ statuses with a single `open` status, simplifying the writ lifecycle from 7 states to 5: `new`, `open`, `completed`, `failed`, `cancelled`. Remove the `acceptedAt` field from `WritDoc`. Add a one-shot idempotent migration at Clerk startup. Update all consumers in the same changeset.

## Current State

**`packages/plugins/clerk/src/types.ts`** defines:
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
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;   // set on ready → active
  resolvedAt?: string;   // set on any terminal transition
  resolution?: string;
}
```

**`packages/plugins/clerk/src/clerk.ts`** defines the state machine:
```typescript
const ALLOWED_FROM: Record<WritStatus, WritStatus[]> = {
  ready: ['new', 'waiting'],
  active: ['ready'],
  completed: ['ready', 'active'],
  failed: ['active', 'waiting'],
  cancelled: ['new', 'ready', 'active', 'waiting'],
  waiting: ['new', 'ready'],
  new: [],
};
const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled']);
const CHILD_ALLOWED_PARENT_STATUSES = new Set<WritStatus>(['new', 'ready', 'waiting']);
```

`api.post()` creates writs in `'ready'` (default) or `'new'` (draft). When a child is added to a parent in `new` or `ready`, the parent is auto-transitioned to `'waiting'`. `api.transition()` sets `acceptedAt` when transitioning to `'active'`.

`handleChildTerminal()` checks `parent.status !== 'waiting'` as a guard, then either fails the parent (child failed) or transitions parent `waiting → ready` (all children terminal, none failed).

**`packages/plugins/spider/src/spider.ts`** `trySpawn()` queries `where: [['status', '=', 'ready']]` and transitions matched writs to `'active'` after spawning a rig.

**`packages/plugins/clerk/src/tools/writ-accept.ts`** transitions `ready → active`.

## Requirements

- R1: The `WritStatus` type must be `'new' | 'open' | 'completed' | 'failed' | 'cancelled'`. The values `'ready'`, `'active'`, and `'waiting'` must not appear in the type.
- R2: The `acceptedAt` field must be removed from the `WritDoc` interface and from all code that reads, writes, or displays it.
- R3: The ALLOWED_FROM state machine must permit exactly these transitions: `new → open`, `new → cancelled`, `open → completed`, `open → failed`, `open → cancelled`. No other transitions are valid.
- R4: When `api.post()` is called with `draft: false` (default), the writ must be created with `status: 'open'`. When `draft: true`, the writ must be created with `status: 'new'`.
- R5: When a child writ is added to a parent, the parent must NOT auto-transition to any status. The parent stays in its current status (`new` or `open`) regardless of children being added.
- R6: The `CHILD_ALLOWED_PARENT_STATUSES` set must be `['new', 'open']`.
- R7: When a child writ reaches `failed` status and its parent is in `open` status, the parent must auto-transition to `failed`. When a child reaches `failed` and its parent is NOT in `open` (e.g. `new`), no cascade occurs.
- R8: The "all children terminal, none failed → parent returns to ready" rollback must be removed entirely.
- R9: The `writ-accept` tool must be deleted and its export removed from `tools/index.ts`.
- R10: On Clerk startup, after books are initialized but before the CDC watcher is registered, any writ with status `ready`, `active`, or `waiting` must be patched to `open`. This migration must be idempotent.
- R11: The Spider's `trySpawn()` must query for writs with `status: 'open'` and must NOT call `clerk.transition()` to set `active` after spawning a rig.
- R12: All clerk tool descriptions, instructions, and handler calls must use the new vocabulary (`open` instead of `ready`/`active`/`waiting`).
- R13: The writs page UI must show filter buttons for `new`, `open`, `completed`, `failed`, `cancelled` only. The `open` badge must use `badge badge--active` (cyan). The detail view must show Complete, Fail, and Cancel buttons for `open` writs.
- R14: Documentation files (`clerk.md`, `spider.md`, `schema.md`, `README.md`) must be updated to reflect the new status vocabulary and transition rules.
- R15: Test fixtures across the codebase that use `'ready'`, `'active'`, or `'waiting'` as writ status values must be updated to valid new-vocabulary values.
- R16: The CLI framework `program.test.ts` enum values must NOT be changed (they are generic test data).

## Design

### Type Changes

**`packages/plugins/clerk/src/types.ts`** — the complete new `WritStatus` and `WritDoc`:

```typescript
/**
 * A writ's position in its lifecycle.
 *
 * Transitions:
 *   new  → open       (publish)   — draft enters the queue
 *   new  → cancelled  (cancel)
 *   open → completed  (complete)
 *   open → failed     (fail)
 *   open → cancelled  (cancel)
 *
 * completed, failed, cancelled are terminal — no further transitions.
 */
export type WritStatus = 'new' | 'open' | 'completed' | 'failed' | 'cancelled';
```

```typescript
export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;
  status: WritStatus;
  title: string;
  body: string;
  codex?: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolution?: string;
}
```

The `acceptedAt` field is removed. No replacement field is added.

**`PostCommissionRequest`** doc comment update:

```typescript
export interface PostCommissionRequest {
  type?: string;
  title: string;
  body: string;
  codex?: string;
  /**
   * When true, the writ is created in 'new' (draft) status instead of 'open'.
   * Draft writs are invisible to the Spider and must be explicitly published
   * (new → open) before they can be picked up for execution.
   * Defaults to false (writ enters the queue immediately).
   */
  draft?: boolean;
  /**
   * Create this writ as a child of the specified parent writ.
   * The parent must be in new or open status.
   */
  parentId?: string;
}
```

**`ClerkApi`** doc comment update — change `post()` doc from `'ready'` to `'open'`.

### Behavior

#### State machine (clerk.ts)

When the new `ALLOWED_FROM` map is defined, it must be:

```typescript
const ALLOWED_FROM: Record<WritStatus, WritStatus[]> = {
  open: ['new'],
  completed: ['open'],
  failed: ['open'],
  cancelled: ['new', 'open'],
  new: [],
};
```

`TERMINAL_STATUSES` is unchanged: `new Set<WritStatus>(['completed', 'failed', 'cancelled'])`.

`CHILD_ALLOWED_PARENT_STATUSES` becomes: `new Set<WritStatus>(['new', 'open'])`.

#### api.post() — writ creation

When `draft: false` (default), the writ status is `'open'`. When `draft: true`, the writ status is `'new'`.

When a `parentId` is provided:
- The parent must be in `new` or `open` status (validated against `CHILD_ALLOWED_PARENT_STATUSES`).
- The parent does NOT auto-transition. Remove the block that patches the parent to `'waiting'` (lines 228-234 in current code). The parent stays in its current status.

#### api.transition() — acceptedAt removal

Remove the `acceptedAt` logic: delete `...(to === 'active' ? { acceptedAt: now } : {})` from the patch object. Also remove `acceptedAt: _a` from the managed-field destructuring guard (line 404 in current code).

#### handleChildTerminal() — cascade simplification

Replace the entire function body. New behavior:

- When `child.status === 'failed'`:
  - Read the parent. If `parent.status === 'open'`, transition parent to `'failed'` with resolution `Child "${child.id}" failed: ${childResolution}`.
  - If parent is in any other status (including `'new'`), do nothing.
- When `child.status === 'completed'` or `'cancelled'`: do nothing. The "all children terminal → parent returns to ready" rollback is removed entirely.

The guard condition changes from `parent.status !== 'waiting'` to `parent.status !== 'open'`.

#### handleParentTerminal() — unchanged

No changes. It checks `TERMINAL_STATUSES` and cascades cancellation to non-terminal children. The resolution message `'Automatically cancelled due to sibling failure'` is pre-existing and outside scope.

#### Startup migration (clerk.ts start())

After books init and writ-type registration, but before the CDC watcher registration, add a migration block:

```typescript
// ── One-shot migration: collapse legacy statuses to 'open' ──
const legacyStatuses = ['ready', 'active', 'waiting'];
for (const oldStatus of legacyStatuses) {
  const found = await writs.find({ where: [['status', '=', oldStatus]] });
  for (const writ of found) {
    await writs.patch(writ.id, {
      status: 'open' as WritStatus,
      updatedAt: new Date().toISOString(),
    });
  }
}
```

This requires `start()` to become `async`. The `Apparatus.start` type already accepts `void | Promise<void>` (in `packages/framework/core/src/plugin.ts`), so making the Clerk's `start()` async requires no framework changes.

**Important**: The `writs.find()` query uses `['status', '=', oldStatus]` where `oldStatus` is a string. After the type change, `'ready'` is no longer a valid `WritStatus`. The query string must be typed as `string` (not `WritStatus`) to avoid a compile error — use `as string` or pass the raw string to the where clause. Alternatively, since `find()` accepts `WhereClause` which is `Array<[string, string, unknown]>`, the value position accepts `unknown`, so this should compile without issue.

#### Spider trySpawn() changes

1. Change the query from `['status', '=', 'ready']` to `['status', '=', 'open']`.
2. Remove the `clerk.transition(writ.id, 'active')` call and the surrounding try/catch (lines 1783-1794).
3. Update the comment from "Find ready writs" to "Find open writs".
4. Update the comment in the template-skip branch from "remain in `ready`" to "remain in `open`".

The rig-existence check (lines 1752-1756) remains unchanged — it is the sole guard against re-dispatching `open` writs that already have rigs.

#### Spider CDC handler — unchanged

The rig-terminal CDC handler (lines 2077-2136) transitions writs to `completed`, `failed`, or `cancelled`. These are all valid transitions from `open` under the new state machine. No changes needed. The `writAlreadyTerminal` check uses hardcoded strings `'completed'`, `'failed'`, `'cancelled'` — all still valid.

### Tool Updates

**Delete `packages/plugins/clerk/src/tools/writ-accept.ts`.**

**`packages/plugins/clerk/src/tools/index.ts`** — remove the `writAccept` export:
```typescript
// DELETE: export { default as writAccept } from './writ-accept.ts';
```

Also remove `writAccept` from the `supportKit.tools` array in `clerk.ts`.

**`packages/plugins/clerk/src/tools/writ-publish.ts`:**
- Description: `'Publish a draft writ, transitioning it from new to open'`
- Instructions: `'Moves a writ from new (draft) status to open, placing it in the execution queue. Once published, the Spider will pick up the writ on its next crawl tick. Only writs in new status can be published. Returns the updated writ.'`
- Handler: `clerk.transition(params.id, 'open')`

**`packages/plugins/clerk/src/tools/writ-complete.ts`:**
- Description: `'Complete a writ, transitioning it from open to completed'`
- Instructions: `'Marks the writ as successfully completed. Writs in open status can be completed. Returns the updated writ.'`

**`packages/plugins/clerk/src/tools/writ-fail.ts`:**
- Description: `'Fail a writ, transitioning it from open to failed'`
- Instructions: `'Marks the writ as failed. Record a resolution explaining why it failed. Writs in open status can be failed. If the writ has non-terminal children, they will be automatically cancelled. Returns the updated writ.'`

**`packages/plugins/clerk/src/tools/writ-cancel.ts`:**
- Description: `'Cancel a writ, transitioning it from new or open to cancelled'`
- Instructions: `'Cancels the writ. Writs in new (draft) or open status can be cancelled. Optionally record a resolution explaining why. If the writ has non-terminal children, they will be automatically cancelled. Returns the updated writ.'`

**`packages/plugins/clerk/src/tools/commission-post.ts`:**
- Description: `'Post a new commission, creating a writ in open or new (draft) status'`
- Instructions: update all references: `ready` → `open`, remove all mentions of `waiting`, remove parent-to-waiting transition language. Parent must be in `new or open status` (no transition on child add).

**`packages/plugins/clerk/src/tools/writ-list.ts`:**
- Both `z.enum` arrays become: `z.enum(['new', 'open', 'completed', 'failed', 'cancelled'])`

**`packages/plugins/spider/src/tools/crawl-one.ts`:**
- Instructions: change "spawn a rig for a ready writ" to "spawn a rig for an open writ".

### Writs Page UI

**`packages/plugins/clerk/pages/writs/index.html`:**

Filter buttons HTML (lines 59-65) — replace the 7 buttons with 5:
```html
<button class="btn filter-btn" data-status="new">new</button>
<button class="btn filter-btn" data-status="open">open</button>
<button class="btn filter-btn" data-status="completed">completed</button>
<button class="btn filter-btn" data-status="failed">failed</button>
<button class="btn filter-btn" data-status="cancelled">cancelled</button>
```

`statusBadge()` function — new mapping:
```javascript
function statusBadge(status) {
  const map = {
    new: 'badge badge--draft',
    open: 'badge badge--active',
    completed: 'badge badge--success',
    failed: 'badge badge--error',
    cancelled: 'badge badge--warning',
  };
  const cls = map[status] ?? 'badge';
  return `<span class="${cls}">${status}</span>`;
}
```

Detail view action buttons (lines 392-408) — replace the `ready`/`active` branches with a single `open` branch:
```javascript
if (writ.status === 'new') {
  // Start (Publish) + Cancel buttons — unchanged
} else if (writ.status === 'open') {
  // Complete + Fail + Cancel buttons
  html += `<button class="btn btn--success" data-action="complete" data-id="${writ.id}">Complete</button>`;
  html += `<button class="btn btn--danger" data-action="fail" data-id="${writ.id}">Fail</button>`;
  html += `<button class="btn btn--danger" data-action="cancel" data-id="${writ.id}">Cancel</button>`;
}
```

Remove the `acceptedAt` display line (`if (writ.acceptedAt) html += ...`).

The `handleDetailAction` function must remove the `'accept'` case. The API call `POST /api/writ/accept` will 404 after the tool is deleted — remove it from the client-side dispatch.

**`packages/plugins/clerk/pages/writs/writs-hierarchy.test.js`:**
Update the duplicated `statusBadge()`, `rowActions()`, and `renderDetail()` functions to match the changes in `index.html`.

### Test Fixture Updates

**`packages/plugins/clerk/src/clerk.test.ts`:**
- All `'ready'` status references in writ creation → `'open'`
- All `'active'` status references → `'open'` (or remove tests for `ready → active` transition)
- All `'waiting'` status references → remove (tests for waiting-related transitions are deleted)
- Remove all `acceptedAt` assertions
- Remove tests for `writ-accept` transitions
- Remove tests for parent-to-waiting auto-transition on child-add
- Remove tests for waiting-to-ready rollback on all-children-terminal
- Update multi-status filter tests (e.g. `['ready', 'active', 'waiting']` → `['open']` or other valid combinations)
- Update parent-child cascade tests: child failure cascades from `open` parent, no rollback
- Update count tests that use old statuses

**`packages/plugins/spider/src/spider.test.ts`:**
- All `'ready'` writ status assertions → `'open'`
- Remove assertions for `ready → active` transition after dispatch
- Remove `clerk.transition(writ.id, 'active')` calls in test setup
- Update unmapped-writ-type tests to assert writ stays in `'open'`

**`packages/plugins/astrolabe/src/engines.test.ts`:**
- Lines 44, 151, 168, 181, 194: Change `status: 'ready'` to `status: 'open'` in mock writ fixtures

**`packages/plugins/animator/src/oculus-routes.test.ts`:**
- Line 179: Change `status: 'active'` to `status: 'open'` in mock writ fixture

### Non-obvious Touchpoints

- **`packages/plugins/clerk/src/clerk.ts` supportKit.tools array** — `writAccept` must be removed from the array (in addition to the `tools/index.ts` export).
- **`packages/plugins/clerk/src/clerk.ts` transition() managed-field guard** — line 404 destructures `acceptedAt: _a` from fields to strip it. This must be removed since the field no longer exists on `WritDoc`.
- **`packages/plugins/clerk/src/index.ts`** — re-exports `WritStatus`. The type change propagates automatically, but verify no re-export of `acceptedAt`-related types.
- **`packages/plugins/clerk/pages/writs/index.html` handleDetailAction** — the `'accept'` case in the action dispatch switch must be removed.
- **`start()` async change** — making Clerk's `start()` async to support the migration. Verify the `Plugin` type accepts `Promise<void>` from `start()`.

### Dependencies

None. The `Plugin` type's `Apparatus.start` method already accepts `void | Promise<void>` (`packages/framework/core/src/plugin.ts` line 137), so making Clerk's `start()` async requires no framework changes.

## Validation Checklist

- V1 [R1]: `grep -r "WritStatus" packages/plugins/clerk/src/types.ts` shows exactly `'new' | 'open' | 'completed' | 'failed' | 'cancelled'`. No occurrence of `'ready'`, `'active'`, or `'waiting'` in the type definition.
- V2 [R2]: `grep -rn "acceptedAt" packages/plugins/clerk/` returns zero matches. `grep -rn "acceptedAt" packages/plugins/` returns zero matches.
- V3 [R3]: Inspect `ALLOWED_FROM` in `clerk.ts` — verify exactly 5 keys (`open`, `completed`, `failed`, `cancelled`, `new`) with the specified source arrays. No key for `ready`, `active`, or `waiting`.
- V4 [R4]: In `clerk.test.ts`, a test creates a writ with `draft: false` and asserts `status === 'open'`. A test creates with `draft: true` and asserts `status === 'new'`.
- V5 [R5, R6]: In `clerk.test.ts`, a test adds a child to a `new` parent and asserts the parent remains in `new` status. A test adds a child to an `open` parent and asserts the parent remains in `open`.
- V6 [R7, R8]: In `clerk.test.ts`, a test has an `open` parent with a child that transitions to `failed` → parent auto-transitions to `failed`. A test has a `new` parent with a failing child → parent stays `new`. No test asserts a "waiting → ready" rollback (that path no longer exists).
- V7 [R9]: `ls packages/plugins/clerk/src/tools/writ-accept.ts` returns "No such file". `grep "writAccept" packages/plugins/clerk/src/tools/index.ts` returns zero matches.
- V8 [R10]: In `clerk.test.ts`, a test seeds writs with statuses `ready`, `active`, `waiting`, calls the startup migration logic, then asserts all three are now `open`. Running the migration again on already-migrated writs produces no changes (idempotency).
- V9 [R11]: `grep "ready" packages/plugins/spider/src/spider.ts` returns zero matches for writ-status queries. `grep "active" packages/plugins/spider/src/spider.ts` returns zero matches for `clerk.transition` calls. The `trySpawn` function queries `status: 'open'` and does not call `clerk.transition` after spawning.
- V10 [R12]: `grep -rn "'ready'" packages/plugins/clerk/src/tools/` returns zero matches. `grep -rn "'active'" packages/plugins/clerk/src/tools/` returns zero matches. `grep -rn "'waiting'" packages/plugins/clerk/src/tools/` returns zero matches.
- V11 [R13]: In the writs page HTML, the filter buttons are exactly: All, new, open, completed, failed, cancelled. The `statusBadge` function maps `open` to `badge badge--active`. The detail view shows Complete, Fail, Cancel for `open` status. No Accept button exists.
- V12 [R14]: `grep -rn "'ready'" docs/architecture/apparatus/clerk.md` returns zero matches for writ status usage. Same for `spider.md`. The `schema.md` writ status list uses the new vocabulary.
- V13 [R15]: `grep -rn "status: 'ready'" packages/plugins/astrolabe/src/engines.test.ts` returns zero matches. `grep -rn "status: 'active'" packages/plugins/animator/src/oculus-routes.test.ts` returns zero matches.
- V14 [R16]: `packages/framework/cli/src/program.test.ts` still contains `z.enum(['ready', 'active', 'waiting'])` — these generic test values are intentionally unchanged.
- V15 [R1-R14]: `pnpm build` succeeds with no type errors across the monorepo. `pnpm test` passes across all packages.

## Test Cases

**Clerk core — status machine:**
- Create writ with default options → status is `'open'`
- Create writ with `draft: true` → status is `'new'`
- Transition `new → open` (publish) → succeeds
- Transition `new → cancelled` → succeeds
- Transition `open → completed` → succeeds, `resolvedAt` is set
- Transition `open → failed` → succeeds, `resolvedAt` is set
- Transition `open → cancelled` → succeeds, `resolvedAt` is set
- Transition `new → completed` → throws (not in ALLOWED_FROM)
- Transition `new → failed` → throws
- Transition `open → new` → throws
- Transition `open → open` → throws (not in ALLOWED_FROM)
- Transition `completed → open` → throws (terminal)

**Clerk core — acceptedAt removal:**
- Created writ has no `acceptedAt` property
- Transitioned writ has no `acceptedAt` property
- Writ show does not return `acceptedAt`

**Clerk core — parent-child (D2 = no-transition, D3 = keep-cascade):**
- Add child to `new` parent → parent stays `'new'`, child is created
- Add child to `open` parent → parent stays `'open'`, child is created
- Add child to `completed` parent → throws (not in CHILD_ALLOWED_PARENT_STATUSES)
- Child of `open` parent transitions to `failed` → parent auto-transitions to `failed` with resolution citing child
- Child of `new` parent transitions to `failed` → parent stays `'new'` (cascade guard: parent.status !== 'open')
- Two children of `open` parent: first completes, second completes → parent stays `'open'` (no rollback)
- Two children of `open` parent: first completes, second fails → parent transitions to `failed`
- Parent transitions to `cancelled` → non-terminal children auto-cancelled

**Clerk core — migration:**
- Writ with status `'ready'` is migrated to `'open'`
- Writ with status `'active'` is migrated to `'open'`
- Writ with status `'waiting'` is migrated to `'open'`
- Writ with status `'new'` is NOT migrated (stays `'new'`)
- Writ with status `'completed'` is NOT migrated (stays `'completed'`)
- Running migration on already-migrated writs produces no changes (idempotent)

**Clerk tools:**
- `writ-publish` transitions `new → open`
- `writ-complete` transitions `open → completed`
- `writ-fail` transitions `open → failed`
- `writ-cancel` transitions `new → cancelled` and `open → cancelled`
- `writ-list --status open` returns writs in `open` status
- `writ-list --status ready` is rejected (invalid enum value)

**Spider — dispatch:**
- Crawl with an `open` writ that has a template mapping → rig is spawned, writ stays `open`
- Crawl with an `open` writ that has no template mapping → no rig spawned, writ stays `open`
- Crawl with an `open` writ that already has a rig → no duplicate rig spawned
- Rig completes → writ transitions `open → completed`
- Rig fails → writ transitions `open → failed`
- Rig cancelled → writ transitions `open → cancelled`

**Writs page UI:**
- Status filter shows exactly: All, new, open, completed, failed, cancelled
- `open` badge renders with `badge badge--active` class
- Detail view for `open` writ shows Complete, Fail, Cancel buttons (no Accept)
- Detail view for `new` writ shows Start (Publish) and Cancel buttons
- No `acceptedAt` row in detail view
