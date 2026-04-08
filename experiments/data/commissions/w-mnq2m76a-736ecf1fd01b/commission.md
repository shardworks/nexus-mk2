---
author: plan-writer
estimated_complexity: 13
---

# Add Retry, Branching, Looping Support to Rigs

## Summary

Add conditional engine activation (`when`), a `skipped` engine status, engine-initiated grafting, and cascade skipping to the Spider's rig system. These primitives make branching (conditional routing based on upstream yields), bounded retry (pre-seeded repeated engines with conditions), and unbounded looping (dynamic graph extension at runtime) expressible in rig templates.

## Current State

The Spider (`packages/plugins/spider/src/spider.ts`) drives rigs — ordered pipelines of engine instances — one crawl step at a time. The crawl loop has four phases: `tryCollect` > `tryCheckBlocked` > `tryRun` > `trySpawn`.

All engines in a rig always run if their upstream completes. There is no conditional routing — every engine with `status === 'pending'` whose upstream is all `completed` becomes runnable. There is no mechanism for an engine to add new engines to the rig at runtime.

### Key current types

`packages/plugins/spider/src/types.ts`:

```typescript
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';

export interface RigTemplateEngine {
  id: string;
  designId: string;
  upstream?: string[];
  givens?: Record<string, unknown>;
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
  block?: BlockRecord;
}

export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'engine-blocked'; rigId: string; engineId: string; blockType: string }
  | { action: 'engine-unblocked'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
  | { action: 'rig-blocked'; rigId: string; writId: string };

export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
  variables?: Record<string, unknown>;
}
```

`packages/plugins/fabricator/src/fabricator.ts`:

```typescript
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };

export interface EngineDesign {
  id: string;
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
  collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
```

### Key current functions in `spider.ts`

`findRunnableEngine(rig)` — finds the first `pending` engine whose every `upstream` engine has `status === 'completed'`.

`buildFromTemplate(template, context)` — converts a `RigTemplate` into `EngineInstance[]`, resolving `$writ` and `$vars.*` eagerly and leaving `$yields.*.*` as strings.

`validateTemplates(rigTemplates, fabricator)` — validates config templates at startup: non-empty, no duplicate IDs, valid designIds, valid upstream refs, **cycle detection (DFS)**, valid resolutionEngine, valid variable references.

`validateKitTemplate(pluginId, templateName, template, allowedPlugins)` — same validation for kit-contributed templates (returns error string or null instead of throwing).

`tryCollect()` — finds running engines with terminal sessions, assembles yields via `design.collect()` or generic default, marks engine completed, checks for rig completion.

`tryRun()` — finds the next runnable engine, calls `design.run()`, handles completed/launched/blocked results.

`failEngine(rig, engineId, errorMessage)` — marks an engine failed, cancels all `pending` and `blocked` engines, sets rig status to `failed`.

## Requirements

