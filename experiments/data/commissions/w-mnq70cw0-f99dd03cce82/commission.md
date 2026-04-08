---
author: plan-writer
estimated_complexity: 8
---

# Spider: Unified `${...}` Template Interpolation for Givens

## Summary

Replace the Spider's dual-syntax variable reference system (bare-`$` whole-value and `${...}` whole-value) with a single `${...}` interpolation syntax that supports both whole-value replacement and inline string embedding. Extract all templating logic into an isolated module (`packages/plugins/spider/src/template.ts`). Remove `normalizeVarRef` and bare-`$` support entirely.

## Current State

### Resolution functions in `packages/plugins/spider/src/spider.ts`

Two functions handle givens resolution in two phases:

**`resolveGivens`** (spawn time, line ~240): Processes template givens when a rig is spawned. Handles `$writ` → whole WritDoc, `$vars.<key>` → config variable value, and `$yields.*.*` → pass-through as literal string. Only activates on strings starting with `$`. Uses `normalizeVarRef` to strip `${...}` wrapper for whole-value forms.

**`resolveYieldRefs`** (run time, line ~201): Resolves `$yields.<engineId>.<prop>` strings from upstream engine yields at engine execution time. Uses `YIELD_REF_RE = /^\$yields\.[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z_][a-zA-Z0-9_]*$/` — anchored to match only whole-value strings.

**`normalizeVarRef`** (line ~160): Converts `${foo}` → `$foo` by stripping curly braces. Used by both resolution functions and both validation functions.

### Validation in `packages/plugins/spider/src/spider.ts`

Two near-identical blocks (~35 lines each) validate variable references:

**`validateTemplates`** (line ~377): Config templates — throws on first invalid ref.

**`validateKitTemplate`** (line ~726): Kit templates — returns error string or null.

Both check strings starting with `$`, normalize via `normalizeVarRef`, then test against `$writ`, `$vars.*` regex, and `YIELD_REF_RE`. They also validate that `$yields.*.*` engine IDs exist and are transitively upstream.

### Types in `packages/plugins/spider/src/types.ts`

```typescript
// RigTemplateEngine.givens (line ~131)
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

// EngineInstance.givensSpec (line ~56)
/**
 * Givens values. Spawn-time references ($writ, $vars.*) are resolved to
 * their values. Yield references ($yields.*.*) remain as strings and are
 * resolved at run time when the engine is executed.
 */
givensSpec: Record<string, unknown>;
```

### Call sites in `packages/plugins/spider/src/spider.ts`

- `tryRun` (line ~1140): `const givens = resolveYieldRefs({ ...pending.givensSpec }, upstream);` — unnecessary spread
- `tryCollect` (line ~986): `const givens = resolveYieldRefs({ ...engine.givensSpec }, upstream);` — unnecessary spread
- `buildFromTemplate` (line ~271): `givensSpec: resolveGivens(entry.givens, context)`

### Test fixtures in `packages/plugins/spider/src/spider.test.ts`

`STANDARD_TEMPLATE` (line ~44) and many test templates use bare-`$` syntax:
```typescript
{ id: 'draft', designId: 'draft', givens: { writ: '$writ' } },
{ id: 'implement', designId: 'implement', upstream: ['draft'], givens: { writ: '$writ', role: '$vars.role' } },
```

All bare-`$` references in tests must be migrated to `${...}` syntax.

## Requirements

