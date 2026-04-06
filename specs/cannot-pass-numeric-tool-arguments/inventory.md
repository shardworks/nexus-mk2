# Inventory: cannot-pass-numeric-tool-arguments

## Brief Summary

CLI tool invocations with numeric arguments fail Zod validation because Commander.js passes all option values as strings, but tool param schemas use `z.number()`. The fix requires detecting numeric (and any other non-string) Zod schema types and coercing CLI string values to the correct type before invoking `toolDef.params.parse()`.

---

## Root Cause

### Primary file: `packages/framework/cli/src/program.ts`

The `buildToolCommand` function (lines 40–77) builds a Commander command from a `ToolDefinition`. The action handler on line 61:

```typescript
cmd.action(async (opts: Record<string, string | undefined>) => {
  try {
    const validated = toolDef.params.parse(opts);
    const result = await toolDef.handler(validated);
```

Commander returns all option values as strings (or `undefined` for omitted optional flags). `toolDef.params.parse(opts)` receives `{ limit: "1" }` when the user passes `--limit 1`, but `z.number()` rejects `"1"` — hence the error:

```
Error: [{"expected":"number","code":"invalid_type","path":["limit"],"message":"Invalid input: expected number, received string"}]
```

**Existing partial handling — booleans:**

Lines 51–54 already detect boolean schemas and register them without `<value>`:
```typescript
if (isBooleanSchema(schema)) {
  cmd.option(flag, description);          // --force, sets true when present
} else if (schema.isOptional()) {
  cmd.option(`${flag} <value>`, description);
} else {
  cmd.requiredOption(`${flag} <value>`, description);
}
```

Boolean params work because Commander sets them to `true` (not a string) when the flag is present, and `undefined` when absent. The `isBooleanSchema` helper in `helpers.ts` detects `z.boolean()` and `z.boolean().optional()` by probing with `.safeParse(true)` / `.safeParse(42)` / etc.

**The gap:** There is no equivalent coercion step for numbers. After Commander produces opts, nothing converts `"1"` → `1` before Zod validation.

---

## Files to Modify

### 1. `packages/framework/cli/src/helpers.ts`

**Current content** (55 lines):
- `toFlag(key)` — camelCase to `--kebab-case`
- `isBooleanSchema(schema)` — detects boolean Zod schemas by behavioral probing
- `findGroupPrefixes(tools)` — identifies tool name prefixes with 2+ tools for grouping

**What changes:** Add a new helper — either `isNumberSchema(schema)` for detection plus a `coerceToNumber(value)` utility, or a combined `coerceParams(shape, opts)` function that walks the shape and returns a coerced copy of opts.

