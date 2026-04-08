# Inventory: Spider — Support GivensSpec Templates Embedded in Strings

Slug: `spider-support-givensspec-templates-embedded`

---

## Brief Summary

The brief asks for two related capabilities:
1. **Inline string interpolation** — support template expressions embedded within larger strings in `givens` values, e.g. `"Write a spec. Decisions: ${yields.decision-review.decisionSummary}"` rather than only whole-value references like `"$yields.decision-review.decisionSummary"`.
2. **Tech debt cleanup** — general cleanup of how givens and yields flow between engines.
3. **Library consideration** — evaluate whether a real templating library should replace the hand-rolled regex system. If one exists that changes syntax, raise as a patron decision.

---

## Files That Will Be Affected

### Direct Changes (Certain)

| File | Change Type | Reason |
|------|-------------|--------|
| `packages/plugins/spider/src/spider.ts` | Modify | Core interpolation logic: `resolveGivens`, `resolveYieldRefs`, `normalizeVarRef`, `YIELD_REF_RE`, `validateTemplates`, `validateKitTemplate` |
| `packages/plugins/spider/src/spider.test.ts` | Modify | Add inline interpolation tests (validation, spawn-time, run-time) |
| `packages/plugins/spider/src/types.ts` | Modify | Update JSDoc on `RigTemplateEngine.givens` to reflect new syntax |

### Likely Changes

| File | Change Type | Reason |
|------|-------------|--------|
| `packages/plugins/spider/package.json` | Modify | Only if a templating library is added as a dependency |
| `docs/architecture/apparatus/spider.md` | Modify | The "Configuration" section documents `$vars.<key>`, `$writ`, `$yields.*.*` syntax |

### No Changes Expected

- `packages/plugins/spider/src/engines/*.ts` — engines themselves don't implement interpolation
- `packages/plugins/spider/src/tools/*.ts` — tools are unaffected
- `packages/plugins/spider/src/block-types/*.ts` — block types are unaffected
- Other apparatus packages — no cross-package interface changes

---

## Current Implementation — Full Code Walkthrough

### `packages/plugins/spider/src/spider.ts`

#### `normalizeVarRef(value: string): string` (line ~159)

```typescript
function normalizeVarRef(value: string): string {
  if (value.startsWith('${') && value.endsWith('}')) {
    return '$' + value.slice(2, -1);
  }
  return value;
}
```

Purpose: strips curly braces from whole-value `${foo}` → `$foo`. **Only handles whole-value patterns** — it cannot extract multiple embedded expressions from a string like `"Hello ${vars.name}, task: ${yields.draft.path}"`.

#### `YIELD_REF_RE` (line ~171)

```typescript
const YIELD_REF_RE = /^\$yields\.[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z_][a-zA-Z0-9_]*$/;
```

The `^` and `$` anchors make this a whole-value matcher only. Engine IDs allow hyphens (`[a-zA-Z0-9-]*`); property names use identifier-safe chars (`[a-zA-Z_][a-zA-Z0-9_]*`). This regex is used in three places: `resolveYieldRefs`, `resolveGivens`, and `validateTemplates`/`validateKitTemplate`.

#### `resolveGivens(givens, context)` (line ~239)

Called at **spawn time** (`buildFromTemplate`). Resolves `$writ` and `$vars.*` references. Passes `$yields.*.*` through as literal strings (to be resolved later at run time).

```typescript
function resolveGivens(
  givens: Record<string, unknown> | undefined,
  context: { writ: WritDoc; spiderConfig: SpiderConfig },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givens ?? {})) {
    if (typeof value !== 'string' || !value.startsWith('$')) {
      result[key] = value;  // non-string or non-$ → literal pass-through
    } else {
      const normalized = normalizeVarRef(value);
      if (normalized === '$writ') {
        result[key] = context.writ;  // whole WritDoc object
      } else if (/^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
        const varKey = normalized.slice('$vars.'.length);
        const resolved = (context.spiderConfig.variables ?? {})[varKey];
        if (resolved !== undefined) {
          result[key] = resolved;
        }
        // undefined → omit key entirely
      } else if (YIELD_REF_RE.test(normalized)) {
        result[key] = value;  // pass through as-is (unresolved yield ref)
      }
      // Unrecognized $-prefixed strings → caught at validation time
    }
  }
  return result;
}
```

