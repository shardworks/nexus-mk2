---
author: plan-writer
estimated_complexity: 13
---

# Engine Blocking on External Conditions

## Summary

Add a `blocked` engine status so engines can signal they are waiting for an external condition. The Spider validates block records against registered block types, runs lightweight condition checkers on each crawl cycle, and restarts engines when conditions clear. Rigs transition to `blocked` when all forward progress is stalled. Operator tools gain blocked filtering, block metadata display, and a manual resume command.

## Current State

### Fabricator (`packages/plugins/fabricator/src/fabricator.ts`)

`EngineRunResult` is a two-variant union:

```typescript
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string };
```

`EngineRunContext` carries minimal execution context:

```typescript
export interface EngineRunContext {
  engineId: string;
  upstream: Record<string, unknown>;
}
```

The Fabricator is a pure query service: scans `engines` from kit/supportKit contributions via `EngineRegistry`, exposes `FabricatorApi.getEngineDesign(id)`. Re-exported from `packages/plugins/fabricator/src/index.ts`.

### Spider types (`packages/plugins/spider/src/types.ts`)

```typescript
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type RigStatus = 'running' | 'completed' | 'failed';

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

export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' };

export interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
  show(id: string): Promise<RigDoc>;
  list(filters?: RigFilters): Promise<RigDoc[]>;
  forWrit(writId: string): Promise<RigDoc | null>;
}
```

### Spider implementation (`packages/plugins/spider/src/spider.ts`)

`createSpider()` factory builds the apparatus. Key internals:

- `failEngine(rig, engineId, errorMessage)` — marks engine failed, cancels all `pending` engines, sets rig to `failed`.
- `tryCollect()` — Phase 1: finds running engines with terminal sessions, collects yields or fails.
- `tryRun()` — Phase 2: finds first runnable pending engine, executes via `design.run()`, handles `completed` and `launched` results.
- `trySpawn()` — Phase 3: creates rigs for ready writs.
- `crawl()` calls: `tryCollect() || tryRun() || trySpawn() || null`.
- `findRunnableEngine(rig)` — returns first `pending` engine with all upstream `completed`.
- CDC handler on rigs book: transitions writs on `completed`/`failed` rig status. Uses `if (rig.status === 'completed') ... else if (rig.status === 'failed') ...` — blocked falls through naturally.
- Apparatus definition: `requires: ['stacks', 'clerk', 'fabricator']`, `supportKit` contains `books`, `engines`, `tools`.

### Tools

- `packages/plugins/spider/src/tools/rig-list.ts` — `z.enum(['running', 'completed', 'failed'])` for status filter.
- `packages/plugins/spider/src/tools/rig-show.ts` — returns full `RigDoc`, instructions text: "Returns the full RigDoc for the given rig id."
- `packages/plugins/spider/src/tools/index.ts` — barrel exports five tools.
- All mutating tools use `permission: 'spider:write'`.

### Barrel export (`packages/plugins/spider/src/index.ts`)

Re-exports all public types: `EngineStatus`, `EngineInstance`, `RigStatus`, `RigDoc`, `RigFilters`, `CrawlResult`, `SpiderApi`, `SpiderConfig`, `DraftYields`, `SealYields`.

## Requirements

