# Writ Type Metadata Parity: Descriptions, Source Tracking, and API Method

## Summary

Upgrade the Clerk's writ type registration system to preserve kit-contributed descriptions, track the source of each type, and expose a `listWritTypes()` method on `ClerkApi` — bringing writ types to metadata parity with the Loom's role system.

## Current State

The Clerk already accepts writ types from three sources: the hardcoded built-in set (`mandate`), guild config (`clerk.writTypes` in guild.json), and kit/supportKit contributions via `consumes: ['writTypes']`. Type validation at post/edit time works correctly.

The gap is in metadata handling. The internal storage is a `Set<string>` (`mergedWritTypes` in `packages/plugins/clerk/src/clerk.ts` line 85) that stores only type names. The `registerKitWritTypes()` function (line 119) extracts `name` from each `WritTypeEntry` and discards the `description`. The `writ-types` tool handler (line 441) reconstructs descriptions by looking up only guild config entries — kit-contributed descriptions always resolve to `null`.

There is no source tracking (which plugin contributed which type) and no programmatic API method for listing types — only the inline tool handler.

**Current types:**

```typescript
// packages/plugins/clerk/src/types.ts
export interface WritTypeEntry {
  name: string;
  description?: string;
}

export interface ClerkConfig {
  writTypes?: WritTypeEntry[];
  defaultType?: string;
}

// packages/plugins/clerk/src/clerk.ts
export interface ClerkKit {
  writTypes?: WritTypeEntry[];
}
```

**Current `ClerkApi` interface** (`packages/plugins/clerk/src/types.ts` lines 197–252) has no `listWritTypes()` method.

**Current `writ-types` tool handler** (`packages/plugins/clerk/src/clerk.ts` lines 441–455):

```typescript
handler: async () => {
  const config = resolveClerkConfig();
  const defaultType = resolveDefaultType();
  const configEntries = config.writTypes ?? [];

  return [...mergedWritTypes].map((name) => {
    const entry = configEntries.find((e) => e.name === name);
    return {
      name,
      description: entry?.description ?? null,
      default: name === defaultType,
    };
  });
},
```

**Current writs page** (`packages/plugins/clerk/pages/writs/index.html`) reads `t.default` at line 864 and `opt.dataset.default` at line 983.

## Requirements

- R1: When a kit or supportKit contributes a `writTypes` entry with a `description` field, the description must be preserved and returned by both `listWritTypes()` and the `writ-types` tool.
- R2: Every entry returned by `listWritTypes()` and the `writ-types` tool must include a `source` field indicating the origin: `"builtin"` for hardcoded types, `"guild"` for types declared in guild config, or the contributing plugin's id for kit-contributed types.
- R3: When a guild config `writTypes` entry has the same name as a kit-contributed type, the guild entry must fully shadow the kit contribution — including its description. The kit description is discarded.
- R4: `ClerkApi` must expose a `listWritTypes(): WritTypeInfo[]` method that returns the full metadata for all registered writ types.
- R5: The `writ-types` tool handler must delegate to `api.listWritTypes()` rather than containing inline logic.
- R6: The `WritTypeInfo` interface must be a named export from `@shardworks/clerk-apparatus` with fields: `name`, `description` (string or null), `source`, and `isDefault` (boolean).
- R7: The writs dashboard page must be updated to consume the renamed `isDefault` field (previously `default`) from the `writ-types` tool response.
- R8: Existing writ type validation behavior (rejecting unknown types at post/edit time, config override of kit types, duplicate kit type warnings, malformed entry warnings) must be preserved unchanged.

## Design

### Type Changes

**New type** — add to `packages/plugins/clerk/src/types.ts`:

```typescript
/**
 * Metadata for a registered writ type, returned by listWritTypes().
 */
export interface WritTypeInfo {
  /** The writ type name. */
  name: string;
  /** Human-readable description, or null if none was provided. */
  description: string | null;
  /** Origin of this type: "builtin", "guild", or the contributing plugin id. */
  source: string;
  /** Whether this is the guild's default writ type. */
  isDefault: boolean;
}
```

