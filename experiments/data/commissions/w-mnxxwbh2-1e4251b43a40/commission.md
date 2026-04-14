# Arbor Documentation: Stale Event Names and Missing API Entries

## Summary

Update the arbor README and six external documentation files to reflect the current codebase: replace all references to the removed `plugin:initialized` event with the actual event names (`apparatus:started` and `phase:started`), add three missing methods to the Guild API table, add two missing functions to the lifecycle internals table, correct the `buildStartupContext` signature, and update the Wire phase description to include kit entry collection.

## Current State

The arbor package lives at `packages/framework/arbor/`. Its README (`packages/framework/arbor/README.md`) documents the Guild API, plugin lifecycle, and guild lifecycle internals.

**Guild interface** (from `packages/framework/core/src/guild.ts`):

```typescript
export interface Guild {
  readonly home: string
  apparatus<T>(name: string): T
  config<T = Record<string, unknown>>(pluginId: string): T
  writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void
  guildConfig(): GuildConfig
  kits(): LoadedKit[]
  apparatuses(): LoadedApparatus[]
  failedPlugins(): FailedPlugin[]
  startupWarnings(): string[]
}
```

The README's Guild API table lists only 6 of these 9 methods — `writeConfig`, `failedPlugins`, and `startupWarnings` are missing.

**Lifecycle events** (from `packages/framework/arbor/src/arbor.ts`, lines 230–235):

```typescript
// Fire apparatus:started (replaces plugin:initialized — no deprecation period)
await fireEvent(eventHandlers, "apparatus:started", app);
// Fire phase:started after all apparatus start + events complete
await fireEvent(eventHandlers, "phase:started");
```

The README still uses the removed `plugin:initialized` event name in the lifecycle step 5 description.

**Lifecycle internals** (from `packages/framework/arbor/src/guild-lifecycle.ts`):

The README's internals table is missing two exported functions:
- `filterFailedPlugins(kits, apparatuses, rootFailures)` — cascade filtering of failed plugins
- `wireKitEntries(kits, orderedApparatuses)` — kit entry collection during Wire phase

The table also shows `buildStartupContext(eventHandlers)` with one parameter, but the actual signature is `buildStartupContext(eventHandlers, kitEntries)`.

**Wire phase** (arbor.ts lines 148–150): The Wire phase collects all kit contributions via `wireKitEntries()` before setting the guild singleton. The README step 4 only mentions setting the guild singleton.

**External docs referencing `plugin:initialized`:**

1. `docs/architecture/index.md` — lines 190 and 241
2. `docs/architecture/apparatus/instrumentarium.md` — line 131
3. `docs/architecture/apparatus/fabricator.md` — lines 123 and 156
4. `packages/plugins/tools/README.md` — line 273
5. `README.md` — line 198
6. `packages/framework/arbor/src/arbor.ts` — line 230 (code comment, not a doc file; left unchanged)

## Requirements

- R1: The arbor README lifecycle step 5 (Start) must describe both `apparatus:started` (fires after each apparatus completes `start()`) and `phase:started` (fires once after all apparatus have started). The removed `plugin:initialized` event name must not appear.
- R2: The arbor README Guild API table must include `writeConfig<T>(pluginId, value)`, `failedPlugins()`, and `startupWarnings()` with correct return types and descriptions matching the Guild interface in `packages/framework/core/src/guild.ts`.
- R3: The arbor README lifecycle internals table must include `filterFailedPlugins(kits, apparatuses, rootFailures)` and `wireKitEntries(kits, orderedApparatuses)` with descriptions matching their JSDoc in `packages/framework/arbor/src/guild-lifecycle.ts`.
- R4: The arbor README lifecycle internals table entry for `buildStartupContext` must show both parameters: `buildStartupContext(eventHandlers, kitEntries)`.
- R5: The arbor README lifecycle step 4 (Wire) must describe both kit entry collection (via `wireKitEntries`) and guild singleton wiring.
- R6: All six external documentation files must replace `plugin:initialized` with the correct current event names (`apparatus:started` and/or `phase:started`), preserving the surrounding sentence meaning.