- R1: `EngineRunResult` must include a `{ status: 'blocked'; blockType: string; condition: unknown; message?: string }` variant.
- R2: `EngineInstance` must include a `block?: BlockRecord` field where `BlockRecord` is `{ type: string; condition: unknown; blockedAt: string; message?: string; lastCheckedAt?: string }`.
- R3: `EngineStatus` must include `'blocked'`. When `run()` returns blocked, the engine transitions `pending → running → blocked` (two Stacks writes, same as existing branches).
- R4: The Spider must define a `BlockType` interface: `{ id: string; check: (condition: unknown) => Promise<boolean>; conditionSchema: ZodSchema; pollIntervalMs?: number }`.
- R5: The Spider must scan `blockTypes` from kit/supportKit contributions using a `BlockTypeRegistry` (same pattern as Fabricator's `EngineRegistry`).
- R6: `SpiderApi` must expose `getBlockType(id): BlockType | undefined` for block type lookup.
- R7: The crawl loop must run in order: `collect > checkBlocked > run > spawn`. `tryCheckBlocked()` queries rigs with status IN (`running`, `blocked`), finds engines with `status === 'blocked'`, and runs the registered checker for each.
- R8: `tryCheckBlocked()` must respect per-block-type `pollIntervalMs`: skip an engine if `Date.now() < block.lastCheckedAt + blockType.pollIntervalMs`. When `pollIntervalMs` is absent, check every cycle.
- R9: When a checker returns `true`, the engine must transition to `pending` (block cleared) and the block field must be removed from the persisted `EngineInstance`. The Spider stores the block record in memory for passing as `priorBlock` on the next `run()`.
- R10: When a checker returns `false`, `block.lastCheckedAt` must be persisted to Stacks.
- R11: When a checker throws, the Spider must log a warning and skip — the engine stays blocked, retry next cycle.
- R12: `RigStatus` must include `'blocked'`. A rig enters `blocked` when: no engine is `running`, `findRunnableEngine()` returns null, and at least one engine is `blocked`.
- R13: An `isRigBlocked(engines): boolean` helper must be extracted and called from `tryRun()`, `tryCollect()`, and `tryCheckBlocked()`.
- R14: When `tryCheckBlocked()` unblocks an engine in a `blocked` rig, it must also restore the rig to `running` in the same Stacks patch.
- R15: `CrawlResult` must gain three variants: `engine-blocked` (`{ rigId, engineId, blockType }`), `engine-unblocked` (`{ rigId, engineId }`), `rig-blocked` (`{ rigId, writId }`). When an engine block also causes the rig to become blocked, return `rig-blocked` (not `engine-blocked`).
- R16: `SpiderApi` must expose `resume(rigId: string, engineId: string): Promise<void>`. When the engine is not blocked, throw: `'Engine "X" in rig "Y" is not blocked (status: Z)'`.
- R17: A `rig-resume` tool must be created with `permission: 'spider:write'`, calling `spider.resume(rigId, engineId)`.
- R18: `rig-list` status enum must include `'blocked'`.
- R19: `rig-show` instructions text must mention blocked engines and block metadata (type, condition, timestamps).
- R20: `EngineRunContext` must gain `priorBlock?: BlockRecord`. When an engine restarts after unblocking, Spider populates this from the stored block record.
- R21: `failEngine()` must cancel `blocked` engines alongside `pending` ones: predicate becomes `e.status === 'pending' || e.status === 'blocked'`.
- R22: Three built-in block types must ship in Spider's `supportKit.blockTypes`: `writ-status`, `scheduled-time`, `book-updated`.
- R23: `writ-status` condition schema: `{ writId: string; targetStatus: string }`. Checker reads the writ and returns `writ.status === condition.targetStatus`. `pollIntervalMs: 10000`.
- R24: `scheduled-time` condition schema: `{ resumeAt: string }` (ISO 8601). Checker returns `Date.now() >= Date.parse(condition.resumeAt)`. `pollIntervalMs: 30000`.
- R25: `book-updated` condition schema: `{ ownerId: string; book: string; documentId?: string }`. Checker reads the book/document via Stacks and compares against comparison data the engine includes in the condition. `pollIntervalMs: 10000`.
- R26: When `run()` returns `blocked` with an unregistered `blockType`, the Spider must fail the engine immediately: `'Unknown block type: "X"'`.
- R27: When `run()` returns `blocked` with a registered type, Spider must call `blockType.conditionSchema.parse(condition)`. On Zod validation failure, fail the engine: `'Block type "X" rejected condition: <Zod error message>'`. Validation runs after `run()` returns, before persisting the block record.
- R28: `BlockRecord` and `BlockType` must be re-exported from `packages/plugins/spider/src/index.ts`.
- R29: The CDC handler on the rigs book must NOT fire for `blocked` status — the existing `if (completed) ... else if (failed) ...` structure naturally handles this (no code change needed, but verify).

## Design

### Type Changes

#### `packages/plugins/fabricator/src/fabricator.ts`

```typescript
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };
```

#### `packages/plugins/fabricator/src/index.ts`

No change needed — `EngineRunResult` is already re-exported via `export type { EngineRunResult } from './fabricator.ts'`.

#### `packages/plugins/spider/src/types.ts`

```typescript
import type { ZodSchema } from 'zod';

export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';

export interface BlockRecord {
  /** Block type identifier (matches a registered BlockType.id). */
  type: string;
  /** Structured condition payload — shape validated by the block type's conditionSchema. */
  condition: unknown;
  /** ISO timestamp when the engine was blocked. */
  blockedAt: string;
  /** Optional human-readable message from the engine. */
  message?: string;
  /** ISO timestamp of the last checker evaluation. Updated on every check cycle. */
  lastCheckedAt?: string;
}

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
  /** Present when status === 'blocked'. Cleared when the block is resolved. */
  block?: BlockRecord;
}

export type RigStatus = 'running' | 'completed' | 'failed' | 'blocked';

export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'engine-blocked'; rigId: string; engineId: string; blockType: string }
  | { action: 'engine-unblocked'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
  | { action: 'rig-blocked'; rigId: string; writId: string };

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

export interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
  show(id: string): Promise<RigDoc>;
  list(filters?: RigFilters): Promise<RigDoc[]>;
  forWrit(writId: string): Promise<RigDoc | null>;
  /** Manually clear a block on a specific engine, regardless of checker. */
  resume(rigId: string, engineId: string): Promise<void>;
  /** Look up a registered block type by ID. */
  getBlockType(id: string): BlockType | undefined;
}
```

#### `packages/plugins/fabricator/src/fabricator.ts` — `EngineRunContext`

```typescript
import type { BlockRecord } from '@shardworks/spider-apparatus';

export interface EngineRunContext {
  engineId: string;
  upstream: Record<string, unknown>;
  /** Present when this engine was previously blocked and has been restarted. Advisory — do not depend on for correctness. */
  priorBlock?: BlockRecord;
}
```

Note: This creates a type-level import from spider-apparatus into fabricator-apparatus. If this introduces a circular dependency (spider depends on fabricator, fabricator imports a type from spider), the `BlockRecord` interface must instead be duplicated in fabricator or moved to a shared types package. Check the package dependency graph at build time. If circular, define `BlockRecord` inline in the `EngineRunContext` type:

```typescript
export interface EngineRunContext {
  engineId: string;
  upstream: Record<string, unknown>;
  priorBlock?: {
    type: string;
    condition: unknown;
    blockedAt: string;
    message?: string;
    lastCheckedAt?: string;
  };
}
```

This avoids the cross-package import while maintaining the same shape. The Spider populates this field from its own `BlockRecord` value.

### Behavior

#### Block Type Registry (`packages/plugins/spider/src/spider.ts`)

**Type guard:**

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

Checks `id` (string) and `check` (function) — the two required fields. Mirrors `isEngineDesign()`.

**BlockTypeRegistry class:**

Follow the exact same pattern as `EngineRegistry` in `packages/plugins/fabricator/src/fabricator.ts`:

```typescript
class BlockTypeRegistry {
  private readonly types = new Map<string, BlockType>();

  register(plugin: LoadedPlugin): void {
    if (isLoadedKit(plugin)) {
      this.registerFromKit(plugin.kit);
    } else if (isLoadedApparatus(plugin)) {
      if (plugin.apparatus.supportKit) {
        this.registerFromKit(plugin.apparatus.supportKit);
      }
    }
  }

  private registerFromKit(kit: Record<string, unknown>): void {
    const raw = kit.blockTypes;
    if (typeof raw !== 'object' || raw === null) return;
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (isBlockType(value)) {
        this.types.set(value.id, value);
      }
    }
  }

  get(id: string): BlockType | undefined {
    return this.types.get(id);
  }
}
```

**Wiring in `createSpider()`:**

1. Instantiate `const blockTypeRegistry = new BlockTypeRegistry()` alongside existing variables.
2. Add `consumes: ['blockTypes']` to the apparatus definition (alongside existing `requires`).
3. In `start()`, scan all loaded kits: `for (const kit of g.kits()) { blockTypeRegistry.register(kit); }`.
4. Subscribe to `plugin:initialized` for late-loading apparatus: `ctx.on('plugin:initialized', (plugin) => { if (isLoadedApparatus(plugin)) blockTypeRegistry.register(plugin); })`.
5. Wire `getBlockType` on the API object: `getBlockType(id) { return blockTypeRegistry.get(id); }`.

**Built-in block types in `supportKit`:**

Add `blockTypes` to the existing `supportKit` object in the apparatus definition:

```typescript
supportKit: {
  books: { ... },
  engines: { ... },
  tools: [ ... ],
  blockTypes: {
    'writ-status': writStatusBlockType,
    'scheduled-time': scheduledTimeBlockType,
    'book-updated': bookUpdatedBlockType,
  },
},
```

The Spider's own `supportKit.blockTypes` are scanned during startup, same as its engines.

#### Engine Blocked Result Handling (`tryRun()`)

When `design.run()` returns `{ status: 'blocked', blockType, condition, message? }`:

1. **Look up the block type** via `blockTypeRegistry.get(blockType)`. If not found, call `failEngine(rig, pending.id, 'Unknown block type: "blockType"')` and return `{ action: 'rig-completed', rigId, writId, outcome: 'failed' }`.

2. **Validate condition** by calling `blockType.conditionSchema.parse(condition)` in a try/catch. On Zod error, call `failEngine(rig, pending.id, 'Block type "blockType" rejected condition: <ZodError formatted message>')` and return `{ action: 'rig-completed', ... outcome: 'failed' }`.

3. **Persist block record.** Build a `BlockRecord`: `{ type: blockType, condition, blockedAt: new Date().toISOString(), message }`. Patch the rig's engines array: set the engine to `status: 'blocked'` with `block: blockRecord`.

4. **Check rig-blocked.** Call `isRigBlocked(updatedEngines)`. If true, also set `rig.status = 'blocked'` in the same patch.

5. **Return CrawlResult.** If rig became blocked: `{ action: 'rig-blocked', rigId, writId }`. Otherwise: `{ action: 'engine-blocked', rigId, engineId, blockType }`.

This goes in `tryRun()` as a new branch after checking for `'launched'` and before handling `'completed'`:

```
if (engineResult.status === 'launched') { ... }
else if (engineResult.status === 'blocked') { ... }  // NEW
else { /* completed */ ... }
```

#### `isRigBlocked` Helper

```typescript
function isRigBlocked(engines: EngineInstance[]): boolean {
  const hasRunning = engines.some((e) => e.status === 'running');
  if (hasRunning) return false;
  const hasBlocked = engines.some((e) => e.status === 'blocked');
  if (!hasBlocked) return false;
  return findRunnableEngine({ engines } as RigDoc) === null;
}
```

Condition: no engine `running`, no engine runnable (pending with all upstream completed), at least one engine `blocked`. `findRunnableEngine` already encodes the "runnable" check.

**Call sites:**

- `tryRun()` — after engine transitions to `blocked`, call `isRigBlocked()` to determine whether rig enters `blocked`.
- `tryCollect()` — after a running engine completes, check `isRigBlocked()` on remaining engines. If true, set rig to `blocked` instead of leaving at `running`.
- `tryCheckBlocked()` — after unblocking an engine, the rig should be restored to `running` (this is always done, since blocked rigs don't have runnable engines by definition).

**`tryCollect()` modification:** After an engine is collected as `completed`, the existing code checks `allCompleted`. Add an additional branch: if not all completed, check `isRigBlocked(updatedEngines)`. If true, set rig status to `blocked` and return `{ action: 'rig-blocked', rigId, writId }`.

#### `tryCheckBlocked()` — New Crawl Phase

```typescript
async function tryCheckBlocked(): Promise<CrawlResult | null> {
  const rigs = await rigsBook.find({
    where: [['status', 'in', ['running', 'blocked']]],
  });

  for (const rig of rigs) {
    for (const engine of rig.engines) {
      if (engine.status !== 'blocked' || !engine.block) continue;

      const blockType = blockTypeRegistry.get(engine.block.type);
      if (!blockType) continue; // Type was unregistered after block was created; skip

      // Poll interval throttle
      if (blockType.pollIntervalMs && engine.block.lastCheckedAt) {
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
        // Update lastCheckedAt
        const now = new Date().toISOString();
        const updatedEngines = rig.engines.map((e) =>
          e.id === engine.id
            ? { ...e, block: { ...e.block!, lastCheckedAt: now } }
            : e,
        );
        await rigsBook.patch(rig.id, { engines: updatedEngines });
        return null; // One action per crawl — wrote lastCheckedAt
      }

      // Cleared — store block record in memory for priorBlock, then transition
      const priorBlockRecord = engine.block;
      pendingPriorBlocks.set(`${rig.id}:${engine.id}`, priorBlockRecord);

      const updatedEngines = rig.engines.map((e) =>
        e.id === engine.id
          ? { ...e, status: 'pending' as const, block: undefined }
          : e,
      );

      // Restore rig to running if it was blocked
      const rigStatus = rig.status === 'blocked' ? 'running' : rig.status;

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

**In-memory prior block storage:** Add a `Map<string, BlockRecord>` at module scope inside `createSpider()`:

```typescript
const pendingPriorBlocks = new Map<string, BlockRecord>();
```

Key format: `"rigId:engineId"`. Written when an engine is unblocked (via checker or `resume()`). Read and deleted in `tryRun()` when building `EngineRunContext`.

**Crawl loop integration:**

```typescript
async crawl(): Promise<CrawlResult | null> {
  const collected = await tryCollect();
  if (collected) return collected;

  const checked = await tryCheckBlocked();
  if (checked) return checked;

  const ran = await tryRun();
  if (ran) return ran;

  const spawned = await trySpawn();
  if (spawned) return spawned;

  return null;
},
```

**`tryCheckBlocked` and the one-action-per-crawl model:** When `lastCheckedAt` is written (checker returns false), return `null` — this is a bookkeeping write, not an action. Only unblocking returns a `CrawlResult`. When no engines need checking this cycle, return `null` to fall through to `tryRun`.

Wait — re-reading the current crawl model: each phase returns on the first action found (one action per crawl). `tryCheckBlocked` should follow the same pattern: iterate until it finds a checkable engine, evaluate it, and return. If the checker returns false, update lastCheckedAt and continue to the next checkable engine (the lastCheckedAt write is bookkeeping, not an action). If the checker returns true, unblock and return the CrawlResult. If all checkable engines return false (or no engines are checkable), return null.

Revised behavior for the `!cleared` branch:

```typescript
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
```

#### `failEngine()` Modification

Change the cancellation predicate:

```typescript
// Before:
if (e.status === 'pending') {
  return { ...e, status: 'cancelled' as const };
}

// After:
if (e.status === 'pending' || e.status === 'blocked') {
  return { ...e, status: 'cancelled' as const, block: undefined };
}
```

Clear the `block` field when cancelling a blocked engine.

#### `resume()` Implementation

```typescript
async resume(rigId: string, engineId: string): Promise<void> {
  const rig = await api.show(rigId); // Throws if not found
  const engine = rig.engines.find((e) => e.id === engineId);
  if (!engine) {
    throw new Error(`Engine "${engineId}" not found in rig "${rigId}".`);
  }
  if (engine.status !== 'blocked') {
    throw new Error(
      `Engine "${engineId}" in rig "${rigId}" is not blocked (status: ${engine.status}).`,
    );
  }

  // Store prior block for priorBlock context
  if (engine.block) {
    pendingPriorBlocks.set(`${rigId}:${engineId}`, engine.block);
  }

  const updatedEngines = rig.engines.map((e) =>
    e.id === engineId
      ? { ...e, status: 'pending' as const, block: undefined }
      : e,
  );

  const rigStatus = rig.status === 'blocked' ? 'running' : rig.status;

  await rigsBook.patch(rigId, {
    engines: updatedEngines,
    status: rigStatus,
  });
},
```

#### Prior Block Context in `tryRun()`

When building the `EngineRunContext` for a pending engine about to run, check for a stored prior block:

```typescript
const priorBlockKey = `${rig.id}:${pending.id}`;
const priorBlock = pendingPriorBlocks.get(priorBlockKey);
if (priorBlock) pendingPriorBlocks.delete(priorBlockKey);

const context = { engineId: pending.id, upstream, ...(priorBlock ? { priorBlock } : {}) };
```

#### Built-in Block Types

Implement in new files under `packages/plugins/spider/src/block-types/`:

**`packages/plugins/spider/src/block-types/writ-status.ts`**

```typescript
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { BlockType } from '../types.ts';

const conditionSchema = z.object({
  writId: z.string(),
  targetStatus: z.string(),
});

const writStatusBlockType: BlockType = {
  id: 'writ-status',
  conditionSchema,
  pollIntervalMs: 10_000,
  async check(condition: unknown): Promise<boolean> {
    const { writId, targetStatus } = condition as z.infer<typeof conditionSchema>;
    const stacks = guild().apparatus<StacksApi>('stacks');
    const writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
    const results = await writsBook.find({ where: [['id', '=', writId]], limit: 1 });
    if (results.length === 0) return false;
    return results[0].status === targetStatus;
  },
};

export default writStatusBlockType;
```

**`packages/plugins/spider/src/block-types/scheduled-time.ts`**

```typescript
import { z } from 'zod';
import type { BlockType } from '../types.ts';

const conditionSchema = z.object({
  resumeAt: z.string(),
});

const scheduledTimeBlockType: BlockType = {
  id: 'scheduled-time',
  conditionSchema,
  pollIntervalMs: 30_000,
  async check(condition: unknown): Promise<boolean> {
    const { resumeAt } = condition as z.infer<typeof conditionSchema>;
    return Date.now() >= Date.parse(resumeAt);
  },
};

export default scheduledTimeBlockType;
```

**`packages/plugins/spider/src/block-types/book-updated.ts`**

```typescript
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import type { BlockType } from '../types.ts';

const conditionSchema = z.object({
  ownerId: z.string(),
  book: z.string(),
  documentId: z.string().optional(),
});

const bookUpdatedBlockType: BlockType = {
  id: 'book-updated',
  conditionSchema,
  pollIntervalMs: 10_000,
  async check(condition: unknown): Promise<boolean> {
    const { ownerId, book, documentId } = condition as z.infer<typeof conditionSchema>;
    const stacks = guild().apparatus<StacksApi>('stacks');
    const targetBook = stacks.readBook(ownerId, book);
    if (documentId) {
      // Per-document: check if the document exists (engine should include comparison data)
      const doc = await targetBook.get(documentId);
      return doc !== null && doc !== undefined;
    }
    // Per-book: check if any documents exist
    const docs = await targetBook.find({ limit: 1 });
    return docs.length > 0;
  },
};

export default bookUpdatedBlockType;
```

**`packages/plugins/spider/src/block-types/index.ts`**

```typescript
export { default as writStatusBlockType } from './writ-status.ts';
export { default as scheduledTimeBlockType } from './scheduled-time.ts';
export { default as bookUpdatedBlockType } from './book-updated.ts';
```

#### `rig-resume` Tool

**`packages/plugins/spider/src/tools/rig-resume.ts`**

```typescript
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'rig-resume',
  description: 'Manually clear a block on a specific engine, regardless of checker result',
  instructions:
    'Clears the block on the specified engine and transitions it back to pending. ' +
    'The engine will be picked up on the next crawl cycle. ' +
    'Throws if the engine is not in blocked status.',
  params: {
    rigId: z.string().describe('The rig id.'),
    engineId: z.string().describe('The engine id within the rig.'),
  },
  permission: 'spider:write',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    await spider.resume(params.rigId, params.engineId);
    return { ok: true };
  },
});
```

#### `rig-list` Status Enum Update

In `packages/plugins/spider/src/tools/rig-list.ts`, change:

```typescript
// Before:
z.enum(['running', 'completed', 'failed'])

