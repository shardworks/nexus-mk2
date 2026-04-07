---
author: plan-writer
estimated_complexity: 2
---

# Accept Curly Brace Syntax for Rig Template Variables

## Summary

Rig template variable references currently require the bare form `$writ`, `$role`, `$spider.<key>`. This adds support for the curly-brace equivalents `${writ}`, `${role}`, `${spider.<key>}`, treating them identically in both startup validation and runtime resolution.

## Current State

Two functions in `packages/plugins/spider/src/spider.ts` handle variable references:

**`resolveGivens`** (line 173) — called from `buildFromTemplate` at rig spawn time. Iterates over a template engine's `givens` map. For string values starting with `$`, it matches against three known patterns:

```typescript
function resolveGivens(
  givens: Record<string, unknown> | undefined,
  context: { writ: WritDoc; role: string; spiderConfig: SpiderConfig },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givens ?? {})) {
    if (typeof value !== 'string' || !value.startsWith('$')) {
      result[key] = value;
    } else if (value === '$writ') {
      result[key] = context.writ;
    } else if (value === '$role') {
      result[key] = context.role;
    } else if (/^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      const spiderKey = value.slice('$spider.'.length);
      const resolved = (context.spiderConfig as Record<string, unknown>)[spiderKey];
      if (resolved !== undefined) {
        result[key] = resolved;
      }
    }
  }
  return result;
}
```

**`validateTemplates`** (line 219, R7 block at line 305) — called at startup. Rejects any `$`-prefixed string that isn't one of the three known patterns:

```typescript
// R7: Variable reference validation
for (const engine of engines) {
  for (const value of Object.values(engine.givens ?? {})) {
    if (typeof value === 'string' && value.startsWith('$')) {
      if (
        value === '$writ' ||
        value === '$role' ||
        /^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
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

A value like `${writ}` currently passes the `startsWith('$')` guard but fails every match branch, causing an "unrecognized variable" error at startup.

The JSDoc on `RigTemplateEngine.givens` in `packages/plugins/spider/src/types.ts` (line 126) reads:

```typescript
/**
 * Givens to pass at spawn time.
 * String values starting with '$' are variable references resolved at spawn time.
 * Non-string values are passed through literally.
 * Variables that resolve to undefined cause the key to be omitted.
 */
givens?: Record<string, unknown>;
```

## Requirements

- R1: When a rig template engine givens value is `${writ}`, it must resolve identically to `$writ` (the full WritDoc object).
- R2: When a rig template engine givens value is `${role}`, it must resolve identically to `$role`.
- R3: When a rig template engine givens value is `${spider.<key>}`, it must resolve identically to `$spider.<key>` (spider config lookup, omit if undefined).
- R4: Startup validation must accept `${writ}`, `${role}`, and `${spider.<key>}` without throwing.
- R5: Startup validation must reject invalid curly-brace variables (e.g. `${badVar}`) with an error message containing the original `${...}` form the user wrote.
- R6: All existing bare-form variable behavior (`$writ`, `$role`, `$spider.*`) must remain unchanged.
- R7: The JSDoc on `RigTemplateEngine.givens` must document both `$name` and `${name}` forms.

## Design

### Normalization Helper

Add a new function `normalizeVarRef` in the helpers section of `packages/plugins/spider/src/spider.ts` (near the top, alongside `isJsonSerializable`, `buildUpstreamMap`, etc.):

```typescript
/**
 * Normalize a variable reference by stripping optional curly braces.
 * '${foo}' → '$foo', '$foo' → '$foo' (unchanged).
 * Called before matching against known variable patterns.
 */
