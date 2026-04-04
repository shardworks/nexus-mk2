# Inventory: plugin-dependency-crash-blocks-all

Brief: Isolate plugin load/validation failures so the nsg CLI remains functional.

---

## Affected Code

### Primary file: `packages/framework/arbor/src/guild-lifecycle.ts`

Pure logic layer for plugin validation, ordering, and events. All functions are deterministic with no I/O.

**validateRequires** (lines 37–99):
```typescript
export function validateRequires(
  kits: LoadedKit[],
  apparatuses: LoadedApparatus[],
): void
```
Throws on the first validation problem found:
- Apparatus requires missing plugin (lines 48–56): throws `"[arbor] "{app.id}" requires "{dep}", which is not installed."`
- Kit requires missing plugin or another kit (lines 59–73): throws distinct errors for each case
- Circular dependency among apparatuses (lines 75–98): DFS cycle detection, throws `"[arbor] Circular dependency detected: {chain}"`

This function is the root cause — it throws errors that propagate uncaught through `createGuild()` and `main()`, crashing the CLI.

**topoSort** (lines 107–127):
```typescript
export function topoSort(apparatuses: LoadedApparatus[]): LoadedApparatus[]
```
Assumes `validateRequires()` has already guaranteed an acyclic graph. Must remain unchanged — cascade filtering (new) runs before this to ensure only valid plugins reach topoSort.

**collectStartupWarnings** (lines 138–185):
```typescript
export function collectStartupWarnings(kits: LoadedKit[], apparatuses: LoadedApparatus[]): string[]
```
Returns advisory warning strings for missing recommends and unconsumed kit contributions. Already non-throwing — this is the pattern validateRequires should follow.

**EventHandlerMap type** (lines 20–23):
```typescript
export type EventHandlerMap = Map<string, Array<(...args: unknown[]) => void | Promise<void>>>;
```

### Primary file: `packages/framework/arbor/src/arbor.ts`

Guild runtime entry point. `createGuild()` orchestrates load → validate → start.

**createGuild** (lines 58–186):
```typescript
export async function createGuild(root?: string): Promise<Guild>
```

Key phases:
1. **Load phase** (lines 68–96): Already resilient — catches per-plugin import errors, warns, continues.
2. **Validation phase** (line 100): `validateRequires(kits, apparatuses)` — **throws uncaught**. This is the second link in the failure chain.
3. **Startup warnings** (lines 104–106): Advisory, non-throwing.
4. **Start phase** (lines 110–183): topoSort, wire guild singleton (line 158 via `setGuild()`), fire kit events, start each apparatus in dependency order.

**Guild instance** (lines 118–157): Object literal implementing the `Guild` interface. Currently exposes `kits()` and `apparatuses()` as snapshot copies. Needs `failedPlugins()` added.

### Critical failure point: `packages/framework/cli/src/program.ts`

**main()** (lines 122–178):
```typescript
export async function main(): Promise<void>
```

Line 163: `await createGuild(home)` — **not wrapped in try/catch**. If `validateRequires` throws, the exception propagates through `main()` to the top-level handler in cli.ts (lines 15–18) which calls `process.exit(1)`. Framework commands are registered at line 156 *before* this call, but never execute because the process exits.

The try/catch at lines 165–174 only wraps Instrumentarium access — it doesn't protect against `createGuild()` failure.

### Framework command: `packages/framework/cli/src/commands/status.ts`

**status tool** (lines 16–58):
- Accesses guild via `guild()` (line 26)
- Currently shows: guild name, nexus version, home, model, plugin list
- Does not report plugin health — no visibility into failed plugins
- Needs `failedPlugins()` data added to both text and JSON output

### Framework command: `packages/framework/cli/src/commands/plugin.ts`

**pluginList** (lines 94–116), **pluginInstall** (lines 118–175), **pluginRemove** (lines 177–212):
- All call `guild()` at handler entry to get `home` path
- These are pure npm + guild.json operations — they don't depend on plugins being healthy
- If `createGuild()` crashes program.ts, these commands are unreachable even though they don't need a fully loaded guild

### Core types: `packages/framework/core/src/plugin.ts`

**LoadedKit** (lines 16–21), **LoadedApparatus** (lines 24–29), **LoadedPlugin** (line 32):
```typescript
export type LoadedPlugin = LoadedKit | LoadedApparatus
```
These describe successfully loaded plugins. No type exists for failed plugins — a `FailedPlugin` interface is needed as a peer type with `id` and `reason` fields.

**Kit** (lines 66–70): Has `requires?: string[]` and `recommends?: string[]`.
**Apparatus** (lines 98–106): Has `requires?: string[]`, `recommends?: string[]`, `provides?`, `start()`, etc.

