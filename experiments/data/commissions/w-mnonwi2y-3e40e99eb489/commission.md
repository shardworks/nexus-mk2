---
author: plan-writer
estimated_complexity: 5
---

# Block Checker Failure Signal

## Summary

Replace `BlockType.check()` return type from `Promise<boolean>` to `Promise<CheckResult>` — a uniform object `{ status, reason? }` — so checkers can signal permanent failure. Update the Spider's `tryCheckBlocked()` to handle the new `'failed'` status by failing the engine and rig. Update all three built-in checkers, adding failure detection to `writ-status`.

## Current State

`packages/plugins/spider/src/types.ts` defines the `BlockType` interface:

```typescript
export interface BlockType {
  id: string;
  check: (condition: unknown) => Promise<boolean>;
  conditionSchema: ZodSchema;
  pollIntervalMs?: number;
}
```

`packages/plugins/spider/src/spider.ts` function `tryCheckBlocked()` (line ~484) stores the checker result in `let cleared: boolean`, then branches: `if (!cleared)` updates `lastCheckedAt` and continues; the fall-through path unblocks the engine.

Three built-in checkers exist:
- `packages/plugins/spider/src/block-types/writ-status.ts` — returns `true`/`false` based on `writ.status === targetStatus`; returns `false` when writ is not found.
- `packages/plugins/spider/src/block-types/scheduled-time.ts` — returns `Date.now() >= Date.parse(resumeAt)`.
- `packages/plugins/spider/src/block-types/book-updated.ts` — returns boolean based on document/book existence.

`packages/plugins/spider/src/index.ts` re-exports public types including `BlockType` but has no `CheckResult` type.

The existing `failEngine()` function (spider.ts line ~381) marks an engine failed, cancels all pending/blocked siblings, and sets the rig to `'failed'`. It is already used in three other call sites that all follow the pattern: `await failEngine(rig, engine.id, msg)` then `return { action: 'rig-completed', rigId, writId, outcome: 'failed' }`.

## Requirements

- R1: `CheckResult` is a new exported type: `{ status: 'cleared' | 'pending' | 'failed'; reason?: string }`.
- R2: `BlockType.check` returns `Promise<CheckResult>` instead of `Promise<boolean>`.
- R3: When `tryCheckBlocked()` receives a result with `status === 'cleared'`, it unblocks the engine (existing behavior).
- R4: When `tryCheckBlocked()` receives a result with `status === 'failed'` and no `reason`, it calls `failEngine` with message `Block "${engine.block.type}" failed permanently` and returns `{ action: 'rig-completed', rigId, writId, outcome: 'failed' }`.
- R5: When `tryCheckBlocked()` receives a result with `status === 'failed'` and a `reason`, it calls `failEngine` with message `Block "${engine.block.type}" failed: ${reason}` and returns `{ action: 'rig-completed', rigId, writId, outcome: 'failed' }`.
- R6: When `tryCheckBlocked()` receives a result with any other `status` value (including `'pending'`), it updates `lastCheckedAt` and continues (existing behavior).
- R7: When `blockType.check()` throws, behavior is unchanged: log a warning, skip, engine stays blocked.
- R8: The failure path does not store the block record in `pendingPriorBlocks` and does not update `lastCheckedAt` before calling `failEngine`.
- R9: The failure path returns immediately after `failEngine` (does not continue checking other engines).
- R10: `scheduled-time` checker returns `{ status: 'cleared' }` when time has passed, `{ status: 'pending' }` otherwise. No failure cases.
- R11: `book-updated` checker returns `{ status: 'cleared' }` when content exists, `{ status: 'pending' }` otherwise. No failure cases.
- R12: `writ-status` checker returns `{ status: 'failed', reason: 'Writ not found' }` when the writ does not exist.
- R13: `writ-status` checker returns `{ status: 'cleared' }` when `writ.status === targetStatus`.
- R14: `writ-status` checker returns `{ status: 'failed', reason: 'Writ reached terminal status "${actual}" instead of "${target}"' }` when the writ is at a terminal status (`'completed'`, `'failed'`, or `'cancelled'`) that is not the target.
- R15: `writ-status` checker returns `{ status: 'pending' }` when the writ exists, is not at the target status, and is not at a terminal status.
- R16: `writ-status` check order: not-found check first, then target match, then terminal-mismatch, then pending.
- R17: `CheckResult` is exported from `packages/plugins/spider/src/index.ts` adjacent to `BlockType`.
- R18: All three built-in checker `check()` methods have explicit return type annotation `Promise<CheckResult>`.

