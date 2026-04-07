---
author: plan-writer
estimated_complexity: 5
---

# Update Rig Template Variable Handling

## Summary

Replace the `$spider.<key>` and `$role` template variable system with a new `$vars.<key>` system that resolves from an explicit `variables` dict in SpiderConfig, isolating user-defined template variables from internal apparatus configuration.

## Current State

Rig templates in `packages/plugins/spider/src/spider.ts` resolve `$`-prefixed variable references at spawn time via two functions:

**`resolveGivens`** (line ~173) handles three variable forms:
- `$writ` — injects the full `WritDoc` (special case, unchanged by this spec)
- `$role` — injects `context.role` (which is `spiderConfig.role ?? 'artificer'`)
- `$spider.<key>` — indexes into the entire `SpiderConfig` object: `(context.spiderConfig as Record<string, unknown>)[key]`

**`validateTemplates`** (line ~305, R7 block) validates at startup that all `$`-prefixed strings in template givens match one of: `$writ`, `$role`, or `/^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/`.

The context parameter type for both `resolveGivens` and `buildFromTemplate` is:
```typescript
{ writ: WritDoc; role: string; spiderConfig: SpiderConfig }
```

`SpiderConfig` in `packages/plugins/spider/src/types.ts`:
```typescript
export interface SpiderConfig {
  role?: string;
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
}
```

The `trySpawn` call site (line ~728) builds the context:
```typescript
buildFromTemplate(template, {
  writ,
  role: spiderConfig.role ?? 'artificer',
  spiderConfig,
});
```

The test file's `STANDARD_TEMPLATE` uses `$role` (×3) and `$spider.buildCommand`, `$spider.testCommand`.

`buildStaticEngines` (line ~131) is dead code — never called by `trySpawn`. It references `config.role`.

## Requirements

- R1: When a template givens value matches `$vars.<identifier>`, it must resolve to the value of `<identifier>` in `SpiderConfig.variables` at rig spawn time.
- R2: When a `$vars.<key>` reference resolves to `undefined` (key absent from `variables`), the givens key must be omitted entirely from the resolved output.
- R3: When the `variables` dict itself is absent from SpiderConfig, all `$vars.*` references must resolve to `undefined` (and be omitted per R2).
- R4: The `$spider.<key>` variable form must be rejected at startup by `validateTemplates` with the existing `[spider] rigTemplates.<template>: engine "<id>" has unrecognized variable "<value>"` error format.
- R5: The `$role` variable form must be rejected at startup by `validateTemplates` with the same error format.
- R6: The `$writ` variable must continue to work unchanged — exact-match resolution to the WritDoc.
- R7: The `role` field must be removed from the `SpiderConfig` interface.
- R8: The `role` field must be removed from the `resolveGivens`/`buildFromTemplate` context parameter type and the `trySpawn` call site.
- R9: Non-`$`-prefixed values and non-string values in template givens must continue to pass through unchanged as literal values.
- R10: All existing tests must be updated to use `$vars.*` syntax where they previously used `$role` or `$spider.*`, and new tests must verify that `$role` and `$spider.*` are rejected.
- R11: The Configuration section of `docs/architecture/apparatus/spider.md` must be updated to show the `variables` key and `$vars.*` syntax.

## Design

### Type Changes

**`packages/plugins/spider/src/types.ts` — `SpiderConfig`:**

```typescript
export interface SpiderConfig {
  /**
   * Polling interval for crawlContinual tool (milliseconds).
   * Default: 5000.
   */
  pollIntervalMs?: number;
  /**
   * Build command to pass to quick engines.
   */
  buildCommand?: string;
  /**
   * Test command to pass to quick engines.
   */
  testCommand?: string;
  /**
   * Writ type → rig template mappings.
   * 'default' key is the fallback for unmatched writ types.
   * Spawning fails if no matching template is found.
   */
  rigTemplates?: Record<string, RigTemplate>;
  /**
   * User-defined variables available in rig template givens via '$vars.<key>'.
   * Values are passed through literally (string, number, boolean).
   * Variables resolving to undefined (key absent) cause the givens key to be omitted.
   */
  variables?: Record<string, unknown>;
}
```

The `role?: string` field is removed entirely.

**`packages/plugins/spider/src/types.ts` — `RigTemplateEngine.givens` JSDoc:**

Update the JSDoc on the `givens` field:

```typescript
  /**
   * Givens to pass at spawn time.
   * String values starting with '$' are variable references resolved at spawn time:
   *   '$writ' — the WritDoc for this rig's writ
   *   '$vars.<key>' — value from spider.variables config
   * Non-string values are passed through literally.
   * Variables that resolve to undefined cause the key to be omitted.
   */
  givens?: Record<string, unknown>;
```

### Behavior

**`resolveGivens` in `spider.ts`:**

The context parameter type changes to `{ writ: WritDoc; spiderConfig: SpiderConfig }` (no `role`).

The function body resolution rules become:

1. When value is not a string or does not start with `$`, pass through literally (unchanged).
2. When value is `'$writ'`, resolve to `context.writ` (unchanged).
3. When value matches `/^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/`, extract the key via `value.slice('$vars.'.length)`, look up `(context.spiderConfig.variables ?? {})[key]`. If the result is not `undefined`, set it. If `undefined`, omit the givens key entirely.
4. Any other `$`-prefixed string falls through — unrecognized references are caught at validation time, not at resolution time (unchanged behavior).

Remove the `$role` branch and the `$spider.*` branch entirely.

The `variables` field is already typed as `Record<string, unknown>`, so no type assertion is needed for index access (unlike the current code which casts `spiderConfig` to `Record<string, unknown>`).

**`buildFromTemplate` in `spider.ts`:**

Context parameter type changes to `{ writ: WritDoc; spiderConfig: SpiderConfig }`.

**`trySpawn` call site in `spider.ts`:**

Change from:
```typescript
buildFromTemplate(template, {
  writ,
  role: spiderConfig.role ?? 'artificer',
  spiderConfig,
});
```

To:
```typescript
buildFromTemplate(template, {
  writ,
  spiderConfig,
});
```

**`validateTemplates` R7 block in `spider.ts`:**

The valid variable set changes from `{ '$writ', '$role', /^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/ }` to `{ '$writ', /^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/ }`.

The updated block:
```typescript
// R7: Variable reference validation
for (const engine of engines) {
  for (const value of Object.values(engine.givens ?? {})) {
    if (typeof value === 'string' && value.startsWith('$')) {
      if (
        value === '$writ' ||
        /^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
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

**`resolveGivens` JSDoc in `spider.ts`:**

Update to:
```typescript
/**
 * Resolve a template engine's givens map using a variables context.
 * '$writ' → WritDoc, '$vars.<key>' → spiderConfig.variables[key].
 * Keys resolving to undefined are omitted from the output.
 * Non-'$' prefixed values are passed through as literals.
 */