- R1: The `RigTemplateEngine` type must support an optional `when?: string` field that specifies a conditional activation expression.
- R2: The `EngineInstance` type must support an optional `when?: string` field, copied from the template at spawn time.
- R3: The `EngineStatus` type must include a `skipped` value: `'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'skipped'`.
- R4: When a `when` expression is a `$yields.<engine_id>.<property>` reference (with optional `!` negation prefix), the referenced yield value is resolved at runtime via the upstream yields map, then checked for JavaScript truthiness (or negated truthiness for `!`-prefixed references). When the condition is falsy, the engine is set to `skipped` status.
- R5: A `skipped` upstream engine must satisfy downstream `upstream` dependencies (alongside `completed`). An engine is runnable when `status === 'pending'` and every engine in its `upstream` array has `status === 'completed'` or `status === 'skipped'`.
- R6: A rig must be considered complete when every engine has `status === 'completed'` or `status === 'skipped'`, and at least one engine has `status === 'completed'`.
- R7: When an engine is skipped, the system must check whether the rig is now fully complete or blocked (same post-action checks as engine completion).
- R8: Template validation at startup must validate `when` expressions: the referenced engine ID must exist in the template and be transitively upstream of the engine with the `when` clause (same rules as `$yields.*.*` in givens).
- R9: The `CrawlResult` type must include an `engine-skipped` variant: `{ action: 'engine-skipped'; rigId: string; engineId: string; cascadeSkipped?: string[] }`.
- R10: `failEngine()` must leave `skipped` engines unchanged — only `pending` and `blocked` engines are cancelled.
- R11: When an engine is skipped and cascade skipping is enabled, the system must immediately evaluate all pending engines whose upstream is now all done and whose `when` condition is false, skipping them in the same crawl step. Only engines with a `when` clause participate in cascade skipping. The `cascadeSkipped` array on the CrawlResult lists all additionally skipped engine IDs.
- R12: The Spider must define a `SpiderEngineRunResult` type that extends `EngineRunResult` with an optional `graft?: RigTemplateEngine[]` field on the `completed` variant. This type is defined in spider types, not in the Fabricator.
- R13: When an engine completes (clockwork via `tryRun`, quick via `tryCollect`) and the result includes a `graft` array, the Spider must validate and append the grafted engines to the rig.
- R14: Graft validation must apply the same rules as startup template validation: designId exists in Fabricator, no duplicate IDs against existing rig engines, no cycles among all engines, valid `when` references, valid yield references in givens. If validation fails, the originating engine is failed.
- R15: Grafted engines' givens must be resolved at graft time using `resolveGivens()` — `$writ` and `$vars.*` resolved eagerly, `$yields.*.*` left as strings for runtime resolution.
- R16: The `CrawlResult` type must include an `engine-grafted` variant: `{ action: 'engine-grafted'; rigId: string; engineId: string; graftedEngineIds: string[] }`.
- R17: The `SpiderConfig` type must support an optional `maxEnginesPerRig?: number` field with a default of 50. When a graft would cause the total engine count to exceed this limit, the originating engine is failed.
- R18: The `SpiderEngineRunResult` type and any related new types must be exported from `packages/plugins/spider/src/index.ts`.
- R19: Quick engines that want to graft must be able to return graft information from their `collect()` method. The Spider must detect a `graft` property on the collect result and extract it.
- R20: Graft processing for quick engines must occur in a separate post-collect phase in the crawl loop, after `tryCollect` and before `tryCheckBlocked`.

## Design

### Type Changes

**`packages/plugins/spider/src/types.ts`** — full updated types:

```typescript
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'skipped';

export interface RigTemplateEngine {
  /** Engine id unique within this template. */
  id: string;
  /** Engine design id to look up in the Fabricator. */
  designId: string;
  /** Engine ids within this template whose completion is required first. Defaults to []. */
  upstream?: string[];
  /**
   * Givens to pass to the engine.
   * String values starting with '$' are variable references (see existing docs).
   */
  givens?: Record<string, unknown>;
  /**
   * Conditional activation expression. A `$yields.<engine_id>.<property>` reference
   * (with optional `!` negation prefix) evaluated at runtime when the engine's upstream
   * is all done. When the condition is falsy, the engine is set to `skipped` status.
   * When absent, the engine is unconditional (always runs).
   *
   * Examples:
   *   '$yields.review.passed'    — run this engine when review.passed is truthy
   *   '!$yields.review.passed'   — run this engine when review.passed is falsy
   *   '${yields.review.passed}'  — equivalent (curly-brace syntax)
   *   '!${yields.review.passed}' — equivalent negated
   */
  when?: string;
}

export interface EngineInstance {
  /** Unique identifier within the rig (e.g. 'draft', 'implement'). */
  id: string;
  /** The engine design to look up in the Fabricator. */
  designId: string;
  /** Current execution status. */
  status: EngineStatus;
  /** Engine IDs that must be completed before this engine can run. */
  upstream: string[];
  /**
   * Givens values. Spawn-time references ($writ, $vars.*) are resolved to
   * their values. Yield references ($yields.*.*) remain as strings and are
   * resolved at run time when the engine is executed.
   */
  givensSpec: Record<string, unknown>;
  /**
   * Conditional activation expression, copied from the template.
   * Evaluated at runtime when upstream is all done. Absent means unconditional.
   */
  when?: string;
  /** Yields from a completed engine run (JSON-serializable). */
  yields?: unknown;
  /** Error message if this engine failed. */
  error?: string;
  /** Session ID from a launched quick engine, used by the collect step. */
  sessionId?: string;
  /** ISO timestamp when execution started. */
  startedAt?: string;
  /** ISO timestamp when execution completed (or failed). */
  completedAt?: string;
  /** Present when status === 'blocked'. Cleared when the block is resolved. */
  block?: BlockRecord;
}

export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'engine-blocked'; rigId: string; engineId: string; blockType: string }
  | { action: 'engine-unblocked'; rigId: string; engineId: string }
  | { action: 'engine-skipped'; rigId: string; engineId: string; cascadeSkipped?: string[] }
  | { action: 'engine-grafted'; rigId: string; engineId: string; graftedEngineIds: string[] }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
  | { action: 'rig-blocked'; rigId: string; writId: string };

export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
  variables?: Record<string, unknown>;
  /**
   * Maximum number of engines allowed in a single rig.
   * Grafts that would exceed this limit fail the originating engine.
   * Default: 50.
   */
  maxEnginesPerRig?: number;
}
```

