# Inventory: Implement Ability to Block Engines on External Conditions

Slug: `implement-ability-to-pause-rigs`  
Brief: Add a `blocked` engine/rig state, block type registry, condition checkers, and operator surface for clearing blocks.

---

## Affected Files

### Files to Modify

**`packages/plugins/fabricator/src/fabricator.ts`**  
Owns `EngineDesign`, `EngineRunResult`, `EngineRunContext`, `FabricatorApi`, `EngineRegistry`.  
Must add:
- New `EngineRunResult` variant: `{ status: 'blocked'; blockType: string; condition: unknown }`
- New `BlockTypeDesign` interface (checker function, condition schema, suggested poll interval)
- New `BlockTypeRegistry` class (parallel to `EngineRegistry`)
- `FabricatorApi.getBlockTypeDesign(id)` method
- Kit scanning logic for `blockTypes` field (parallel to `engines` scanning)

**`packages/plugins/fabricator/src/index.ts`**  
Re-exports public types. Must add exports for `BlockTypeDesign` and updated `EngineRunResult`.

**`packages/plugins/spider/src/types.ts`**  
Owns all public Spider types. Must change:
- `EngineStatus`: add `'blocked'`
- `RigStatus`: add `'blocked'`
- `EngineInstance`: add `block?` field (block record when engine is blocked)
- New `BlockRecord` type: `{ type: string; condition: unknown; blockedAt: string }`
- `CrawlResult`: add `engine-blocked`, `engine-unblocked`, `rig-blocked`, `rig-unblocked` variants
- `SpiderApi`: add `resume(rigId, engineId)` method (manual block clear)
- `SpiderConfig`: possibly add `blockCheckIntervalMs` or leave block types' own poll hints
- `EngineRunContext`: add `priorBlock?` field so restarted engines know their prior block