## Design

### Type Changes

In `packages/plugins/spider/src/types.ts`, immediately before the `BlockType` interface, add:

```typescript
/**
 * Result of a block type check.
 *
 * 'cleared' — condition met, unblock the engine.
 * 'pending' — condition not yet met, keep polling.
 * 'failed'  — condition is permanently unresolvable, fail the engine.
 *
 * When status is 'failed', an optional reason provides a human-readable
 * explanation that the Spider includes in the engine error message.
 */
export interface CheckResult {
  status: 'cleared' | 'pending' | 'failed';
  reason?: string;
}
```

The `BlockType` interface becomes:

```typescript
export interface BlockType {
  /** Unique identifier (e.g. 'writ-status', 'scheduled-time'). */
  id: string;
  /**
   * Check whether the blocking condition has been resolved.
   *
   * Return { status: 'cleared' } when the condition is met.
   * Return { status: 'pending' } when the condition is not yet met.
   * Return { status: 'failed' } or { status: 'failed', reason: '...' }
   * when the condition is permanently unresolvable.
   *
   * Throwing is reserved for transient errors (network failures, etc.)
   * — the engine stays blocked and the checker is retried next cycle.
   */
  check: (condition: unknown) => Promise<CheckResult>;
  /** Zod schema for validating the condition payload at block time. */
  conditionSchema: ZodSchema;
  /** Suggested poll interval in milliseconds. If absent, check every crawl cycle. */
  pollIntervalMs?: number;
}
```

### Behavior

#### `tryCheckBlocked()` in `packages/plugins/spider/src/spider.ts`

Replace `let cleared: boolean` with `let result: CheckResult`. Import `CheckResult` from `./types.ts` (add to the existing import block).

After the try/catch that calls `blockType.check()`:

1. When `result.status === 'cleared'`: existing unblock path (store priorBlock, transition to pending, return `engine-unblocked`). No change.

2. When `result.status === 'failed'`: new failure path.
   - Construct message: if `result.reason` is truthy, use `` `Block "${engine.block.type}" failed: ${result.reason}` ``; otherwise use `` `Block "${engine.block.type}" failed permanently` ``.
   - Call `await failEngine(rig, engine.id, message)`.
   - Return `{ action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' }`.
   - Do not store to `pendingPriorBlocks`. Do not update `lastCheckedAt`.

3. Otherwise (including `result.status === 'pending'` and any unexpected value): existing pending path — update `lastCheckedAt`, continue.

The discrimination order is: check `'cleared'` first, then `'failed'`, else pending. This makes `'pending'` the default for any unexpected status value.

#### `writ-status` checker in `packages/plugins/spider/src/block-types/writ-status.ts`

Add `CheckResult` to the import from `'../types.ts'`. Define a local terminal-status set:

```typescript
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
```

The check logic, in order:
1. If writ not found (`results.length === 0`): return `{ status: 'failed', reason: 'Writ not found' }`.
2. If `writ.status === targetStatus`: return `{ status: 'cleared' }`.
3. If `TERMINAL_STATUSES.has(writ.status)` (and status is not target, per step 2): return `{ status: 'failed', reason: 'Writ reached terminal status "${writ.status}" instead of "${targetStatus}"' }` (with actual interpolated values).
4. Otherwise: return `{ status: 'pending' }`.

Change the return type annotation from `Promise<boolean>` to `Promise<CheckResult>`.

#### `scheduled-time` checker in `packages/plugins/spider/src/block-types/scheduled-time.ts`

Add `CheckResult` to the import from `'../types.ts'`. Replace:

```typescript
return Date.now() >= Date.parse(resumeAt);
```