- R1: All variable references in givens use exclusively `${...}` syntax. Bare-`$` references (`$writ`, `$vars.role`, `$yields.draft.path`) are no longer recognized. The `normalizeVarRef` function is deleted.
- R2: `${writ}` as a whole-value string resolves to the full WritDoc object. `${writ.<field>}` accesses a specific field on the WritDoc via generic property access (any field, not an allowlist).
- R3: `${vars.<key>}` resolves to the config variable value. `${vars.<dotpath>}` supports arbitrary dot-path traversal for nested variable structures.
- R4: `${yields.<engineId>.<dotpath>}` resolves to a property from an upstream engine's yields at run time. Supports arbitrary dot-path traversal.
- R5: When a string contains ONLY a single `${...}` expression with no surrounding text, the result is the raw resolved value (preserving type — object, number, etc.). When a string contains surrounding text or multiple expressions, the result is a string with all expressions interpolated.
- R6: When an inline `${...}` expression resolves to `undefined` (missing property), it is replaced with an empty string in the interpolated result.
- R7: When an inline `${...}` expression resolves to a non-string primitive (number, boolean), it is stringified with `String(value)`. When it resolves to an object or array, it is stringified with `JSON.stringify(value)`.
- R8: Strings with mixed spawn-time and run-time references are partially resolved at spawn time: `${writ.*}` and `${vars.*}` are resolved, while `${yields.*}` expressions are left as literal `${yields.*}` text in the stored givensSpec string. The run-time phase then resolves the remaining `${yields.*}` expressions.
- R9: The escape sequence `\${` produces a literal `${` in the output — the expression is not interpolated.
- R10: At startup, all string givens values containing `${` are scanned for template expressions. Each expression is validated: it must match one of `writ`, `writ.<path>`, `vars.<path>`, or `yields.<engineId>.<path>`. Unrecognized expressions (e.g. `${unknown.foo}`) cause a validation error. For `yields` refs, the engine ID must exist in the template and be transitively upstream of the referencing engine.
- R11: Validation fails on the first invalid expression in a string (fail-fast).
- R12: The validation logic is extracted into a shared `validateGivensRefs(givens, engineId, engineIds, allEngines): string | null` function. Config template validation calls this and throws if non-null. Kit template validation calls this and returns the string.
- R13: All template interpolation logic (the `interpolateTemplate` function, expression parsing, dot-path traversal, stringification, and escape handling) is extracted to a new module `packages/plugins/spider/src/template.ts`.
- R14: The unnecessary `{ ...engine.givensSpec }` spreads in `tryRun` and `tryCollect` are removed — `givensSpec` is passed directly to `resolveYieldRefs`.
- R15: JSDoc on `RigTemplateEngine.givens` and `EngineInstance.givensSpec` is updated to document the `${...}`-only syntax, inline interpolation, dot-path traversal, and escape mechanism.
- R16: All existing tests using bare-`$` syntax are migrated to `${...}` syntax.

## Design

### New module: `packages/plugins/spider/src/template.ts`

This module contains all interpolation logic, isolated so it can be replaced with a library later.