**New types in `packages/plugins/spider/src/types.ts`:**

```typescript
import type { EngineRunResult } from '@shardworks/fabricator-apparatus';

/**
 * Spider-extended engine run result. Adds an optional `graft` field
 * to the `completed` variant, allowing engines to dynamically append
 * new engines to the rig alongside their yields.
 *
 * Engines that want to graft import this type from @shardworks/spider-apparatus.
 * Engines that don't graft use the base EngineRunResult from @shardworks/fabricator-apparatus.
 *
 * The Spider internally checks for the `graft` property on any completed result
 * (duck-typing — the Fabricator type is not modified).
 */
export type SpiderEngineRunResult =
  | { status: 'completed'; yields: unknown; graft?: RigTemplateEngine[] }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };

/**
 * Spider-extended collect result. When a quick engine's collect() method
 * returns an object with a `graft` property (an array), the Spider extracts
 * it as a graft request and uses the `yields` property as the engine's yields.
 *
 * When collect() returns a value without a `graft` array property, the entire
 * return value is treated as yields (backward compatible).
 */
export interface SpiderCollectResult {
  yields: unknown;
  graft?: RigTemplateEngine[];
}
```

**`packages/plugins/spider/src/index.ts`** — add to exports:

```typescript
export type {
  // ... existing exports ...
  SpiderEngineRunResult,
  SpiderCollectResult,
} from './types.ts';
```

### Behavior

#### `when` condition parsing and evaluation

A `when` string is parsed as follows:

1. If the string starts with `!`, strip the `!` prefix and set `negate = true`. Otherwise `negate = false`.
2. Apply `normalizeVarRef()` to handle `${...}` syntax (existing function).
3. Validate the result matches `YIELD_REF_RE` (`/^\$yields\.[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z_][a-zA-Z0-9_]*$/`).
4. Extract `engineId` and `property` from the reference.
5. Look up `upstream[engineId]` in the upstream yields map (from `buildUpstreamMap()`).
6. Look up `property` on the engine's yields object.
7. Evaluate JavaScript truthiness of the value.
8. If `negate`, invert the truthiness.
9. Return the result.

Extract this logic into a helper function:

```typescript
/**
 * Evaluate a `when` condition against the upstream yields map.
 * Returns true if the engine should run, false if it should be skipped.
 */
function evaluateWhen(when: string, upstream: Record<string, unknown>): boolean {
  let expr = when.trim();
  let negate = false;
  if (expr.startsWith('!')) {
    negate = true;
    expr = expr.slice(1);
  }
  const normalized = normalizeVarRef(expr);
  // Extract engine_id and property from '$yields.<engine_id>.<property>'
  const withoutPrefix = normalized.slice('$yields.'.length);
  const dotIndex = withoutPrefix.indexOf('.');
  const engineId = withoutPrefix.slice(0, dotIndex);
  const prop = withoutPrefix.slice(dotIndex + 1);

  const engineYields = upstream[engineId];
  let value: unknown;
  if (engineYields !== null && engineYields !== undefined && typeof engineYields === 'object') {
    value = (engineYields as Record<string, unknown>)[prop];
  }
  const truthy = !!value;
  return negate ? !truthy : truthy;
}
```

When a `when` reference points to a skipped upstream engine (no yields), `upstream[engineId]` is `undefined`, so `value` is `undefined`, which is falsy. With `!` prefix, it becomes truthy. This is the correct behavior for branching patterns.

#### `findRunnableEngine()` change

Change the upstream satisfaction check to accept both `completed` and `skipped`:

```typescript
function findRunnableEngine(rig: RigDoc): EngineInstance | null {
  for (const engine of rig.engines) {
    if (engine.status !== 'pending') continue;
    const allUpstreamDone = engine.upstream.every((upstreamId) => {
      const dep = rig.engines.find((e) => e.id === upstreamId);
      return dep?.status === 'completed' || dep?.status === 'skipped';
    });
    if (allUpstreamDone) return engine;
  }
  return null;
}
```

#### Rig completion helper

Extract a shared helper for rig completion checking (currently duplicated in `tryCollect` and `tryRun`):

