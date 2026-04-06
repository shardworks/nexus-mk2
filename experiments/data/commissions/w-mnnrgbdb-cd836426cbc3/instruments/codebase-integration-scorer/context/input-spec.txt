---
author: plan-writer
estimated_complexity: 8
---

# Configurable Rig Templates via Guild Config

## Summary

Add a `rigTemplates` map to the Spider's config section, keyed by writ type, that defines the engine pipeline for each type of commission. At spawn time, the Spider resolves the template for the writ's type, resolves variable references in givens, and constructs the rig. Templates are validated at startup; spawning fails if no matching template exists.

## Current State

The Spider (`packages/plugins/spider/src/spider.ts`) builds a hardcoded 5-engine pipeline for every writ via `buildStaticEngines()`:

```typescript
function buildStaticEngines(writ: WritDoc, config: SpiderConfig): EngineInstance[] {
  const role = config.role ?? 'artificer';
  const reviewGivens: Record<string, unknown> = {
    writ,
    role: 'reviewer',
    ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
    ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
  };

  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],           givensSpec: { writ } },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],     givensSpec: { writ, role } },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'], givensSpec: reviewGivens },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],    givensSpec: { writ, role } },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],    givensSpec: {} },
  ];
}
```

`trySpawn()` calls `buildStaticEngines(writ, spiderConfig)` at line 321 for every ready writ.

`SpiderConfig` (in `packages/plugins/spider/src/types.ts`) has four optional fields:

```typescript
export interface SpiderConfig {
  role?: string;
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
}
```

The CDC handler in `start()` hardcodes resolution extraction:

```typescript
const sealEngine = rig.engines.find((e) => e.id === 'seal');
const resolution = sealEngine?.yields
  ? JSON.stringify(sealEngine.yields)
  : 'Rig completed';
```

`RigDoc` has no field indicating which engine provides the resolution:

```typescript
export interface RigDoc {
  [key: string]: unknown;
  id: string;
  writId: string;
  status: RigStatus;
  engines: EngineInstance[];
  createdAt: string;
}
```

## Requirements

- R1: `SpiderConfig` must accept an optional `rigTemplates` field — a `Record<string, RigTemplate>` keyed by writ type, where `'default'` is the fallback key.
- R2: When spawning a rig, the Spider must look up the template matching `writ.type` in `spiderConfig.rigTemplates`, falling back to `rigTemplates['default']`. If no matching template is found (including when `rigTemplates` is absent entirely), spawning must fail with a clear error.
- R3: Template givens must support variable references via `$`-prefixed strings: `$writ` resolves to the full `WritDoc`, `$role` resolves to `spiderConfig.role ?? 'artificer'`, and `$spider.<key>` resolves to the top-level `spiderConfig[key]` value.
- R4: When a `$spider.<key>` variable resolves to `undefined`, the key must be omitted from the resolved `givensSpec` entirely.
- R5: Givens values that are not `$`-prefixed strings must be passed through as literals to `givensSpec`.
- R6: At startup, the Spider must validate all configured templates: (a) every `designId` must exist in the Fabricator engine registry or the Spider's own supportKit engine IDs, (b) no duplicate engine `id`s within a template, (c) every `upstream` entry must reference an `id` within the same template, (d) the upstream dependency graph must be acyclic, (e) if `resolutionEngine` is specified it must reference an `id` within the template.
- R7: Startup validation must also check that all `$`-prefixed strings in template givens match a recognized form: `$writ`, `$role`, or `$spider.<key>` (single top-level key, no nested dot-paths). Unrecognized `$`-prefixed strings must fail validation.
- R8: Validation must fail on the first error with a `[spider]` prefixed message identifying the template key, engine, and rule violated.
- R9: `RigDoc` must gain an optional `resolutionEngineId` field, set at spawn time from the template's `resolutionEngine` value.
- R10: The CDC completion handler must determine the resolution using this chain: `rig.resolutionEngineId` → engine with `id === 'seal'` → last engine in array order with `status === 'completed'`. The first match with non-undefined `yields` provides the resolution; if none, use `'Rig completed'`.
- R11: The `buildStaticEngines()` function must be preserved in the codebase (not deleted), but the new dispatch logic must not call it — template resolution is the only spawn path.
- R12: The new types `RigTemplate` and `RigTemplateEngine` must be exported from `packages/plugins/spider/src/index.ts`.
- R13: Each template must have a non-empty `engines` array; validation must reject empty templates.

