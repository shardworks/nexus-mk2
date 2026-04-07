---
author: plan-writer
estimated_complexity: 5
---

# Wire Upstream Yields as RigTemplate Givens

## Summary

Extend the Spider's rig template givens system to support `$yields.<engine_id>.<yield_name>` references that resolve upstream engine yields into downstream engine givens at run time. This complements the existing `$writ` and `$vars.*` namespaces (resolved at spawn time) with a new namespace that defers resolution until the referenced upstream engine has completed.

## Current State

The Spider's rig template system (`packages/plugins/spider/src/spider.ts`) supports variable references in `RigTemplateEngine.givens`:

- `$writ` / `${writ}` — resolves to the WritDoc at spawn time
- `$vars.<key>` / `${vars.<key>}` — resolves to `spiderConfig.variables[key]` at spawn time

These are processed by `resolveGivens()` at spawn time inside `buildFromTemplate()`. The resolved values are stored in `EngineInstance.givensSpec`. At run time, `tryRun()` copies `givensSpec` as-is into `givens` and passes it to `design.run()`:

```typescript
// spider.ts, tryRun() — current code
const upstream = buildUpstreamMap(rig);
const givens = { ...pending.givensSpec };
// ...
engineResult = await design.run(givens, context);
```

The same pattern exists in `tryCollect()`:

```typescript
// spider.ts, tryCollect() — current code
const givens = { ...engine.givensSpec };
const upstream = buildUpstreamMap(rig);
const context = { rigId: rig.id, engineId: engine.id, upstream };
yields = await design.collect(engine.sessionId!, givens, context);
```

Engines currently access upstream yields only via `context.upstream['engineId']` with type assertions:

```typescript
// engines/implement.ts
const draft = context.upstream['draft'] as DraftYields;
```

Startup validation in `validateTemplates()` (config templates, throws on error) and `RigTemplateRegistry.validateKitTemplate()` (kit templates, returns error string for warn-and-skip) rejects any `$`-prefixed string that isn't `$writ` or `$vars.<key>`.

Critically, `resolveGivens()` silently drops unrecognized `$`-prefixed strings — they are not added to the result object (line 190: the else-if chain has no fallthrough for unmatched patterns). This means an explicit pass-through branch is required for yield references to survive spawn time.

## Requirements

- R1: When a rig template engine's `givens` contains a string value matching `$yields.<engine_id>.<yield_name>` or `${yields.<engine_id>.<yield_name>}`, the Spider must resolve it at run time to the value of `upstream[engine_id][yield_name]` and pass the resolved value as that given to the engine's `run()` method.
- R2: When a yield reference resolves to `undefined` at run time (the yield object exists but lacks the property), the key must be omitted from givens entirely.
- R3: At startup, the Spider must validate that `<engine_id>` in a yield reference refers to an engine that exists in the same template.
- R4: At startup, the Spider must validate that the referenced `<engine_id>` is transitively reachable upstream of the engine using the reference (i.e., there exists a path through `upstream` arrays from the referencing engine back to the referenced engine).
- R5: When validation fails because `<engine_id>` does not exist in the template, the error message must identify it as an unknown engine id.
- R6: When validation fails because `<engine_id>` exists in the template but is not transitively upstream, the error message must explicitly state the upstream reachability problem (e.g., `engine "X" references $yields.Y.Z but "Y" is not upstream of "X"`).
- R7: For config templates, validation failures must throw (consistent with existing `validateTemplates()` behavior). For kit templates, validation failures must warn and skip the template (consistent with existing `validateKitTemplate()` behavior).
- R8: Yield references must survive spawn-time processing in `resolveGivens()` — stored as literal strings in `givensSpec` — and be resolved only at run time.
- R9: Yield references in givens must also be resolved before calling `design.collect()` in `tryCollect()`, so engines see consistent resolved givens in both `run()` and `collect()`.
- R10: The `RigTemplateEngine.givens` JSDoc must document the `$yields.*.*` namespace alongside `$writ` and `$vars.*`, with a note that yield references resolve at run time.
- R11: The `EngineInstance.givensSpec` JSDoc must be updated to acknowledge that the field may contain unresolved yield reference strings alongside resolved literal values.

## Design

### Type Changes

No structural type changes. The `RigTemplateEngine`, `EngineInstance`, `RigTemplate`, and `SpiderConfig` interfaces are unchanged in shape. Only JSDoc comments are updated.

Updated `RigTemplateEngine` (in `packages/plugins/spider/src/types.ts`):

