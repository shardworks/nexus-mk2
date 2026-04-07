# Inventory — Block Checker Failure Signal Commission

## Brief Summary

Change `BlockType.check()` from `Promise<boolean>` to `Promise<CheckResult>` where `CheckResult = 'cleared' | 'pending' | 'failed' | { failed: string }`. Update `tryCheckBlocked()` in spider.ts to handle the new failure results by calling `failEngine()` and returning `rig-completed/failed`. Update all three built-in block types accordingly, with `writ-status` gaining two new failure cases.

---

## Affected Files

### Will be modified

| File | Why |
|------|-----|
| `packages/plugins/spider/src/types.ts` | Add `CheckResult` type; change `BlockType.check` signature |
| `packages/plugins/spider/src/index.ts` | Export `CheckResult` type |
| `packages/plugins/spider/src/spider.ts` | Update `tryCheckBlocked()` to handle new result variants; update `isBlockType()` guard |
| `packages/plugins/spider/src/block-types/writ-status.ts` | Return string literals; add failure cases for missing writ and terminal-status mismatch |
| `packages/plugins/spider/src/block-types/scheduled-time.ts` | Return `'cleared'`/`'pending'` string literals instead of booleans |
| `packages/plugins/spider/src/block-types/book-updated.ts` | Return `'cleared'`/`'pending'` string literals instead of booleans |
| `packages/plugins/spider/src/spider.test.ts` | Update existing block-type tests; add new failure-signal tests |

### Will NOT be modified (confirmed unaffected)

- `packages/plugins/spider/src/tools/rig-resume.ts` — no checker interaction
- `packages/plugins/spider/src/tools/crawl-one.ts` — no type dependency on `CheckResult`
- `packages/plugins/spider/src/tools/crawl-continual.ts` — same
- `packages/plugins/spider/src/tools/tools.test.ts` — uses `CrawlResult` not `CheckResult`
- `packages/plugins/spider/src/engines/*` — engines return `EngineRunResult`, not `CheckResult`
- `packages/plugins/fabricator/src/fabricator.ts` — defines `EngineRunResult`, unrelated to `CheckResult`
- All other packages — `BlockType` is only consumed by the spider apparatus itself

---

## Types and Interfaces

### Current `BlockType` interface (types.ts:182–191)

```typescript
export interface BlockType {
  /** Unique identifier (e.g. 'writ-status', 'scheduled-time'). */
  id: string;
  /** Lightweight checker — returns true if the blocking condition has cleared. */
  check: (condition: unknown) => Promise<boolean>;
  /** Zod schema for validating the condition payload at block time. */
  conditionSchema: ZodSchema;
  /** Suggested poll interval in milliseconds. If absent, check every crawl cycle. */
  pollIntervalMs?: number;
}
```

### New `CheckResult` type (to be added to types.ts)

```typescript
export type CheckResult = 'cleared' | 'pending' | 'failed' | { failed: string }
```

### New `BlockType` interface

```typescript
export interface BlockType {
  id: string;
  check: (condition: unknown) => Promise<CheckResult>;
  conditionSchema: ZodSchema;
  pollIntervalMs?: number;
}
```

### `CrawlResult` (types.ts:167–174) — unchanged

```typescript
export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'engine-blocked'; rigId: string; engineId: string; blockType: string }
  | { action: 'engine-unblocked'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
  | { action: 'rig-blocked'; rigId: string; writId: string };
```

---

## Functions That Will Change

### `tryCheckBlocked()` — spider.ts:484–551

Full current implementation:

```typescript
async function tryCheckBlocked(): Promise<CrawlResult | null> {
  const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
  const blockedRigs = await rigsBook.find({ where: [['status', '=', 'blocked']] });
  const rigs = [...runningRigs, ...blockedRigs];

  for (const rig of rigs) {
    for (const engine of rig.engines) {
      if (engine.status !== 'blocked' || !engine.block) continue;

      const blockType = blockTypeRegistry.get(engine.block.type);
      if (!blockType) continue; // Type was unregistered after block was created; skip

      // Poll interval throttle
      if (blockType.pollIntervalMs !== undefined && engine.block.lastCheckedAt) {
        const elapsed = Date.now() - new Date(engine.block.lastCheckedAt).getTime();
        if (elapsed < blockType.pollIntervalMs) continue;
      }

      let cleared: boolean;
      try {
        cleared = await blockType.check(engine.block.condition);
      } catch (err) {
        // Log warning, skip — engine stays blocked, retry next cycle
        console.warn(
          `Block checker "${engine.block.type}" threw for engine "${engine.id}" in rig "${rig.id}":`,
          err,
        );
        continue;
      }

      if (!cleared) {
        // Update lastCheckedAt and continue checking other engines
        const now = new Date().toISOString();
        const updatedEngines = rig.engines.map((e) =>
          e.id === engine.id
            ? { ...e, block: { ...e.block!, lastCheckedAt: now } }
            : e,
        );
        await rigsBook.patch(rig.id, { engines: updatedEngines });
        continue; // Check next engine
      }

      // Cleared — store block record in memory for priorBlock, then transition engine to pending
      const priorBlockRecord = engine.block;
      pendingPriorBlocks.set(`${rig.id}:${engine.id}`, priorBlockRecord);

      const updatedEngines = rig.engines.map((e) =>
        e.id === engine.id
          ? { ...e, status: 'pending' as const, block: undefined }
          : e,
      );

      const stillBlocked = isRigBlocked(updatedEngines);
      const rigStatus = stillBlocked ? 'blocked' : 'running';

      await rigsBook.patch(rig.id, {
        engines: updatedEngines,
        status: rigStatus,
      });

      return { action: 'engine-unblocked', rigId: rig.id, engineId: engine.id };
    }
  }
  return null;
}
```