The `isBooleanSchema` function uses behavioral probing (`.safeParse()`) rather than `instanceof` checks. A parallel `isNumberSchema` could use the same approach. Alternatively, `coerceParams` could inspect the unwrapped inner type via `instanceof z.ZodNumber` (same pattern as `tools-show.ts`'s `extractSingleParam`/`zodTypeToJsonType`).

### 2. `packages/framework/cli/src/program.ts`

**What changes:** The action handler in `buildToolCommand` needs to coerce opts before parsing. Concretely, before `toolDef.params.parse(opts)`:

```typescript
cmd.action(async (opts: Record<string, string | undefined>) => {
  try {
    const coerced = coerceParams(shape, opts);   // ← new step
    const validated = toolDef.params.parse(coerced);
    const result = await toolDef.handler(validated);
```

### 3. `packages/framework/cli/src/program.test.ts`

**Current content:** 109 lines. Tests only the helper functions in `helpers.ts` (`toFlag`, `isBooleanSchema`, `findGroupPrefixes`). Does NOT test `buildToolCommand` end-to-end.

**What changes:** Add tests for any new helper(s) added to `helpers.ts` (e.g., `isNumberSchema`, `coerceParams`). Tests for numeric coercion cases: string `"1"` → number `1`, `"1.5"` → `1.5`, `undefined` → `undefined`.

---

## All Affected Tool Params

Every tool that uses `z.number()` on a CLI-accessible param is currently broken. They all work via MCP (where values arrive as typed JSON) but fail via CLI.

### `packages/plugins/clerk/src/tools/writ-list.ts`
```typescript
params: {
  status: z.enum([...]).optional(),
  type: z.string().optional(),
  limit: z.number().optional().default(20),     // ← broken
  offset: z.number().optional(),                // ← broken
}
```

### `packages/plugins/spider/src/tools/rig-list.ts`
```typescript
params: {
  status: z.enum(['running', 'completed', 'failed']).optional(),
  limit: z.number().optional(),                 // ← broken
  offset: z.number().optional(),                // ← broken
}
```

### `packages/plugins/animator/src/tools/session-list.ts`
```typescript
params: {
  status: z.enum([...]).optional(),
  provider: z.string().optional(),
  conversationId: z.string().optional(),
  limit: z.number().optional().default(20),     // ← broken
}
```

### `packages/plugins/parlour/src/tools/conversation-list.ts`
```typescript
params: {
  status: z.enum([...]).optional(),
  kind: z.enum([...]).optional(),
  limit: z.number().optional().default(20),     // ← broken
}
```

### `packages/plugins/codexes/src/tools/draft-seal.ts`
```typescript
params: {
  codexName: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string().optional(),
  maxRetries: z.number().optional(),            // ← broken
  keepDraft: z.boolean().optional(),            // ← works (boolean)
}
```

### `packages/plugins/spider/src/tools/crawl-continual.ts`
```typescript
params: {
  maxIdleCycles: z.number().optional().default(0),  // ← broken
  pollIntervalMs: z.number().optional(),             // ← broken
}
```

**Total: 8 numeric params across 6 tools.** All currently fail when passed via CLI.

---

## Working (Not Broken) Param Types for Reference

### Booleans — already handled
```typescript
// draft-abandon.ts
force: z.boolean().optional()   // works — registered as --force flag, no <value>

// draft-seal.ts
keepDraft: z.boolean().optional()

// status.ts, version.ts, plugin.ts (framework commands)
json: z.boolean().optional()

// upgrade.ts
dryRun: z.boolean().optional()
```

### Strings — pass through naturally
All `z.string()` and `z.enum()` params work — Commander returns strings, Zod validates them as strings/enums.

---

## Type Unwrapping Pattern (Precedent)

`packages/plugins/tools/src/tools/tools-show.ts` (lines 51–86) already has infrastructure for unwrapping Zod types:

```typescript
function extractSingleParam(zodType: z.ZodType): ParamInfo {
  let isOptional = false;
  let inner: z.ZodType = zodType;

  // Unwrap ZodOptional
  if (inner instanceof z.ZodOptional) {
    isOptional = true;
    inner = inner.unwrap() as z.ZodType;
  }

  // Unwrap ZodDefault
  if (inner instanceof z.ZodDefault) {
    isOptional = true;
    inner = inner.unwrap() as z.ZodType;
  }

  return {
    type: zodTypeToJsonType(inner),   // 'number', 'string', 'boolean', etc.
    description: inner.description ?? null,
    optional: isOptional,
  };
}

function zodTypeToJsonType(zodType: z.ZodType): string {
  if (zodType instanceof z.ZodString) return 'string';
  if (zodType instanceof z.ZodNumber) return 'number';
  if (zodType instanceof z.ZodBoolean) return 'boolean';
  // ...
}
```

This exact pattern — unwrap ZodOptional, unwrap ZodDefault, check `instanceof z.ZodNumber` — can drive coercion in the CLI layer. The `helpers.ts` module could adopt it, or import from a shared utility, to detect number schemas and convert string values.

---

## The `isBooleanSchema` Approach vs. `instanceof` Approach

The existing `isBooleanSchema` in `helpers.ts` uses behavioral probing:
```typescript
export function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  return (
    schema.safeParse(true).success &&
    schema.safeParse(false).success &&
    !schema.safeParse(42).success &&
    !schema.safeParse('test').success
  );
}
```

This is resilient against Zod internal changes (doesn't depend on class names). A parallel `isNumberSchema` could use:
```typescript
schema.safeParse(42).success &&
!schema.safeParse('hello').success &&
!schema.safeParse(true).success
```

However, numbers create a complexity: `z.number().optional()` passes `safeParse(42)` but also `safeParse(undefined)`. That's fine — optional detection is already handled separately by `schema.isOptional()`.

The `instanceof z.ZodNumber` approach is shorter but potentially more brittle across Zod versions. The codebase already mixes both approaches (`tools-show.ts` uses `instanceof`, `helpers.ts` uses behavioral probing).

---

## Coercion Strategy

The coercion function needs to handle these Zod wrapper chains:
- `z.number()` → plain number schema
- `z.number().optional()` → ZodOptional wrapping ZodNumber
- `z.number().optional().default(20)` → ZodDefault wrapping ZodOptional wrapping ZodNumber (actually in Zod v4 it may differ)
- `z.number().default(20)` → ZodDefault wrapping ZodNumber

For `undefined` values (omitted optional flags): pass through as `undefined` — Zod's parse step handles defaults and optional behavior.

For string values where schema is numeric: apply `Number(value)`. `Number("1")` → `1`, `Number("1.5")` → `1.5`, `Number("abc")` → `NaN` — Zod will reject NaN with a cleaner error message than "received string". This is appropriate behavior.

**Note on `z.number().int()`:** `Number("5")` → `5` which is fine. No special handling needed.

---

## Zod Version Note

From `packages/plugins/tools/src/tool.ts`:
```typescript
import { z } from 'zod';
```

The codebase uses Zod. The `tools-show.ts` uses `instanceof z.ZodNumber` and `.unwrap()`, which confirms these APIs are available. The `helpers.ts` uses `.isOptional()` and `.safeParse()`. Both approaches are available.

---

## Adjacent: `program.ts` Type Annotation

Line 61 types opts as `Record<string, string | undefined>`:
```typescript
cmd.action(async (opts: Record<string, string | undefined>) => {
```

After coercion, the type would be `Record<string, string | number | boolean | undefined>`. The TypeScript annotation might need updating, or the coercion could be typed more loosely as `Record<string, unknown>` (which is what Zod's `parse()` actually accepts).

---

## Test File: `packages/framework/cli/src/program.test.ts`

Current state: 109 lines. Tests `toFlag`, `isBooleanSchema`, `findGroupPrefixes` — all from `helpers.ts`. Does NOT have end-to-end tests of `buildToolCommand` (which would require mocking Commander and guild infrastructure).

Tests needed for the fix:
- `isNumberSchema(z.number())` → true
- `isNumberSchema(z.number().optional())` → true
- `isNumberSchema(z.number().optional().default(20))` → true
- `isNumberSchema(z.string())` → false
- `isNumberSchema(z.boolean())` → false
- `coerceParams(shape, { limit: "5" })` → `{ limit: 5 }`
- `coerceParams(shape, { limit: undefined })` → `{ limit: undefined }`
- `coerceParams(shape, { limit: "abc" })` → `{ limit: NaN }` (or Number("abc"))

---

## Framework Commands (Not Broken)

`packages/framework/cli/src/commands/` contains:
- `status.ts` — `json: z.boolean().optional()` — works
- `version.ts` — `json: z.boolean().optional()` — works
- `plugin.ts` — `json: z.boolean().optional()` — works
- `upgrade.ts` — `dryRun: z.boolean().optional()` — works
- `init.ts` — no params with `<value>` (interactive)

These are registered via `registerTools(program, frameworkCommands)` and go through the same `buildToolCommand` path. No numeric params currently, so not broken — but will benefit from the fix's robustness.

---

## Scope of Fix

The fix is **entirely in the CLI layer** — `helpers.ts` and `program.ts`. No tool definitions need to change. No Instrumentarium changes. No Zod schema changes in any tool file.

The fix does NOT require:
- Using `z.coerce.number()` in tool definitions (would require touching every tool)
- Changing the MCP code path (values already arrive typed via MCP JSON)
- Changes to the `tool()` factory or `ToolDefinition` type

---

## Files Summary

### Will be modified:
- `packages/framework/cli/src/helpers.ts` — add `isNumberSchema()` or `coerceParams()` helper
- `packages/framework/cli/src/program.ts` — apply coercion before `toolDef.params.parse(opts)` in `buildToolCommand`
- `packages/framework/cli/src/program.test.ts` — add tests for new helper(s)

### Will NOT be modified:
- All tool definition files (`writ-list.ts`, `rig-list.ts`, etc.) — they're fine as-is
- `packages/plugins/tools/src/tool.ts` — ToolDefinition type unchanged
- `packages/plugins/tools/src/instrumentarium.ts` — no change needed
- MCP server code — it already receives typed values from the MCP protocol

---

## Doc/Code Discrepancies

None found relevant to this bug. The CLI doc in `packages/framework/cli/README.md` (referenced in prior specs) mentions commands but likely doesn't describe the argument parsing internals.

---

## Existing Context

No prior commissions touched this code path specifically. The `isBooleanSchema` helper was added as part of the original CLI-from-tools generation work — it established the pattern that new type handlers follow.

The `program.test.ts` comment says "tests the helper functions in program.ts" but `buildToolCommand` itself is not covered — it would require Commander integration tests that would be heavyweight. New tests can follow the existing pattern of testing helpers in isolation.