```typescript
export interface RigTemplateEngine {
  /** Engine id unique within this template. */
  id: string;
  /** Engine design id to look up in the Fabricator. */
  designId: string;
  /** Engine ids within this template whose completion is required first. Defaults to []. */
  upstream?: string[];
  /**
   * Givens to pass to the engine.
   * String values starting with '$' (either $name or ${name}) are variable
   * references:
   *   '$writ' or '${writ}' — the WritDoc for this rig's writ
   *   '$vars.<key>' or '${vars.<key>}' — value from spider.variables config
   *   '$yields.<engine_id>.<property>' or '${yields.<engine_id>.<property>}'
   *       — a property from an upstream engine's yields (resolved at run time)
   * Non-string values are passed through literally.
   * Variables that resolve to undefined cause the key to be omitted.
   */
  givens?: Record<string, unknown>;
}
```

Updated `EngineInstance` block comment and `givensSpec` JSDoc (in `packages/plugins/spider/src/types.ts`):

```typescript
/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds values set at spawn time (writ, role, commands) and
 * may contain unresolved yield reference strings ('$yields.<id>.<prop>')
 * that the Spider resolves at run time from upstream engine yields.
 */
export interface EngineInstance {
  // ...
  /**
   * Givens values. Spawn-time references ($writ, $vars.*) are resolved to
   * their values. Yield references ($yields.*.*) remain as strings and are
   * resolved at run time when the engine is executed.
   */
  givensSpec: Record<string, unknown>;
  // ... (all other fields unchanged)
}
```

### Behavior

#### Yield reference regex (after normalization)

The regex for matching valid yield references after `normalizeVarRef()` stripping:

```typescript
const YIELD_REF_RE = /^\$yields\.[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z_][a-zA-Z0-9_]*$/;
```

The engine_id segment allows hyphens (kit-contributed engines commonly use them). The yield_name segment uses standard JS identifier characters.

#### Spawn-time pass-through in `resolveGivens()`

Add a branch to recognize `$yields.*` references and pass them through as literal strings. Without this, the current code silently drops them (the else-if chain has no fallthrough for unmatched `$`-prefixed patterns).

When `resolveGivens()` encounters a `$`-prefixed string value:
- If it matches `$writ` → resolve to WritDoc (existing)
- If it matches `$vars.*` → resolve from config variables (existing)
- If it matches `$yields.*.*` (via `YIELD_REF_RE`) → **pass through the original string as-is** into the result
- Otherwise → silently omit (existing behavior; caught by startup validation)

#### Run-time resolution via `resolveYieldRefs()`

New standalone function:

```typescript
/**
 * Resolve yield references in a givens map using the upstream yields.
 * '$yields.<engineId>.<prop>' → upstream[engineId][prop].
 * Keys resolving to undefined are omitted.
 * Non-yield-ref values are passed through unchanged.
 */
function resolveYieldRefs(
  givensSpec: Record<string, unknown>,
  upstream: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givensSpec)) {
    if (typeof value === 'string' && YIELD_REF_RE.test(normalizeVarRef(value))) {
      const normalized = normalizeVarRef(value);
      // Extract engine_id and property from '$yields.<engine_id>.<property>'
      const withoutPrefix = normalized.slice('$yields.'.length);
      const dotIndex = withoutPrefix.indexOf('.');
      const engineId = withoutPrefix.slice(0, dotIndex);
      const prop = withoutPrefix.slice(dotIndex + 1);
      const engineYields = upstream[engineId];
      if (
        engineYields !== null &&
        engineYields !== undefined &&
        typeof engineYields === 'object'
      ) {
        const resolved = (engineYields as Record<string, unknown>)[prop];
        if (resolved !== undefined) {
          result[key] = resolved;
        }
        // undefined property → omit key
      }
      // engine not in upstream (shouldn't happen — validated at startup) → omit key
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

#### Integration into `tryRun()`

In `tryRun()`, after building the upstream map and copying givensSpec, resolve yield refs before any other logic:

```typescript
const upstream = buildUpstreamMap(rig);
const givens = resolveYieldRefs({ ...pending.givensSpec }, upstream);
```

This replaces the current `const givens = { ...pending.givensSpec };`. The resolution happens before marking the engine as running (grouping it with other givens assembly).

#### Integration into `tryCollect()`

In `tryCollect()`, inside the `if (design?.collect)` branch, resolve yield refs the same way:

```typescript
const upstream = buildUpstreamMap(rig);
const givens = resolveYieldRefs({ ...engine.givensSpec }, upstream);
const context = { rigId: rig.id, engineId: engine.id, upstream };
yields = await design.collect(engine.sessionId!, givens, context);
```

This replaces the current `const givens = { ...engine.givensSpec };`.

#### Upstream reachability computation for validation

New helper function used by both validators:

```typescript
/**
 * Compute the set of engine ids transitively reachable upstream of a given engine.
 * Uses BFS over the template's upstream arrays.
 */