The `cleared: boolean` local variable and the `if (!cleared)` branch are the key change points.

### `failEngine()` — spider.ts:381–400

Already exists and works for this purpose. Signature:

```typescript
async function failEngine(
  rig: RigDoc,
  engineId: string,
  errorMessage: string,
): Promise<void>
```

Behaviour: marks the target engine `failed`, cancels all `pending` and `blocked` engines, patches rig status to `'failed'`.

### `isBlockType()` type guard — spider.ts:317–324

```typescript
function isBlockType(value: unknown): value is BlockType {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).check === 'function'
  );
}
```

This guard is used when scanning kits/apparatus for block types at startup. It only checks the function's existence — does NOT validate return type. No functional change needed, but if we want the guard comment to be accurate, the JSDoc on `BlockType.check` will change.

---

## Built-in Block Type Implementations

### `writ-status` — block-types/writ-status.ts

```typescript
const writStatusBlockType: BlockType = {
  id: 'writ-status',
  conditionSchema,   // z.object({ writId: z.string(), targetStatus: z.string() })
  pollIntervalMs: 10_000,
  async check(condition: unknown): Promise<boolean> {
    const { writId, targetStatus } = conditionSchema.parse(condition);
    const stacks = guild().apparatus<StacksApi>('stacks');
    const writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
    const results = await writsBook.find({ where: [['id', '=', writId]], limit: 1 });
    if (results.length === 0) return false;       // ← currently false; brief says { failed: 'Writ not found' }
    return results[0].status === targetStatus;    // ← currently boolean; also needs terminal-status mismatch check
  },
};
```

**Required changes per brief:**
- `results.length === 0` → return `{ failed: 'Writ not found' }`
- `results[0].status === targetStatus` → if equal return `'cleared'`, else if terminal status (and not target) return `{ failed: 'Writ reached terminal status "${actual}" instead of "${target}"' }`, else `'pending'`
- Need to know what "terminal status" means for a writ — the Clerk `WritDoc` has statuses including at least `completed`, `failed`, `cancelled` (inferred from other code)

### `scheduled-time` — block-types/scheduled-time.ts

```typescript
const scheduledTimeBlockType: BlockType = {
  id: 'scheduled-time',
  conditionSchema,   // z.object({ resumeAt: z.string() })
  pollIntervalMs: 30_000,
  async check(condition: unknown): Promise<boolean> {
    const { resumeAt } = conditionSchema.parse(condition);
    return Date.now() >= Date.parse(resumeAt);  // ← return 'cleared' / 'pending'
  },
};
```

### `book-updated` — block-types/book-updated.ts

```typescript
const bookUpdatedBlockType: BlockType = {
  id: 'book-updated',
  conditionSchema,   // z.object({ ownerId, book, documentId? })
  pollIntervalMs: 10_000,
  async check(condition: unknown): Promise<boolean> {
    // ... returns boolean based on document presence
    // ← change true → 'cleared', false → 'pending'
  },
};
```

---

## Test File — spider.test.ts

**Test suite for blocking:** `describe('Spider — engine blocking on external conditions', ...)` starts at line 3092. Contains:
- `buildBlockingFixture()` — extended fixture with real StartupContext
- `registerBlockType()` helper
- ~40+ individual `it()` tests covering all blocking behaviour