## Design

### Type Changes

**`packages/plugins/spider/src/types.ts`** — add new types and extend existing ones:

```typescript
/**
 * A single engine slot declared in a rig template.
 */
export interface RigTemplateEngine {
  /** Engine id unique within this template. */
  id: string;
  /** Engine design id to look up in the Fabricator. */
  designId: string;
  /** Engine ids within this template whose completion is required first. Defaults to []. */
  upstream?: string[];
  /**
   * Givens to pass at spawn time.
   * String values starting with '$' are variable references resolved at spawn time.
   * Non-string values are passed through literally.
   * Variables that resolve to undefined cause the key to be omitted.
   */
  givens?: Record<string, unknown>;
}

/**
 * A complete rig template.
 */
export interface RigTemplate {
  /** Ordered list of engine slot declarations. */
  engines: RigTemplateEngine[];
  /**
   * Engine id whose yields provide the writ resolution summary.
   * Falls back to seal engine, then last completed engine in array order.
   */
  resolutionEngine?: string;
}
```

**`packages/plugins/spider/src/types.ts`** — extend `SpiderConfig`:

```typescript
export interface SpiderConfig {
  role?: string;
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  /**
   * Writ type → rig template mappings.
   * 'default' key is the fallback for unmatched writ types.
   * Spawning fails if no matching template is found.
   */
  rigTemplates?: Record<string, RigTemplate>;
}
```

**`packages/plugins/spider/src/types.ts`** — extend `RigDoc`:

```typescript
export interface RigDoc {
  [key: string]: unknown;
  id: string;
  writId: string;
  status: RigStatus;
  engines: EngineInstance[];
  createdAt: string;
  /** Engine id whose yields provide the resolution summary. Set at spawn time. */
  resolutionEngineId?: string;
}
```

**`packages/plugins/spider/src/index.ts`** — add to re-exports:

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
  DraftYields,
  SealYields,
  RigTemplate,         // ← new
  RigTemplateEngine,   // ← new
} from './types.ts';
```

### Behavior

#### Template lookup (`lookupTemplate`)

When `trySpawn()` has a ready writ, it calls `lookupTemplate(writ.type, spiderConfig)`:

- When `spiderConfig.rigTemplates` is defined and contains key `writ.type`, return that template.
- When `spiderConfig.rigTemplates` is defined and contains key `'default'`, return that template.
- Otherwise, throw: `[spider] No rig template found for writ type "${writ.type}" and no "default" template configured.`

This means: if `rigTemplates` is `undefined` (not configured at all), spawning fails. If `rigTemplates` is configured but the writ type has no entry and no `'default'` key exists, spawning fails.

#### Variable resolution (`resolveGivens`)

Given a template engine's `givens` map (or `{}` if absent) and a variables context `{ writ: WritDoc, role: string, spiderConfig: SpiderConfig }`:

- For each entry in `givens`:
  - If the value is not a string, or is a string not starting with `$`: pass it through as a literal.
  - If the value is `"$writ"`: set the key to the `WritDoc` object.
  - If the value is `"$role"`: set the key to `spiderConfig.role ?? 'artificer'`.
  - If the value matches `$spider.<key>` (exactly one dot, one key segment — `$spider.buildCommand`, `$spider.testCommand`, etc.): resolve to `(spiderConfig as Record<string, unknown>)[key]`. If the resolved value is `undefined`, **omit the key entirely** from the output.
  - `$spider.<key>` only supports top-level keys. `$spider.nested.path` is a validation error caught at startup (R7), not at resolution time.
- Return the resulting `Record<string, unknown>`.

Example resolution:

```json
// Template givens:
{ "writ": "$writ", "role": "reviewer", "buildCommand": "$spider.buildCommand" }
// spiderConfig: { role: "artificer", buildCommand: "pnpm build" }
// → givensSpec: { writ: <WritDoc>, role: "reviewer", buildCommand: "pnpm build" }