```typescript
/**
 * Check whether all engines in the list have reached a terminal state
 * (completed or skipped) and at least one is completed.
 */
function isRigComplete(engines: EngineInstance[]): boolean {
  const allTerminal = engines.every(
    (e) => e.status === 'completed' || e.status === 'skipped',
  );
  if (!allTerminal) return false;
  return engines.some((e) => e.status === 'completed');
}
```

Replace every occurrence of `const allCompleted = updatedEngines.every((e) => e.status === 'completed')` with `isRigComplete(updatedEngines)`.

#### Condition evaluation and skipping in `tryRun()`

When `tryRun()` finds a runnable engine (via `findRunnableEngine`), before executing it:

1. If the engine has a `when` field, evaluate it via `evaluateWhen(engine.when, upstream)`.
2. If the condition is false, skip the engine:
   a. Set the engine's status to `skipped`.
   b. Perform cascade skipping (see below).
   c. Check for rig completion or blocked state (same as after engine completion).
   d. Return an `engine-skipped` CrawlResult.
3. If the condition is true (or no `when` field), proceed with execution as before.

#### Cascade skipping

After setting an engine to `skipped`, immediately loop over all remaining `pending` engines:

1. Find any pending engine whose upstream is now all done (`completed` or `skipped`) AND that has a `when` field.
2. Evaluate that engine's `when`. If false, set it to `skipped` and add its ID to the `cascadeSkipped` list.
3. Repeat until no more engines can be cascade-skipped in this pass.
4. Engines without a `when` field are never cascade-skipped — they are unconditional and will run when their upstream is done.

```typescript
/**
 * Cascade-skip all pending engines whose `when` is false, given the current
 * upstream map. Returns the list of additionally skipped engine IDs.
 * Mutates the engines array in place.
 */
function cascadeSkip(engines: EngineInstance[], upstream: Record<string, unknown>): string[] {
  const cascaded: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const engine of engines) {
      if (engine.status !== 'pending' || !engine.when) continue;
      const allUpstreamDone = engine.upstream.every((upId) => {
        const dep = engines.find((e) => e.id === upId);
        return dep?.status === 'completed' || dep?.status === 'skipped';
      });
      if (!allUpstreamDone) continue;
      if (!evaluateWhen(engine.when, upstream)) {
        engine.status = 'skipped';
        cascaded.push(engine.id);
        changed = true;
      }
    }
  }
  return cascaded;
}
```

Note: `buildUpstreamMap()` only includes `completed` engines (with yields). Skipped engines have no yields. The upstream map does not change during cascade skipping — skipped engines do not contribute new yields. This is correct.

#### `buildFromTemplate()` change

Copy the `when` field from template to engine instance:

```typescript
function buildFromTemplate(
  template: RigTemplate,
  context: { writ: WritDoc; spiderConfig: SpiderConfig },
): { engines: EngineInstance[]; resolutionEngineId?: string } {
  const engines: EngineInstance[] = template.engines.map((entry) => ({
    id: entry.id,
    designId: entry.designId,
    status: 'pending' as const,
    upstream: entry.upstream ?? [],
    givensSpec: resolveGivens(entry.givens, context),
    ...(entry.when !== undefined ? { when: entry.when } : {}),
  }));
  return { engines, resolutionEngineId: template.resolutionEngine };
}
```

#### Template validation for `when`

In both `validateTemplates()` and `validateKitTemplate()`, add a validation step for `when` fields. This goes after the existing variable reference validation (R7 block):

```typescript
// When condition validation
for (const engine of engines) {
  if (engine.when === undefined) continue;
  let expr = engine.when.trim();
  if (expr.startsWith('!')) {
    expr = expr.slice(1);
  }
  const normalized = normalizeVarRef(expr);
  if (!YIELD_REF_RE.test(normalized)) {
    // error: when must be a $yields reference
    throw new Error(
      `[spider] rigTemplates.${templateKey}: engine "${engine.id}" has invalid when expression "${engine.when}" — must be a $yields.<engine_id>.<property> reference with optional ! prefix`
    );
  }
  // Extract engine_id and validate upstream reachability
  const withoutPrefix = normalized.slice('$yields.'.length);
  const dotIndex = withoutPrefix.indexOf('.');
  const refEngineId = withoutPrefix.slice(0, dotIndex);
  const yieldProp = withoutPrefix.slice(dotIndex + 1);

  if (!engineIds.has(refEngineId)) {
    throw new Error(
      `[spider] rigTemplates.${templateKey}: engine "${engine.id}" when references $yields.${refEngineId} but "${refEngineId}" is not an engine in this template`
    );
  }
  const reachable = computeUpstreamReachable(engine.id, engines);
  if (!reachable.has(refEngineId)) {
    throw new Error(
      `[spider] rigTemplates.${templateKey}: engine "${engine.id}" when references $yields.${refEngineId}.${yieldProp} but "${refEngineId}" is not upstream of "${engine.id}"`
    );
  }
}
```