with:

```typescript
return Date.now() >= Date.parse(resumeAt) ? { status: 'cleared' } : { status: 'pending' };
```

Change return type annotation from `Promise<boolean>` to `Promise<CheckResult>`.

#### `book-updated` checker in `packages/plugins/spider/src/block-types/book-updated.ts`

Add `CheckResult` to the import from `'../types.ts'`. Replace every `return true`/`return <boolean expression>` with the equivalent `CheckResult`:
- `return doc !== null && doc !== undefined` → `return (doc !== null && doc !== undefined) ? { status: 'cleared' } : { status: 'pending' }`
- `return docs.length > 0` → `return docs.length > 0 ? { status: 'cleared' } : { status: 'pending' }`

Change return type annotation from `Promise<boolean>` to `Promise<CheckResult>`.

#### `index.ts` export in `packages/plugins/spider/src/index.ts`

Add `CheckResult` to the type export list, adjacent to `BlockType`:

```typescript
export type {
  // ... existing exports ...
  BlockRecord,
  BlockType,
  CheckResult,
  // ... rest ...
} from './types.ts';
```

### Non-obvious Touchpoints

- **`isBlockType()` type guard** (spider.ts line ~317): Checks `typeof check === 'function'` — this still works. No change needed. The guard cannot validate return types at runtime; the pending-as-default dispatch (R6) provides a soft landing for checkers that return unexpected values.

- **All mock block types in `spider.test.ts`**: There are approximately 8–10 inline mock block types in the test file that return `true` or `false`. Every one must be updated to return `{ status: 'cleared' }` or `{ status: 'pending' }`. The TypeScript compiler will flag these.

- **Mutable checker result variables in tests**: Tests that use `let checkerResult = false` and later set `checkerResult = true` must change to `let checkerResult: CheckResult = { status: 'pending' }` and `checkerResult = { status: 'cleared' }`.

## Validation Checklist

- V1 [R1, R2]: `CheckResult` interface exists in `types.ts` with `status: 'cleared' | 'pending' | 'failed'` and optional `reason?: string`. `BlockType.check` returns `Promise<CheckResult>`. Run `npx tsc --noEmit` in `packages/plugins/spider` — no type errors.

- V2 [R3, R6, R7]: Existing blocking tests pass unchanged in behavior (after mock return value updates). Run `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/plugins/spider/src/spider.test.ts` — all pre-existing tests pass.

- V3 [R4, R5, R9]: New test: register a block type whose checker returns `{ status: 'failed' }`. Spawn rig, block engine, crawl. Verify `CrawlResult` is `{ action: 'rig-completed', outcome: 'failed' }`. Verify engine has `status: 'failed'` and `error` contains `'failed permanently'`. Repeat with `{ status: 'failed', reason: 'some reason' }` and verify error contains `'failed: some reason'`.

- V4 [R8]: In the failure test from V3, verify that `pendingPriorBlocks` is not populated (engine cannot be re-run after failure — verify by checking that no `priorBlock` appears in any subsequent engine context).

- V5 [R10]: `scheduled-time` checker returns `{ status: 'cleared' }` for past timestamps, `{ status: 'pending' }` for future timestamps. Existing tests updated and passing.

- V6 [R11]: `book-updated` checker returns `{ status: 'cleared' }` when content exists, `{ status: 'pending' }` otherwise. Existing tests updated and passing.

- V7 [R12, R13, R14, R15, R16]: `writ-status` checker: (a) returns `{ status: 'failed', reason: 'Writ not found' }` for nonexistent writ; (b) returns `{ status: 'cleared' }` when writ matches target; (c) returns `{ status: 'failed', reason: 'Writ reached terminal status "failed" instead of "completed"' }` when writ is at wrong terminal; (d) returns `{ status: 'pending' }` when writ is at non-terminal non-target status.

- V8 [R17]: `grep 'CheckResult' packages/plugins/spider/src/index.ts` shows the type in the export list.

- V9 [R18]: All three checker files have explicit `Promise<CheckResult>` return type annotation on their `check()` methods.