```

### Non-obvious Touchpoints

**`buildStaticEngines` (dead code) in `spider.ts`:**

This function references `config.role` (line ~132). Removing `role` from `SpiderConfig` produces a type error here. Since this function is dead code (never called in production — `trySpawn` exclusively uses `buildFromTemplate`), the simplest resolution is to remove the function entirely along with its preservation test (`describe('Spider — buildStaticEngines preserved')`). Do not refactor it to use the new variable system.

**Test file `STANDARD_TEMPLATE` and `buildFixture`:**

The `STANDARD_TEMPLATE` constant is used by nearly every test via `buildFixture()`. It must be updated to use `$vars.*` syntax, and `buildFixture`'s default spider config must include `variables: { role: 'artificer' }` so that `$vars.role` resolves. `buildCommand` and `testCommand` are intentionally absent from the default variables — `$vars.buildCommand` and `$vars.testCommand` resolve to `undefined` and their givens keys are omitted, which matches the current behavior.

Updated `STANDARD_TEMPLATE`:
```typescript
const STANDARD_TEMPLATE: RigTemplate = {
  engines: [
    { id: 'draft',     designId: 'draft',     givens: { writ: '$writ' } },
    { id: 'implement', designId: 'implement', upstream: ['draft'],     givens: { writ: '$writ', role: '$vars.role' } },
    { id: 'review',    designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer', buildCommand: '$vars.buildCommand', testCommand: '$vars.testCommand' } },
    { id: 'revise',    designId: 'revise',    upstream: ['review'],    givens: { writ: '$writ', role: '$vars.role' } },
    { id: 'seal',      designId: 'seal',      upstream: ['revise'],    givens: {} },
  ],
  resolutionEngine: 'seal',
};
```

Updated `buildFixture` spider config default (inside `fakeGuildConfig`):
```typescript
spider: {
  rigTemplates: { default: STANDARD_TEMPLATE },
  variables: { role: 'artificer' },
  ...(guildConfig.spider ?? {}),
},
```

Note: The `variables` default must be placed before the spread so that tests passing `spider: { variables: { role: 'builder' } }` override the default.

**Scattered integration tests using `$role` in inline templates:**

Every inline template in the test file that uses `givens: { ..., role: '$role' }` must be changed to `role: '$vars.role'`, and its fixture config must include `variables: { role: 'artificer' }` (or the appropriate value). The inventory identifies these at approximately lines 2136, 2443, and 2613.

**`docs/architecture/apparatus/spider.md` Configuration section:**

The config example (currently at the end of the file) must be updated. Replace the current example:

```json
{
  "spider": {
    "role": "artificer",
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

With:

```json
{
  "spider": {
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test",
    "variables": {
      "role": "artificer"
    }
  }
}
```

Update the descriptive text to explain that `variables` entries are available in rig templates as `$vars.<key>`, and that `$writ` is the only other supported variable reference. Remove any mentions of `$role` or `$spider.*` from the doc.

## Validation Checklist

- V1 [R1, R2, R3]: Create a test template with `givens: { cmd: '$vars.buildCommand' }`. Spawn with `variables: { buildCommand: 'make build' }` — verify `givensSpec.cmd === 'make build'`. Spawn without `buildCommand` in variables — verify `cmd` key is absent from givensSpec. Spawn with no `variables` key at all — verify `cmd` key is absent from givensSpec.

- V2 [R4]: Configure a template with `givens: { x: '$spider.buildCommand' }` and call `buildFixture` — verify it throws with message matching `[spider]` and `unrecognized variable "$spider.buildCommand"`.

- V3 [R5]: Configure a template with `givens: { r: '$role' }` and call `buildFixture` — verify it throws with message matching `[spider]` and `unrecognized variable "$role"`.

- V4 [R6]: Verify existing `$writ` resolution test still passes — template with `givens: { w: '$writ' }` resolves `w` to the full WritDoc object.

- V5 [R7]: Verify that `SpiderConfig` no longer has a `role` field — `const c: SpiderConfig = {}; c.role` should be a type error if checked, or verify the interface in source has no `role` entry.

- V6 [R8]: Verify `resolveGivens` and `buildFromTemplate` context parameter types do not include `role`. Verify the `trySpawn` call site does not pass `role`.

- V7 [R9]: Verify a template with `givens: { role: 'reviewer', count: 5 }` (all literals) resolves unchanged — `givensSpec.role === 'reviewer'` and `givensSpec.count === 5`.

- V8 [R10]: Run the full spider test suite (`node --test packages/plugins/spider/src/spider.test.ts` and `node --test packages/plugins/spider/src/tools/tools.test.ts`) — all tests pass.

- V9 [R11]: Inspect `docs/architecture/apparatus/spider.md` — the Configuration section shows `variables` in the JSON example and does not mention `$role` or `$spider.*`.

- V10 [R1, R4, R5]: Run a grep for `\$spider\.` and `\$role` across `packages/plugins/spider/src/` — no remaining references in production code (spider.ts, types.ts) except inside `buildStaticEngines` if retained. No remaining references in test code except in assertions that verify these are now rejected.

## Test Cases

**Happy path — `$vars.<key>` resolves from variables:**
- Template with `givens: { cmd: '$vars.buildCommand' }`, config `variables: { buildCommand: 'make build' }` → `givensSpec.cmd === 'make build'`.

**Happy path — `$vars.<key>` with different value types:**
- `variables: { count: 42 }` does NOT apply (42 is not a string starting with `$`); but `givens: { n: '$vars.count' }` with `variables: { count: 42 }` → `givensSpec.n === 42`.

**Undefined key omission:**
- Template `givens: { cmd: '$vars.testCommand' }`, config `variables: {}` (no `testCommand` key) → `givensSpec` has no `cmd` key.

**Absent variables dict:**
- Template `givens: { cmd: '$vars.testCommand' }`, config has no `variables` key → `givensSpec` has no `cmd` key.

**Mixed literals and variables:**
- Template `givens: { writ: '$writ', role: 'reviewer', cmd: '$vars.buildCommand' }` with `variables: { buildCommand: 'pnpm build' }` → `givensSpec.writ` is WritDoc, `givensSpec.role === 'reviewer'`, `givensSpec.cmd === 'pnpm build'`.

**Rejection — `$spider.*` is now invalid:**
- Template `givens: { x: '$spider.buildCommand' }` → startup throws `[spider] rigTemplates.<key>: engine "<id>" has unrecognized variable "$spider.buildCommand"`.

**Rejection — `$role` is now invalid:**
- Template `givens: { r: '$role' }` → startup throws `[spider] rigTemplates.<key>: engine "<id>" has unrecognized variable "$role"`.

**Rejection — `$spider.a.b` nested path still invalid:**
- Template `givens: { x: '$spider.a.b' }` → startup throws with unrecognized variable.

**Rejection — `$vars.a.b` nested path invalid:**
- Template `givens: { x: '$vars.a.b' }` → startup throws with unrecognized variable (regex requires single-level identifier).

**Rejection — bare `$buildCommand` still invalid:**
- Template `givens: { x: '$buildCommand' }` → startup throws with unrecognized variable.

**Acceptance — `$vars.buildCommand` is valid at startup:**
- Template `givens: { cmd: '$vars.buildCommand' }` → startup does NOT throw (validation passes regardless of whether variables.buildCommand exists).

**`$writ` unchanged:**
- Template `givens: { w: '$writ' }` → resolves to full WritDoc.

**Engine with no givens:**
- Template `givens: undefined` or absent → `givensSpec` is `{}`.

**Full pipeline still works:**
- Spawn with STANDARD_TEMPLATE (now using `$vars.role`, `$vars.buildCommand`, `$vars.testCommand`) and `variables: { role: 'artificer' }` → rig spawns with 5 engines, implement/revise have `givensSpec.role === 'artificer'`, review has `givensSpec.role === 'reviewer'` (literal), review does NOT have `buildCommand` or `testCommand` keys (undefined, omitted).