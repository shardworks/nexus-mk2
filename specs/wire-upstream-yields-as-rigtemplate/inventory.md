# Inventory — Wire Upstream Yields as RigTemplate Givens

Slug: `wire-upstream-yields-as-rigtemplate`

---

## Brief Summary

Extend the `rigTemplate` givens system to allow `${yields.<engine_id>.<yield_name>}` (and bare `$yields.<engine_id>.<yield_name>`) references that resolve upstream engine yields into a downstream engine's givens at run time — not at spawn time.

---

## Affected Files

### Files that will be modified

| File | Why |
|------|-----|
| `packages/plugins/spider/src/spider.ts` | Core change site: `resolveGivens()`, `validateTemplates()`, `RigTemplateRegistry.validateKitTemplate()`, `tryRun()`, `tryCollect()` |
| `packages/plugins/spider/src/types.ts` | JSDoc comment on `RigTemplateEngine.givens` (and possibly `EngineInstance.givensSpec`) |
| `packages/plugins/spider/src/spider.test.ts` | New test cases: variable resolution (yields branch) and startup validation (yields syntax) |

### Files that will NOT be modified but are important context

| File | Notes |
|------|-------|
| `packages/plugins/fabricator/src/fabricator.ts` | Defines `EngineRunContext.upstream: Record<string, unknown>` — the escape hatch that `$yields.*` mirrors into givens |
| `packages/plugins/spider/src/engines/draft.ts` | Produces `DraftYields`; currently consumed via `context.upstream['draft']` |
| `packages/plugins/spider/src/engines/implement.ts` | Consumes `DraftYields` via context.upstream; a candidate downstream that might use `$yields.*` |
| `packages/plugins/spider/src/engines/review.ts` | Consumes `DraftYields` and context; has collect() method |
| `packages/plugins/spider/src/engines/revise.ts` | Consumes `DraftYields` + `ReviewYields` via context.upstream |
| `packages/plugins/spider/src/engines/seal.ts` | Consumes `DraftYields` via context.upstream only |
| `packages/plugins/spider/src/oculus-routes.ts` | Returns `rigTemplates` in `/api/spider/config` — no change needed, but affected by template shape if we add new givens fields |
| `docs/architecture/apparatus/spider.md` | "Future Evolution" explicitly mentions givensSpec templates; doc is stale vs actual implementation |

---

## Current Type Signatures (Exact)

### `RigTemplateEngine` (types.ts:119-136)

```typescript
export interface RigTemplateEngine {
  /** Engine id unique within this template. */
  id: string;
  /** Engine design id to look up in the Fabricator. */
  designId: string;
  /** Engine ids within this template whose completion is required first. Defaults to []. */
  upstream?: string[];
  /**
   * Givens to pass at spawn time.
   * String values starting with '$' (either $name or ${name}) are variable
   * references resolved at spawn time:
   *   '$writ' or '${writ}' — the WritDoc for this rig's writ
   *   '$vars.<key>' or '${vars.<key>}' — value from spider.variables config
   * Non-string values are passed through literally.
   * Variables that resolve to undefined cause the key to be omitted.
   */
  givens?: Record<string, unknown>;
}
```

### `EngineInstance` (types.ts:47-70)

```typescript
export interface EngineInstance {
  id: string;
  designId: string;
  status: EngineStatus;
  upstream: string[];
  /** Literal givens values set at spawn time. */
  givensSpec: Record<string, unknown>;
  yields?: unknown;
  error?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  block?: BlockRecord;
}
```

### `EngineRunContext` (fabricator/src/fabricator.ts:26-47)

```typescript
export interface EngineRunContext {
  rigId: string;
  engineId: string;
  /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
  upstream: Record<string, unknown>;
  priorBlock?: { ... };
}
```

---

## Key Functions (Exact Signatures)

### `normalizeVarRef(value: string): string` (spider.ts:157-162)
Strips `${...}` braces. `'${foo}'` → `'$foo'`.

### `resolveGivens(givens, context)` (spider.ts:170-194)
Called at **spawn time** in `buildFromTemplate()`. Resolves:
- `$writ` / `${writ}` → WritDoc
- `$vars.<key>` / `${vars.<key>}` → `spiderConfig.variables[key]`
- Unrecognized `$...` → caught by `validateTemplates()` at startup
- Non-`$` values → passed through as literals

**Important:** This function is called ONCE at spawn time. `$yields.*` references CANNOT be resolved here because upstream engines haven't run yet.

```typescript
function resolveGivens(
  givens: Record<string, unknown> | undefined,
  context: { writ: WritDoc; spiderConfig: SpiderConfig },
): Record<string, unknown>
```