```typescript
/**
 * Givens template interpolation — isolated module.
 *
 * Handles ${...} expression scanning, parsing, resolution, and stringification.
 * Designed to be replaceable with an external templating library if needed.
 */

/** Regex to find all ${...} expressions in a string. */
const TEMPLATE_EXPR_RE = /\$\{([^}]+)\}/g;

/** Regex to detect escaped \${ sequences. */
const ESCAPED_TEMPLATE_RE = /\\\$\{/g;

/** Sentinel used during interpolation to protect escaped sequences. */
const ESCAPE_SENTINEL = '\x00ESCAPED_TEMPLATE_DOLLAR\x00';

/**
 * Resolve a dot-path against a root value.
 *
 * resolveDotPath({ a: { b: 42 } }, 'a.b') → 42
 * resolveDotPath({ a: 1 }, 'a.b.c') → undefined
 *
 * Returns undefined if any segment along the path is nullish or not an object.
 */
export function resolveDotPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Convert a resolved value to a string for inline interpolation.
 *
 * - undefined → '' (empty string)
 * - string → as-is
 * - number, boolean, bigint, symbol → String(value)
 * - object, array (including null) → JSON.stringify(value)
 */
export function stringifyForInline(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  return String(value);
}

/**
 * Test whether a string contains any ${...} template expressions
 * (excluding escaped \${).
 */
export function containsTemplate(value: string): boolean {
  // Quick check before regex
  if (!value.includes('${')) return false;
  // Reset and test with the global regex
  TEMPLATE_EXPR_RE.lastIndex = 0;
  const cleaned = value.replace(ESCAPED_TEMPLATE_RE, '');
  return TEMPLATE_EXPR_RE.test(cleaned);
}

/**
 * Extract all expression bodies from a template string.
 * Returns the content inside each ${...}, ignoring escaped \${.
 *
 * extractExpressions('Hello ${writ.title} at ${yields.d.path}')
 *   → ['writ.title', 'yields.d.path']
 */
export function extractExpressions(value: string): string[] {
  const cleaned = value.replace(ESCAPED_TEMPLATE_RE, ESCAPE_SENTINEL);
  const exprs: string[] = [];
  const re = new RegExp(TEMPLATE_EXPR_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    exprs.push(match[1]);
  }
  return exprs;
}

/**
 * Interpolate a template string.
 *
 * When the string is exactly one ${...} expression with no surrounding text,
 * returns the raw resolved value (preserving type).
 *
 * When the string has surrounding text or multiple expressions, returns
 * a string with all expressions replaced by their stringified values.
 *
 * The `resolve` callback receives the expression body (e.g. 'writ.title',
 * 'yields.draft.path') and returns the resolved value, or undefined if
 * unresolvable. Callers control which namespaces are available.
 *
 * Escaped \${ sequences produce literal ${ in the output.
 */
export function interpolateTemplate(
  value: string,
  resolve: (expr: string) => unknown | undefined,
): unknown {
  // Protect escaped sequences
  const working = value.replace(ESCAPED_TEMPLATE_RE, ESCAPE_SENTINEL);

  // Check for single-expression whole-value: exactly ${expr} with nothing else
  const singleRe = /^\$\{([^}]+)\}$/;
  const singleMatch = singleRe.exec(working);
  if (singleMatch) {
    const resolved = resolve(singleMatch[1]);
    // For whole-value, return raw value (preserving type).
    // undefined → return undefined (caller decides whether to omit key).
    return resolved;
  }

  // Multi-expression or inline: interpolate as string
  const result = working.replace(
    new RegExp(TEMPLATE_EXPR_RE.source, 'g'),
    (_match, expr: string) => {
      const resolved = resolve(expr);
      return stringifyForInline(resolved);
    },
  );

  // Restore escaped sequences to literal ${
  return result.replaceAll(ESCAPE_SENTINEL, '${');
}
```

### Changes to `packages/plugins/spider/src/spider.ts`

#### Deletions

- Delete `normalizeVarRef` function entirely.
- Delete `YIELD_REF_RE` constant entirely.
- Delete the inline variable-reference-validation loops from both `validateTemplates` (lines ~377–414) and `validateKitTemplate` (lines ~726–753).

#### New import

```typescript
import {
  interpolateTemplate,
  containsTemplate,
  extractExpressions,
  resolveDotPath,
} from './template.ts';
```

#### New shared validation function