function normalizeVarRef(value: string): string {
  if (value.startsWith('${') && value.endsWith('}')) {
    return '$' + value.slice(2, -1);
  }
  return value;
}
```

The function is generic — it strips the outermost `${...}` wrapper without inspecting the inner content. Semantic validation (is the resulting `$...` name recognized?) is handled by the existing match logic downstream.

### Behavior

#### `resolveGivens` changes

When the value is a `$`-prefixed string (the existing guard), normalize it before branching:

- When `value` is `'${writ}'`, `normalizeVarRef` produces `'$writ'`, which then hits the existing `=== '$writ'` branch.
- When `value` is `'${role}'`, `normalizeVarRef` produces `'$role'`, which then hits the existing `=== '$role'` branch.
- When `value` is `'${spider.buildCommand}'`, `normalizeVarRef` produces `'$spider.buildCommand'`, which matches the existing regex. The existing `.slice('$spider.'.length)` extracts the key correctly from the normalized form.
- When `value` is already a bare `$writ` / `$role` / `$spider.*`, `normalizeVarRef` returns it unchanged — no behavioral difference.

The `startsWith('$')` guard is not changed — `'${foo}'` already starts with `'$'`.

#### `validateTemplates` R7 changes

When iterating givens values, normalize before the recognition check but preserve the original value for the error message:

- When `value` is `'${writ}'`, the normalized form `'$writ'` matches the known pattern — `continue` (valid).
- When `value` is `'${badVar}'`, the normalized form `'$badVar'` fails all three checks — throw an error. The error message must use the original `value` (`"${badVar}"`), not the normalized form.

#### Edge cases

No special handling for malformed brace forms:
- `'${}'` normalizes to `'$'` — fails existing validation.
- `'${ writ }'` normalizes to `'$ writ '` — fails existing validation.
- `'${${writ}}'` normalizes to `'${writ}'` (strips outermost braces, inner `${` remains) — fails existing validation.

All of these correctly result in "unrecognized variable" errors.

### Type Changes

No type signature changes. The `RigTemplateEngine.givens` field type (`Record<string, unknown>`) is unchanged.

Update the JSDoc on `RigTemplateEngine.givens` in `packages/plugins/spider/src/types.ts`:

```typescript
/**
 * Givens to pass at spawn time.
 * String values starting with '$' (either $name or ${name}) are variable
 * references resolved at spawn time.
 * Non-string values are passed through literally.
 * Variables that resolve to undefined cause the key to be omitted.
 */
givens?: Record<string, unknown>;
```

## Validation Checklist

- V1 [R1, R2, R3, R6]: Run the spider test suite (`node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'packages/plugins/spider/src/**/*.test.ts'`). All existing tests pass (bare-form behavior unchanged). New resolution test passes: a template using `${writ}`, `${role}`, and `${spider.buildCommand}` resolves identically to the bare forms.
- V2 [R4]: New validation-acceptance test passes: `buildFixture` with a template using `${writ}`, `${role}`, `${spider.buildCommand}` does not throw.
- V3 [R5]: New validation-rejection test passes: `buildFixture` with a template using `${badVar}` throws with `[spider]` prefix and the string `"${badVar}"` in the error message.
- V4 [R7]: Grep `packages/plugins/spider/src/types.ts` for `\$name or \$\{name\}` — the updated JSDoc is present.

## Test Cases

All new tests go in `packages/plugins/spider/src/spider.test.ts`.

### Resolution: curly-brace variables resolve equivalently to bare forms

Add within the existing `'Spider — variable resolution'` describe block.

**Scenario:** Template with `givens: { w: '${writ}', r: '${role}', cmd: '${spider.buildCommand}' }`. Spider config has `role: 'builder'` and `buildCommand: 'make build'`.

**Expected:**
- `givensSpec.w` is the WritDoc object (same `id` as the posted writ).
- `givensSpec.r` is `'builder'`.
- `givensSpec.cmd` is `'make build'`.

### Validation acceptance: curly-brace forms pass startup validation

Add within the existing template validation describe block.

**Scenario:** `buildFixture` with template givens `{ w: '${writ}', r: '${role}', cmd: '${spider.buildCommand}' }`.

**Expected:** Does not throw.

### Validation rejection: invalid curly-brace variable is rejected with original form in error

Add within the existing template validation describe block.

**Scenario:** `buildFixture` with template givens `{ x: '${badVar}' }`.

**Expected:** Throws an `Error` whose message starts with `'[spider]'` and includes the substring `'"${badVar}"'`.