### `buildFromTemplate(template, context)` (spider.ts:199-211)
Calls `resolveGivens()` and builds `EngineInstance[]`. Returns `{ engines, resolutionEngineId }`.

### `validateTemplates(rigTemplates, fabricator)` (spider.ts:217-321)
Called at startup for config-declared templates. Contains variable reference validation (R7 block) at lines 303-320:
```typescript
// R7: Variable reference validation
for (const engine of engines) {
  for (const value of Object.values(engine.givens ?? {})) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const normalized = normalizeVarRef(value);
      if (
        normalized === '$writ' ||
        /^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)
      ) {
        continue; // valid
      }
      throw new Error(
        `[spider] rigTemplates.${templateKey}: engine "${engine.id}" has unrecognized variable "${value}"`
      );
    }
  }
}
```

### `RigTemplateRegistry.validateKitTemplate(...)` (spider.ts:532-622)
Parallel validation logic for kit-contributed templates. Contains same variable reference check at lines 606-619.

### `tryRun()` (spider.ts:954-1084)
Phase 3 of crawl. The run path (lines 966-993):
```typescript
const upstream = buildUpstreamMap(rig);
const givens = { ...pending.givensSpec };
// ...
const context = { rigId: rig.id, engineId: pending.id, upstream, ... };
engineResult = await design.run(givens, context);
```
**This is where `$yields.*` resolution must be inserted** — between reading `givensSpec` and calling `design.run()`.

### `tryCollect()` (spider.ts:793-855)
Phase 1 of crawl. The collect path for engines with a custom `collect()` (lines 811-818):
```typescript
const givens = { ...engine.givensSpec };
const upstream = buildUpstreamMap(rig);
const context = { rigId: rig.id, engineId: engine.id, upstream };
yields = await design.collect(engine.sessionId!, givens, context);
```
**Also needs `$yields.*` resolution** if givens passed to collect should be fully resolved.

### `buildUpstreamMap(rig: RigDoc)` (spider.ts:106-114)
Collects all completed engine yields keyed by engine id:
```typescript
function buildUpstreamMap(rig: RigDoc): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const engine of rig.engines) {
    if (engine.status === 'completed' && engine.yields !== undefined) {
      upstream[engine.id] = engine.yields;
    }
  }
  return upstream;
}
```

---

## Current Variable Syntax and Resolution

### Spawn-time resolution (happens in `resolveGivens()`):
- `$writ` / `${writ}` → full WritDoc object stored in givensSpec
- `$vars.<key>` / `${vars.<key>}` → config value stored in givensSpec
- Missing `$vars.*` key → key omitted from givensSpec entirely

### Validation (startup-time):
- `$writ` — always valid
- `$vars.<identifier>` — valid (single-level key, `[a-zA-Z_][a-zA-Z0-9_]*`)
- `$vars.a.b` (nested) — **invalid**, throws at startup
- Any other `$`-prefixed string — **invalid**, throws at startup (config templates), warns and skips (kit templates)

### Curly-brace normalization:
- Both `$foo` and `${foo}` forms accepted
- `normalizeVarRef()` strips braces before matching

---

## What "Upstream Yields" Currently Are

Each `EngineInstance` has `yields?: unknown` set when the engine completes. These are stored in the Stacks (must be JSON-serializable). The Spider builds `buildUpstreamMap(rig)` which returns `Record<string, unknown>` keyed by engine id.

Actual yield shapes (all flat objects in the built-in engines):
- `DraftYields`: `{ draftId, codexName, branch, path, baseSha }`
- `ImplementYields`: `{ sessionId, sessionStatus }`
- `ReviewYields`: `{ sessionId, passed, findings, mechanicalChecks }`
- `ReviseYields`: `{ sessionId, sessionStatus }`
- `SealYields`: `{ sealedCommit, strategy, retries, inscriptionsSealed }`

Currently engines access upstream yields via `context.upstream['engineId']` with a type assertion, e.g.:
```typescript
const draft = context.upstream['draft'] as DraftYields;
```

The brief asks us to mirror this into givens via template syntax, e.g.:
```typescript
givens: { path: '$yields.draft.path' }
// → at run time: givens.path === (upstream['draft'] as DraftYields).path
```

---

## Timing Gap: Spawn vs. Run

This is the central challenge of the brief:

| Resolution | Timing | Available Info |
|------------|--------|----------------|
| `$writ` | Spawn time | WritDoc available at spawn |
| `$vars.*` | Spawn time | Config available at spawn |
| `$yields.*` | **Run time** | Upstream yields only exist after upstream engines complete |

The `givensSpec` field is described as "Literal givens values set at spawn time." With this change, it will also contain **unresolved yield reference strings** that are resolved later. The comment and possibly the field name need updating.