**Modified type** — add method to `ClerkApi` in `packages/plugins/clerk/src/types.ts`:

```typescript
export interface ClerkApi {
  // ... all existing methods unchanged ...

  /**
   * List all registered writ types with metadata.
   * Returns builtin types, guild-configured types, and kit-contributed types.
   * Each entry includes the type name, optional description, source, and
   * whether it is the default type.
   */
  listWritTypes(): WritTypeInfo[];
}
```

**New internal type** — add inside `createClerk()` in `packages/plugins/clerk/src/clerk.ts` (not exported):

```typescript
/** Internal metadata stored per writ type. */
interface WritTypeMeta {
  description?: string;
  source: string;
}
```

**Unchanged types** — `WritTypeEntry`, `ClerkKit`, `ClerkConfig`, `WritDoc` are unchanged.

### Behavior

**Internal storage replacement:**

- When `mergedWritTypes` is replaced from `Set<string>` to `Map<string, WritTypeMeta>`, all existing callsites that use `.has(name)` continue to work identically �� `Map.has()` has the same semantics as `Set.has()`.

**Initialization in `start(ctx)` (currently lines 501–509):**

- When initializing from `BUILTIN_TYPES`: for each name, set the Map entry to `{ source: 'builtin' }` (no description for built-in types).
- When initializing from `configWritTypeNames`: for each config entry, set the Map entry to `{ description: entry.description, source: 'guild' }`.
- When scanning kit contributions via `ctx.kits('writTypes')`: `registerKitWritTypes` stores `{ description: entry.description, source: kitEntry.pluginId }` for each valid entry.

**Registration in `registerKitWritTypes()` (currently lines 119–150):**

- When a config type has the same name: skip silently (unchanged — full shadow per D3).
- When a duplicate kit type is detected: warn and skip (unchanged).
- When a valid new type is registered: `mergedWritTypes.set(name, { description: (entry as WritTypeEntry).description, source: pluginId })` instead of `mergedWritTypes.add(name)`.

**`resolveWritTypes()` (currently lines 96–98):**

- Returns the `Map<string, WritTypeMeta>` directly. Callers that use `.has(type)` work unchanged since `Map.has()` behaves identically to `Set.has()`.

**`listWritTypes()` implementation on the API object:**

- Synchronous method (no async needed — all data is in memory).
- Iterates `mergedWritTypes` entries, resolves `isDefault` from `resolveDefaultType()`, and returns `WritTypeInfo[]`.

```
When listWritTypes() is called, for each [name, meta] in mergedWritTypes:
  → return { name, description: meta.description ?? null, source: meta.source, isDefault: name === resolveDefaultType() }
```

**`writ-types` tool handler refactoring:**

- Replace the inline handler body with: `handler: async () => api.listWritTypes()`.

**Writs dashboard page updates (`packages/plugins/clerk/pages/writs/index.html`):**

- Line 864: `t.default` → `t.isDefault`.
- Line 983: `opt.dataset.default` → `opt.dataset.isDefault`. Note: this `dataset` attribute is read at line 983 but never explicitly set; the correct fix is to also set `opt.dataset.isDefault = String(t.isDefault)` when constructing the option element (around line 864), otherwise the reset logic at line 983 will not work regardless of the field name. This is a pre-existing bug that the rename naturally surfaces.

### Non-obvious Touchpoints

- **`packages/plugins/clerk/src/index.ts`** — must add `WritTypeInfo` to the type exports.
- **`packages/plugins/clerk/src/clerk.test.ts`** — existing writ-types tool tests assert `.default` (lines 1602, 1612, 1624, 1626, 1642). These must be updated to assert `.isDefault`. Existing kit-contributed writ type tests that assert `description: null` for a type without a description still pass unchanged, but new tests must cover a kit type *with* a description.
- **`packages/plugins/clerk/pages/writs/writs-type-filter.test.js`** — verify this file does not reference the `default` field. (Confirmed: it does not.)

## Validation Checklist

