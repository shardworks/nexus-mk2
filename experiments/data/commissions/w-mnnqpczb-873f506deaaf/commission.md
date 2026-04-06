---
author: plan-writer
estimated_complexity: 2
---

# Fix: Coerce CLI String Arguments to Numbers for z.number() Tool Params

## Summary

Commander.js passes all `--option <value>` arguments as strings, but tool param schemas use `z.number()`. Add a `coerceCliOpts()` function in the CLI helpers that detects number schemas via `instanceof` unwrapping and converts string values with `Number()` before Zod validation.

## Current State

**`packages/framework/cli/src/program.ts`** — `buildToolCommand()` generates Commander commands from `ToolDefinition` objects. The action handler passes Commander's raw opts directly to Zod:

```typescript
cmd.action(async (opts: Record<string, string | undefined>) => {
  try {
    const validated = toolDef.params.parse(opts);
    const result = await toolDef.handler(validated);
```

Commander returns `{ limit: "1" }` when the user passes `--limit 1`. Zod's `z.number()` rejects `"1"` with `"expected number, received string"`.

Boolean params already work via special handling: `isBooleanSchema()` detects them during option registration, and Commander sets boolean flags to `true` (not a string) when present. No equivalent exists for numbers.

**`packages/framework/cli/src/helpers.ts`** — 55 lines. Contains three pure helper functions:

```typescript
export function toFlag(key: string): string { /* camelCase → --kebab-case */ }
export function isBooleanSchema(schema: z.ZodTypeAny): boolean { /* behavioral probing */ }
export function findGroupPrefixes(tools: ToolDefinition[]): Set<string> { /* grouping logic */ }
```

**`packages/framework/cli/src/program.test.ts`** — 109 lines. Tests `toFlag`, `isBooleanSchema`, and `findGroupPrefixes` in isolation. Does not test `buildToolCommand`.

**Broken params** — 8 numeric params across 6 tools fail when passed via CLI:
- `writ-list`: `limit`, `offset`
- `rig-list`: `limit`, `offset`
- `session-list`: `limit`
- `conversation-list`: `limit`
- `draft-seal`: `maxRetries`
- `crawl-continual`: `maxIdleCycles`, `pollIntervalMs`

## Requirements

- R1: When a CLI user passes a string value for a `z.number()` param (including wrapped in `ZodOptional` and/or `ZodDefault`), the CLI must convert it to a number before Zod validation, so that `--limit 1` works identically to passing `1` (the number) via MCP.
- R2: When a CLI user passes a non-numeric string for a `z.number()` param (e.g. `--limit abc`), the CLI must convert it to `NaN`, which Zod rejects with an appropriate error — not silently accept partial strings.
- R3: When a `z.number()` param is omitted (value is `undefined`), the CLI must pass `undefined` through unchanged so Zod's `.optional()` and `.default()` semantics apply normally.
- R4: When a param has a non-number schema (`z.string()`, `z.enum()`, `z.boolean()`), the CLI must leave its value unchanged — no coercion applied.
- R5: The coercion must be implemented as a single exported `coerceCliOpts(shape, opts)` function in `packages/framework/cli/src/helpers.ts`.
- R6: The `coerceCliOpts` function must be covered by unit tests in `packages/framework/cli/src/program.test.ts`, following the existing pattern of testing helpers in isolation with synthetic Zod shapes.

## Design

### Type Changes

None. No types, interfaces, or exports are added or modified in any package. The `ToolDefinition` type and all tool param schemas remain unchanged.

### Behavior

#### New function: `coerceCliOpts` in `helpers.ts`

Add this function to `packages/framework/cli/src/helpers.ts`:

```typescript
/**
 * Coerce Commander string opts to match the expected Zod schema types.
 *
 * Commander passes all --option <value> arguments as strings. This function
 * walks the Zod shape and converts string values to numbers where the
 * schema expects z.number() (including when wrapped in ZodOptional/ZodDefault).
 *
 * Undefined values pass through unchanged — Zod handles optional/default.
 * Non-number schemas are left untouched.
 */
export function coerceCliOpts(
  shape: Record<string, z.ZodTypeAny>,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...opts };

  for (const [key, schema] of Object.entries(shape)) {
    const value = result[key];
    if (typeof value !== 'string') continue;

    if (isNumberSchema(schema)) {
      result[key] = Number(value);
    }
  }

  return result;
}
```

The `isNumberSchema` helper is a private function (not exported) that unwraps `ZodOptional` and `ZodDefault` wrappers then checks `instanceof z.ZodNumber`. This follows the same unwrapping pattern used in `packages/plugins/tools/src/tools/tools-show.ts` (`extractSingleParam`):

```typescript
/**
 * Check whether a Zod schema is a number type, possibly wrapped
 * in ZodOptional and/or ZodDefault.
 */
function isNumberSchema(schema: z.ZodTypeAny): boolean {
  let inner: z.ZodTypeAny = schema;

  if (inner instanceof z.ZodOptional) {
    inner = inner.unwrap();
  }
  if (inner instanceof z.ZodDefault) {
    inner = inner.unwrap();
  }
  // Handle the reverse nesting order too (default wrapping optional)
  if (inner instanceof z.ZodOptional) {
    inner = inner.unwrap();
  }

  return inner instanceof z.ZodNumber;
}
```

The triple-unwrap handles both possible nesting orders:
- `z.number().optional().default(20)` — ZodDefault → ZodOptional → ZodNumber
- `z.number().default(20)` — ZodDefault → ZodNumber
- `z.number().optional()` — ZodOptional → ZodNumber
- `z.number()` — ZodNumber directly

#### Change in `program.ts`: apply coercion before parse

In `buildToolCommand`, update the action handler to coerce opts before Zod validation. Two changes:

1. Update the import on line 27:

```typescript
import { toFlag, isBooleanSchema, findGroupPrefixes, coerceCliOpts } from './helpers.ts';
```

2. Replace the action handler (lines 61–74) — change the `opts` type annotation and insert the coercion call:

```typescript
  cmd.action(async (opts: Record<string, unknown>) => {
    try {
      const coerced = coerceCliOpts(shape, opts);
      const validated = toolDef.params.parse(coerced);
      const result = await toolDef.handler(validated);

      const output =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      console.log(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
```

The only differences from the current code:
- `opts` type changes from `Record<string, string | undefined>` to `Record<string, unknown>`
- `const coerced = coerceCliOpts(shape, opts);` is inserted before parse
- `toolDef.params.parse(opts)` becomes `toolDef.params.parse(coerced)`

#### When X, then Y — behavioral rules

- When `opts[key]` is a string and the schema for `key` unwraps to `z.ZodNumber`: replace with `Number(opts[key])`.
- When `opts[key]` is a string and the schema for `key` is NOT a number type: leave unchanged.
- When `opts[key]` is `undefined`: leave unchanged regardless of schema type.
- When `opts[key]` is already a non-string type (e.g. `true` from a boolean flag): leave unchanged — the `typeof value !== 'string'` guard skips it.
- When `Number(value)` produces `NaN` (e.g. `--limit abc`): pass `NaN` to Zod. Zod's `z.number()` rejects `NaN` with an appropriate validation error. This is intentional — `Number()` is strict and does not accept partial numeric strings like `"123abc"`.

### Non-obvious Touchpoints

- **`packages/framework/cli/src/program.ts` line 46** — `const shape = toolDef.params.shape as ZodShape;` — this `shape` variable (type `Record<string, z.ZodTypeAny>`) is already available in the `buildToolCommand` scope and is the same `shape` passed to `coerceCliOpts`. It is declared before the action handler closure and captured by it. No new variable needed.

## Validation Checklist