```typescript
/**
 * Validate all ${...} expressions in a single engine's givens.
 *
 * Returns a human-readable error string on the first invalid expression,
 * or null if all expressions are valid.
 *
 * Checks:
 * - Expression must start with 'writ', 'vars', or 'yields'
 * - 'yields' expressions must reference an engine that exists in the template
 *   and is transitively upstream of the referencing engine
 * - 'writ' must be bare ('writ') or have a dot-path ('writ.<path>')
 * - 'vars' must have a dot-path ('vars.<path>')
 * - 'yields' must have at least engineId and one path segment ('yields.<id>.<path>')
 */
function validateGivensRefs(
  givens: Record<string, unknown>,
  engineId: string,
  engineIds: Set<string>,
  allEngines: RigTemplateEngine[],
): string | null {
  for (const [_key, value] of Object.entries(givens)) {
    if (typeof value !== 'string') continue;
    if (!value.includes('${')) continue;

    const expressions = extractExpressions(value);
    for (const expr of expressions) {
      if (expr === 'writ' || expr.startsWith('writ.')) {
        continue; // valid — whole writ or writ sub-property
      }
      if (expr.startsWith('vars.')) {
        // Must have at least one segment after 'vars.'
        if (expr === 'vars.') {
          return `engine "${engineId}" has invalid expression "\${${expr}}" — vars requires a key`;
        }
        continue; // valid
      }
      if (expr.startsWith('yields.')) {
        // Must be yields.<engineId>.<path> — at least two dots total
        const withoutPrefix = expr.slice('yields.'.length);
        const dotIndex = withoutPrefix.indexOf('.');
        if (dotIndex < 0) {
          return `engine "${engineId}" has invalid expression "\${${expr}}" — yields requires engineId and property path`;
        }
        const refEngineId = withoutPrefix.slice(0, dotIndex);

        if (!engineIds.has(refEngineId)) {
          return `engine "${engineId}" references \${yields.${refEngineId}} but "${refEngineId}" is not an engine in this template`;
        }

        const reachable = computeUpstreamReachable(engineId, allEngines);
        if (!reachable.has(refEngineId)) {
          const yieldPath = withoutPrefix.slice(dotIndex + 1);
          return `engine "${engineId}" references \${yields.${refEngineId}.${yieldPath}} but "${refEngineId}" is not upstream of "${engineId}"`;
        }
        continue; // valid
      }
      return `engine "${engineId}" has unrecognized expression "\${${expr}}"`;
    }
  }
  return null;
}
```

#### Updated `validateTemplates`

Replace the inline R7 validation loop with:

```typescript
// R7: Variable reference validation
for (const engine of engines) {
  const refError = validateGivensRefs(engine.givens ?? {}, engine.id, engineIds, engines);
  if (refError !== null) {
    throw new Error(`[spider] rigTemplates.${templateKey}: ${refError}`);
  }
}
```

#### Updated `validateKitTemplate`

Replace the inline variable reference validation with:

```typescript
// Variable reference validation
for (const engine of engines) {
  const refError = validateGivensRefs(engine.givens ?? {}, engine.id, engineIds, template.engines);
  if (refError !== null) {
    return `${prefix}: ${refError}`;
  }
}
```

#### Rewritten `resolveGivens`

```typescript
/**
 * Resolve a template engine's givens map at spawn time.
 *
 * Resolves ${writ}, ${writ.<path>}, and ${vars.<path>} expressions.
 * ${yields.*} expressions are left as-is (resolved at run time).
 * Keys whose whole-value expression resolves to undefined are omitted.
 * Non-string values are passed through literally.
 */
function resolveGivens(
  givens: Record<string, unknown> | undefined,
  context: { writ: WritDoc; spiderConfig: SpiderConfig },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givens ?? {})) {
    if (typeof value !== 'string' || !containsTemplate(value)) {
      result[key] = value;
      continue;
    }
    const resolved = interpolateTemplate(value, (expr) => {
      if (expr === 'writ') return context.writ;
      if (expr.startsWith('writ.')) {
        return resolveDotPath(context.writ, expr.slice('writ.'.length));
      }
      if (expr.startsWith('vars.')) {
        return resolveDotPath(context.spiderConfig.variables ?? {}, expr.slice('vars.'.length));
      }
      if (expr.startsWith('yields.')) {
        // Return a sentinel: leave the ${yields.*} expression in place
        return undefined;
      }
      return undefined;
    });
    if (resolved !== undefined) {
      result[key] = resolved;
    }
    // undefined whole-value → omit key
  }
  return result;
}
```