- V1 [R1]: Create a kit with `writTypes: [{ name: 'quality-audit', description: 'Code quality audit' }]`, start the Clerk with it, call `listWritTypes()`, and verify the `quality-audit` entry has `description: 'Code quality audit'` (not `null`).
- V2 [R2]: Call `listWritTypes()` on a Clerk with built-in types, guild config types, and kit types. Verify: `mandate` has `source: 'builtin'`, a guild-configured type has `source: 'guild'`, and a kit-contributed type has `source` equal to the kit's pluginId.
- V3 [R3]: Configure guild `clerk.writTypes` with `{ name: 'quality-audit', description: 'Guild desc' }` AND provide a kit contributing `{ name: 'quality-audit', description: 'Kit desc' }`. Call `listWritTypes()`. Verify the entry has `description: 'Guild desc'` and `source: 'guild'`.
- V4 [R4]: Verify `ClerkApi` has a `listWritTypes()` method by calling it after `start()` and confirming it returns an array of `WritTypeInfo` objects.
- V5 [R5]: Verify the `writ-types` tool handler body delegates to `api.listWritTypes()` — its output must be identical to calling `api.listWritTypes()` directly.
- V6 [R6]: Import `WritTypeInfo` from `@shardworks/clerk-apparatus` (i.e., `packages/plugins/clerk/src/index.ts`). Verify the type has `name: string`, `description: string | null`, `source: string`, and `isDefault: boolean`.
- V7 [R7]: In the writs page HTML, verify that `t.default` references have been replaced with `t.isDefault`, and that `opt.dataset.isDefault` is both set (during option creation) and read (during form reset).
- V8 [R8]: Run the existing clerk test suite. All pre-existing tests for type validation (unknown type rejection, config override, duplicate warnings, malformed entries, built-in coexistence) must pass — with the sole change that `.default` assertions become `.isDefault`.

## Test Cases

**Happy path — kit description preserved:**
- Kit contributes `{ name: 'quality-audit', description: 'Code quality audit' }` → `listWritTypes()` entry for `quality-audit` has `description: 'Code quality audit'`, `source` equal to kit's pluginId, `isDefault: false`.

**Happy path — builtin source:**
- Default setup with no config → `listWritTypes()` entry for `mandate` has `source: 'builtin'`, `isDefault: true`, `description: null`.

**Happy path — guild config source:**
- Guild config `clerk.writTypes: [{ name: 'task', description: 'A task' }]` → entry has `source: 'guild'`, `description: 'A task'`.

**Happy path — guild config default override:**
- Guild config `clerk: { writTypes: [{ name: 'task' }], defaultType: 'task' }` → `task` entry has `isDefault: true`, `mandate` has `isDefault: false`.

**Edge case — kit type without description:**
- Kit contributes `{ name: 'quality-audit' }` (no description) → entry has `description: null`, `source` is kit's pluginId.

**Edge case — guild config shadows kit description:**
- Guild config declares `{ name: 'quality-audit', description: 'Guild version' }`, kit also contributes `{ name: 'quality-audit', description: 'Kit version' }` → entry has `description: 'Guild version'`, `source: 'guild'`.

**Edge case — guild config shadows kit with no description:**
- Guild config declares `{ name: 'quality-audit' }` (no description), kit contributes `{ name: 'quality-audit', description: 'Kit version' }` → entry has `description: null`, `source: 'guild'`. The kit description is fully shadowed.

**Edge case — apparatus supportKit writ type:**
- An apparatus with `supportKit: { writTypes: [{ name: 'late-type', description: 'Late' }] }` → entry has `description: 'Late'`, `source` is the apparatus's pluginId.

**Error case — duplicate kit type still warns:**
- Two kits contribute same type name → second kit's entry is skipped with `console.warn`, first kit's metadata (description, source) is retained.

**Error case — malformed entry still warns:**
- Kit contributes `[{ notName: 'bad' }]` → warning emitted, no entry added.

**Boundary — tool delegates to API:**
- Call the `writ-types` tool handler and `api.listWritTypes()` separately → both return identical results.

**Boundary — isDefault field name:**
- Call `listWritTypes()` → verify each entry has an `isDefault` property (not `default`).