// After:
z.enum(['running', 'completed', 'failed', 'blocked'])
```

#### `rig-show` Instructions Update

In `packages/plugins/spider/src/tools/rig-show.ts`, change:

```typescript
// Before:
instructions: 'Returns the full RigDoc for the given rig id. Throws if the rig does not exist.',

// After:
instructions:
  'Returns the full RigDoc for the given rig id. Throws if the rig does not exist. ' +
  'Blocked engines include a block record with type, condition, blockedAt, and lastCheckedAt timestamps.',
```

#### Tools Barrel Export Update

In `packages/plugins/spider/src/tools/index.ts`, add:

```typescript
export { default as rigResumeTool } from './rig-resume.ts';
```

#### Spider supportKit Tools Array Update

In `packages/plugins/spider/src/spider.ts`, add `rigResumeTool` to the import and `tools` array:

```typescript
import { crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool, rigResumeTool } from './tools/index.ts';

// ...
tools: [crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool, rigResumeTool],
```

#### Spider Index Re-exports

In `packages/plugins/spider/src/index.ts`, add:

```typescript
export type {
  // ... existing exports ...
  BlockRecord,
  BlockType,
} from './types.ts';
```

### Non-obvious Touchpoints

1. **Circular dependency risk with `priorBlock` on `EngineRunContext`.** `EngineRunContext` lives in `fabricator-apparatus`. `BlockRecord` lives in `spider-apparatus`. Spider depends on Fabricator, so Fabricator cannot import from Spider. The spec provides an inline type alternative in the Type Changes section — use it if the build detects a circular import. The Fabricator does not need to import `BlockRecord` by name; the shape can be defined inline.

2. **Spider's `consumes` field.** The Spider apparatus currently has no `consumes`. Adding `consumes: ['blockTypes']` tells the plugin system that Spider scans this contribution field. If `consumes` is not supported alongside `requires` in the apparatus definition shape, the scanning can proceed without it — the `blockTypes` field is read generically from kit records. Verify by checking how Fabricator uses `consumes: ['engines']`.

3. **`findRunnableEngine` is a module-level function** (not a method on any class). `isRigBlocked` uses it, so `isRigBlocked` must be defined at the same scope. Both take `RigDoc` (or a subset). Place `isRigBlocked` adjacent to `findRunnableEngine`.

4. **Stacks `in` operator.** `tryCheckBlocked` uses `['status', 'in', ['running', 'blocked']]`. Verify that the Stacks `find` API supports the `in` operator for `WhereClause`. If not, use two separate queries: one for `running` and one for `blocked`, and concatenate results.

### Dependencies

The `EngineRunContext.priorBlock` field creates a type-level dependency from fabricator-apparatus to the `BlockRecord` shape. As noted in Type Changes, if this creates a circular package dependency, define the type inline in fabricator-apparatus rather than importing from spider-apparatus. This is a minimum enabling change, not scope expansion.

## Validation Checklist

- V1 [R1]: Create an engine design that returns `{ status: 'blocked', blockType: 'test-type', condition: { key: 'value' } }`. Run it via `crawl()`. Verify the engine transitions to `blocked` status.

- V2 [R2, R3]: After V1, call `spider.show(rigId)` and verify the engine has `status: 'blocked'` and `block` field with `{ type: 'test-type', condition: { key: 'value' }, blockedAt: <ISO string> }`.

- V3 [R4, R5, R6]: Register a block type via supportKit `blockTypes` field. Call `spider.getBlockType('test-type')` and verify it returns the registered `BlockType` object.

- V4 [R7, R8]: Block an engine with a block type that has `pollIntervalMs: 60000`. Call `crawl()` immediately — verify the checker is NOT called (poll interval not elapsed). Advance time (or set `lastCheckedAt` to the past), call `crawl()` again — verify the checker IS called.

- V5 [R9, R20]: Register a block type whose checker returns `true`. Block an engine, then `crawl()`. Verify the engine returns to `pending`, `block` field is cleared from EngineInstance. On next `crawl()` when the engine runs again, verify `context.priorBlock` contains the previous block record.

- V6 [R10]: Register a block type whose checker returns `false`. Block an engine, ensure `lastCheckedAt` is null. Call `crawl()`. Verify `block.lastCheckedAt` is now set on the persisted engine.

- V7 [R11]: Register a block type whose checker throws. Block an engine. Call `crawl()`. Verify the engine remains `blocked` (not failed).

- V8 [R12, R13]: Create a rig with two engines: A (no upstream) and B (upstream: A). A returns blocked. Verify rig status becomes `blocked` (no running engines, no runnable engines, one blocked engine).

- V9 [R14]: With a blocked rig from V8, register a checker that returns `true`. Call `crawl()`. Verify rig status is restored to `running`.

- V10 [R15]: Block engine A in a two-engine rig where B depends on A. Verify `crawl()` returns `{ action: 'rig-blocked', rigId, writId }` (escalation — not `engine-blocked`).

- V11 [R15]: Block engine A in a rig where engine B is still `running`. Verify `crawl()` returns `{ action: 'engine-blocked', rigId, engineId, blockType }` (rig is still running, no escalation).

- V12 [R16, R17]: Block an engine. Call `spider.resume(rigId, engineId)`. Verify engine returns to `pending`, block is cleared. Call `resume()` again on the now-pending engine — verify it throws with the expected error message.

- V13 [R18]: Call `spider.list({ status: 'blocked' })` on a rig with `blocked` status. Verify it returns the blocked rig. Verify rig-list tool's status param accepts `'blocked'`.

- V14 [R19]: Verify rig-show tool's `instructions` text mentions blocked engines and block metadata.

- V15 [R21]: In a rig with engine A (blocked) and engine B (pending), fail a different engine C. Verify both A (blocked → cancelled) and B (pending → cancelled) are cancelled.

- V16 [R22, R23]: Block an engine with `blockType: 'writ-status'`, `condition: { writId: 'w1', targetStatus: 'completed' }`. Verify the block is persisted. Transition writ w1 to completed. Call `crawl()`. Verify the engine is unblocked.

- V17 [R24]: Block an engine with `blockType: 'scheduled-time'`, `condition: { resumeAt: <past ISO timestamp> }`. Call `crawl()`. Verify the engine is unblocked.

- V18 [R25]: Block an engine with `blockType: 'book-updated'`, `condition: { ownerId: 'test', book: 'data' }`. Write a document to that book. Call `crawl()`. Verify the engine is unblocked.

- V19 [R26]: Return `{ status: 'blocked', blockType: 'nonexistent', condition: {} }` from an engine. Verify the engine is failed with message containing `'Unknown block type: "nonexistent"'`.

- V20 [R27]: Return `{ status: 'blocked', blockType: 'writ-status', condition: { bad: 'shape' } }` from an engine. Verify the engine is failed with message containing `'Block type "writ-status" rejected condition'` and Zod error details.

- V21 [R28]: Verify `BlockRecord` and `BlockType` are importable from `@shardworks/spider-apparatus` (check index.ts re-exports).

- V22 [R29]: Block a rig (status → `blocked`). Verify the CDC handler does NOT call `clerk.transition()` — only `completed` and `failed` trigger writ transitions.

## Test Cases

**Engine returns blocked result → engine enters blocked status:**
Engine design returns `{ status: 'blocked', blockType: 'test-block', condition: { x: 1 }, message: 'waiting' }`. After crawl, engine has `status: 'blocked'`, `block.type === 'test-block'`, `block.condition === { x: 1 }`, `block.message === 'waiting'`, `block.blockedAt` is an ISO string.

**Unregistered block type → immediate engine failure:**
Engine returns `{ status: 'blocked', blockType: 'does-not-exist', condition: {} }`. After crawl, engine has `status: 'failed'`, `error` contains `'Unknown block type'`. Rig is failed.

**Zod validation failure → immediate engine failure:**
Register block type `test-strict` with `conditionSchema: z.object({ required: z.string() })`. Engine returns `{ status: 'blocked', blockType: 'test-strict', condition: { wrong: 123 } }`. After crawl, engine is failed, error contains Zod validation details.

**Checker clears block → engine returns to pending:**
Register block type with controllable checker (starts returning false, then true). Block engine. First crawl: engine stays blocked. Set checker to return true. Next crawl: engine returns to pending, block field cleared.

**Checker throws → engine stays blocked (no failure):**
Register block type whose checker throws `new Error('network error')`. Block engine. Crawl. Verify engine still blocked, not failed.

**Poll interval respected:**
Register block type with `pollIntervalMs: 60000`. Block engine. Crawl immediately — checker should not be called. Manually set `block.lastCheckedAt` to 61 seconds ago. Crawl — checker should be called.

**Rig transitions to blocked when all progress stalled:**
Rig with engines A → B. A blocks. No engines running, B is pending but upstream (A) not completed. Verify rig status is `blocked`.

**Rig stays running when some engines still active:**
Rig with engines A, B (independent). A blocks, B is running. Verify rig status remains `running`.

**Rig restored to running on unblock:**
Blocked rig. Checker returns true. After crawl, rig status is `running`.

**resume() clears block manually:**
Blocked engine. Call `resume(rigId, engineId)`. Engine is pending, block cleared, rig is running.

**resume() on non-blocked engine throws:**
Engine is `pending`. Call `resume()`. Verify error: `'Engine "X" in rig "Y" is not blocked (status: pending)'`.

**Prior block context on restart:**
Block engine, unblock via checker. On next crawl when engine runs, verify `context.priorBlock` matches the previous block record. On a second run (no prior block), verify `context.priorBlock` is undefined.

**failEngine cancels blocked engines:**
Rig with A (blocked), B (pending), C (running). C fails. Verify A is cancelled (not left blocked), B is cancelled.

**CrawlResult escalation — engine-blocked causes rig-blocked:**
Single-engine rig. Engine blocks. Verify crawl returns `{ action: 'rig-blocked' }`, not `engine-blocked`.

**CrawlResult — engine-blocked without rig-blocked:**
Two independent engines. One blocks, other is running. Verify crawl returns `{ action: 'engine-blocked' }`.

**CrawlResult — engine-unblocked:**
Blocked engine, checker returns true. Verify crawl returns `{ action: 'engine-unblocked' }`.

**lastCheckedAt persisted when checker returns false:**
Block engine. Crawl (checker returns false). Verify `block.lastCheckedAt` is set in Stacks.

**CDC handler ignores blocked status:**
Patch rig status to `blocked`. Verify CDC handler does NOT call `clerk.transition()`.

**rig-list filters by blocked:**
Create a blocked rig. Call `list({ status: 'blocked' })`. Verify it appears. Call `list({ status: 'running' })`. Verify it does not appear.

**Built-in writ-status block type:**
Block with `writ-status`, condition `{ writId, targetStatus: 'completed' }`. Writ is not completed → checker returns false. Transition writ to completed → checker returns true.

**Built-in scheduled-time block type:**
Block with `scheduled-time`, condition `{ resumeAt: <future> }` → checker returns false. Condition `{ resumeAt: <past> }` → checker returns true.

**Built-in book-updated block type:**
Block with `book-updated`, condition `{ ownerId, book }`. Book is empty → checker returns false. Put a document in the book → checker returns true.