## Design

### Arbor README Changes (`packages/framework/arbor/README.md`)

**Guild API table (line 48–55):** Replace the existing 6-row table with a 9-row table. The three new rows, inserted in the order they appear on the Guild interface:

| Method | Returns | Description |
|---|---|---|
| `home` | `string` | Absolute path to the guild root |
| `apparatus<T>(name)` | `T` | Retrieve a started apparatus's `provides` API by plugin id. Throws if the apparatus has no `provides` |
| `config<T>(pluginId)` | `T` | Read the plugin-specific configuration section from `guild.json` |
| `writeConfig<T>(pluginId, value)` | `void` | Write a plugin's configuration section to `guild.json` and persist to disk |
| `guildConfig()` | `GuildConfig` | The full parsed `guild.json` |
| `kits()` | `LoadedKit[]` | All loaded kits (snapshot copy) |
| `apparatuses()` | `LoadedApparatus[]` | All loaded apparatus in start order (snapshot copy) |
| `failedPlugins()` | `FailedPlugin[]` | Plugins that failed to load, validate, or start (snapshot copy) |
| `startupWarnings()` | `string[]` | Advisory warnings collected during startup (missing recommends, unconsumed contributions) |

**Lifecycle step 4 (line 90):** Replace:
```
4. **Wire** — sets the `guild()` singleton. The `provides` map is populated progressively as each apparatus starts; dependency ordering guarantees declared deps are available.
```
with:
```
4. **Wire** — collects all kit contributions (standalone kits and apparatus `supportKit` entries) into a flat `KitEntry[]`, then sets the `guild()` singleton. The `provides` map is populated progressively as each apparatus starts; dependency ordering guarantees declared deps are available.
```

**Lifecycle step 5 (line 91):** Replace:
```
5. **Start** — fires `plugin:initialized` for all kits, then calls `start(ctx)` on each apparatus in dependency-resolved order, firing `plugin:initialized` after each.
```
with:
```
5. **Start** — calls `start(ctx)` on each apparatus in dependency-resolved order, firing `apparatus:started` after each. Once all apparatus have started, fires `phase:started` once.
```

**Lifecycle internals table (lines 101–107):** Replace the existing 5-row table with a 7-row table:

| Function | Description |
|---|---|
| `validateRequires(kits, apparatuses)` | Validates all `requires` declarations and detects circular dependencies |
| `filterFailedPlugins(kits, apparatuses, rootFailures)` | Removes plugins that transitively depend on any failed plugin; cascades until stable |
| `topoSort(apparatuses)` | Topological sort by `requires` — determines apparatus start order |
| `wireKitEntries(kits, orderedApparatuses)` | Collects all kit contributions (standalone + apparatus supportKit) into a flat `KitEntry[]` |
| `collectStartupWarnings(kits, apparatuses)` | Advisory warnings for unconsumed contributions and missing recommends |
| `buildStartupContext(eventHandlers, kitEntries)` | Creates the `StartupContext` passed to `apparatus.start()` |
| `fireEvent(eventHandlers, event, ...args)` | Fires lifecycle events to registered handlers |

### External Documentation Changes

**`docs/architecture/index.md` line 190:**
Replace:
```
Everything else is forwarded opaquely to consuming apparatus via the `plugin:initialized` lifecycle event.
```
with:
```
Everything else is available to consuming apparatus via the `apparatus:started` lifecycle event (or read eagerly from `ctx.kits()` at start time).
```

**`docs/architecture/index.md` line 241:**
Replace:
```
Kit contributions are forwarded to consuming apparatus reactively via the `plugin:initialized` lifecycle event.
```
with:
```
Kit contributions are available to consuming apparatus via `ctx.kits()` at start time and reactively via the `apparatus:started` lifecycle event.
```