**Decision point:** Where do unresolved `$yields.*` references live between spawn and run?

Option A: Leave them as strings in `givensSpec`. Resolve in `tryRun()` before calling `design.run()`.
Option B: Store them in a new field (e.g., `givensTemplate`) separate from `givensSpec`. Merge at run time.

Current codebase clearly leans toward Option A — `givensSpec` already holds unresolved-at-spawn-time values? No — actually `$writ` and `$vars.*` ARE resolved at spawn time. The difference: `$writ` becomes a WritDoc object, `$vars.*` becomes the value. But `$yields.*` must remain as a string until run time.

This means `givensSpec` would contain a mix of: (a) fully resolved values (WritDoc, config values, literals), and (b) unresolved yield reference strings. The code that reads `givensSpec` in `tryRun()` and `tryCollect()` would need to resolve any remaining `$yields.*` strings.

---

## Validation Requirements for Yield References

At startup, for `$yields.<engine_id>.<yield_name>`:

1. **`engine_id` must exist in the template** (it's an engine id defined in `engines`)
2. **`engine_id` must be upstream of the engine using the reference** — directly or transitively  
   (If `implement` lists `upstream: ['draft']` and uses `$yields.draft.path`, `draft` is directly upstream — valid. If `revise` has `upstream: ['review']` and uses `$yields.draft.path`, `draft` is transitively upstream — should this be allowed? See below.)
3. **`yield_name`** — single identifier (no further nesting). Cannot be validated at startup (yield schemas are runtime). The reference resolves to `undefined` at run time if the property doesn't exist.

### Direct vs. transitive upstream check

The current `EngineInstance.upstream` stores only *direct* upstream ids. But `buildUpstreamMap()` returns ALL completed engine yields (not just direct). So `context.upstream['draft']` is available to `revise` even though `draft` is not in `revise`'s direct upstream.

At validation time we only have the template's `upstream` arrays (not a transitive closure). We could:
- Only validate against direct upstream (simple, safe, potentially too restrictive)
- Compute reachability from the template graph (more permissive, matches runtime behavior)

The runtime behavior allows any completed engine's yields to be accessed (since `buildUpstreamMap` includes all completed engines). So transitive reachability is the semantically correct check.

---

## Test Coverage Map

### Current variable resolution tests (describe 'Spider — variable resolution', line 1984+)

Existing test cases:
- `$writ` resolves to WritDoc
- `$vars.<key>` resolves to value
- `$vars.<key>` resolves non-string types
- `$vars.<key>` omits key when absent
- `$vars.<key>` omits key when variables dict absent
- literal string passes through
- mixed literals and vars
- engine with no givens → empty givensSpec
- `${writ}` / `${vars.<key>}` curly-brace forms

New tests needed:
- `$yields.<engine_id>.<yield_name>` resolves to the yield property at run time
- `${yields.<engine_id>.<yield_name>}` curly-brace form works identically
- unresolved `$yields.*` — engine_id exists but yield_name missing from actual yields → key omitted
- yield reference to non-existent engine id → startup error
- yield reference to engine not in upstream → startup error
- yield reference to engine in transitive upstream (if we support it) → valid

### Current startup validation tests (describe 'Spider — startup validation', line 2131+)

Existing test cases:
- unknown designId → throw
- accepts Spider builtin designIds
- unknown upstream reference → throw
- cycle detection
- duplicate engine id → throw
- resolutionEngine unknown → throw
- unrecognized variable `$buildCommand` → throw
- `$role` variable (not $writ, not $vars.*) → throw
- `$spider.buildCommand` (has dot but wrong prefix) → throw
- `$spider.a.b` → throw
- `$vars.a.b` (nested vars path) → throw
- `$vars.buildCommand` → accepted
- `${writ}`, `${vars.<key>}` curly-brace forms → accepted
- invalid curly-brace `${badVar}` → throw (error includes original form)
- empty engines array → throw

New tests needed:
- `$yields.draft.path` with `draft` in upstream → accepted
- `$yields.nonexistent.path` with `nonexistent` not a template engine id → throw
- `$yields.implement.sessionId` with `implement` not in upstream → throw
- `${yields.draft.path}` curly-brace form → accepted

---

## Adjacent Patterns

### How $writ and $vars.* are handled (the pattern to follow)

1. **Regex for validation**: `normalizeVarRef()` then pattern match
2. **`validateTemplates()`**: throws with `[spider]` prefix for invalid patterns (config templates)  
   `validateKitTemplate()`: returns error string for invalid patterns (kit templates)
3. **`resolveGivens()`**: switch on normalized value, resolves at spawn time
4. **`givensSpec`**: stores fully resolved values after spawn

For `$yields.*`:
1. Regex: `\$yields\.[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*` (two-part path)
2. Both validation functions need the new branch (allow valid yields refs, reject invalid `$yields` forms)
3. `resolveGivens()` does NOT resolve yields — keeps the string as-is
4. New `resolveYieldGivens()` function needed: called in `tryRun()` and `tryCollect()` before passing givens to the engine

### How context.upstream is built

`buildUpstreamMap(rig)` collects all completed engine yields. This is the exact data source for yield reference resolution.

---

## Doc/Code Discrepancies

1. **spider.md "Future Evolution"** says givensSpec templates will use syntax like `${draft.worktreePath}` (no `yields.` prefix). The brief proposes `${yields.<engine_id>.<yield_name>}` which is more explicit and avoids ambiguity with `$vars.*`. Code doesn't implement either yet — the doc is aspirational.

2. **spider.md "Configuration" section** describes `buildCommand`, `testCommand`, `role` as top-level spider config keys. The current code uses `$vars.role`, `$vars.buildCommand` etc. in templates — these are resolved through the `variables` dict, not as direct config keys. The doc is significantly stale vs. actual implementation.

3. **EngineInstance JSDoc** says `givensSpec` holds "Literal givens values set at spawn time." With this change, it will also hold unresolved yield reference strings. The comment needs updating.

4. **RigTemplateEngine.givens JSDoc** currently lists only `$writ` and `$vars.<key>`. Will need `$yields.<engine_id>.<yield_name>` added.

---

## Scratch Notes / Prior Commissions

No prior commissions in `_planning/` for this specific feature (only `brief.md` exists). No known-gaps or TODOs in the codebase referencing this feature by name.

---

## Summary of Changes Required

### `spider.ts` — main changes

1. **`normalizeVarRef()`**: No change needed (already handles `${...}` stripping generically).

2. **`resolveGivens()`**: Add a branch to recognize `$yields.*` as a **known but deferred** reference — leave the string in place (do not throw, do not resolve). Alternatively, simply don't throw for valid yield refs; the validation catch-all changes to only throw for patterns that are neither `$writ`, `$vars.*`, nor `$yields.*.*`.

3. **New function `resolveYieldGivens(givensSpec, upstream)`**: Called at run time. Iterates givensSpec, finds strings matching the `$yields.*.*` pattern, looks up `upstream[engineId][yieldName]`, returns resolved givens (omitting keys where resolution is undefined).

4. **`validateTemplates()`** (R7 block): Add new valid pattern for `$yields.<engineId>.<yieldName>`. Also validate that `engineId` is reachable upstream of this engine in the template.

5. **`RigTemplateRegistry.validateKitTemplate()`**: Same validation additions as `validateTemplates()`.

6. **`tryRun()`**: After `const givens = { ...pending.givensSpec }`, call `resolveYieldGivens()` to resolve any `$yields.*` strings before calling `design.run(givens, context)`.

7. **`tryCollect()`**: After `const givens = { ...engine.givensSpec }`, call `resolveYieldGivens()` to resolve yield refs before calling `design.collect(sessionId, givens, context)`.

### `types.ts` — comment updates

1. `RigTemplateEngine.givens` JSDoc: add `$yields.<engine_id>.<yield_name>` documentation
2. `EngineInstance.givensSpec` JSDoc: update "set at spawn time" note to acknowledge deferred yield references

### `spider.test.ts` — new test cases

Add tests in "variable resolution" and "startup validation" describe blocks.

---

## Open Questions for Analyst

1. **Transitive vs. direct upstream**: Should `$yields.draft.path` be valid in `revise` if `draft` is only transitively upstream (not in `revise.upstream` directly)? Runtime behavior allows it (buildUpstreamMap includes all completed). Simpler validation: require the engine_id to be in the engine's *direct* upstream only. But this is more restrictive than runtime actually enforces.

2. **Undefined resolution behavior**: When `${yields.draft.nonExistentField}` is used and the field doesn't exist at run time, should the key be omitted (like `$vars.*`) or should the engine receive `undefined`? Omit is consistent with current behavior.

3. **Collect resolution**: Should `tryCollect()` also resolve yield givens? It makes the givens passed to `collect()` consistent with those passed to `run()`. But `collect()` has access to `context.upstream` anyway — so engines that need upstream data in collect already have an escape hatch. Probably worth being consistent.

4. **Kit template validation**: Kit templates validate `engine_id` against `designSourceMap` for designIds. For yield refs, there's no global engine id registry. Kit template validation should check that `engine_id` appears as an engine id in the *same* template's engines array, plus is reachable upstream.