**Key limitation**: The `!value.startsWith('$')` check means any string NOT starting with `$` is passed through unchanged, even if it contains embedded `${...}` patterns. `"prefix ${yields.foo.bar} suffix"` does not start with `$`, so it silently passes through as a literal.

**`$writ` sub-property access**: Currently `$writ` resolves to the entire WritDoc object. `${writ.body}` would be normalised to `$writ.body`, which matches neither `'$writ'` nor `$vars.*` nor `YIELD_REF_RE` — causing a validation-time "unrecognized variable" error. Accessing `writ.body` inline is currently impossible.

#### `resolveYieldRefs(givensSpec, upstream)` (line ~200)

Called at **run time** (`tryRun` and `tryCollect`). Resolves `$yields.*.*` whole-value references from completed upstream engine yields.

```typescript
function resolveYieldRefs(
  givensSpec: Record<string, unknown>,
  upstream: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givensSpec)) {
    if (typeof value === 'string' && YIELD_REF_RE.test(normalizeVarRef(value))) {
      const normalized = normalizeVarRef(value);
      const withoutPrefix = normalized.slice('$yields.'.length);
      const dotIndex = withoutPrefix.indexOf('.');
      const engineId = withoutPrefix.slice(0, dotIndex);
      const prop = withoutPrefix.slice(dotIndex + 1);
      const engineYields = upstream[engineId];
      if (engineYields !== null && engineYields !== undefined && typeof engineYields === 'object') {
        const resolved = (engineYields as Record<string, unknown>)[prop];
        if (resolved !== undefined) {
          result[key] = resolved;
        }
        // undefined property → omit key
      }
      // engine not in upstream → omit key
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

**Key limitation**: Only resolves whole-value patterns. Strings not matching `YIELD_REF_RE` (including strings with embedded `${yields.*.*}`) pass through unchanged.

**Resolved value type**: Returns the actual property value — could be any JSON type (string, number, boolean, object, array, null). For whole-value refs, this is correct (the full value flows through). For inline string interpolation, non-string values would need to be `String()`'d.

#### `buildFromTemplate(template, context)` (line ~271)

Calls `resolveGivens` for each engine's givens at spawn time. The returned `engines` array is stored in the RigDoc as `givensSpec`.

```typescript
function buildFromTemplate(template, context): { engines: EngineInstance[]; resolutionEngineId? } {
  const engines = template.engines.map((entry) => ({
    id: entry.id,
    designId: entry.designId,
    status: 'pending',
    upstream: entry.upstream ?? [],
    givensSpec: resolveGivens(entry.givens, context),
  }));
  return { engines, resolutionEngineId: template.resolutionEngine };
}
```

#### `validateTemplates(rigTemplates, fabricator)` (line ~289)

Called at startup for config-declared templates. Validates variable references at line ~376:

```typescript
// R7: Variable reference validation
for (const engine of engines) {
  for (const value of Object.values(engine.givens ?? {})) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const normalized = normalizeVarRef(value);
      if (normalized === '$writ' || /^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
        continue; // valid
      }
      if (YIELD_REF_RE.test(normalized)) {
        // check engine_id exists in template + is upstream
        continue;
      }
      throw new Error(`[spider] rigTemplates.${templateKey}: engine "${engine.id}" has unrecognized variable "${value}"`);
    }
  }
}
```

**Key limitation**: Only validates strings starting with `$`. A string like `"prefix ${yields.draft.path}"` does not start with `$`, so validation **silently skips it** — it would never be flagged as invalid, and the embedded reference would silently fail to resolve at run time.

#### `validateKitTemplate(...)` (line ~650)

Near-identical logic to `validateTemplates` — duplicated code for the variable reference validation section (lines ~724-753). Both check strings starting with `$`, normalize, and test against the same patterns. This is existing tech debt.

#### `tryRun()` (line ~1122)

At run time, calls `resolveYieldRefs` to expand yield references before calling `design.run(givens, context)`:

```typescript
const upstream = buildUpstreamMap(rig);
const givens = resolveYieldRefs({ ...pending.givensSpec }, upstream);
// ...
engineResult = await design.run(givens, context);
```

Note: the `{ ...pending.givensSpec }` shallow copy is unnecessary — `resolveYieldRefs` already creates a new `result` object. Minor tech debt.

#### `tryCollect()` (line ~961)

Also calls `resolveYieldRefs` before calling `design.collect()`:

```typescript
const upstream = buildUpstreamMap(rig);
const givens = resolveYieldRefs({ ...engine.givensSpec }, upstream);
const context = { rigId: rig.id, engineId: engine.id, upstream };
yields = await design.collect(engine.sessionId!, givens, context);
```

Same unnecessary spread pattern.

---

## Current Types

### `RigTemplateEngine.givens` JSDoc (types.ts, line ~131)

```typescript
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
```

This JSDoc describes whole-value references only. It does not document inline interpolation (which doesn't exist yet). Note that it documents `${writ}` as the syntax for the whole WritDoc — but accessing sub-properties like `${writ.body}` is not documented (and is currently unsupported).

### `EngineInstance.givensSpec` JSDoc (types.ts, line ~56)

```typescript
/**
 * Givens values. Spawn-time references ($writ, $vars.*) are resolved to
 * their values. Yield references ($yields.*.*) remain as strings and are
 * resolved at run time when the engine is executed.
 */