function computeUpstreamReachable(
  engineId: string,
  engines: RigTemplateEngine[],
): Set<string> {
  const engineMap = new Map(engines.map((e) => [e.id, e]));
  const reachable = new Set<string>();
  const queue: string[] = [...(engineMap.get(engineId)?.upstream ?? [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const deps = engineMap.get(current)?.upstream ?? [];
    queue.push(...deps);
  }
  return reachable;
}
```

#### Validation in `validateTemplates()` (config templates)

In the R7 variable reference validation block, extend the recognized-variable check. After checking `$writ` and `$vars.*`, add:

```typescript
if (YIELD_REF_RE.test(normalized)) {
  // Extract engine_id from '$yields.<engine_id>.<property>'
  const withoutPrefix = normalized.slice('$yields.'.length);
  const dotIndex = withoutPrefix.indexOf('.');
  const refEngineId = withoutPrefix.slice(0, dotIndex);

  // Check engine_id exists in template
  if (!engineIds.has(refEngineId)) {
    throw new Error(
      `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references $yields.${refEngineId} but "${refEngineId}" is not an engine in this template`
    );
  }

  // Check engine_id is transitively upstream
  const reachable = computeUpstreamReachable(engine.id, engines);
  if (!reachable.has(refEngineId)) {
    throw new Error(
      `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references $yields.${refEngineId}.${withoutPrefix.slice(dotIndex + 1)} but "${refEngineId}" is not upstream of "${engine.id}"`
    );
  }
  continue; // valid
}
```

This must appear before the final `throw` for unrecognized variables.

#### Validation in `validateKitTemplate()` (kit templates)

The same logic, but returning an error string instead of throwing:

```typescript
if (YIELD_REF_RE.test(normalized)) {
  const withoutPrefix = normalized.slice('$yields.'.length);
  const dotIndex = withoutPrefix.indexOf('.');
  const refEngineId = withoutPrefix.slice(0, dotIndex);

  if (!engineIds.has(refEngineId)) {
    return `${prefix}: engine "${engine.id}" references $yields.${refEngineId} but "${refEngineId}" is not an engine in this template`;
  }

  const reachable = computeUpstreamReachable(engine.id, template.engines);
  if (!reachable.has(refEngineId)) {
    return `${prefix}: engine "${engine.id}" references $yields.${refEngineId}.${withoutPrefix.slice(dotIndex + 1)} but "${refEngineId}" is not upstream of "${engine.id}"`;
  }
  continue;
}
```

### Non-obvious Touchpoints

- **`resolveGivens()` silent-drop behavior (line ~190):** The current code silently omits any `$`-prefixed string that doesn't match `$writ` or `$vars.*`. The new `$yields.*` branch must be added as an explicit pass-through *before* the implicit drop. If placed incorrectly (e.g., after the closing brace), yield references will be silently discarded at spawn time and the engine will receive empty givens at run time with no error.

- **Two parallel validation functions:** The variable reference validation logic exists in both `validateTemplates()` (config, lines 303-319) and `validateKitTemplate()` (kit, lines 605-619). Both must receive the identical yield reference handling. They differ only in error reporting (throw vs return string).

## Validation Checklist

- V1 [R1, R2]: Create a two-engine template where the second engine has `givens: { path: '$yields.draft.path' }` with `upstream: ['draft']`. Spawn a rig, run the draft engine to completion with yields `{ path: '/tmp/test' }`, then run the second engine. Verify the second engine's `run()` receives `givens.path === '/tmp/test'`. Repeat with a yield property that does not exist on the draft yields object and verify the key is absent from givens.

- V2 [R1, R5]: Create a template with `givens: { x: '${yields.draft.path}' }` (curly-brace form). Verify it behaves identically to the bare `$yields.draft.path` form.

- V3 [R3, R5]: Create a config template with `givens: { x: '$yields.nonexistent.foo' }` where `nonexistent` is not an engine id in the template. Verify startup throws a `[spider]`-prefixed error mentioning "not an engine in this template".

- V4 [R4, R6]: Create a config template with engines `[a, b]` where `b.upstream: ['a']` and `a.givens: { x: '$yields.b.foo' }` (a references b, but b is downstream of a). Verify startup throws a `[spider]`-prefixed error mentioning "not upstream of".

- V5 [R4, R6]: Create a config template with engines `[a, b, c]` where `b.upstream: ['a']`, `c.upstream: ['b']`, and `c.givens: { x: '$yields.a.foo' }` (a is transitively upstream of c). Verify startup does NOT throw — transitive reachability is accepted.

- V6 [R7]: Create a kit-contributed template with an invalid yield reference (engine_id not in template). Verify a console.warn is emitted and the template is skipped (not registered), without throwing.

- V7 [R8]: After spawning a rig from a template with yield references, inspect the `givensSpec` on the pending engine in the Stacks. Verify it contains the literal string (e.g., `'$yields.draft.path'`), not a resolved value.

- V8 [R9]: Create an engine design with a `collect()` method that inspects `givens`. Use a yield reference in the engine's template givens. After the engine's session completes, verify `collect()` receives resolved yield values (not raw strings).

- V9 [R10, R11]: Verify that the JSDoc on `RigTemplateEngine.givens` lists `$yields.<engine_id>.<property>` and notes run-time resolution. Verify that `EngineInstance.givensSpec` JSDoc mentions yield reference strings.

## Test Cases

### Happy path

1. **Basic yield resolution:** Template with `draft` (clockwork, yields `{ path: '/w' }`) → `impl` (upstream: `['draft']`, givens: `{ dir: '$yields.draft.path' }`). After draft completes and impl runs, `design.run()` receives `givens.dir === '/w'`.

2. **Curly-brace form:** Same as above but with `'${yields.draft.path}'`. Identical behavior.

3. **Transitive upstream:** Template with `a → b → c` chain. Engine `c` uses `$yields.a.someProp`. Verify the value resolves correctly (a is transitively upstream of c via b).

4. **Multiple yield refs in one engine:** Engine with `givens: { x: '$yields.a.foo', y: '$yields.b.bar', z: 'literal' }`. Verify all three resolve correctly (two yield refs + one literal pass-through).

5. **Mixed refs:** Engine with `givens: { w: '$writ', r: '$vars.role', p: '$yields.draft.path' }`. Verify $writ resolves at spawn time (WritDoc in givensSpec), $vars.role resolves at spawn time (string in givensSpec), $yields.draft.path remains as string in givensSpec and resolves at run time.

6. **Collect receives resolved givens:** Quick engine with `collect()` method and yield refs in givens. Verify `collect()` receives resolved values, not raw `$yields.*` strings.

### Edge cases

7. **Yield property missing:** `$yields.draft.nonExistentProp` — draft yields exist but lack the property. Verify the givens key is omitted (not present, not undefined).

8. **Engine yields are null/undefined:** Upstream engine completed with `yields: undefined` or `yields: null`. Yield reference to that engine's property omits the key.

9. **Yield ref alongside omitted $vars ref:** `givens: { a: '$yields.draft.path', b: '$vars.missing' }` where `missing` is not in config variables. Verify `a` resolves correctly and `b` is omitted — they don't interfere.

10. **Engine with no givens field:** Template engine with no `givens` key. Verify `givensSpec` is `{}` (existing behavior, no regression).

### Validation — error cases

11. **Unknown engine_id in config template:** `$yields.ghost.foo` where `ghost` is not an engine id. Startup throws `[spider]` error with "not an engine in this template".

12. **Non-upstream engine_id in config template:** `$yields.downstream.foo` where `downstream` exists but is not upstream. Startup throws `[spider]` error with "not upstream of".

13. **Self-reference:** `$yields.myEngine.foo` used in engine `myEngine`'s own givens. Fails the upstream reachability check (engine is never in its own upstream).

14. **Invalid yield reference syntax:** `$yields.draft` (missing property segment), `$yields.draft.a.b` (too many segments), `$yields..foo` (empty engine id). All rejected as unrecognized variables at startup.

15. **Kit template invalid yield ref:** Kit contributes a template with `$yields.nonexistent.foo`. Verify console.warn and template is skipped, no throw.

16. **Curly-brace form of invalid ref:** `${yields.ghost.foo}` — same error as bare form, error message includes the original `${...}` form (consistent with existing curly-brace error behavior).