// Template givens:
{ "writ": "$writ", "role": "$role", "testCommand": "$spider.testCommand" }
// spiderConfig: { role: "artificer" }  (no testCommand)
// → givensSpec: { writ: <WritDoc>, role: "artificer" }  (testCommand omitted)
```

#### Building engines from a template (`buildFromTemplate`)

Given a `RigTemplate` and a variables context, produce `{ engines: EngineInstance[], resolutionEngineId?: string }`:

- For each `RigTemplateEngine` in `template.engines`:
  - Resolve `givens` via `resolveGivens`.
  - Construct an `EngineInstance` with `status: 'pending'`, `upstream: entry.upstream ?? []`, the resolved `givensSpec`, and the entry's `id` and `designId`.
- Set `resolutionEngineId` to `template.resolutionEngine` if defined, otherwise `undefined`.

#### Dispatch in `trySpawn`

Replace the existing `buildStaticEngines(writ, spiderConfig)` call with:

```typescript
const template = lookupTemplate(writ.type, spiderConfig);
const { engines, resolutionEngineId } = buildFromTemplate(template, {
  writ,
  role: spiderConfig.role ?? 'artificer',
  spiderConfig,
});

const rig: RigDoc = {
  id: rigId,
  writId: writ.id,
  status: 'running',
  engines,
  createdAt: new Date().toISOString(),
  ...(resolutionEngineId !== undefined ? { resolutionEngineId } : {}),
};
```

When `lookupTemplate` throws, the error propagates through `trySpawn` and surfaces in the `crawl()` call. The writ remains in `ready` status — no rig is created and no writ transition occurs.

#### Startup validation (`validateTemplates`)

Called in `start()` after `spiderConfig` is read and `fabricator` is obtained. Remains synchronous.

Build the set of known engine design IDs:

```typescript
const builtinEngineIds = new Set([
  draftEngine.id, implementEngine.id, reviewEngine.id,
  reviseEngine.id, sealEngine.id,
]);
```

These imports already exist at module scope in `spider.ts`.

For each `[templateKey, template]` in `spiderConfig.rigTemplates` (if defined):

1. **Non-empty check:** If `template.engines.length === 0`, throw `[spider] rigTemplates.${templateKey}: template has no engines`.

2. **Duplicate ID check:** Collect all engine `id` values. If any ID appears more than once, throw `[spider] rigTemplates.${templateKey}: duplicate engine id "${id}"`.

3. **designId check:** For each engine, check `fabricator.getEngineDesign(engine.designId) !== undefined || builtinEngineIds.has(engine.designId)`. If neither, throw `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references unknown designId "${engine.designId}"`.

4. **Upstream reference check:** For each engine, for each `upstreamId` in `engine.upstream ?? []`, verify it exists in the template's engine ID set. If not, throw `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references unknown upstream "${upstreamId}"`.

5. **Cycle detection (DFS):** Use the same visiting/visited set pattern as `guild-lifecycle.ts`:

   ```typescript
   const visiting = new Set<string>();
   const visited = new Set<string>();

   function visit(id: string): void {
     if (visited.has(id)) return;
     if (visiting.has(id)) {
       throw new Error(
         `[spider] rigTemplates.${templateKey}: dependency cycle detected involving engine "${id}"`
       );
     }
     visiting.add(id);
     const engine = engines.find((e) => e.id === id)!;
     for (const dep of engine.upstream ?? []) {
       visit(dep);
     }
     visiting.delete(id);
     visited.add(id);
   }

   for (const engine of engines) {
     visit(engine.id);
   }
   ```

6. **resolutionEngine check:** If `template.resolutionEngine` is defined, verify it exists in the template's engine ID set. If not, throw `[spider] rigTemplates.${templateKey}: resolutionEngine "${template.resolutionEngine}" is not an engine id in this template`.

7. **Variable reference validation:** For each engine, for each value in `engine.givens ?? {}`, if the value is a string starting with `$`:
   - `$writ` — valid.
   - `$role` — valid.
   - Matches `/^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/` — valid (single top-level key).
   - Anything else — throw `[spider] rigTemplates.${templateKey}: engine "${engine.id}" has unrecognized variable "${value}"`.

Validation stops on the first error (fail-fast).

#### CDC completion handler update

Replace the current hardcoded seal lookup with:

```typescript
if (rig.status === 'completed') {
  let resolutionYields: unknown;

  // 1. Try the declared resolution engine
  if (rig.resolutionEngineId) {
    const declared = rig.engines.find((e) => e.id === rig.resolutionEngineId);
    if (declared?.yields !== undefined) {
      resolutionYields = declared.yields;
    }
  }

  // 2. Fall back to seal engine (backwards compat for pre-existing rigs)
  if (resolutionYields === undefined) {
    const seal = rig.engines.find((e) => e.id === 'seal');
    if (seal?.yields !== undefined) {
      resolutionYields = seal.yields;
    }
  }

  // 3. Fall back to last completed engine in array order
  if (resolutionYields === undefined) {
    const lastCompleted = [...rig.engines]
      .reverse()
      .find((e) => e.status === 'completed' && e.yields !== undefined);
    if (lastCompleted) {
      resolutionYields = lastCompleted.yields;
    }
  }

  const resolution = resolutionYields !== undefined
    ? JSON.stringify(resolutionYields)
    : 'Rig completed';
  await clerk.transition(rig.writId, 'completed', { resolution });
}
```

The failed-rig branch is unchanged.

#### `start()` integration

```typescript
start(_ctx: StartupContext): void {
  const g = guild();
  spiderConfig = g.guildConfig().spider ?? {};

  const stacks = g.apparatus<StacksApi>('stacks');
  clerk = g.apparatus<ClerkApi>('clerk');
  fabricator = g.apparatus<FabricatorApi>('fabricator');

  // Validate templates before any rig operations can occur
  if (spiderConfig.rigTemplates) {
    validateTemplates(spiderConfig.rigTemplates, fabricator);
  }

  rigsBook = stacks.book<RigDoc>('spider', 'rigs');
  // ... rest unchanged ...

  // CDC handler uses updated resolution logic
  stacks.watch<RigDoc>('spider', 'rigs', async (event) => {
    // ... updated CDC handler per above ...
  }, { failOnError: true });
}
```

#### Preserving `buildStaticEngines`

`buildStaticEngines()` remains in `spider.ts` as-is. It is not called by the new dispatch logic. It serves as a reference for the original pipeline and may be used by existing direct-call tests. No modifications to its signature or body.

### Non-obvious Touchpoints

- **`packages/plugins/spider/src/index.ts`** — must add `RigTemplate` and `RigTemplateEngine` to the type re-exports.
- **Existing tests in `spider.test.ts`** — every test that uses `buildFixture()` without explicit `rigTemplates` config will now fail at rig spawn time (no templates → lookup throws). Tests must be updated to provide a `rigTemplates` config in their fixture. The standard 5-engine template for test fixtures:

```typescript
const STANDARD_TEMPLATE: RigTemplate = {
  engines: [
    { id: 'draft',     designId: 'draft',     givens: { writ: '$writ' } },
    { id: 'implement', designId: 'implement', upstream: ['draft'],     givens: { writ: '$writ', role: '$role' } },
    { id: 'review',    designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer', buildCommand: '$spider.buildCommand', testCommand: '$spider.testCommand' } },
    { id: 'revise',    designId: 'revise',    upstream: ['review'],    givens: { writ: '$writ', role: '$role' } },
    { id: 'seal',      designId: 'seal',      upstream: ['revise'],    givens: {} },
  ],
  resolutionEngine: 'seal',
};
```

  Existing tests should use `buildFixture({ spider: { rigTemplates: { default: STANDARD_TEMPLATE } } })` to reproduce the original behavior. This ensures the template path is exercised even in "default" tests.

## Validation Checklist

- V1 [R1]: Verify `SpiderConfig` in `types.ts` has `rigTemplates?: Record<string, RigTemplate>`. Check that `RigTemplate` and `RigTemplateEngine` types exist with the specified fields.

- V2 [R2]: Post a writ with type `'mandate'` when `rigTemplates` has a `'mandate'` key → rig spawns with that template's engines. Post a writ with type `'task'` when only a `'default'` key exists → rig spawns with the default template. Post a writ with type `'task'` when no `'default'` key exists and no `'task'` key → `crawl()` throws with a message containing `No rig template found`. Post a writ when `rigTemplates` is not configured → `crawl()` throws.

- V3 [R3]: Configure a template with givens `{ "writ": "$writ", "role": "$role", "cmd": "$spider.buildCommand" }` and `spiderConfig.role = 'artificer'`, `spiderConfig.buildCommand = 'pnpm build'`. Spawn a rig → verify the engine's `givensSpec` contains the full `WritDoc` at key `writ`, string `'artificer'` at key `role`, string `'pnpm build'` at key `cmd`.

- V4 [R4]: Configure a template givens with `"testCmd": "$spider.testCommand"` but do not set `testCommand` in `SpiderConfig`. Spawn a rig → verify `givensSpec` does not have a `testCmd` key (not `undefined`, not `null` — absent).

- V5 [R5]: Configure a template givens with `"role": "reviewer"` (a literal string, no `$` prefix). Spawn a rig → verify `givensSpec.role === 'reviewer'` regardless of `spiderConfig.role`.

- V6 [R6]: (a) Configure a template with `designId: 'nonexistent'` → `start()` throws with message containing `unknown designId "nonexistent"`. (b) Configure a template with engine upstream referencing `'missing'` → `start()` throws with message containing `unknown upstream "missing"`. (c) Configure a template with A upstream B and B upstream A → `start()` throws with message containing `cycle detected`. (d) Configure a template with duplicate engine id `'x'` → throws with `duplicate engine id "x"`. (e) Configure a template with `resolutionEngine: 'missing'` → throws with `resolutionEngine "missing"`.

- V7 [R7]: Configure template givens with `"x": "$unknown"` → `start()` throws with message containing `unrecognized variable "$unknown"`. Configure `"x": "$spider.build.nested"` → throws with `unrecognized variable`. Configure `"x": "$spider.buildCommand"` → passes validation.

- V8 [R8]: In each validation failure case (V6, V7), verify the error message starts with `[spider]` and includes the template key (e.g. `rigTemplates.mandate`).

- V9 [R9]: Spawn a rig from a template with `resolutionEngine: 'seal'` → verify the stored `RigDoc` has `resolutionEngineId === 'seal'`. Spawn from a template without `resolutionEngine` → verify `resolutionEngineId` is absent from the stored doc.

- V10 [R10]: Complete a rig with `resolutionEngineId: 'summarize'` where engine `summarize` has yields → verify the writ transition receives `JSON.stringify(summarize.yields)`. Complete a rig with no `resolutionEngineId` and no `seal` engine but engine `implement` completed with yields → verify the writ transition receives `JSON.stringify(implement.yields)`. Complete a rig with no `resolutionEngineId` but a `seal` engine with yields → verify the writ transition uses the seal engine's yields.

- V11 [R11]: Verify `buildStaticEngines` function still exists in `spider.ts`. Verify it is not called from `trySpawn` or `buildRigEngines`.

- V12 [R12]: Import `RigTemplate` and `RigTemplateEngine` from `@shardworks/spider-apparatus` in a test file → verify the imports resolve.

- V13 [R13]: Configure a template with `engines: []` → `start()` throws with message containing `has no engines`.

## Test Cases

### Template dispatch

- **Type-specific match:** Configure `rigTemplates: { mandate: { engines: [...2 engines...] } }`. Post a writ with type `'mandate'`. Crawl → rig has exactly 2 engines matching the template.
- **Default fallback:** Configure `rigTemplates: { default: { engines: [...3 engines...] } }`. Post a writ with type `'task'` (no `'task'` key). Crawl → rig has 3 engines from the default template.
- **Type-specific over default:** Configure both `mandate` and `default` templates with different engine counts. Post a `'mandate'` writ → rig uses the mandate template, not default.
- **No match, no default:** Configure `rigTemplates: { mandate: {...} }`. Post a writ with type `'task'`. Crawl → throws error containing `No rig template found`.
- **No rigTemplates at all:** Configure `spider: {}` (no rigTemplates key). Post any writ. Crawl → throws error containing `No rig template found`.

### Variable resolution

- **$writ resolves to full WritDoc:** Template givens `{ "w": "$writ" }`. After spawn, `engine.givensSpec.w` is the WritDoc object with `id`, `type`, `title`, `body`, etc.
- **$role resolves with default:** `spiderConfig.role` not set. Template givens `{ "r": "$role" }`. After spawn, `givensSpec.r === 'artificer'`.
- **$role uses configured value:** `spiderConfig.role = 'builder'`. Template givens `{ "r": "$role" }`. After spawn, `givensSpec.r === 'builder'`.
- **$spider.buildCommand resolves:** `spiderConfig.buildCommand = 'make'`. Template givens `{ "cmd": "$spider.buildCommand" }`. After spawn, `givensSpec.cmd === 'make'`.
- **$spider.* undefined omission:** `spiderConfig` has no `testCommand`. Template givens `{ "cmd": "$spider.testCommand" }`. After spawn, `givensSpec` has no `cmd` key.
- **Literal passthrough:** Template givens `{ "role": "reviewer", "count": 5 }`. After spawn, `givensSpec.role === 'reviewer'` and `givensSpec.count === 5`.
- **Mixed literals and variables:** Template givens `{ "writ": "$writ", "role": "reviewer", "cmd": "$spider.buildCommand" }`. After spawn, all resolve correctly with the literal `"reviewer"` unchanged.
- **Empty givens:** Template engine with no `givens` field. After spawn, `givensSpec` is `{}`.

### Startup validation

- **Valid template passes silently:** A well-formed template with known designIds, valid upstream, no cycles, valid variables → `start()` completes without error.
- **Unknown designId:** Engine with `designId: 'nonexistent'` → `start()` throws.
- **Spider's own designIds are accepted:** Engine with `designId: 'draft'` is accepted even though Spider's engines aren't in the Fabricator at `start()` time.
- **Unknown upstream:** Engine references upstream `'ghost'` → `start()` throws.
- **Duplicate engine IDs:** Two engines with `id: 'step1'` → `start()` throws.
- **Cycle detection:** A→B→C→A dependency cycle → `start()` throws with message mentioning cycle.
- **Self-referencing upstream:** Engine with `upstream: ['self']` where `id: 'self'` → `start()` throws (cycle).
- **Invalid resolutionEngine:** `resolutionEngine: 'absent'` → `start()` throws.
- **Unknown variable reference:** Givens with `"$buildCommand"` (not `$spider.buildCommand`) → `start()` throws.
- **Nested spider path rejected:** Givens with `"$spider.a.b"` → `start()` throws.
- **Empty engines array:** `engines: []` → `start()` throws.

### CDC resolution fallback

- **resolutionEngineId present and engine has yields:** Rig completes with `resolutionEngineId: 'summarize'`, engine `summarize` yields `{ result: 'done' }` → writ resolution is `JSON.stringify({ result: 'done' })`.
- **resolutionEngineId absent, seal engine present:** Rig completes with no `resolutionEngineId`, engine `seal` has yields → writ resolution uses seal yields (backwards compat).
- **No resolutionEngineId, no seal, last completed has yields:** Rig completes, last engine in array order with `status === 'completed'` has yields → writ resolution uses those yields.
- **No yields anywhere:** Rig completes, no engine has yields → writ resolution is `'Rig completed'`.
- **Pre-existing rig (no resolutionEngineId field):** Simulate a rig document without `resolutionEngineId`. On completion → falls through to seal check, then last completed.

### Full pipeline integration

- **Custom 2-engine template:** Configure a `hotfix` template with implement → seal. Post a `hotfix` writ. Crawl through spawn → implement starts → implement completes → seal runs → seal completes → rig completed → writ transitions to completed with seal yields as resolution.
- **3-engine template without seal:** Configure a template with draft → implement → review (no seal). Set `resolutionEngine: 'review'`. Full crawl → rig completed → writ resolution uses review yields.