## Test Cases

### Spider `tryCheckBlocked()` failure path

1. **Checker returns `{ status: 'failed' }` (no reason) — sole engine**: Register a block type whose checker returns `{ status: 'failed' }`. Create a rig with one engine that blocks on this type. Crawl to block, then crawl again. Expected: `CrawlResult` is `{ action: 'rig-completed', outcome: 'failed' }`. Engine has `status: 'failed'`, `error: 'Block "test-block" failed permanently'`. Rig has `status: 'failed'`.

2. **Checker returns `{ status: 'failed', reason: 'resource deleted' }` — sole engine**: Same setup but checker returns reason. Expected: engine `error` is `'Block "test-block" failed: resource deleted'`.

3. **Checker failure with multiple engines — sibling cancelled**: Two-engine rig (a blocks, b is pending with upstream on a). Checker for a returns `{ status: 'failed' }`. Expected: a is `'failed'`, b is `'cancelled'`, rig is `'failed'`.

4. **Checker failure on rig with running sibling**: Two independent engines (a blocks, b is running). Checker for a returns `{ status: 'failed' }`. Expected: a is `'failed'`, b is `'cancelled'` (failEngine cancels all pending/blocked), rig is `'failed'`.

5. **Checker failure when rig status is `'blocked'`**: Sole-engine rig in blocked state. Checker returns `{ status: 'failed', reason: 'gone' }`. Expected: rig transitions from `'blocked'` to `'failed'`.

6. **Checker returns `{ status: 'cleared' }` — existing unblock still works**: Same as existing unblock tests but with object return. Engine transitions to `'pending'`, rig restored to `'running'`.

7. **Checker returns `{ status: 'pending' }` — existing pending still works**: Engine stays `'blocked'`, `lastCheckedAt` updated.

8. **Checker throws — engine stays blocked (unchanged)**: Checker throws `Error`. Engine stays `'blocked'`, no failure. Same as existing test, with object-returning mock.

### `writ-status` checker failure cases

9. **Writ not found**: Call `check({ writId: 'nonexistent', targetStatus: 'completed' })`. Expected: `{ status: 'failed', reason: 'Writ not found' }`.

10. **Writ at target status**: Create writ, transition to `completed`. Call with `targetStatus: 'completed'`. Expected: `{ status: 'cleared' }`.

11. **Writ at wrong terminal status**: Create writ, transition to `active`, then `failed`. Call with `targetStatus: 'completed'`. Expected: `{ status: 'failed', reason: 'Writ reached terminal status "failed" instead of "completed"' }`.

12. **Writ at non-terminal, non-target status**: Create writ (status `ready`). Call with `targetStatus: 'completed'`. Expected: `{ status: 'pending' }`.

13. **Writ at terminal status that IS the target**: Create writ, transition to `active`, then `failed`. Call with `targetStatus: 'failed'`. Expected: `{ status: 'cleared' }` (target match takes priority over terminal-mismatch).

14. **Writ cancelled (terminal) targeting completed**: Create writ, cancel it. Call with `targetStatus: 'completed'`. Expected: `{ status: 'failed', reason: 'Writ reached terminal status "cancelled" instead of "completed"' }`.

### `scheduled-time` and `book-updated` (updated assertions)

15. **scheduled-time past**: `check({ resumeAt: pastISOString })` returns `{ status: 'cleared' }`.

16. **scheduled-time future**: `check({ resumeAt: futureISOString })` returns `{ status: 'pending' }`.

17. **book-updated empty book**: returns `{ status: 'pending' }`.

18. **book-updated book with documents**: returns `{ status: 'cleared' }`.

19. **book-updated specific document not found**: returns `{ status: 'pending' }`.

20. **book-updated specific document found**: returns `{ status: 'cleared' }`.

### Integration: failure signal propagates to rig lifecycle

21. **End-to-end: checker failure → rig failed → writ transition**: A rig with a blocking engine whose checker returns failed. After crawl, rig is failed. Verify the CDC handler transitions the writ (if the existing test suite covers CDC transitions on rig failure, this is already exercised; otherwise add it).