**Critical behavior for mixed strings (R8):** When a string contains both `${writ.*}` and `${yields.*}` expressions (e.g., `"Title: ${writ.title}, Path: ${yields.draft.path}"`), the spawn-time resolver resolves `${writ.title}` to its value and `${yields.draft.path}` to empty string (since the resolver returns `undefined` for yields, and `stringifyForInline(undefined)` returns `''`).

**Wait — this loses the yield ref.** The string would become `"Title: My Writ, Path: "` and the yields expression would be gone. The run-time phase would have nothing to resolve.

The spawn-time resolver must **not** resolve yields expressions at all. When `interpolateTemplate` encounters an expression where the resolver returns `undefined`, the single-expression case returns `undefined` (key omission). But for inline/mixed strings, replacing with empty string destroys yield refs.

This requires a refinement of `interpolateTemplate`: the resolver needs a way to signal "leave this expression in place" vs "resolved to undefined/missing." A three-way return:
- A value (including `undefined` as a real value mapped to empty string)
- A special sentinel meaning "skip — do not interpolate this expression"

Updated `interpolateTemplate` design:

```typescript
/** Sentinel value: resolver returns this to leave the expression unmodified. */
export const SKIP = Symbol('SKIP');

export function interpolateTemplate(
  value: string,
  resolve: (expr: string) => unknown | typeof SKIP,
): unknown {
  const working = value.replace(ESCAPED_TEMPLATE_RE, ESCAPE_SENTINEL);

  // Single-expression whole-value
  const singleRe = /^\$\{([^}]+)\}$/;
  const singleMatch = singleRe.exec(working);
  if (singleMatch) {
    const resolved = resolve(singleMatch[1]);
    if (resolved === SKIP) {
      // Leave the original expression — restore escapes and return as-is
      return value;
    }
    return resolved;
  }

  // Multi/inline: interpolate as string
  const result = working.replace(
    new RegExp(TEMPLATE_EXPR_RE.source, 'g'),
    (fullMatch, expr: string) => {
      const resolved = resolve(expr);
      if (resolved === SKIP) return fullMatch; // leave expression in place
      return stringifyForInline(resolved);
    },
  );

  return result.replaceAll(ESCAPE_SENTINEL, '${');
}
```

And the spawn-time resolver becomes:

```typescript
// In resolveGivens resolver callback:
if (expr.startsWith('yields.')) {
  return SKIP; // leave for run-time resolution
}
```

#### Rewritten `resolveYieldRefs`

```typescript
/**
 * Resolve ${yields.*} expressions in a givens map at run time.
 *
 * Processes all string values containing ${yields.<engineId>.<path>} and
 * resolves them from upstream engine yields. Non-yield expressions and
 * non-string values pass through unchanged.
 * Keys whose whole-value expression resolves to undefined are omitted.
 */
function resolveYieldRefs(
  givensSpec: Record<string, unknown>,
  upstream: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givensSpec)) {
    if (typeof value !== 'string' || !containsTemplate(value)) {
      result[key] = value;
      continue;
    }
    const resolved = interpolateTemplate(value, (expr) => {
      if (!expr.startsWith('yields.')) {
        return SKIP; // not a yield ref — leave in place (shouldn't happen after spawn-time resolution, but safe)
      }
      const withoutPrefix = expr.slice('yields.'.length);
      const dotIndex = withoutPrefix.indexOf('.');
      if (dotIndex < 0) return undefined; // malformed — validated at startup
      const engineId = withoutPrefix.slice(0, dotIndex);
      const propPath = withoutPrefix.slice(dotIndex + 1);
      const engineYields = upstream[engineId];
      return resolveDotPath(engineYields, propPath);
    });
    if (resolved !== undefined) {
      result[key] = resolved;
    }
    // undefined whole-value → omit key
  }
  return result;
}
```

#### Updated call sites

In `tryRun` (~line 1140):
```typescript
// Before:
const givens = resolveYieldRefs({ ...pending.givensSpec }, upstream);
// After:
const givens = resolveYieldRefs(pending.givensSpec, upstream);
```