- V1 [R1]: Run `pnpm -s vibe writ list --limit 1` in the guild. Verify it returns writs (no Zod error). Previously this produced `"expected number, received string"`.

- V2 [R1]: Run `pnpm -s vibe writ list --limit 1 --offset 0`. Verify both numeric params are accepted.

- V3 [R2]: Run `pnpm -s vibe writ list --limit abc`. Verify it produces a Zod validation error about an invalid number (not "received string").

- V4 [R3]: Run `pnpm -s vibe writ list` (no --limit). Verify it returns up to 20 results (the default). Confirm `undefined` passes through and `.default(20)` applies.

- V5 [R4]: Run `pnpm -s vibe writ list --status ready`. Verify string/enum params still work.

- V6 [R5, R6]: Run `node --test packages/framework/cli/src/program.test.ts` and verify all tests pass, including the new `coerceCliOpts` tests.

## Test Cases

All tests go in `packages/framework/cli/src/program.test.ts`, in a new `describe('coerceCliOpts', ...)` block. Import `coerceCliOpts` alongside the existing helpers import. Tests use synthetic Zod shapes (no Commander, no guild).

### Number coercion — happy path

1. **Integer string to number:** Shape `{ limit: z.number() }`, opts `{ limit: '5' }`. Result: `{ limit: 5 }`.

2. **Float string to number:** Shape `{ ratio: z.number() }`, opts `{ ratio: '1.5' }`. Result: `{ ratio: 1.5 }`.

3. **Negative number:** Shape `{ offset: z.number() }`, opts `{ offset: '-3' }`. Result: `{ offset: -3 }`.

4. **Optional number:** Shape `{ limit: z.number().optional() }`, opts `{ limit: '10' }`. Result: `{ limit: 10 }`.

5. **Optional number with default:** Shape `{ limit: z.number().optional().default(20) }`, opts `{ limit: '5' }`. Result: `{ limit: 5 }`.

6. **Number with default (no optional):** Shape `{ limit: z.number().default(20) }`, opts `{ limit: '5' }`. Result: `{ limit: 5 }`.

### Pass-through — values that must not be coerced

7. **String param unchanged:** Shape `{ name: z.string() }`, opts `{ name: 'hello' }`. Result: `{ name: 'hello' }`.

8. **Enum param unchanged:** Shape `{ status: z.enum(['ready', 'active']) }`, opts `{ status: 'ready' }`. Result: `{ status: 'ready' }`.

9. **Undefined value passes through:** Shape `{ limit: z.number().optional() }`, opts `{ limit: undefined }`. Result: `{ limit: undefined }`.

10. **Missing key passes through:** Shape `{ limit: z.number().optional() }`, opts `{}`. Result: `{}`.

11. **Boolean value (true) unchanged:** Shape `{ force: z.boolean().optional() }`, opts `{ force: true }`. Result: `{ force: true }`.

### Mixed shapes

12. **Mixed string and number params:** Shape `{ name: z.string(), limit: z.number().optional(), status: z.enum(['a', 'b']).optional() }`, opts `{ name: 'test', limit: '5', status: 'a' }`. Result: `{ name: 'test', limit: 5, status: 'a' }`. Only `limit` is coerced.

### Edge / error cases

13. **Non-numeric string becomes NaN:** Shape `{ limit: z.number() }`, opts `{ limit: 'abc' }`. Result: `{ limit: NaN }`. (Zod will reject NaN downstream, but the coercion function itself produces NaN.)

14. **Empty string becomes NaN (via Number("")):** Note: `Number("")` is `0`, not `NaN`. Shape `{ limit: z.number() }`, opts `{ limit: '' }`. Result: `{ limit: 0 }`. (This is `Number("")` behavior. Zod validation downstream will accept or reject based on any `.min()` or `.int()` constraints.)

15. **Empty shape, opts with extra keys:** Shape `{}`, opts `{ anything: 'value' }`. Result: `{ anything: 'value' }`. No coercion applied since shape has no entries.