givensSpec: Record<string, unknown>;
```

This accurately describes the current two-phase resolution model.

---

## Validation Logic — What's Checked vs What's Missing

### Validation currently catches (throw for config, warn for kit):
- `$yields.<id>.<prop>` where `<id>` is not an engine in the template
- `$yields.<id>.<prop>` where `<id>` is not transitively upstream of the current engine
- `$yields.<id>` (missing property segment) — caught as unrecognized variable
- `$writ.body` (subproperty access on writ) — caught as unrecognized variable
- Any unrecognized `$`-prefixed string

### Validation currently misses (silently ignored):
- Inline embedded `${...}` patterns in strings that don't start with `$`
  - e.g., `"Prefix ${yields.draft.path}"` → not flagged, silently passes through unchanged
- Invalid inline refs within valid-looking strings
  - e.g., `"${yields.nonexistent.prop}"` (nonexistent engine) → not flagged at validation time

---

## Test Coverage

### `spider.test.ts` — `$yields.* reference support` section (line ~5222)

Covers:
- Config template validation: unknown engine_id → throws
- Config template validation: non-upstream engine_id → throws
- Transitive upstream reference → valid
- Self-reference → fails upstream reachability
- Curly-brace form `${yields.*.*}` → same validation
- Invalid syntax `$yields.draft` (no property segment) → unrecognized variable
- Valid `$yields` reference passes validation
- Curly-brace form passes validation when upstream
- `givensSpec` stores yield ref strings as-is at spawn time
- Curly-brace form preserved as-is in `givensSpec`
- Run-time: second engine receives resolved yield value
- Run-time: curly-brace form resolves identically
- Run-time: multiple yield refs in one engine all resolve
- Run-time: missing property causes key omission

### Missing test coverage (for new inline feature):
- Inline interpolation at spawn time (`${vars.key}` embedded in string)
- Inline interpolation at spawn time (`${writ.body}` embedded in string)
- Inline interpolation at run time (`${yields.engineId.prop}` embedded in string)
- Mixed inline: string with multiple embedded references
- Mixed: whole-value ref and inline ref in different keys of same givens
- Validation: inline ref with unknown engine → should warn/throw
- Validation: inline ref with non-upstream engine → should warn/throw
- Edge: non-string values embedded inline (number, boolean → String())
- Edge: missing inline ref property → how is it handled (empty string? omit? leave literal?)

---

## Adjacent Patterns — How Comparable Problems Are Handled

### The `$vars.*` variable pattern (existing)

`$vars.<key>` (whole-value) resolves to the config value. Undefined variables cause key omission. This is the precedent for "missing reference → omit".

### Template validation duplication

`validateTemplates` (config templates, ~290-415) and `validateKitTemplate` (kit templates, ~650-756) have nearly identical variable reference validation logic — 35+ lines repeated. The only differences:
- Config version throws; kit version returns error string
- Error message prefix format differs (`[spider] rigTemplates.X:` vs `[spider] Kit "X" rigTemplates.Y:`)

This duplication is explicitly called out in the brief as tech debt to fix.

### Pattern for new syntax decisions

The brief's example uses `${yields.decision-review.decisionSummary}` — curly-brace style. This is consistent with the existing `${yields.*.*}` whole-value syntax. The question is whether bare `$yields.*.*` inline (without braces) should also be supported. Looking at existing behavior: the curly-brace form is converted to bare form via `normalizeVarRef` before matching. For inline interpolation, only the curly-brace form (`${...}`) makes natural sense — bare `$` inline would be ambiguous about where the reference ends.

---

## Potential Templating Libraries

No templating library is currently in use anywhere in the codebase (search confirmed zero matches for mustache, handlebars, nunjucks, eta, ejs, lodash). The codebase uses Node.js 24.x (`.nvmrc`) and TypeScript 5.9.3.

### Options for patron decision:

**Option A: No external library — extend hand-rolled regex system**
- Keep current `${...}` / `$...` syntax
- Add inline regex: `/\$\{(yields\.[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z_][a-zA-Z0-9_]*|vars\.[a-zA-Z_][a-zA-Z0-9_]*|writ\.[a-zA-Z_][a-zA-Z0-9_]*)\}/g`
- No new dependency, no syntax change, minimal implementation
- Risk: edge cases (escaping, nested braces) hand-rolled

**Option B: `es6-template-strings` or similar** 
- Libraries that evaluate JS-style `${...}` template literals against a context object
- Could support `${writ.body}`, `${vars.role}`, `${yields.draft.path}` in a unified way
- Risk: syntax overlap with JS template literals; some libraries eval arbitrary JS (security concern)
- Unclear which specific library is lightweight enough

**Option C: `mustache` / `handlebars` style `{{...}}`**
- Widely used, well-tested, handles edge cases
- `mustache` npm package: ~14KB, zero dependencies
- **Breaking change**: existing `$writ`, `$vars.*`, `$yields.*.*` syntax would become `{{writ}}`, `{{vars.role}}`, `{{yields.draft.path}}`
- All existing guild configurations using `$`-style references would break

**Option D: `eta` (configurable delimiters)**
- Can be configured to use `${...}` or any delimiter
- ~7KB, minimal dependencies
- Would require configuring to use a non-default syntax

Given the brief's "prefer minimal and low-weight transitive dependencies" guidance and "breaking change may be acceptable," this is a patron decision.

---

## Tech Debt Identified

### TD1: Validation logic duplication
`validateTemplates` and `validateKitTemplate` both contain ~35 lines of near-identical variable reference validation (lines ~376-414 vs ~724-753). Could be extracted to a shared `validateGivensValues(givens, engineIds, reachableFn, errorFn)` helper with different error emission strategies (throw vs return string).

### TD2: Unnecessary spread in resolveYieldRefs call sites
`tryRun` and `tryCollect` both call `resolveYieldRefs({ ...pending.givensSpec }, upstream)` — the `{ ...engine.givensSpec }` spread is unnecessary because `resolveYieldRefs` already builds a new result object. Minor, but noise.

### TD3: `resolveGivens` and `resolveYieldRefs` are conceptually a single pipeline
The two-phase resolution (spawn-time then run-time) is correct design, but the functions could share a common "interpolate a single string value" subroutine that both call. Currently each function has its own if-chains.

### TD4: `normalizeVarRef` is too narrow for inline use
The function only handles the case where the entire string is `${...}`. For inline interpolation, we need a different scanning approach — either a new function or replacement.

### TD5: `$writ` sub-property access impossible
Currently `${writ.body}` is flagged as "unrecognized variable" at validation time. The brief's example implies `${writ.body}` type access should work for inline interpolation. This is a new capability.

### TD6: Engine implementations use `context.upstream` escape hatch for all cross-engine data
The implement, review, revise, and seal engines all use `context.upstream['draft']` to access DraftYields, rather than declaring those values in givens. With inline interpolation, individual properties from upstream yields can be declared in givens (e.g., `path: '${yields.draft.path}'`). However, whole object references (getting the full DraftYields struct) are not possible via givens interpolation — only scalar properties can be interpolated into strings. The engines using the escape hatch to get whole objects (not just strings) are correct to do so. This is NOT tech debt to fix; it's correct design.

---

## Doc/Code Discrepancies

### D1: `spider.md` documents static 5-engine pipeline as "MVP"
The architecture doc (`docs/architecture/apparatus/spider.md`) says "⚠️ MVP scope" and describes a static 5-engine pipeline. The actual code has already evolved significantly beyond this: rig templates, kit contributions, block types, input requests. The doc is significantly stale.

### D2: `spider.md` givens interpolation listed as "future evolution"
The doc lists "givensSpec templates" under "Future Evolution" as a planned feature (`${draft.worktreePath}` style). This is the feature we're implementing. After this change, the doc should move this from future to current.

### D3: `spider.md` uses `context.upstream` for yield data flow
The doc describes engines accessing upstream yields via `context.upstream`. The actual EngineInstance `givensSpec` comment says "Yield references ($yields.*.*) remain as strings and are resolved at run time" — but this refers to whole-value refs, not inline. The docs and code agree on current behavior but the docs don't reflect the newly planned inline capability.

### D4: `spider.md` configuration section doesn't document `$yields.*.*` in templates
The configuration section in `spider.md` only describes `$vars.<key>` and `$writ` — doesn't mention `$yields.*.*` givens support which was already shipped.

---

## Key Questions for Analyst

1. **Inline syntax for `$writ` properties**: Should `${writ.body}`, `${writ.title}`, etc. work for inline interpolation? (Currently `$writ` resolves to the whole object, but `${writ.body}` is invalid.) The brief implies we want `${yields.decision-review.decisionSummary}` style, suggesting deep property access.

2. **Behavior when inline ref is missing/undefined**: If `${yields.draft.nonExistentProp}` appears inline, what should happen? Options: empty string, literal `${...}` pass-through, error. Whole-value refs currently omit the key entirely — inline can't omit a key, so it needs a different behavior.

3. **Bare `$...` inline**: Should `Hello $vars.role world` work inline, or only `${vars.role}`? Given ambiguity about where bare refs end, likely curly-brace-only for inline.

4. **Validation of inline refs**: Current validation only checks strings starting with `$`. Should inline refs in strings NOT starting with `$` be validated at startup? (Currently silently ignored.)

5. **Non-string values in inline**: `${vars.count}` where `count: 42` — should this stringify to `"42"` in the resulting string? Almost certainly yes.

6. **Library decision**: Should a lightweight library be introduced? If syntax change is acceptable, what library?