The same validation must be replicated in `validateKitTemplate()` (returning error strings instead of throwing).

#### Engine-initiated grafting

##### Detecting grafts

In both `tryRun()` (clockwork engines) and `tryCollect()` (quick engines), after obtaining the completed result/yields, check for a `graft` property:

**For clockwork engines (in `tryRun`, `status === 'completed'` branch):**

```typescript
const { yields } = engineResult;
// Check for graft (SpiderEngineRunResult extension)
const graft = (engineResult as Record<string, unknown>).graft as RigTemplateEngine[] | undefined;
```

Store `graft` alongside the engine's yields. Do NOT process the graft inline — store it for the post-collect/post-run graft processing phase (see below).

**For quick engines (in `tryCollect`, after calling `design.collect()`):**

```typescript
let yields: unknown;
let collectGraft: RigTemplateEngine[] | undefined;

if (design?.collect) {
  const collectResult = await design.collect(engine.sessionId!, givens, context);
  // Check for SpiderCollectResult shape (duck-typing)
  if (
    collectResult !== null &&
    collectResult !== undefined &&
    typeof collectResult === 'object' &&
    Array.isArray((collectResult as Record<string, unknown>).graft)
  ) {
    const scr = collectResult as SpiderCollectResult;
    yields = scr.yields;
    collectGraft = scr.graft;
  } else {
    yields = collectResult;
  }
} else {
  // generic default yields
  yields = { sessionId: session.id, sessionStatus: session.status, ... };
}
```

##### Graft processing phase

Add a new crawl phase `tryProcessGrafts()` after `tryCollect` and before `tryCheckBlocked`. The crawl loop becomes:

```typescript
async crawl(): Promise<CrawlResult | null> {
  const collected = await tryCollect();
  if (collected) return collected;

  const grafted = await tryProcessGrafts();
  if (grafted) return grafted;

  const checked = await tryCheckBlocked();
  if (checked) return checked;

  const ran = await tryRun();
  if (ran) return ran;

  const spawned = await trySpawn();
  if (spawned) return spawned;

  return null;
}
```

`tryProcessGrafts()` processes pending grafts stored by `tryCollect` and `tryRun`. Use an in-memory queue:

```typescript
/**
 * In-memory queue of pending grafts.
 * Key: rigId. Value: { engineId, graft, writ }.
 * Written by tryCollect/tryRun when a completed engine has a graft.
 * Consumed by tryProcessGrafts.
 */
const pendingGrafts = new Map<string, { engineId: string; graft: RigTemplateEngine[]; writ: WritDoc }>();
```

When `tryRun` or `tryCollect` detect a graft, they store it in `pendingGrafts` (keyed by rigId) and return `engine-completed` (not `engine-grafted`). The next crawl call picks up `tryProcessGrafts`, which:

1. Takes the first entry from `pendingGrafts`.
2. Validates the grafted engines against the current rig (see Graft Validation below).
3. If validation fails, fails the originating engine via `failEngine()` and returns `rig-completed` with `outcome: 'failed'`.
4. Checks `maxEnginesPerRig` — if `rig.engines.length + graft.length > maxEnginesPerRig`, fail.
5. Resolves givens for grafted engines via `resolveGivens()` using the rig's writ and spiderConfig.
6. Converts the `RigTemplateEngine[]` to `EngineInstance[]` (status `pending`, upstream as declared, givensSpec resolved, `when` copied).
7. Appends the new engine instances to the rig's engines array.
8. Patches the rig.
9. Returns `{ action: 'engine-grafted', rigId, engineId, graftedEngineIds }`.

##### Graft validation

Apply the same validation rules as startup template validation, in the context of the existing rig's engines plus the grafted engines:

```typescript
function validateGraft(
  rig: RigDoc,
  graft: RigTemplateEngine[],
  fabricator: FabricatorApi,
  maxEngines: number,
): string | null {
  // Max engines check
  if (rig.engines.length + graft.length > maxEngines) {
    return `Graft would exceed maxEnginesPerRig (${maxEngines}): rig has ${rig.engines.length} engines, graft adds ${graft.length}`;
  }

  const existingIds = new Set(rig.engines.map((e) => e.id));

  // Duplicate ID check
  const graftIds = new Set<string>();
  for (const engine of graft) {
    if (existingIds.has(engine.id) || graftIds.has(engine.id)) {
      return `Duplicate engine id "${engine.id}"`;
    }
    graftIds.add(engine.id);
  }

  // designId check
  for (const engine of graft) {
    if (fabricator.getEngineDesign(engine.designId) === undefined) {
      return `Engine "${engine.id}" references unknown designId "${engine.designId}"`;
    }
  }

  // Upstream reference check (can reference existing rig engines or other graft engines)
  const allIds = new Set([...existingIds, ...graftIds]);
  for (const engine of graft) {
    for (const upId of engine.upstream ?? []) {
      if (!allIds.has(upId)) {
        return `Engine "${engine.id}" references unknown upstream "${upId}"`;
      }
    }
  }

  // Cycle detection (DFS on combined engine set)
  // Build adjacency from grafted engines + existing engines
  {
    const allEngines = [...rig.engines.map(e => ({ id: e.id, upstream: e.upstream })),
                        ...graft.map(e => ({ id: e.id, upstream: e.upstream ?? [] }))];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): string | null => {
      if (visited.has(id)) return null;
      if (visiting.has(id)) return `Dependency cycle detected involving engine "${id}"`;
      visiting.add(id);
      const eng = allEngines.find((e) => e.id === id);
      if (eng) {
        for (const dep of eng.upstream) {
          const err = visit(dep);
          if (err) return err;
        }
      }
      visiting.delete(id);
      visited.add(id);
      return null;
    };

    for (const engine of graft) {
      const err = visit(engine.id);
      if (err) return err;
    }
  }

  // when reference validation
  for (const engine of graft) {
    if (engine.when === undefined) continue;
    let expr = engine.when.trim();
    if (expr.startsWith('!')) expr = expr.slice(1);
    const normalized = normalizeVarRef(expr);
    if (!YIELD_REF_RE.test(normalized)) {
      return `Engine "${engine.id}" has invalid when expression — must be a $yields reference`;
    }
    const withoutPrefix = normalized.slice('$yields.'.length);
    const dotIndex = withoutPrefix.indexOf('.');
    const refEngineId = withoutPrefix.slice(0, dotIndex);
    if (!allIds.has(refEngineId)) {
      return `Engine "${engine.id}" when references unknown engine "${refEngineId}"`;
    }
    // Upstream reachability — compute from combined engines
    const allTemplateEngines = [...rig.engines.map(e => ({ id: e.id, upstream: e.upstream } as RigTemplateEngine)),
                                ...graft];
    const reachable = computeUpstreamReachable(engine.id, allTemplateEngines);
    if (!reachable.has(refEngineId)) {
      return `Engine "${engine.id}" when references "${refEngineId}" which is not upstream`;
    }
  }

  // yield reference validation in givens
  for (const engine of graft) {
    for (const value of Object.values(engine.givens ?? {})) {
      if (typeof value === 'string' && value.startsWith('$')) {
        const normalized = normalizeVarRef(value);
        if (YIELD_REF_RE.test(normalized)) {
          const withoutPrefix = normalized.slice('$yields.'.length);
          const dotIndex = withoutPrefix.indexOf('.');
          const refEngineId = withoutPrefix.slice(0, dotIndex);
          if (!allIds.has(refEngineId)) {
            return `Engine "${engine.id}" references $yields.${refEngineId} but it is not an engine in the rig`;
          }
          const allTemplateEngines = [...rig.engines.map(e => ({ id: e.id, upstream: e.upstream } as RigTemplateEngine)),
                                      ...graft];
          const reachable = computeUpstreamReachable(engine.id, allTemplateEngines);
          if (!reachable.has(refEngineId)) {
            return `Engine "${engine.id}" references $yields.${refEngineId} but it is not upstream`;
          }
        }
      }
    }
  }

  return null; // Valid
}
```

#### `failEngine()` — no change to skipped

The existing `failEngine()` cancels `pending` and `blocked` engines. `skipped` engines are already terminal and must not be overwritten. The current condition (`e.status === 'pending' || e.status === 'blocked'`) naturally excludes `skipped`. No code change needed.

#### CDC handler — no change

The CDC handler's resolution yield fallback chain (`resolutionEngineId` → seal → last completed in array order) already filters by `e.status === 'completed' && e.yields !== undefined`. Skipped engines (status `skipped`, no yields) are naturally excluded. No code change needed.