**`packages/plugins/spider/src/spider.ts`**  
Core crawl logic. Must change:
- Add Phase 0 (or Phase 1.5): `tryCheckBlocked()` — iterates blocked engines, runs checkers via Fabricator, transitions cleared engines back to `pending`
- `tryRun()`: handle `{ status: 'blocked' }` result — validate block type, store block record, set engine to `blocked` status; also update rig status to `blocked` if all forward progress is blocked
- `findRunnableEngine()`: must skip `blocked` engines (they are not `pending` in the ordinary sense until unblocked)
- `buildUpstreamMap()`: no change needed (blocked engines have no yields yet)
- `failEngine()`: currently cancels `pending` engines — must also cancel engines that were `blocked` (since they won't unblock if the rig fails)
- CDC handler: must handle `blocked` rig status (do NOT transition writ to failed/completed on `blocked` status)
- `api` object: add `resume()` implementation
- `start()`: wire up the Fabricator for block type lookups

**`packages/plugins/spider/src/tools/rig-list.ts`**  
The `status` param enum `['running', 'completed', 'failed']` must add `'blocked'`.

**`packages/plugins/spider/src/tools/rig-show.ts`**  
No structural change needed — the tool returns the full `RigDoc` which will naturally include `block` fields on engine instances. Doc/instruction text update optional.

**`packages/plugins/spider/src/tools/index.ts`**  
Must export the new `rig-resume` tool.

**`packages/plugins/spider/src/spider.test.ts`**  
Extensive test file (23K tokens). Must add test coverage for:
- Engine returning `blocked` result → engine enters `blocked` status
- Block type validation failure → immediate engine failure
- Blocked engine's block record stored on `EngineInstance`
- Rig transitions to `blocked` when all forward progress blocked
- `tryCheckBlocked()` finding a cleared condition → engine returns to `pending`
- `tryCheckBlocked()` with checker returning false → engine stays blocked
- Checker throwing → error handling (log and skip? or fail engine?)
- Manual `resume()` clearing a block
- `rig-list` filter on `blocked` status
- Prior block context passed to restarted engine

### Files to Create

**`packages/plugins/spider/src/tools/rig-resume.ts`**  
New tool. Calls `spider.resume(rigId, engineId)` to manually clear a block on a specific engine, regardless of checker result.

### Files Likely Unchanged (but review)

- `packages/plugins/spider/src/engines/draft.ts` — no blocked return, no change
- `packages/plugins/spider/src/engines/implement.ts` — no change unless we want a reference blocked engine
- `packages/plugins/spider/src/engines/review.ts` — no change
- `packages/plugins/spider/src/engines/seal.ts` — no change
- `packages/plugins/spider/src/engines/revise.ts` — no change
- `packages/plugins/spider/src/engines/index.ts` — no change
- `packages/plugins/fabricator/src/fabricator.test.ts` — may need new tests
- `packages/plugins/clerk/src/types.ts` — no change (writ statuses unaffected)

---

## Current Type Signatures (Verbatim)

### `packages/plugins/spider/src/types.ts`

```typescript
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

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

export type RigStatus = 'running' | 'completed' | 'failed';

export interface RigDoc {
  [key: string]: unknown;
  id: string;
  writId: string;
  status: RigStatus;
  engines: EngineInstance[];
  createdAt: string;
}

export interface RigFilters {
  status?: RigStatus;
  limit?: number;
  offset?: number;
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

export interface SpiderConfig {
  role?: string;
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
}
```

### `packages/plugins/fabricator/src/fabricator.ts`

```typescript
export interface EngineRunContext {
  engineId: string;
  upstream: Record<string, unknown>;
}

export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string };

export interface EngineDesign {
  id: string;
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
  collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}

export interface FabricatorApi {
  getEngineDesign(id: string): EngineDesign | undefined;
}
```

---

## Spider Core Logic (Key Functions)

### `findRunnableEngine(rig: RigDoc): EngineInstance | null`
```typescript
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
```
This function only checks `pending` engines. After adding `blocked`, `blocked` engines must NOT appear here.

### `failEngine(rig, engineId, errorMessage)`
Currently cancels all `pending` engines and fails the rig. After adding `blocked`, `blocked` engines should also be cancelled when the rig fails.

### `tryRun()` — handling engine run results
```typescript
engineResult = await design.run(givens, context);

if (engineResult.status === 'launched') {
  // store sessionId, mark engine 'running'
  return { action: 'engine-started', ... };
}

// 'completed' case — store yields, advance engine
```
Must add a `'blocked'` branch here.

### `tryCollect()` — Phase 1 priority
Iterates `running` rigs, finds engine with `status === 'running' && sessionId`. Checks session terminal state.  
No structural change needed for the blocked path — a blocked engine has `status === 'blocked'`, not `running`, so `tryCollect()` won't touch it.

### `crawl()` call order
```typescript
const collected = await tryCollect();  // Phase 1
if (collected) return collected;

const ran = await tryRun();            // Phase 2
if (ran) return ran;

const spawned = await trySpawn();      // Phase 3
if (spawned) return spawned;

return null;
```
New `tryCheckBlocked()` phase needs to be inserted. Priority question: before or after collect/run? The brief says checking blocks is polling-based and happens on each crawl cycle. Most sensible: run it before or after collect but before run/spawn — blocked checks unblock engines, which then become runnable.

### CDC handler (rigs book Phase 1)
```typescript
if (rig.status === 'completed') { await clerk.transition(..., 'completed', ...) }
else if (rig.status === 'failed') { await clerk.transition(..., 'failed', ...) }
```
After adding `blocked`, the handler must NOT fire for `blocked` status — only `completed` and `failed` are terminal.

---

## Fabricator Engine Registry (Relevant Internals)

```typescript
class EngineRegistry {
  private readonly designs = new Map<string, EngineDesign>();
  register(plugin: LoadedPlugin): void { ... }  // scans plugin.apparatus.supportKit.engines
  private registerFromKit(kit: Record<string, unknown>): void { ... }
  get(id: string): EngineDesign | undefined { ... }
}
```

A parallel `BlockTypeRegistry` class would follow the same pattern, scanning `blockTypes` from kit/supportKit contributions. The Fabricator's `start()` already handles both initial kit scan and `plugin:initialized` events — block type scanning would piggyback the same hooks.

```typescript
// isEngineDesign type guard
function isEngineDesign(value: unknown): value is EngineDesign {
  return typeof value === 'object' && value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).run === 'function';
}
```
A parallel `isBlockTypeDesign()` guard needed.

---

## Tool Patterns

All existing tools follow this pattern:
```typescript
export default tool({
  name: 'tool-name',
  description: '...',
  instructions: '...',
  params: { ... },
  permission: 'read' | 'spider:write',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.method(...);
  },
});
```

The `rig-resume` tool would follow this exact pattern, calling `spider.resume(rigId, engineId)`. Permission should be `'spider:write'` (same as crawl tools — it mutates state).

---

## Stacks Book: `spider/rigs`

Current indexes: `['status', 'writId', ['status', 'writId'], 'createdAt']`

After adding `blocked` status to `RigStatus`, the query in `tryCheckBlocked()` would query `{ where: [['status', '=', 'blocked']] }`. The existing `status` index covers this. No schema change needed.

Query in `tryRun()` and `tryCollect()` both filter `where: [['status', '=', 'running']]` — these don't change.

---

## Adjacent Patterns

### How the existing `cancelled` status propagates
When `failEngine()` is called, pending downstream engines are marked `cancelled`. The same logic applies to blocked engines when a rig fails — blocked engines should also be cancelled, not left dangling.

### How `EngineStatus` is used in `buildUpstreamMap()`
```typescript
if (engine.status === 'completed' && engine.yields !== undefined) {
  upstream[engine.id] = engine.yields;
}
```
Blocked engines never reach completed, so they contribute nothing to upstream. No change needed here.

### How `allCompleted` check works in `tryRun()`
```typescript
const allCompleted = completedEngines.every((e) => e.status === 'completed');
```
After adding blocked/cancelled: `allCompleted` already returns false if any engine is `pending`, `running`, `cancelled`, or (new) `blocked`. The rig-completed logic is unaffected. BUT: the rig-blocked determination requires a different check — "all non-completed engines are either blocked or pending-with-blocked-upstream."

### How `rig-completed` is returned
Both `tryCollect()` and `tryRun()` check `allCompleted` and return `rig-completed` with `outcome: 'completed'`. The rig-blocked case needs a new check after an engine transitions to blocked.

---

## Rig-Level Blocked Logic

Determining when a rig is blocked (all forward progress blocked):

```
rig.blocked iff:
  - no engine has status 'running'
  - no engine has status 'pending' with all upstream completed
  - at least one engine has status 'blocked'
```

In other words: there are no runnable engines and no running engines, but there are blocked engines preventing completion. This check runs inside `tryRun()` when a new blocked engine causes the rig to have no more runnable work.

Similarly, `rig.running` resumes when any engine is unblocked (returned to `pending`).

---

## CrawlResult Priority Question

The brief says the crawl loop should emit block/unblock variants. Current priority: collect > run > spawn. Where does `tryCheckBlocked()` fit?

Options:
1. **Before collect** — unblocked engines become runnable immediately, but delays collecting completed sessions
2. **After collect, before run** — unblocked engines become runnable in same cycle their block clears; collect still prioritized
3. **After run, before spawn** — simplest: block checking is low-priority, done when nothing else to run

The brief says checking is "as a natural extension of its rig-tending responsibilities" — suggests it runs as part of the crawl loop at whatever priority makes sense. Option 2 (after collect, before run) seems most natural: the blocked check unblocks an engine, then run picks it up in the *next* crawl. This matches the "one unit of work per crawl" model.

---

## Test File Analysis

`packages/plugins/spider/src/spider.test.ts` (~500+ lines):
- Uses `buildFixture()` which wires in-memory Stacks + mock Animator + Clerk + Fabricator + Spider
- Custom engine designs are injected via `fire('plugin:initialized', fakePlugin)` pattern
- Mock Animator writes session records immediately to the sessions book
- Tests use `setSessionOutcome()` to control what session results the mock produces
- Engine designs contributed via `apparatus.supportKit.engines`
- Pattern for test engines:
  ```typescript
  const badEngine: EngineDesign = {
    id: 'bad-engine',
    async run() { return { status: 'completed', yields: { fn: (() => {}) as any } }; },
  };
  ```
- For blocked engine tests, would need an engine that returns `{ status: 'blocked', blockType: 'test-condition', condition: { ... } }` and a registered block type with a controllable checker.

---

## Built-in Block Types (per brief)

The brief says: "Built-in block types should ship with the framework for common cases: book updates, writ status, scheduled time, and at least one external-system example."

These would be contributed by the Spider's support kit (or a new `block-types` kit) and registered via the `blockTypes` kit field. Each is a `BlockTypeDesign`:

1. **`book-updated`** — checker watches for changes to a specific book/document
2. **`writ-status`** — checker polls for a writ reaching a target status
3. **`scheduled-time`** — checker evaluates `Date.now() >= condition.resumeAt`
4. **`github-workflow`** — calls GitHub API to check workflow run status (example external system)

Where to contribute these is a design decision (in Spider's support kit? separate package?). The brief doesn't specify a package boundary. The Spider support kit is the natural home for built-in types since the Spider already contributes engines there.

---

## `EngineRunContext` Extension

When an engine is restarted after being unblocked, it needs context about the prior block. The current `EngineRunContext`:
```typescript
export interface EngineRunContext {
  engineId: string;
  upstream: Record<string, unknown>;
}
```
Must add `priorBlock?: BlockRecord` — populated by the Spider when an engine restarts after a block. The Spider reads this from the engine's `block` field before clearing it.

---

## `SpiderApi.resume()` Shape

The brief calls it `rig-resume` (the tool name) with "manual override — an operator can clear a block regardless of the checker, for any block type."

The API method could be:
```typescript
resume(rigId: string, engineId: string): Promise<void>
```
This would transition the engine from `blocked` back to `pending`. The rig would also transition back to `running` (since it now has a runnable engine).

---

## CDC / Event-Driven Unblocking (Optional Optimization)

The brief mentions: "For internal conditions (book updates, writ status changes), the system can use CDC/events to clear blocks immediately rather than waiting for the next poll tick. But polling is the baseline mechanism — events are an optimization layered on top."

This suggests: Phase 1 is polling-based (every crawl cycle). An optional Phase 2 might have specific block type implementations register CDC watchers on the Stacks that proactively trigger re-checking when a relevant book changes. This is an optimization not a requirement for MVP.

The inventory notes this exists as a described future optimization but is out of scope for the initial implementation.

---

## Doc/Code Discrepancies

1. **`docs/architecture/apparatus/spider.md` tool list:** Docs say `supportKit.tools: [crawlOneTool, crawlContinualTool]` but actual code includes `[crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool]` — three additional tools undocumented.

2. **`docs/guides/building-engines.md`:** This guide describes a completely different engine concept — Clockworks handlers registered via `nexus-engine.json` and standing orders. This is NOT the same as `EngineDesign` objects registered with the Fabricator. The terminology collision is significant. The guide appears to document a pre-apparatus architecture or a parallel system not reflected in the current `spider`/`fabricator` apparatus code. No Clockworks apparatus or `clockworks.ts` file exists in the current codebase's packages.

3. **`docs/architecture/apparatus/spider.md` static graph:** Docs describe `yields: null` as initial value on EngineInstances, but actual code uses `yields?: unknown` (optional field, not set at spawn time).

4. **`docs/architecture/apparatus/spider.md` CDC handler resolution:** Doc shows `sealYields.sealedCommit` etc. in resolution string, but actual code uses `JSON.stringify(sealEngine.yields)` — less structured.

---

## Package Dependency Graph

```
@shardworks/spider-apparatus
  → @shardworks/fabricator-apparatus  (engine design lookup)
  → @shardworks/stacks-apparatus      (rigs book, sessions read, writs read, CDC)
  → @shardworks/clerk-apparatus       (writ transitions)
  → @shardworks/animator-apparatus    (session docs type)
  → @shardworks/tools-apparatus       (tool() factory)
  → @shardworks/codexes-apparatus     (draft/seal engines use this)
  → @shardworks/nexus-core            (guild(), generateId, etc.)

@shardworks/fabricator-apparatus
  → @shardworks/nexus-core            (LoadedPlugin, guild, etc.)
```

Block type checkers (added to Fabricator) have no new package dependencies — they run within the Fabricator's already-loaded context. Individual block type implementations may need apparatus dependencies (e.g., the `book-updated` checker would use Stacks, `github-workflow` would use `node:https`), accessed via `guild()` in the checker function body.

---

## Existing Tests Structure

`packages/plugins/spider/src/spider.test.ts` test sections:
- "Fabricator — Spider engine registration"
- "walk() — idle"
- "walk() — spawn"
- "walk() — priority ordering: collect > run > spawn"
- "engine readiness — upstream must complete first"
- "implement engine execution"
- "yield serialization failure"
- "implement engine — Animator integration"
- "quick engine — collect"
- (more sections likely below line 750, not read)

New test sections needed:
- "blocked engine — engine returns blocked result"
- "blocked engine — block type validation"
- "blocked engine — rig transitions to blocked"
- "blocked engine — condition checker clears block"
- "blocked engine — rig resumes when unblocked"
- "blocked engine — resume() tool clears block manually"
- "blocked engine — prior block context on restart"
- "blocked engine — failure cancels blocked engines"

`packages/plugins/fabricator/src/fabricator.test.ts` — not read but exists; would need block type design tests.