**`docs/architecture/apparatus/instrumentarium.md` line 131:**
Replace:
```
Each entry is a `ToolDefinition` produced by the `tool()` factory. The Instrumentarium scans these contributions reactively via `plugin:initialized` at startup.
```
with:
```
Each entry is a `ToolDefinition` produced by the `tool()` factory. The Instrumentarium scans these contributions at startup via `ctx.kits()` and reactively via the `apparatus:started` event.
```

**`docs/architecture/apparatus/fabricator.md` line 123:**
Replace:
```
Each value is an `EngineDesign`. The Fabricator scans these contributions reactively via `plugin:initialized` at startup — the same pattern the Instrumentarium uses for tools. See the [Instrumentarium spec](instrumentarium.md) for the reference implementation of kit-contribution scanning.
```
with:
```
Each value is an `EngineDesign`. The Fabricator scans these contributions at startup via `ctx.kits()` and reactively via the `apparatus:started` event — the same pattern the Instrumentarium uses for tools. See the [Instrumentarium spec](instrumentarium.md) for the reference implementation of kit-contribution scanning.
```

**`docs/architecture/apparatus/fabricator.md` line 156:**
Replace:
```
- The Instrumentarium's kit-scanning lifecycle is the model to follow — reactive consumption of `plugin:initialized` events, collecting contributions into an internal registry.
```
with:
```
- The Instrumentarium's kit-scanning lifecycle is the model to follow — eager reading of `ctx.kits()` at start time plus reactive consumption of `apparatus:started` events, collecting contributions into an internal registry.
```

**`packages/plugins/tools/README.md` line 273:**
Replace:
```
Each entry in the `tools` array is a `ToolDefinition` produced by the `tool()` factory. The Instrumentarium scans these contributions at startup via the `plugin:initialized` lifecycle event.
```
with:
```
Each entry in the `tools` array is a `ToolDefinition` produced by the `tool()` factory. The Instrumentarium scans these contributions at startup via `ctx.kits()` and reactively via the `apparatus:started` lifecycle event.
```

**`README.md` line 198:**
Replace:
```
      // ctx.on('plugin:initialized', handler) — react to kit contributions
```
with:
```
      // ctx.on('apparatus:started', handler) — react to apparatus startup
```

### Non-obvious Touchpoints

- `packages/framework/arbor/src/arbor.ts` line 230 contains a code comment referencing `plugin:initialized` as historical context (`// Fire apparatus:started (replaces plugin:initialized — no deprecation period)`). This is intentional developer context in the source code, not documentation. Leave it unchanged.

## Validation Checklist

- V1 [R1]: Grep `packages/framework/arbor/README.md` for `plugin:initialized` — must return zero matches. Grep for `apparatus:started` and `phase:started` — both must appear in the step 5 description.
- V2 [R2]: Read the Guild API table in the arbor README and verify it contains exactly 9 rows: `home`, `apparatus<T>(name)`, `config<T>(pluginId)`, `writeConfig<T>(pluginId, value)`, `guildConfig()`, `kits()`, `apparatuses()`, `failedPlugins()`, `startupWarnings()`. Verify `writeConfig` shows return type `void`, `failedPlugins` shows `FailedPlugin[]`, `startupWarnings` shows `string[]`.
- V3 [R3]: Read the lifecycle internals table in the arbor README and verify it contains rows for `filterFailedPlugins(kits, apparatuses, rootFailures)` and `wireKitEntries(kits, orderedApparatuses)`.
- V4 [R4]: Read the lifecycle internals table and verify `buildStartupContext` shows two parameters: `(eventHandlers, kitEntries)`.
- V5 [R5]: Read lifecycle step 4 in the arbor README and verify it mentions kit entry collection and guild singleton wiring.
- V6 [R6]: Grep the entire repo for `plugin:initialized` — the only match must be the code comment in `packages/framework/arbor/src/arbor.ts` line 230. Zero matches in any `.md` file: `grep -r 'plugin:initialized' --include='*.md'` must return nothing.

## Test Cases

This commission modifies only documentation (Markdown files). There are no automated tests to write. Validation is structural (grep-based checks in the validation checklist above).