#### `isRigBlocked()` — no change

`isRigBlocked()` delegates to `findRunnableEngine()`. The D15 change to `findRunnableEngine()` (accepting `skipped` as upstream-done) is sufficient. No direct change to `isRigBlocked()` needed.

### Non-obvious Touchpoints

- **`packages/plugins/spider/src/index.ts`** — must export `SpiderEngineRunResult` and `SpiderCollectResult` from the barrel file so engine authors can import them.
- **Both `validateTemplates()` and `validateKitTemplate()`** receive the same `when` validation logic. These are ~130 lines apart with near-identical structure. The `when` validation must be added to both.

## Validation Checklist

- V1 [R1, R2, R18]: Verify `RigTemplateEngine` has `when?: string`, `EngineInstance` has `when?: string`, and `SpiderEngineRunResult`/`SpiderCollectResult` are exported from `packages/plugins/spider/src/index.ts`. Run `grep -n 'when?' packages/plugins/spider/src/types.ts` and `grep -n 'SpiderEngineRunResult\|SpiderCollectResult' packages/plugins/spider/src/index.ts`.
- V2 [R3, R34]: Verify `EngineStatus` includes `'skipped'`. Run `grep 'skipped' packages/plugins/spider/src/types.ts`.
- V3 [R4, R11]: Create a test with a branching template: engine A (unconditional), engine B (`when: "$yields.A.passed"`), engine C (`when: "!$yields.A.passed"`). Set A's yields to `{ passed: true }`. Verify B runs and C is skipped. Set A's yields to `{ passed: false }`. Verify C runs and B is skipped. With negation and cascade, verify downstream engines of a skipped branch are also cascade-skipped.
- V4 [R5]: Create a test where engine B depends on upstream engine A which has `when` that evaluates false (A is skipped). Verify engine B becomes runnable (its upstream is satisfied by A being skipped).
- V5 [R6, R7]: Create a test where a rig has engines A (unconditional, completes), B (conditional, skipped), C (conditional, skipped). Verify the rig completes with status `completed`. Create a test where ALL engines are skipped — verify the rig does NOT complete as `completed` (edge case: at least one must complete).
- V6 [R8, R12]: Create a template with `when: "$yields.nonexistent.passed"` where `nonexistent` is not an engine ID. Verify startup validation throws. Create a template with `when: "$yields.A.passed"` where A is not upstream. Verify startup validation throws.
- V7 [R9, R32]: Verify the `engine-skipped` CrawlResult variant exists with `cascadeSkipped?: string[]`. Run `grep 'engine-skipped' packages/plugins/spider/src/types.ts`.
- V8 [R10, R16]: Verify `failEngine` leaves `skipped` engines unchanged. Create a test where an engine fails in a rig with a previously skipped engine — verify the skipped engine's status is still `skipped`, not `cancelled`.
- V9 [R12, R13, R14, R15, R16, R17]: Create a test with a clockwork engine that returns `{ status: 'completed', yields: { ... }, graft: [{ id: 'new-engine', designId: 'some-design', upstream: ['grafting-engine'] }] }`. Verify the grafted engine is appended to the rig, appears as `pending`, and the CrawlResult is `engine-grafted` with `graftedEngineIds: ['new-engine']`. Verify the grafted engine runs on subsequent crawl calls.
- V10 [R14]: Create a test where a graft has a duplicate engine ID. Verify the originating engine is failed. Create a test where a graft references an unknown designId. Verify the originating engine is failed.
- V11 [R17]: Create a test where the rig has 48 engines and a graft would add 5 more (exceeding default 50). Verify the originating engine is failed with a clear error message about maxEnginesPerRig.
- V12 [R19, R20]: Create a test with a quick engine whose `collect()` returns `{ yields: { ... }, graft: [{ ... }] }`. Verify the Spider extracts yields correctly and processes the graft. Verify the graft is processed in a separate crawl step (not inline with collect).
- V13 [R11, R33]: Create a test with a cascade scenario: engine A completes, engine B (`when: "$yields.A.passed"`) is skipped because A.passed is false. Engine C (`when: "$yields.B.result"`, upstream B) should be cascade-skipped. Engine D (no `when`, upstream B) should NOT be cascade-skipped — it runs. Verify `cascadeSkipped` includes C but not D.

## Test Cases

### Happy path — branching

**Scenario:** Template with `draft → implement → review`, then `seal` (when review.passed) and `revise` (when !review.passed).