### Core singleton: `packages/framework/core/src/guild.ts`

**Guild interface** (lines 26–73):
```typescript
export interface Guild {
  readonly home: string
  apparatus<T>(name: string): T
  config<T>(pluginId: string): T
  writeConfig<T>(pluginId: string, value: T): void
  guildConfig(): GuildConfig
  kits(): LoadedKit[]
  apparatuses(): LoadedApparatus[]
}
```
Missing: `failedPlugins(): FailedPlugin[]` — needed for status command and any future plugin health inspection.

### Core exports: `packages/framework/core/src/index.ts`

Re-exports plugin types (lines 11–24) and guild singleton (lines 27–32). New `FailedPlugin` type needs adding to the plugin type exports.

---

## Adjacent Patterns

### Pattern 1: Load-phase resilience (arbor.ts lines 68–96)

The load phase already demonstrates the target pattern — per-plugin try/catch with warn-and-continue:
```typescript
try {
  const entryPath = resolveGuildPackageEntry(guildRoot, packageName);
  const mod = await import(entryPath);
  // ...discriminate kit vs apparatus...
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[arbor] Failed to load plugin "${packageName}": ${message}`);
}
```

### Pattern 2: collectStartupWarnings (guild-lifecycle.ts lines 138–185)

Non-throwing advisory pattern: collects all issues as strings, returns array, caller decides how to emit. This is the model for resilient validation — collect instead of throw.

### Pattern 3: Plugin remove error suppression (plugin.ts lines 198–207)

```typescript
try {
  npm(['uninstall', packageName], home);
} catch {
  // Don't fail if uninstall fails — guild.json is already updated
}
```
Demonstrates that plugin management commands prioritize config consistency over npm success.

---

## Test Files

### `packages/framework/arbor/src/guild-lifecycle.test.ts`

Pure logic tests using synthetic `makeKit()` / `makeApparatus()` fixtures. No I/O.

**validateRequires block** (lines 57–176): 14 tests using `assert.throws()` / `assert.doesNotThrow()`.
Key tests that need conversion:
- "throws when apparatus requires a missing plugin" (line 82–88)
- "throws when kit requires a missing plugin" (lines 90–96)
- "throws when kit requires another kit" (lines 98–107)
- "detects a direct circular dependency" (lines 121–130)
- "detects a transitive circular dependency" (lines 132–142)
- "includes the cycle path in the error message" (lines 144–156)
- "passes with a self-referencing apparatus" (lines 169–175)

All `assert.throws` calls become positive assertions on the returned `FailedPlugin[]`. All `assert.doesNotThrow` calls become `assert.deepEqual(result, [])`.

No `filterFailedPlugins` tests exist — new test block needed.

### `packages/framework/arbor/src/arbor.test.ts`

Integration tests using real temp directories with fake plugin packages in `node_modules/`.

**Fixture helpers**: `makeTmpDir()`, `writeGuildJson()`, `writePackageJson()`, `installFakeKit()`, `installFakeApparatus()`.

**Validation block** (lines 341–366): 2 tests using `assert.rejects()`:
- "throws when an apparatus requires a missing plugin" (lines 342–352)
- "throws on circular dependencies" (lines 354–365)

Both need conversion to verify `createGuild()` succeeds, then check `g.failedPlugins()` and `g.apparatuses()`.

**Resilience block** (lines 416–453): Already tests load-phase resilience (broken JS, missing package.json). Confirms the existing resilience pattern that validation should match.

---

## Files Summary

### Will be modified:
- `packages/framework/core/src/plugin.ts` — add FailedPlugin interface
- `packages/framework/core/src/guild.ts` — add failedPlugins() to Guild interface
- `packages/framework/core/src/index.ts` — export FailedPlugin type
- `packages/framework/arbor/src/guild-lifecycle.ts` — refactor validateRequires to return FailedPlugin[], add filterFailedPlugins
- `packages/framework/arbor/src/arbor.ts` — use resilient validation, wire failedPlugins() on guild instance
- `packages/framework/cli/src/program.ts` — wrap createGuild in try/catch
- `packages/framework/cli/src/commands/status.ts` — show failed plugins section
- `packages/framework/arbor/src/guild-lifecycle.test.ts` — convert throws to return-value assertions, add filterFailedPlugins tests
- `packages/framework/arbor/src/arbor.test.ts` — convert rejects to positive assertions, add cascade test

### Will NOT be modified:
- `packages/framework/cli/src/commands/plugin.ts` — plugin install/remove/list work unchanged once the CLI error boundary (S3) prevents crash
- `packages/framework/cli/src/cli.ts` — top-level error handler stays as-is; the fix is in program.ts
- Any plugin packages — the fix is entirely in framework code