In `tryCollect` (~line 986):
```typescript
// Before:
const givens = resolveYieldRefs({ ...engine.givensSpec }, upstream);
// After:
const givens = resolveYieldRefs(engine.givensSpec, upstream);
```

### Type Changes in `packages/plugins/spider/src/types.ts`

No structural type changes. JSDoc updates only:

```typescript
// RigTemplateEngine.givens
/**
 * Givens to pass to the engine.
 *
 * String values may contain `${...}` template expressions:
 *   `${writ}` — the full WritDoc for this rig's writ
 *   `${writ.<path>}` — a field of the WritDoc (dot-path traversal)
 *   `${vars.<path>}` — value from spider.variables config (dot-path traversal)
 *   `${yields.<engine_id>.<path>}` — a property from an upstream engine's
 *       yields (resolved at run time, dot-path traversal)
 *
 * When a string is exactly one expression (e.g. `${writ}`), the resolved
 * value preserves its original type. When expressions are embedded in a
 * larger string, the result is always a string.
 *
 * Non-string values are passed through literally.
 * Whole-value expressions that resolve to undefined cause the key to be omitted.
 * Inline expressions that resolve to undefined are replaced with empty string.
 *
 * Use `\${` to produce a literal `${` in the output.
 */
givens?: Record<string, unknown>;

// EngineInstance.givensSpec
/**
 * Givens values. Spawn-time expressions (`${writ}`, `${writ.*}`, `${vars.*}`)
 * are resolved to their values. Yield expressions (`${yields.*}`) remain as
 * literal `${yields.*}` strings and are resolved at run time when the engine
 * is executed.
 */
givensSpec: Record<string, unknown>;
```

### Barrel export in `packages/plugins/spider/src/index.ts`

No changes needed — the template module is internal to the spider package. It is not re-exported from index.ts.

### Non-obvious Touchpoints

- **All test fixtures using bare-`$` syntax** must be migrated to `${...}`. This affects `STANDARD_TEMPLATE`, every `buildFixture` call with custom templates, and the yield-ref test suite. The migration is mechanical: `'$writ'` → `'${writ}'`, `'$vars.role'` → `'${vars.role}'`, `'$yields.first.path'` → `'${yields.first.path}'`.
- **Test assertions checking for bare-`$` strings in givensSpec** must be updated. For example, tests that assert `secondEngine.givensSpec.p === '$yields.first.path'` must assert `'${yields.first.path}'` instead.
- **Validation tests that check error messages** referencing `unrecognized variable "$foo"` must be updated to reflect the new error format (`unrecognized expression "${foo}"`).
- **The `$yields.* reference tests` section** (line ~5222) tests bare-`$` and `${...}` forms. All bare-`$` tests become `${...}` tests. Tests that verified `normalizeVarRef` equivalence between the two forms can be removed since there's only one form now.

## Validation Checklist

- V1 [R1, R16]: Verify that all bare-`$` references (`$writ`, `$vars.role`, `$yields.draft.path`) in test fixtures have been converted to `${...}` syntax. Run: `grep -rn "'\\\$writ\|'\\\$vars\|'\\\$yields" packages/plugins/spider/src/` — should return zero matches (excluding comments explaining the migration).
- V2 [R1]: Verify that `normalizeVarRef` does not exist in `spider.ts`. Run: `grep -n 'normalizeVarRef' packages/plugins/spider/src/spider.ts` — should return zero matches.
- V3 [R1]: Verify that `YIELD_REF_RE` does not exist in `spider.ts`. Run: `grep -n 'YIELD_REF_RE' packages/plugins/spider/src/spider.ts` — should return zero matches.
- V4 [R2]: Write a test: a template with `givens: { writ: '${writ}' }` — after spawn, `givensSpec.writ` is the full WritDoc object (same type, same id).
- V5 [R2, R5]: Write a test: a template with `givens: { title: '${writ.title}' }` — when the whole string is the expression, the resolved value is the raw string value of `writ.title`, not a stringified version.
- V6 [R3]: Write a test: `givens: { role: '${vars.role}' }` resolves to the config variable value.
- V7 [R4]: Write a test: `givens: { dir: '${yields.first.path}' }` — at run time, resolves to the upstream engine's yields.path value.
- V8 [R5]: Write a test: `givens: { msg: 'Path is ${yields.first.path}' }` — inline interpolation produces a string like `"Path is /tmp/workdir"`.
- V9 [R5]: Write a test: `givens: { msg: 'Title: ${writ.title}, Path: ${yields.draft.path}' }` — after spawn-time resolution, givensSpec contains `"Title: My Writ, Path: ${yields.draft.path}"`. After run-time resolution, contains `"Title: My Writ, Path: /tmp/workdir"`.
- V10 [R6]: Write a test: `givens: { msg: 'Codex: ${writ.codex}' }` with a writ that has `codex: undefined` — result is `"Codex: "`.
- V11 [R7]: Write a test: inline `${yields.first.count}` where count is `42` (number) — result string contains `"42"`. Test with an object value — result contains JSON.
- V12 [R8]: Verify that mixed strings preserve yield refs at spawn time. Test: `givens: { prompt: '${writ.title}: ${yields.first.result}' }` — givensSpec after spawn contains the writ title resolved and the yields expression as literal text.
- V13 [R9]: Write a test: `givens: { msg: 'Use \\${this} syntax' }` — result is `"Use ${this} syntax"`, not an interpolation attempt.
- V14 [R10, R11]: Write a test: config template with `givens: { x: '${unknown.foo}' }` — throws at startup with error mentioning "unrecognized expression".
- V15 [R10, R14]: Write a test: config template with `givens: { x: '${yields.nonexistent.foo}' }` where engine "nonexistent" doesn't exist — throws at startup.
- V16 [R10, R14]: Write a test: config template with `givens: { x: '${yields.downstream.foo}' }` where "downstream" is not upstream — throws at startup.
- V17 [R12]: Verify that `validateGivensRefs` is the shared function used by both `validateTemplates` and `validateKitTemplate`. Run: `grep -n 'validateGivensRefs' packages/plugins/spider/src/spider.ts` — should appear in both validation contexts.
- V18 [R13]: Verify that `packages/plugins/spider/src/template.ts` exists and exports `interpolateTemplate`, `containsTemplate`, `extractExpressions`, `resolveDotPath`, `stringifyForInline`, and `SKIP`.
- V19 [R14]: Verify no `{ ...engine.givensSpec }` or `{ ...pending.givensSpec }` spreads remain before `resolveYieldRefs` calls. Run: `grep -n '\.\.\..*givensSpec' packages/plugins/spider/src/spider.ts` — should return zero matches.
- V20 [R15]: Verify JSDoc on `RigTemplateEngine.givens` mentions `${...}` syntax, dot-path traversal, and `\${` escape.
- V21 [R5, R2]: Write a test: `givens: { data: '${yields.first.obj}' }` where `obj` is `{ a: 1 }` — since it's a whole-value single expression, the result is the raw object `{ a: 1 }`, not a string.
- V22 [R4, R5]: Write a test for deep dot-path: `givens: { val: '${yields.first.nested.deep.prop}' }` where first's yields are `{ nested: { deep: { prop: 'found' } } }` — resolves to `'found'`.
- V23 [R1–R16]: Run the full test suite: `cd packages/plugins/spider && node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'` — all tests pass.

## Test Cases

### Happy path — whole-value resolution

1. `{ writ: '${writ}' }` → resolves to WritDoc object at spawn time
2. `{ title: '${writ.title}' }` → resolves to writ.title string at spawn time
3. `{ role: '${vars.role}' }` → resolves to config variable at spawn time
4. `{ path: '${yields.first.path}' }` → stored as literal `'${yields.first.path}'` at spawn, resolved to yield value at run time
5. `{ deep: '${yields.first.nested.prop}' }` → deep dot-path traversal at run time

### Happy path — inline interpolation

6. `{ msg: 'Hello ${writ.title}' }` → `"Hello <title>"` at spawn time
7. `{ msg: 'Path: ${yields.first.path}' }` → stored as `"Path: ${yields.first.path}"` at spawn, resolved to `"Path: /tmp/dir"` at run time
8. `{ msg: '${writ.title}: ${yields.first.result}' }` → partial resolution at spawn: `"<title>: ${yields.first.result}"`, full resolution at run: `"<title>: <result>"`
9. `{ msg: '${writ.title} (${vars.env})' }` → both resolved at spawn time

### Edge cases — undefined / missing

10. `{ codex: '${writ.codex}' }` where writ has no codex → whole-value returns undefined → key omitted
11. `{ msg: 'Codex: ${writ.codex}' }` where writ has no codex → inline → `"Codex: "` (empty string substitution)
12. `{ path: '${yields.first.noSuchProp}' }` → whole-value returns undefined → key omitted
13. `{ msg: 'Val: ${yields.first.noSuchProp}' }` → inline → `"Val: "` (empty string)
14. `{ val: '${vars.undefined_key}' }` → whole-value returns undefined → key omitted

### Edge cases — type coercion

15. `{ msg: 'Count: ${yields.first.count}' }` where count=42 → `"Count: 42"` (String for number)
16. `{ msg: 'Ok: ${yields.first.flag}' }` where flag=true → `"Ok: true"` (String for boolean)
17. `{ msg: 'Data: ${yields.first.obj}' }` where obj={a:1} → `"Data: {\"a\":1}"` (JSON.stringify for object)
18. `{ data: '${yields.first.obj}' }` where obj={a:1} → raw `{a:1}` object (whole-value preserves type)

### Escape mechanism

19. `{ msg: 'Use \\${this} syntax' }` → `"Use ${this} syntax"` (literal ${, no interpolation)
20. `{ msg: '\\${writ.title} is escaped but ${writ.title} is not' }` → `"${writ.title} is escaped but <title> is not"`

### Validation — errors

21. `{ x: '${unknown.foo}' }` → config template throws: unrecognized expression
22. `{ x: '${yields.nonexistent.foo}' }` → config template throws: engine not in template
23. `{ x: '${yields.downstream.foo}' }` where downstream is not upstream → throws: not upstream
24. `{ x: '${vars.}' }` → throws: invalid expression (no key after vars.)
25. `{ x: '${yields.eng}' }` → throws: invalid expression (no property path)
26. `{ x: 'valid ${writ.title} and ${bad.ref}' }` → throws on first invalid (bad.ref)
27. Kit template with `{ x: '${yields.nonexistent.foo}' }` → warns and skips (does not throw)

### Validation — valid

28. `{ x: '${writ}' }` → valid (whole writ)
29. `{ x: '${writ.title}' }` → valid
30. `{ x: '${vars.role}' }` → valid
31. `{ x: '${yields.upstream.prop}' }` where upstream is declared and reachable → valid
32. `{ x: '${yields.upstream.deep.nested.val}' }` → valid (deep path is not validated at startup, only the engine reachability)
33. `{ x: 'no templates here' }` → valid (no ${, skipped)
34. `{ x: 42 }` → valid (non-string, passed through)
35. `{ x: '\\${not.a.template}' }` → valid (escaped, no expressions to validate)

### Migration — bare-$ removal

36. Verify `'$writ'` as a givens value is NOT recognized — treated as a plain string literal (no resolution, no error at validation since it doesn't contain `${`)
37. Verify `'$vars.role'` as a givens value is NOT recognized — plain literal
38. Verify `'$yields.draft.path'` as a givens value is NOT recognized — plain literal, never resolved