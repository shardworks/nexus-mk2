# Inventory: Accept Curly Brace Syntax for Rig Template Variables

## Brief Summary

Rig template `givens` values support `$foo` / `$spider.foo` variable references resolved at spawn time. The brief asks to additionally accept the curly-brace equivalents `${foo}` / `${spider.foo}`.

---

## Affected Code

### Primary file: `packages/plugins/spider/src/spider.ts`

This is the only file that needs code changes. Two functions handle variable references:

#### `resolveGivens` (lines 173–196)

Runtime function. Called from `buildFromTemplate` at rig spawn time. Iterates over a template engine's `givens` map and resolves any `$`-prefixed string values.

Current logic:
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
      // undefined → omit key entirely
    }
    // Unrecognized $-prefixed strings are caught at validation time
  }
  return result;
}
```

Recognized variable patterns (currently):
- `$writ` — exact string match
- `$role` — exact string match
- `$spider.<key>` — regex `/^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/`

NOT recognized (throws at validation, not resolution):
- `${writ}`, `${role}`, `${spider.buildCommand}` — these fall through without matching any branch and would reach "unrecognized variable" in `validateTemplates`

#### `validateTemplates` (lines 219–323, specifically R7 check at lines 305–321)

Startup validation function. Called during `apparatus.startup()`. Validates all configured rig templates. The variable-reference check (R7):

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

Note: validation iterates `engine.givens` (the raw template value) while resolution iterates `entry.givens` in `buildFromTemplate`. These are the same data — both refer to `RigTemplateEngine.givens`.

---

### Test file: `packages/plugins/spider/src/spider.test.ts`

Tests live in two describe blocks:

**"Spider — variable resolution"** (line 1977–~2095)  
Runtime resolution tests. All use `buildFixture(...)`, post a writ, call `spider.crawl()`, and check resolved `givensSpec` values on the spawned rig.

Existing tests in this block:
- `'$writ resolves to the full WritDoc object'` (line 1982)
- `'$role resolves to spiderConfig.role when set'` (line 1999)
- `'$role defaults to "artificer" when spiderConfig.role is not set'` (line 2013)
- `'$spider.buildCommand resolves to the configured value'` (line 2027)
- `'$spider.* undefined causes key to be omitted entirely'` (line 2041)
- `'literal string without $ prefix is passed through unchanged'` (line 2055)
- `'mixed literals and $-variables resolve correctly together'` (line 2070)

**Template validation tests** (around lines 2098–2345, in a describe block covering startup validation)  
These use `assert.throws(() => buildFixture({ spider: { rigTemplates: ... } }), ...)`.

Existing validation tests relevant to variables:
- `'throws [spider] error for unrecognized variable reference ($buildCommand)'` (line 2258)
- `'throws [spider] error for nested $spider path ($spider.a.b)'` (line 2278)
- `'accepts $spider.buildCommand as a valid variable'` (line 2298)

**Test patterns used:**
- `buildFixture({ spider: { rigTemplates: { default: template } } })` — sets up full guild with in-memory stacks/clerk/fabricator/spider
- `await clerk.post(...)` then `await spider.crawl()` — triggers rig spawn
- `await rigsBook(stacks).list()` — retrieves spawned rig
- `rigs[0].engines[0].givensSpec` — the resolved givens after spawn
- `assert.throws(() => buildFixture(...), (err) => { ... return true; })` — startup validation failures

---

### Type comment: `packages/plugins/spider/src/types.ts`

The `RigTemplateEngine.givens` field has this JSDoc (lines 126–132):
```typescript
/**
 * Givens to pass at spawn time.
 * String values starting with '$' are variable references resolved at spawn time.
 * Non-string values are passed through literally.
 * Variables that resolve to undefined cause the key to be omitted.
 */
givens?: Record<string, unknown>;
```

This comment will need updating to mention curly-brace syntax.

---

### Docs: `docs/architecture/apparatus/spider.md`

Two relevant references:

1. No dedicated "variable syntax" section in the current doc. The givens flow is described at a high level but the `$writ`/`$role`/`$spider.*` syntax is not enumerated in the docs (it lives only in code/tests). No doc update is strictly needed, but worth noting if documentation of the variable syntax is added later.

2. **Future-feature note at line 627:**
   > "The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens."
   
   This note uses `${draft.worktreePath}` — a *different* kind of curly-brace template than what this brief implements. This brief is about `${writ}` / `${spider.foo}` as aliases for `$writ` / `$spider.foo`. The future note is about a planned mechanism for resolving upstream yield fields. These are two distinct features sharing similar surface syntax.

---

## Scope of Change

The change is narrow. Only two functions in one file need updating:

1. **`resolveGivens`** in `spider.ts` — add normalization so `${writ}` → `$writ` etc before matching
2. **`validateTemplates`** in `spider.ts` (R7 block) — same normalization so curly-brace forms pass validation

Tests need new cases covering `${writ}`, `${role}`, `${spider.key}` (both resolution and validation paths).

The JSDoc on `RigTemplateEngine.givens` in `types.ts` needs one-line update.

---

## Implementation Approach (observed pattern)

The natural implementation is a small normalization helper:

```typescript
// Strip optional curly braces: ${foo} → $foo
function normalizeVarSyntax(value: string): string {
  if (value.startsWith('${') && value.endsWith('}')) {
    return '$' + value.slice(2, -1);
  }
  return value;
}
```

Called at the top of both `resolveGivens` (on the `value` variable before branching) and in the R7 loop of `validateTemplates` (on each `value` before checking).

The guard `value.startsWith('$')` in both functions still fires for `${...}` values since they start with `$` — so the normalization only needs to happen after that guard, not before it.

---

## Adjacent Patterns (comparable implementations)

No other files in the codebase use `$`-prefixed variable substitution. The spider is the only place this pattern appears. There is no prior precedent for how curly-brace normalization is done elsewhere to copy from.

---

## Existing Context & Notes

- The STANDARD_TEMPLATE constant in the test file (line 39–48) uses `$writ`, `$role`, `$spider.buildCommand`, `$spider.testCommand` — the canonical example of in-use variable syntax.
- The buildFixture test helper at startup calls `createSpider()` then `apparatus.startup(ctx)` — this triggers `validateTemplates`, so any invalid givens throw synchronously at fixture construction time.
- The test file imports `RigTemplate` from `./types.ts` — test code operates on the public type directly.

---

## Doc/Code Discrepancies

1. `docs/architecture/apparatus/spider.md` line 627 uses `${draft.worktreePath}` as example syntax for a *planned future feature* (upstream yield access via template expressions). This creates a naming collision risk: the curly-brace forms `${writ}` / `${spider.foo}` enabled by this brief use the same `${...}` delimiters as the planned upstream yield templates. These are currently different things — the brief's feature is an alias for existing `$foo` variables; the future feature would add new interpolation into upstream yield paths. The doc doesn't distinguish between them. This is worth flagging: accepting `${foo}` now may create reader confusion with the future `${engineId.field}` syntax if both are live simultaneously.

2. `types.ts` comment says "String values starting with '$' are variable references" — technically `${...}` also starts with `$` so the comment isn't wrong, but it's incomplete/misleading (implies only bare `$foo` form).
