# Inventory: Add Retry, Branching, Looping Support to Rigs

## Brief

"Add retry, branching, looping support to rigs"

---

## Codebase Map

### Directly Affected Files

#### `packages/plugins/spider/src/types.ts`
Primary type definitions for the rig system. Everything the change touches is here.

Current `RigTemplateEngine` (no condition/loop support):
```typescript
export interface RigTemplateEngine {
  id: string;
  designId: string;
  upstream?: string[];
  givens?: Record<string, unknown>;
  // NO: when/condition, loop, maxIterations
}
```

Current `RigTemplate`:
```typescript
export interface RigTemplate {
  engines: RigTemplateEngine[];
  resolutionEngine?: string;
  // NO: loop-level constructs
}
```

Current `EngineInstance` (no loop/iteration tracking):
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
  block?: BlockRecord;
  // NO: iterationCount, loopId, conditionResult
}
```

Current `RigDoc`:
```typescript
export interface RigDoc {
  [key: string]: unknown;
  id: string;
  writId: string;
  status: RigStatus;
  engines: EngineInstance[];
  createdAt: string;
  resolutionEngineId?: string;
  // NO: loop state / iteration tracking at rig level
}
```

`EngineStatus`: `'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked'`
`RigStatus`: `'running' | 'completed' | 'failed' | 'blocked'`

`CrawlResult` (7 variants — no loop/branch action variants):
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

#### `packages/plugins/spider/src/spider.ts`
Core Spider logic. ~1569 lines.

Key internal functions that will change:

**`findRunnableEngine(rig)`** — finds first `pending` engine with all upstream `completed`. Currently has no concept of conditions:
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

**`validateTemplates()`** (~lines 289–415) — config template validation at startup. Has explicit **cycle detection (DFS)** that throws on cycles. Also validates: non-empty engines, no duplicate IDs, all designIds known, upstream references valid, resolutionEngine valid, variable references valid. Must be extended for any new template fields (`when`, `maxIterations`, etc.).

**`validateKitTemplate()`** (~lines 650–756) — same checks for kit-contributed templates. Must mirror config validation changes.

**`buildFromTemplate()`** (~lines 271–283):
```typescript
function buildFromTemplate(
  template: RigTemplate,
  context: { writ: WritDoc; spiderConfig: SpiderConfig },
): { engines: EngineInstance[]; resolutionEngineId?: string }
```
Converts template → `EngineInstance[]`. For branching: must apply conditional spawn-time evaluation or leave condition on instance for runtime. For looping: this is the spawn-time seeding point.

**`resolveGivens()`** — resolves `$writ`, `$vars.*`, `$yields.*.*` references. No changes expected unless condition references use the same syntax.

**`tryRun()`** (~lines 1122–1252) — Phase 3 of crawl. Runs the next runnable engine. For branching, must evaluate `when` conditions and skip (cancel) engines whose condition is false. For grafting (if chosen), must handle a new `graft` EngineRunResult.

**`tryCollect()`** (~lines 961–1023) — Phase 1 of crawl. Collects completed sessions. For grafting (if chosen), might be where we check whether a completed engine's yields trigger a graft.

**CDC handler** (~lines 1511–1564) — reacts to rig reaching terminal state. Transitions writ. No changes expected for basic branching/retry, unless loops change what "completed" means.

**`isRigBlocked()`** — checks whether rig should enter blocked status. For conditional engines that get skipped, must not treat `cancelled` as blocked.

**`RigTemplateRegistry`** (~lines 478–901) — manages kit/config template registration and lookup. Would need updates if template validation rules change.

#### `packages/plugins/fabricator/src/fabricator.ts`
Defines the `EngineRunResult` type that engines return. Currently:
```typescript
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };
```

For **engine-initiated grafting** (dynamic approach): a new `graft` variant would need to be added here:
```typescript
| { status: 'graft'; yields: unknown; engines: RigTemplateEngine[] }
// — or something similar
```

Also defines `EngineRunContext`, which may need loop iteration context passed to engines:
```typescript
export interface EngineRunContext {
  rigId: string;
  engineId: string;
  upstream: Record<string, unknown>;
  priorBlock?: { ... };  // added previously for block resumption
  // Possible addition: iterationCount?: number
}
```

#### `packages/plugins/spider/src/engines/review.ts`
The `review` engine is the primary consumer of branching logic. Currently:
- Always returns `{ status: 'launched', sessionId }` → linear flow → revise always runs
- `collect()` computes `ReviewYields.passed` (boolean)
- For dynamic grafting: would need to return `{ status: 'graft' }` when `!passed && iterations < max`

#### `packages/plugins/spider/src/engines/revise.ts`
Always runs. For branching (pre-seeded approach): unchanged. For dynamic grafting: unchanged — review engine drives the graft.

#### `packages/plugins/spider/src/engines/seal.ts`
Always runs after revise. For branching: in the target design, seal only runs when review passed. Pre-seeded branching means multiple seal engines; dynamic means seal grafted after passing review.

#### `packages/plugins/spider/src/spider.test.ts`
Large test file (~very extensive). Uses `STANDARD_TEMPLATE` fixture (5-engine linear pipeline). Tests will need:
- New test fixtures for branching templates (engines with `when` conditions)
- New test fixtures for loop/retry templates
- Tests for condition evaluation (true/false paths, skip behavior)
- Tests for graft handling (if chosen)
- Tests for cycle handling if cycles become valid under specific conditions

#### `packages/plugins/fabricator/src/fabricator.test.ts`
Fabricator tests — tests `EngineDesign` registration and lookup. If `EngineRunResult` gains a `graft` variant, test coverage needed.

### Files That Will Likely NOT Change

- `packages/plugins/spider/src/block-types/` — all 4 block types unchanged
- `packages/plugins/spider/src/input-request*.ts` — patron input mechanism unchanged
- `packages/plugins/spider/src/tools/` — existing tools unchanged (no new tools anticipated for core retry/branching; possible `rig-graft` tool if dynamic extension chosen)
- `packages/plugins/spider/src/oculus-routes.ts` — display routes unchanged
- `packages/plugins/spider/src/engines/draft.ts` — opens worktree, unchanged
- `packages/plugins/clerk/` — writ transitions unchanged
- `packages/plugins/animator/` — session management unchanged
- `packages/plugins/codexes/` — git/worktree operations unchanged

### Possibly Affected Files

- `packages/plugins/spider/src/index.ts` — barrel re-exports; would need to export any new public types
- `docs/architecture/apparatus/spider.md` — doc needs update if rig template format changes
- `docs/architecture/apparatus/review-loop.md` — has "implementation notes" stubs for what's not yet done; those stubs describe exactly this feature

---

## Key Current Types and Signatures

### `RigTemplateEngine` (current, no conditions)
```typescript
export interface RigTemplateEngine {
  id: string;
  designId: string;
  upstream?: string[];
  givens?: Record<string, unknown>;
}
```

### `EngineRunResult` (current, no graft)
```typescript
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };
```

### `SpiderConfig` (current, no retry/maxIterations)
```typescript
export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
  variables?: Record<string, unknown>;
}
```

### `EngineRunContext` (current, no iteration)
```typescript
export interface EngineRunContext {
  rigId: string;
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

---

## The Constraint That Must Be Understood: Cycle Detection

The current template system **explicitly rejects cycles** via DFS in both `validateTemplates()` (config path) and `validateKitTemplate()` (kit path). This is the primary structural blocker for "looping" support in the simplest sense.

Two approaches exist that avoid true cycles:

### Approach A: Pre-seeded fixed graph with conditional skipping

Seed multiple engine slots at spawn time (e.g., `review-1, revise-1, review-2, revise-2`) with `when` conditions on each. When a review passes, its downstream revise/review slots are skipped (cancelled). Only one seal engine runs at the end.

- **Pros**: No cycles, fits existing DAG model, simple topology
- **Cons**: Depth is fixed at spawn time, template gets verbose for high maxIterations
- **Template shape**:
  ```json
  {
    "engines": [
      { "id": "draft", "designId": "draft", ... },
      { "id": "implement", "designId": "implement", "upstream": ["draft"], ... },
      { "id": "review-1", "designId": "review", "upstream": ["implement"], ... },
      { "id": "revise-1", "designId": "revise", "upstream": ["review-1"],
        "when": "$yields.review-1.passed == false" },
      { "id": "review-2", "designId": "review", "upstream": ["revise-1"],
        "when": "$yields.review-1.passed == false" },
      { "id": "seal", "designId": "seal", "upstream": ["review-1", "review-2"],
        "when": "$yields.review-1.passed || $yields.review-2.passed" }
    ]
  }
  ```

### Approach B: Engine-initiated dynamic grafting

An engine returns `{ status: 'graft', yields, engines: [...] }` — the Spider appends the new engine list to the rig and continues. The review engine would graft a new revise+review pair when it fails.

- **Pros**: True runtime loops, arbitrary depth, clean engine-level responsibility
- **Cons**: More complex Spider logic, requires `EngineRunResult` extension in Fabricator, rig document grows unboundedly
- **`EngineRunResult` extension needed**:
  ```typescript
  | { status: 'graft'; yields: unknown; append: RigTemplateEngine[] }
  ```

### Approach C: Loop construct in template (bounded)

A first-class `loop` concept in the template: a sub-graph that repeats up to `maxIterations` times. The Spider expands the loop into concrete engine instances at spawn time (equivalent to Approach A) or at runtime when an iteration completes.

- **Pros**: Cleaner authoring experience, bounded by design
- **Cons**: New template schema concept, significant validation complexity
- This is essentially a higher-level version of Approach A/B

---

## Design Document Evidence

### `docs/architecture/apparatus/review-loop.md`
This document is the authoritative design target. Key quotes:

> **Implementation status (2026-04):** [...] The branching rig pattern (conditional pass/fail routing, escalation engine, retry budget) described below is not yet implemented — the current pipeline always runs all five engines in sequence.

The doc describes:
1. **Branching**: After review, route to `seal` (if passed) or `revise` (if failed)
2. **Retry budget**: A `maxRetries` parameter limits how many revise+review cycles run before escalation
3. **Escalation engine**: When retries exhausted, an `escalate` clockwork engine runs (fails the writ with context)
4. **Pre-seeded fixed graph** as the MVP approach:
   > For maxRetries=2, the origination engine seeds a fixed graph (not dynamically extended)
5. **Dynamic extension** as future:
   > A more sophisticated design would have the review engine declare a need: 'revision' when it fails, and the Fabricator would resolve and graft the next revise+review pair.

The doc's rig diagram (branching target):
```
                ┌──────────────┐
                │  implement   │
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │   review 1   │
                └──────┬───────┘
          passed        │ failed (attempt < maxRetries)
          ▼             ▼
   ┌─────────┐   ┌──────────────┐
   │  seal   │   │   revise 1   │
   └─────────┘   └────────┬─────┘
                          ▼
                 ┌──────────────┐
                 │   review 2   │
                 └──────┬───────┘
          passed        │ failed
          ▼             ▼
   ┌─────────┐   ┌──────────────┐
   │  seal   │   │   escalate   │
   └─────────┘   └──────────────┘
```
(Note: a single `seal` engine exists with two possible upstream paths; the diagram is slightly misleading — in practice seal has two upstreams, review-1 and review-2, and a `when` condition.)

---

## Variable Reference System (Current)

The current `givens` in templates support these references (resolved at spawn time):
- `$writ` / `${writ}` → WritDoc
- `$vars.<key>` / `${vars.<key>}` → `spiderConfig.variables[key]`
- `$yields.<engine_id>.<property>` / `${yields.<engine_id>.<property>}` → resolved at run time from upstream

The YIELD_REF_RE regex:
```typescript
const YIELD_REF_RE = /^\$yields\.[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z_][a-zA-Z0-9_]*$/;
```

For **conditions** (`when` expressions): if conditions follow the same `$yields.*.*` syntax to reference a single boolean yield property, the existing reference machinery can be partially reused. If conditions need more complex expressions (e.g., `!passed`, `count < 2`), a new mini-expression language or a structured condition object is needed.

---

## Validation Rules That Will Need Updates

**Cycle detection** — must decide: do cycles become valid under certain conditions? Or is the template always a DAG with conditions deciding runtime paths?

For Approach A (pre-seeded): template stays acyclic, cycle detection unchanged. New validation needed for `when` expressions.

For Approach B (dynamic graft): template validation unchanged for the static part. New validation for `append` engine lists in graft results (runtime, not startup).

**`resolutionEngine` fallback** — the CDC handler uses `resolutionEngineId` or falls back to seal then last-completed. For branching templates where multiple seal engines are possible, or no seal engine exists, the fallback chain needs review.

**`upstream` completeness for conditional engines** — the current rule: "engine is runnable when all upstream is `completed`". For conditional engines, an upstream engine that gets `cancelled` must also satisfy the upstream check. The definition needs to change to: "all upstream is `completed` OR `cancelled`".

---

## Adjacent Patterns

### How blocked engines work (closest analog to conditional skip)
When an engine returns `{ status: 'blocked' }`:
- Engine transitions to `blocked` status (not cancelled)
- `BlockRecord` is stored on the engine instance
- `isRigBlocked()` checks if all progress is stalled
- On next crawl, `tryCheckBlocked()` polls the checker and transitions back to `pending` if cleared

Conditional skipping is different: instead of waiting for a condition to clear, the engine is skipped permanently. The closest analogy is the `cancelled` status path (already used for downstream engines when an engine fails).

### How `failEngine()` propagates cancellation
```typescript
async function failEngine(rig, engineId, errorMessage): Promise<void> {
  const updatedEngines = rig.engines.map((e) => {
    if (e.id === engineId) return { ...e, status: 'failed', error: errorMessage, completedAt: now };
    if (e.status === 'pending' || e.status === 'blocked') {
      return { ...e, status: 'cancelled', block: undefined };
    }
    return e;
  });
  await rigsBook.patch(rig.id, { engines: updatedEngines, status: 'failed' });
}
```
Conditional skipping is analogous but surgical: only specific engines get cancelled (those whose `when` evaluates false), not all downstream pending engines.

---

## Existing Tests Patterns

`packages/plugins/spider/src/spider.test.ts` uses:
- `STANDARD_TEMPLATE` (5-engine linear) as the default fixture
- `buildFixture()` to wire up stacks/clerk/fabricator/spider with mock animator
- Tests for: spawn, collect, run (clockwork/quick), fail propagation, CDC handler, block/unblock, rig-for-writ tool, rig-resume tool, template validation (extensive)
- Pattern: custom engines registered via `extra.customEngines` on `buildFixture()`
- Pattern: custom `guildConfig.spider.rigTemplates` to test template-based rigs

New tests will follow these patterns. Key new scenarios needed:
1. Engine with `when: true` condition runs; engine with `when: false` is cancelled
2. Engine with `when` referencing an upstream yield boolean: run/skip based on value
3. Conditional skip: when engine A is cancelled due to condition, downstream engines of A are also cancelled (or handled per design)
4. Rig with `maxIterations` loop: runs correctly for pass-on-first-attempt, pass-on-second, exhausted budget
5. Graft variant: review engine appends revise+review; Spider runs grafted engines

---

## Doc/Code Discrepancies

1. **`docs/architecture/apparatus/spider.md`** describes the `CrawlResult` type with only 4 variants but the current code has 7 (the blocked/unblocked variants were added). The doc is stale from pre-block-type implementation.

2. **`docs/architecture/apparatus/spider.md`** describes `spawnStaticRig()` hardcoding the 5-engine pipeline, but the current code uses the template system (`rigTemplateRegistry.lookup()`). The static-pipeline code no longer exists.

3. **`docs/architecture/apparatus/spider.md`** describes `SpiderConfig` with `role` field, but the current `SpiderConfig` type has no `role` — it was moved to `variables.role`. The doc is stale.

4. **`docs/architecture/apparatus/review-loop.md`** has extensive "implementation notes" (stale-doc markers) documenting differences between the design target and what's shipped. These are accurate notes about what's not yet built — they identify exactly what this brief covers.

5. **`docs/architecture/apparatus/fabricator.md`** describes `EngineRunContext` without `rigId` field, but the code has `rigId` in the actual type.

---

## Summary: What "Retry, Branching, Looping" Requires

| Feature | Current State | Gap | Approach |
|---------|--------------|-----|----------|
| **Branching** (conditional engine activation) | Not implemented. All engines with completed upstream always run. | Need `when` condition on `RigTemplateEngine`; Spider must evaluate and skip (cancel) false-condition engines | Add `when` field to `RigTemplateEngine`; extend `findRunnableEngine` or `tryRun` to evaluate and cancel |
| **Retry** (re-run after failure) | Not implemented. A single engine failure fails the whole rig. | Need ability to re-run a sub-graph (review+revise) up to N times | Pre-seeded DAG (multiple review/revise slots) OR engine-initiated graft |
| **Looping** (cycles in rig graph) | Explicitly blocked by cycle detection in template validation. | Need either: allow bounded cycles in templates, or use pre-seeded DAG, or dynamic graft | See Approach A/B/C above |
| **Upstream `cancelled` satisfies deps** | Not implemented. `findRunnableEngine` only checks `completed`. | A cancelled conditional engine must not block downstream engines that don't need it | Change upstream satisfaction check: `completed` OR `cancelled` counts as "done" |
| **`when` expression evaluation** | Not implemented. | Need to evaluate boolean conditions referencing upstream yields | Mini-expression language or reference-only (just `$yields.id.field` as boolean ref) |
| **Dynamic graph extension (graft)** | Not implemented. | `EngineRunResult` needs `graft` variant; Spider needs to append engines mid-run | Extend `EngineRunResult` in fabricator.ts; extend `tryRun`/`tryCollect` in spider.ts |

The core tension: Approach A (pre-seeded DAG) is simpler to implement but produces verbose templates and limits loop depth. Approach B (dynamic graft) is more powerful but adds complexity in both the Fabricator type system and the Spider's crawl logic. The `review-loop.md` doc endorses Approach A for MVP.

The `when` condition feature is required by either approach (even with dynamic graft, you need conditional routing: if review passed → seal, not graft). `when` is the shared primitive.