```typescript
const BRANCHING_TEMPLATE: RigTemplate = {
  engines: [
    { id: 'draft',     designId: 'draft',     givens: { writ: '$writ' } },
    { id: 'implement', designId: 'implement', upstream: ['draft'],     givens: { writ: '$writ', role: '$vars.role' } },
    { id: 'review',    designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer' } },
    { id: 'seal',      designId: 'seal',      upstream: ['review'],    when: '$yields.review.passed' },
    { id: 'revise',    designId: 'revise',    upstream: ['review'],    when: '!$yields.review.passed', givens: { writ: '$writ', role: '$vars.role' } },
  ],
  resolutionEngine: 'seal',
};
```

- When review yields `{ passed: true }`: seal runs, revise is skipped. Rig completes.
- When review yields `{ passed: false }`: revise runs, seal is skipped. Rig completes after revise (4 completed + 1 skipped).

### Happy path — bounded retry (pre-seeded)

**Scenario:** Two review-revise cycles with conditions.

```typescript
const RETRY_TEMPLATE: RigTemplate = {
  engines: [
    { id: 'draft',      designId: 'draft',     givens: { writ: '$writ' } },
    { id: 'implement',  designId: 'implement', upstream: ['draft'], givens: { writ: '$writ', role: '$vars.role' } },
    { id: 'review-1',   designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer' } },
    { id: 'revise-1',   designId: 'revise',    upstream: ['review-1'],  when: '!$yields.review-1.passed', givens: { writ: '$writ', role: '$vars.role' } },
    { id: 'review-2',   designId: 'review',    upstream: ['revise-1'],  when: '!$yields.review-1.passed', givens: { writ: '$writ', role: 'reviewer' } },
    { id: 'seal',       designId: 'seal',      upstream: ['review-1', 'review-2'] },
  ],
  resolutionEngine: 'seal',
};
```

- When review-1 passes: revise-1, review-2 are skipped. Seal runs (upstream: review-1 completed, review-2 skipped). Rig completes.
- When review-1 fails, review-2 passes: revise-1 runs, review-2 runs, seal runs. Rig completes.
- When both reviews fail: revise-1 runs, review-2 runs, seal runs (seal is unconditional). Rig completes.

### Happy path — engine-initiated graft

**Scenario:** A clockwork engine returns a graft.

- Create a custom engine `decision-engine` that returns `{ status: 'completed', yields: { decided: true }, graft: [{ id: 'extra', designId: 'some-clockwork', upstream: ['decision-engine'] }] }`.
- Verify the rig grows by one engine. Verify the `extra` engine runs on subsequent crawl.

### Happy path — quick engine collect graft

**Scenario:** A quick engine's collect returns `{ yields: { ... }, graft: [...] }`.

- Create a custom quick engine with a `collect()` that returns `{ yields: { sessionId, sessionStatus: 'completed' }, graft: [{ id: 'follow-up', designId: 'some-engine', upstream: ['quick-engine'] }] }`.
- Verify yields are extracted correctly (not the whole `{ yields, graft }` object).
- Verify the graft is processed in a subsequent crawl step.

### Edge cases — `when` references skipped engine

- Engine A has `when: "$yields.X.val"` where X was skipped. A should also be skipped (undefined is falsy).
- Engine A has `when: "!$yields.X.val"` where X was skipped. A should run (negated undefined is truthy).

### Edge cases — all engines skipped

- Template where every engine has a `when` that evaluates false. No engine completes. Rig should NOT succeed. Verify the rig enters a blocked or failed state (no runnable engines, no running engines, no blocked engines — this is a stalled rig).

### Edge cases — cascade skipping

- Chain of 5 conditional engines: A → B (when A.x) → C (when B.y) → D (when C.z) → E (no when). A completes with falsy x. B, C, D should all be cascade-skipped in one crawl step. E should NOT be cascade-skipped (unconditional).

### Error cases — invalid `when` at startup

- `when: "not a valid ref"` → validation error at startup.
- `when: "$yields.nonexistent.field"` where engine doesn't exist → validation error.
- `when: "$yields.later.field"` where `later` is not upstream → validation error.

### Error cases — graft validation failure

- Graft with duplicate engine ID → originating engine fails.
- Graft with unknown designId → originating engine fails.
- Graft that creates a cycle → originating engine fails.
- Graft exceeding maxEnginesPerRig → originating engine fails with clear message.

### Error cases — graft with invalid `when`

- Graft containing an engine with `when: "$yields.nonexistent.val"` where the referenced engine doesn't exist in the rig → originating engine fails.