**Built-in block type tests:** lines 4331–4477
- `writ-status`: 4 tests (false when not at status, true when at status, false when writ doesn't exist, pollIntervalMs check)
- `scheduled-time`: 3 tests (future=false, past=true, pollIntervalMs check)
- `book-updated`: 5 tests (empty=false, has-docs=true, no-doc-id=false, doc-exists=true, pollIntervalMs check)

**Existing test for "writ not found" case (line 4362–4369):**
```typescript
it('checker returns false when writ does not exist', async () => {
  const result = await blockType.check({ writId: 'nonexistent-writ-99', targetStatus: 'completed' });
  assert.equal(result, false, 'checker should return false when writ not found');
});
```
This test must be updated — the expectation changes from `false` to `{ failed: 'Writ not found' }`.

**Test patterns used:**
- `assert.equal(result, true/false, ...)` — direct equality on boolean returns; must change to string/object comparisons
- Mock block types use `async check() { return true; }` or `async check() { return false; }` — these will continue to compile after the type change since `boolean` is not assignable to `CheckResult`; all mock block types in tests will need updating too
- Tests check `result.action`, `result.outcome`, engine `.status`, etc. — CrawlResult shape unchanged

**Mock block type pattern used throughout (must update all occurrences):**
```typescript
await registerBlockType(fix.fireAll, {
  id: 'some-block',
  conditionSchema: z.object({ ... }),
  async check() { return true; },  // ← currently boolean, will need to be 'cleared'
});
```

There are approximately 8–10 places in spider.test.ts where mock block types return `true` or `false`. All must be updated to return `'cleared'` or `'pending'` respectively, since TypeScript will enforce the new signature.

---

## Data Flow: `tryCheckBlocked()` Pipeline

```
rigsBook.find(running) + rigsBook.find(blocked)
  → for each blocked engine:
      blockTypeRegistry.get(block.type)
      → pollIntervalMs throttle check
      → blockType.check(condition)         ← return type changes here
          throws → console.warn, continue  ← unchanged
          false  → update lastCheckedAt    ← becomes 'pending'
          true   → unblock engine          ← becomes 'cleared'
          NEW: 'failed' / {failed:string}  → failEngine() + return rig-completed/failed
```

The `failEngine()` function is already called in 4 other places in spider.ts with the exact same pattern (`failEngine(rig, engine.id, message)` then `return { action: 'rig-completed', ... outcome: 'failed' }`), so the new failure path follows an established pattern.

---

## Existing Failure Paths (Comparable Implementations)

Three existing call sites that call `failEngine()` and return `rig-completed/failed`:

1. **tryCollect (line 425–426):** Session failed/timeout
   ```typescript
   await failEngine(rig, engine.id, session.error ?? `Session ${session.status}`);
   return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
   ```

2. **tryCollect (line 446–447):** Non-serializable yields
   ```typescript
   await failEngine(rig, engine.id, 'Session yields are not JSON-serializable');
   return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
   ```

3. **tryRun (line 572–573):** No engine design found
   ```typescript
   await failEngine(rig, pending.id, `No engine design found for "${pending.designId}"`);
   return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
   ```

The new failure path in `tryCheckBlocked()` will follow the same pattern exactly.

---

## Public API Surface

### `index.ts` — current exports

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
  BlockRecord,
  BlockType,
  DraftYields,
  SealYields,
  RigTemplate,
  RigTemplateEngine,
} from './types.ts';
```

`CheckResult` is not currently exported. Per the brief, it becomes part of the public interface (kit authors implementing custom block types need it). It must be added to the export list.

### `SpiderApi` interface — unchanged

`getBlockType(id: string): BlockType | undefined` returns `BlockType`, which changes its `check` signature.

---

## Writ Terminal Statuses

The `writ-status` checker needs to detect "terminal status that isn't the target." The Clerk's writ statuses appear in the codebase:

From clerk tests and tools:
- `active` — transitional
- `completed` — terminal
- `failed` — terminal  
- `cancelled` — terminal (via `writ-cancel.ts`)
- `pending`/`ready`/`draft` — non-terminal (early states)

The brief says to return `{ failed: 'Writ reached terminal status "${actual}" instead of "${target}"' }` when the writ is in a terminal status that isn't the target. The set of terminal statuses needs to be determined. Looking at the current checker: it checks `results[0].status === targetStatus` — it doesn't currently distinguish between "wrong terminal" and "still in progress." The clerk tool `writ-fail.ts` exists, confirming `failed` is a valid writ status.

---

## Doc/Code Discrepancies

1. **spider.md does not document BlockType at all.** The architecture doc (`docs/architecture/apparatus/spider.md`) describes the Spider's crawl phases and data model but has no mention of block types, `BlockType` interface, or the three built-in block types. This is a documentation gap, not a bug — the blocking feature was clearly added after the doc was written.

2. **spider.md's `EngineInstance` is stale.** The doc at line 132 shows `status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'` — missing `'blocked'`. The code in `types.ts:13` has `'blocked'`. Also missing `block?: BlockRecord` field.

3. **spider.md's `RigDoc` is stale.** Doc shows `status: 'running' | 'completed' | 'failed'` — code also has `'blocked'` in `RigStatus`. Missing `resolutionEngineId` field.

4. **Existing test expects `false` for "writ not found."** The test at line 4362 (`'checker returns false when writ does not exist'`) tests current behavior. The brief changes this to `{ failed: 'Writ not found' }`. This is an intentional change, not a discrepancy, but is the one existing test guaranteed to break.

---

## Adjacent Patterns / Prior Commissions

- The blocking feature itself was a prior commission (referenced at test line 3082: "Tests for requirements R1–R29 (write w-mnnmd63t-b62234c456d3)"). The full blocking suite is already in place. This commission extends it.
- No `CheckResult` type anywhere in the codebase today — this is a net-new type.
- The `PreconditionCheckResult` in core-api.md is unrelated (tools preconditions, different system).

---

## Scratch/Future Notes

None found — no scratch notes, TODO comments, or FUTURE markers specifically related to the block type checker interface in the searched files.
