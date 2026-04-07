---
author: plan-writer
estimated_complexity: 13
---

# Startup Lifecycle Phases and Unified Kit Wiring

## Summary

Introduce a Wire phase in Arbor that collects all kit and supportKit contributions into a flat `KitEntry[]` before any apparatus starts, expose them via `ctx.kits(type)` on `StartupContext`, and replace the fragile scan+subscribe pattern in six consumer apparatuses (plus Stacks) with a single query. Fix `g.apparatuses()` to return only started apparatuses. Replace the `plugin:initialized` event with `apparatus:started`. Add a `phase:started` event.

## Current State

### Lifecycle in `packages/framework/arbor/src/arbor.ts`

`createGuild()` runs three phases: Load, Validate, Start. During Start (line 130–205):

1. `topoSort(apparatuses)` produces `orderedApparatuses`
2. Guild singleton is set with `apparatuses()` returning `[...orderedApparatuses]` — **all** apparatuses regardless of start status
3. `plugin:initialized` fires for each standalone kit (lines 183–185) — dead code, no handler is registered yet
4. For each apparatus in order: register provides → `start(ctx)` → re-check provides → fire `plugin:initialized`

### `StartupContext` in `packages/framework/core/src/plugin.ts` (line 52)

```typescript
export interface StartupContext {
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
}
```

### `Guild` interface in `packages/framework/core/src/guild.ts` (line 26)

```typescript
export interface Guild {
  readonly home: string
  apparatus<T>(name: string): T
  config<T = Record<string, unknown>>(pluginId: string): T
  writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void
  guildConfig(): GuildConfig
  kits(): LoadedKit[]              // returns standalone kits only
  apparatuses(): LoadedApparatus[] // BUG: returns ALL ordered, not just started
  failedPlugins(): FailedPlugin[]
  startupWarnings(): string[]
}
```

### Consumer scan+subscribe pattern (example: Oculus `packages/plugins/oculus/src/oculus.ts`, start() ~line 426)

```typescript
for (const kit of g.kits()) { scanKit(kit); }
for (const apparatus of g.apparatuses()) { scanApparatus(apparatus); }
ctx.on('plugin:initialized', (plugin: unknown) => { scan... });
```

The same pattern repeats in Instrumentarium, Fabricator, Loom, Clerk, and Spider. The `g.apparatuses()` call returns unstarted apparatuses, causing double-registration when `plugin:initialized` fires later.

### `collectStartupWarnings` in `packages/framework/arbor/src/guild-lifecycle.ts` (line 228)

Currently checks only standalone kit contribution types against apparatus `consumes` tokens. Does not check apparatus supportKit contributions.

### Stacks in `packages/plugins/stacks/src/stacks.ts` (line 39)

```typescript
start(_: StartupContext): void {
  const g = guild();
  // ...
  const allPlugins = [...g.kits(), ...g.apparatuses()];
  this.reconcileSchemas(allPlugins);
}
```

Relies on `g.apparatuses()` returning ALL apparatuses to create book tables for plugins that haven't started yet.

## Requirements

- R1: Arbor must collect all kit contributions (from both kit plugins and apparatus supportKits) into a flat `KitEntry[]` during a Wire phase, before any `start()`.
- R2: `StartupContext` must expose `kits(type: string): KitEntry[]` for querying contributions by type.
- R3: Wire must handle both `plugin.kit` (standalone kit plugins) and `plugin.apparatus.supportKit` (apparatus sidecars) uniformly.
- R4: `g.apparatuses()` must only return apparatuses that have completed `start()`.
- R5: Replace `plugin:initialized` with `apparatus:started`. Remove `plugin:initialized` outright — no deprecation period.
- R6: Add `phase:started` event, fired once after all apparatus `start()` calls and their `apparatus:started` events complete. No arguments.
- R7: Oculus must replace scan+subscribe with `ctx.kits('pages')`, `ctx.kits('routes')`, and `ctx.kits('tools')`.
- R8: Instrumentarium must replace scan+subscribe with `ctx.kits('tools')`.
- R9: Fabricator must replace scan+subscribe with `ctx.kits('engines')`.
- R10: Loom must replace scan+subscribe with `ctx.kits('roles')`.
- R11: Spider must replace scan+subscribe with `ctx.kits('engines')`, `ctx.kits('rigTemplates')`, and `ctx.kits('blockTypes')`.
- R12: Clerk must replace scan+subscribe with `ctx.kits('writTypes')`.
- R13: Stacks must replace `[...g.kits(), ...g.apparatuses()]` with `ctx.kits('books')` for schema reconciliation.
- R14: `collectStartupWarnings` must check both standalone kit and apparatus supportKit contribution types against `consumes`.
- R15: All existing tests pass.
- R16: New tests verify: (a) `ctx.kits()` returns contributions from both kit plugins and apparatus supportKits, (b) `g.apparatuses()` excludes unstarted apparatuses, (c) no contribution is delivered twice, (d) kit entries are available during `start()`.

## Design

### Type Changes

#### New: `KitEntry` in `packages/framework/core/src/plugin.ts`

```typescript
/**
 * A single kit contribution collected during the Wire phase.
 *
 * Each key/value pair from a kit or supportKit (excluding framework fields
 * `requires` and `recommends`) becomes one KitEntry. Available via
 * `ctx.kits(type)` during and after `start()`.
 */
export interface KitEntry {
  /** Plugin id of the kit or apparatus that contributed this entry. */
  readonly pluginId: string
  /** npm package name of the contributing plugin. */
  readonly packageName: string
  /** The contribution key: 'tools', 'pages', 'routes', 'engines', 'roles', 'books', etc. */
  readonly type: string
  /** The contributed value — type varies by contribution type. */
  readonly value: unknown
}
```

#### Modified: `StartupContext` in `packages/framework/core/src/plugin.ts`

```typescript
export interface StartupContext {
  /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void

  /**
   * Query kit contributions collected during the Wire phase.
   *
   * Returns all KitEntry records with the given contribution type.
   * Returns [] if no plugin contributes the requested type.
   * Each call returns a new array (snapshot copy).
   */
  kits(type: string): KitEntry[]
}
```

#### Modified: `Guild.kits()` doc comment in `packages/framework/core/src/guild.ts`

Change line 68 from:
```typescript
/** Snapshot of all loaded kits (including apparatus supportKits). */
```
to:
```typescript
/** Snapshot of all loaded standalone kit plugins. Does not include apparatus supportKits. */
```

#### New export in `packages/framework/core/src/index.ts`

Add `type KitEntry` to the export block from `'./plugin.ts'`.

### Behavior

#### Wire phase — `wireKitEntries()` in `packages/framework/arbor/src/guild-lifecycle.ts`

```typescript
import type { KitEntry, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';

/** Framework-level kit fields excluded from KitEntry collection. */
const FRAMEWORK_KIT_FIELDS = new Set(['requires', 'recommends']);

/**
 * Collect all kit contributions from standalone kits and apparatus supportKits
 * into a flat KitEntry array. Called during the Wire phase before any start().
 *
 * Iteration order: standalone kits first, then ordered apparatuses.
 * Framework fields (requires, recommends) are excluded.
 */
export function wireKitEntries(
  kits: LoadedKit[],
  orderedApparatuses: LoadedApparatus[],
): KitEntry[] {
  const entries: KitEntry[] = [];

  for (const kit of kits) {
    for (const [type, value] of Object.entries(kit.kit)) {
      if (FRAMEWORK_KIT_FIELDS.has(type)) continue;
      entries.push({ pluginId: kit.id, packageName: kit.packageName, type, value });
    }
  }

  for (const app of orderedApparatuses) {
    const bag = app.apparatus.supportKit;
    if (!bag || typeof bag !== 'object') continue;
    for (const [type, value] of Object.entries(bag)) {
      if (FRAMEWORK_KIT_FIELDS.has(type)) continue;
      entries.push({ pluginId: app.id, packageName: app.packageName, type, value });
    }
  }

  return entries;
}
```

#### Updated `buildStartupContext()` in `packages/framework/arbor/src/guild-lifecycle.ts`

```typescript
export function buildStartupContext(
  eventHandlers: EventHandlerMap,
  kitEntries: KitEntry[],
): StartupContext {
  // Pre-index by type for efficient lookup
  const index = new Map<string, KitEntry[]>();
  for (const entry of kitEntries) {
    const list = index.get(entry.type) ?? [];
    list.push(entry);
    index.set(entry.type, list);
  }

  return {
    on(event: string, handler: (...args: unknown[]) => void | Promise<void>) {
      const list = eventHandlers.get(event) ?? [];
      list.push(handler);
      eventHandlers.set(event, list);
    },

    kits(type: string): KitEntry[] {
      return [...(index.get(type) ?? [])];
    },
  };
}
```

#### Updated `collectStartupWarnings()` in `packages/framework/arbor/src/guild-lifecycle.ts`

Extend to also check apparatus supportKit contribution types against `consumes` tokens. After the existing standalone kit loop (lines 253–272), add a loop over apparatuses:

```typescript
// Check apparatus supportKit contribution types against consumes
for (const app of apparatuses) {
  if (!app.apparatus.supportKit) continue;
  for (const key of Object.keys(app.apparatus.supportKit)) {
    if (key === 'requires' || key === 'recommends') continue;
    if (!consumedTypes.has(key)) {
      warnings.push(
        `[arbor] warn: "${app.id}" supportKit contributes "${key}" but no installed apparatus declares consumes: ["${key}"]`,
      );
    }
  }
}
```

#### Updated `createGuild()` in `packages/framework/arbor/src/arbor.ts`

The new flow after the topo sort:

```typescript
const orderedApparatuses = topoSort(apparatuses);
const provides = new Map<string, unknown>();
const startedApparatuses: LoadedApparatus[] = [];

// ── Wire phase ──────────────────────────────────────────────────────
const kitEntries = wireKitEntries(kits, orderedApparatuses);

const guildInstance: Guild = {
  home: guildRoot,
  // ... apparatus(), config(), writeConfig(), guildConfig() unchanged ...
  kits()             { return [...kits]; },
  apparatuses()      { return [...startedApparatuses]; },  // CHANGED: only started
  failedPlugins()    { return [...allFailures]; },
  startupWarnings()  { return [...allWarnings]; },
};
setGuild(guildInstance);

// ── Start phase ─────────────────────────────────────────────────────
// No more plugin:initialized firing for kits — removed (dead code).

const startupCtx = buildStartupContext(eventHandlers, kitEntries);
for (const app of orderedApparatuses) {
  if (app.apparatus.provides !== undefined) {
    provides.set(app.id, app.apparatus.provides);
  }

  await app.apparatus.start(startupCtx);

  if (!provides.has(app.id) && app.apparatus.provides !== undefined) {
    provides.set(app.id, app.apparatus.provides);
  }

  // Add to started list BEFORE firing event (D11)
  startedApparatuses.push(app);

  // Fire apparatus:started (replaces plugin:initialized — no deprecation)
  await fireEvent(eventHandlers, 'apparatus:started', app);
}

// Fire phase:started after all apparatus start + events complete
await fireEvent(eventHandlers, 'phase:started');

return guildInstance;
```

Changes from current code:
1. Wire phase added: `wireKitEntries()` call before guild singleton is set
2. `apparatuses()` returns `[...startedApparatuses]` instead of `[...orderedApparatuses]`
3. `startedApparatuses.push(app)` after each `start()`, before event fire
4. Kit `plugin:initialized` loop removed entirely
5. `plugin:initialized` replaced with `apparatus:started` — no deprecation period
6. `phase:started` fired after the apparatus loop

Update `arbor.ts` imports: add `wireKitEntries` from `guild-lifecycle.ts` and `KitEntry` from core.

Update the file-level JSDoc to describe the new lifecycle: Load → Validate → Wire → Start.

#### Oculus consumer change (`packages/plugins/oculus/src/oculus.ts`)

Remove `scanKit()` and `scanApparatus()` helper functions. Remove the `plugin:initialized` subscription. Replace the entire scan block (~lines 426–636 start section) with:

```typescript
// ── Register pages from all kit contributions ───────────────────
for (const entry of ctx.kits('pages')) {
  for (const page of entry.value as PageContribution[]) {
    const resolvedDir = resolveDirForPackage(entry.packageName, page.dir);
    registerPage(page, resolvedDir);
  }
}

// ── Register custom routes from all kit contributions ───────────
for (const entry of ctx.kits('routes')) {
  for (const route of entry.value as RouteContribution[]) {
    registerCustomRoute(route, entry.pluginId);
  }
}

// ── Register tool routes from all kit contributions ─────────────
for (const entry of ctx.kits('tools')) {
  const rawTools = entry.value;
  if (!Array.isArray(rawTools)) continue;
  for (const t of rawTools) {
    if (isToolDefinition(t)) {
      registerToolRoute(t);
    }
  }
}
```

Tool route discovery uses `ctx.kits('tools')` instead of `instrumentarium.list()`. The route handlers still invoke tool execution through the Instrumentarium API (which is fully populated before Oculus starts, since Oculus `requires: ['tools']`).

Remove the `plugin:initialized` handler entirely (lines 621–636). No `apparatus:started` subscription needed.

Remove unused imports: `LoadedKit`, `LoadedApparatus` if no longer referenced elsewhere in the file. Keep `guild`, `VERSION`, `StartupContext`.

#### Instrumentarium consumer change (`packages/plugins/tools/src/instrumentarium.ts`)

In `start()`, replace the kit scan + `plugin:initialized` subscription (lines 332–358) with:

```typescript
start(ctx: StartupContext): void {
  const g = guild();
  registry.setHome(g.home);

  // Register all tool contributions (standalone kits + apparatus supportKits)
  for (const entry of ctx.kits('tools')) {
    const rawTools = entry.value;
    if (!Array.isArray(rawTools)) continue;
    for (const t of rawTools) {
      if (isToolDefinition(t)) {
        const definition = registry.preloadInstructions(t, entry.packageName);
        registry.registerTool(definition, entry.pluginId);
      }
    }
  }
},
```

Remove the explicit self-registration of `toolsList` and `toolsShow` (lines 339–341) — they are now collected from the Instrumentarium's own supportKit during Wire.

The `ToolRegistry.register(plugin: LoadedPlugin)` method and `registerToolsFromKit` private method can remain for now (they are internal) but are no longer called from `start()`. If there are no other callers, they can be removed.

Make `preloadInstructions` accessible: it is currently `private`. Either change it to a package-scoped method, or inline the preload logic within the `start()` loop. The simplest approach: change the visibility from `private` to a regular method (remove `private` keyword — TypeScript classes use convention, not enforcement at runtime).

Remove unused imports: `LoadedPlugin`, `LoadedKit`, `LoadedApparatus`, `isLoadedKit`, `isLoadedApparatus` — if no longer used elsewhere in the file.

#### Fabricator consumer change (`packages/plugins/fabricator/src/fabricator.ts`)

In `start()`, replace the kit scan + `plugin:initialized` subscription (lines 211–229) with:

```typescript
start(ctx: StartupContext): void {
  // Register all engine design contributions
  for (const entry of ctx.kits('engines')) {
    const rawEngines = entry.value;
    if (typeof rawEngines !== 'object' || rawEngines === null) continue;
    for (const value of Object.values(rawEngines as Record<string, unknown>)) {
      if (isEngineDesign(value)) {
        registry.designs.set(value.id, value);
        registry.provenance.set(value.id, entry.pluginId);
      }
    }
  }
},
```

Note: `EngineRegistry.designs` and `provenance` are private Maps. Either make them accessible, or add a public `registerDesign(id, design, pluginId)` method, or keep `registerFromKit` and adapt its signature to `(kitBag: Record<string, unknown>, pluginId: string)` and call it as `registry.registerFromKit(entry.value as Record<string, unknown>, entry.pluginId)`. The latter is cleanest — minimal change to the existing private API.

Remove `guild` import from start body (no longer needed — Fabricator doesn't call `g.kits()` or `g.apparatuses()`). Remove `plugin:initialized` subscription. Remove unused type imports.

#### Loom consumer change (`packages/plugins/loom/src/loom.ts`)

Change `registerKitRoles` signature to accept `KitEntry` plus `home`:

```typescript
function registerKitRoles(entry: KitEntry, home: string): void {
  const rawRoles = entry.value;
  if (typeof rawRoles !== 'object' || rawRoles === null || Array.isArray(rawRoles)) return;

  // Determine allowed plugins for dependency-scoped permission validation.
  // For standalone kits: use the kit's own requires/recommends.
  // For apparatus supportKits: use the parent apparatus's requires/recommends.
  const g = guild();
  const standaloneKit = g.kits().find(k => k.id === entry.pluginId);
  let parentRequires: string[] = [];
  let parentRecommends: string[] = [];

  if (standaloneKit) {
    parentRequires = standaloneKit.kit.requires ?? [];
    parentRecommends = standaloneKit.kit.recommends ?? [];
  } else {
    // Apparatus supportKit — look up apparatus deps
    const app = g.apparatuses().find(a => a.id === entry.pluginId);
    if (app) {
      parentRequires = app.apparatus.requires ?? [];
      parentRecommends = app.apparatus.recommends ?? [];
    }
    // If not found in either (apparatus not yet started), fall through
    // with empty requires/recommends — pluginId is still in allowedPlugins.
  }

  const allowedPlugins = new Set<string>([
    entry.pluginId,
    ...parentRequires,
    ...parentRecommends,
  ]);

  // ... rest of role registration logic unchanged, using entry.pluginId
  // for qualifiedName, entry.packageName for instructionsFile resolution ...
}
```

In `start()`, replace the three-phase scan (lines 411–435) with:

```typescript
// ── Kit role scanning ──────────────────────────────────────────
kitRoles = new Map();

for (const entry of ctx.kits('roles')) {
  registerKitRoles(entry, home);
}
```

Remove the `plugin:initialized` subscription. Remove unused imports (`LoadedPlugin`, `isLoadedApparatus`).

#### Spider consumer change (`packages/plugins/spider/src/spider.ts`)

**`RigTemplateRegistry.buildDesignSourceMap`** — change signature:

```typescript
buildDesignSourceMap(engineEntries: KitEntry[]): void {
  // Spider's built-in engines always map to 'spider'
  const builtinIds = [draftEngine.id, implementEngine.id, reviewEngine.id, reviseEngine.id, sealEngine.id];
  for (const id of builtinIds) {
    this.designSourceMap.set(id, 'spider');
  }

  for (const entry of engineEntries) {
    const raw = entry.value;
    if (typeof raw !== 'object' || raw === null) continue;
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (typeof value === 'object' && value !== null
          && typeof (value as Record<string, unknown>).id === 'string'
          && typeof (value as Record<string, unknown>).run === 'function') {
        this.designSourceMap.set(
          (value as Record<string, unknown>).id as string,
          entry.pluginId,
        );
      }
    }
  }
}
```

**`BlockTypeRegistry.register`** — change to accept `KitEntry`:

```typescript
registerFromEntry(entry: KitEntry): void {
  const raw = entry.value;
  if (typeof raw !== 'object' || raw === null) return;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (isBlockType(value)) {
      this.types.set(value.id, value);
      this.provenance.set(value.id, entry.pluginId);
    }
  }
}
```

**`RigTemplateRegistry.registerFromKit`** — adapt to accept `KitEntry`:

```typescript
registerFromEntry(entry: KitEntry): void {
  // entry.value is the rigTemplates contribution
  // ... adapt existing registerFromKit logic, using entry.pluginId ...
}
```

In `start()`, replace the multi-phase scan (lines 1288–1336) with:

```typescript
start(ctx: StartupContext): void {
  const g = guild();
  spiderConfig = g.guildConfig().spider ?? {};

  const stacks = g.apparatus<StacksApi>('stacks');
  clerk = g.apparatus<ClerkApi>('clerk');
  fabricator = g.apparatus<FabricatorApi>('fabricator');

  // 1. Build designId → pluginId map from all engine contributions
  rigTemplateRegistry.buildDesignSourceMap(ctx.kits('engines'));

  // 2. Validate and register config templates
  if (spiderConfig.rigTemplates) {
    validateTemplates(spiderConfig.rigTemplates, fabricator);
    rigTemplateRegistry.registerConfigTemplates(spiderConfig.rigTemplates);
  }

  // 3. Register config mappings
  if (spiderConfig.rigTemplateMappings) {
    rigTemplateRegistry.registerConfigMappings(spiderConfig.rigTemplateMappings);
  }

  // 4. Register all block types
  for (const entry of ctx.kits('blockTypes')) {
    blockTypeRegistry.registerFromEntry(entry);
  }

  // 5. Register all kit-contributed rig templates
  for (const entry of ctx.kits('rigTemplates')) {
    rigTemplateRegistry.registerFromEntry(entry);
  }

  // 6. Validate all mappings (single pass — no late arrivals)
  rigTemplateRegistry.validateDeferredMappings();

  // No plugin:initialized / apparatus:started subscription needed.

  rigsBook = stacks.book<RigDoc>('spider', 'rigs');
  // ... rest of start() unchanged ...
},
```

Remove `validateIncrementalMappings` calls — all templates are registered before validation. Remove unused imports.

#### Clerk consumer change (`packages/plugins/clerk/src/clerk.ts`)

Change `registerKitWritTypes` to accept `KitEntry`:

```typescript
function registerKitWritTypes(entry: KitEntry): void {
  const raw = entry.value;
  if (!Array.isArray(raw)) return;

  for (const item of raw) {
    if (typeof item !== 'object' || item === null
        || typeof (item as Record<string, unknown>).name !== 'string') {
      console.warn(
        `[clerk] Kit "${entry.pluginId}" writTypes: entry is missing required "name" field — skipped`
      );
      continue;
    }
    const name = (item as WritTypeEntry).name;
    if (configWritTypeNames.has(name)) continue;
    if (mergedWritTypes.has(name)) {
      console.warn(
        `[clerk] Kit "${entry.pluginId}" writTypes: type "${name}" already registered by another kit — skipped`
      );
      continue;
    }
    mergedWritTypes.add(name);
  }
}
```

In `start()`, replace the three-phase scan (lines 349–367) with:

```typescript
// Scan all kit-contributed writ types
for (const entry of ctx.kits('writTypes')) {
  registerKitWritTypes(entry);
}
```

Remove the `plugin:initialized` subscription. Remove unused imports.

#### Stacks consumer change (`packages/plugins/stacks/src/stacks.ts`)

Update `StacksApparatus.start()` to accept and use `StartupContext`:

```typescript
start(ctx: StartupContext): void {
  const g = guild();
  const config = g.guildConfig().stacks ?? {};
  const autoMigrate = config.autoMigrate ?? true;

  this.core.backend.open({ home: g.home });

  if (autoMigrate) {
    this.reconcileSchemas(ctx);
  }
}
```

Change `reconcileSchemas` to use `ctx.kits('books')`:

```typescript
private reconcileSchemas(ctx: StartupContext): void {
  for (const entry of ctx.kits('books')) {
    const books = entry.value;
    if (typeof books !== 'object' || books === null) continue;
    for (const [bookName, schema] of Object.entries(books as Record<string, BookSchema>)) {
      this.core.backend.ensureBook({ ownerId: entry.pluginId, book: bookName }, schema);
    }
  }
}
```

Remove the `extractBooks(plugin)` method — no longer needed. Remove unused imports (`LoadedPlugin`).

Update the outer closure in `createStacksApparatus`:

```typescript
start(ctx: StartupContext): void {
  impl.start(ctx);   // pass ctx through
  api = impl.createApi();
},
```

### Non-obvious Touchpoints

- **`packages/framework/arbor/src/index.ts`**: Only exports `createGuild` — no changes needed.
- **`packages/framework/core/src/index.ts`**: Must add `type KitEntry` to the export from `./plugin.ts`.
- **`packages/framework/arbor/src/guild-lifecycle.ts` imports**: Must import `KitEntry` from `@shardworks/nexus-core`.
- **`packages/plugins/tools/src/instrumentarium.ts` `preloadInstructions`**: Currently a `private` method on `ToolRegistry`. The new `start()` body calls it directly from outside the class context. Either make it non-private or extract it as a standalone function.
- **`packages/plugins/spider/src/spider.ts` `validateIncrementalMappings`**: Called in the current `plugin:initialized` handler. With no late arrivals, this method is dead code. Remove the method or leave it (implementer's choice — it's internal).
- **`docs/architecture/plugins.md`**: References `plugin:initialized` in multiple locations (lines 280, 328, 467, 477). Update to describe `apparatus:started` and `ctx.kits(type)` as the primary mechanisms.

## Validation Checklist

- V1 [R1, R3]: Run `wireKitEntries` unit tests — verify that given a mix of LoadedKit[] and LoadedApparatus[] with supportKits, the output KitEntry[] contains entries from both sources, with `requires`/`recommends` excluded.

- V2 [R2]: In a `guild-lifecycle.test.ts` test, call `buildStartupContext(handlers, entries)` and verify `ctx.kits('tools')` returns matching entries, `ctx.kits('unknown')` returns `[]`, and each call returns a new array (not the same reference).

- V3 [R4]: In `arbor.test.ts`, create a guild with two apparatuses (B requires A). During B's `start()`, call `g.apparatuses()` and verify it contains A but not B. After `createGuild()` returns, verify `g.apparatuses()` contains both.

- V4 [R5]: `grep -r 'plugin:initialized' packages/` returns zero matches in production source files (test files may reference it in comments or fixture names — that's fine). All event subscriptions use `apparatus:started`.

- V5 [R6]: In `arbor.test.ts`, create a guild with apparatuses. Subscribe to `phase:started` in one apparatus's `start()`. Verify the handler fires once, after all apparatus `start()` calls complete.

- V6 [R7]: In `packages/plugins/oculus/src/oculus.ts`, verify: no `scanKit` function, no `scanApparatus` function, no `plugin:initialized` subscription. `ctx.kits('pages')`, `ctx.kits('routes')`, and `ctx.kits('tools')` are iterated in `start()`. Run `oculus.test.ts` — all tests pass.

- V7 [R8]: In `packages/plugins/tools/src/instrumentarium.ts`, verify: no `g.kits()` loop, no `plugin:initialized` subscription, no self-registration of tools-list/tools-show. `ctx.kits('tools')` is iterated in `start()`. Run `instrumentarium.test.ts` — all tests pass.

- V8 [R9]: In `packages/plugins/fabricator/src/fabricator.ts`, verify: no `g.kits()` loop, no `plugin:initialized` subscription. `ctx.kits('engines')` is iterated in `start()`. Run `fabricator.test.ts` — all tests pass.

- V9 [R10]: In `packages/plugins/loom/src/loom.ts`, verify: no `g.kits()` loop for role scanning, no `g.apparatuses()` loop for role scanning, no `plugin:initialized` subscription. `ctx.kits('roles')` is iterated in `start()`. Run `loom.test.ts` — all tests pass.

- V10 [R11]: In `packages/plugins/spider/src/spider.ts`, verify: no `g.kits()` loops, no `g.apparatuses()` loops for scanning (config reading is fine), no `plugin:initialized` subscription. `ctx.kits('engines')`, `ctx.kits('rigTemplates')`, `ctx.kits('blockTypes')` are used. Run `spider.test.ts` — all tests pass.

- V11 [R12]: In `packages/plugins/clerk/src/clerk.ts`, verify: no `g.kits()` loop, no `g.apparatuses()` loop, no `plugin:initialized` subscription. `ctx.kits('writTypes')` is iterated. Run `clerk.test.ts` — all tests pass.

- V12 [R13]: In `packages/plugins/stacks/src/stacks.ts`, verify: `reconcileSchemas` uses `ctx.kits('books')`, not `[...g.kits(), ...g.apparatuses()]`. `extractBooks` method is removed. The outer `start(ctx)` passes `ctx` to the inner implementation.

- V13 [R14]: In `guild-lifecycle.test.ts`, verify `collectStartupWarnings` returns a warning when an apparatus supportKit contributes a type no apparatus consumes.

- V14 [R15]: Run full test suite: `node --test` across all packages. Zero failures.

- V15 [R16]: New tests in `guild-lifecycle.test.ts` and `arbor.test.ts` verify: (a) KitEntry from both standalone kit and apparatus supportKit in `ctx.kits()`, (b) `g.apparatuses()` is empty before any start and grows progressively, (c) a contribution from a supportKit appears exactly once (no double-registration), (d) `ctx.kits('tools')` is non-empty during apparatus `start()`.

## Test Cases

**Wire phase unit tests (`guild-lifecycle.test.ts`):**

1. `wireKitEntries` with empty inputs → returns `[]`.
2. `wireKitEntries` with one standalone kit contributing `{ tools: [...], requires: ['x'] }` → returns one entry with type `'tools'`; no entry for `requires`.
3. `wireKitEntries` with one apparatus with supportKit `{ engines: {...}, books: {...} }` → returns entries for `engines` and `books`; no entry for `requires`/`recommends`.
4. `wireKitEntries` with both standalone kits and apparatuses → entries from kits appear before entries from apparatuses.
5. `wireKitEntries` with apparatus that has no supportKit → no entries for that apparatus.
6. `wireKitEntries` with apparatus whose supportKit is undefined → no entries; no crash.
7. `buildStartupContext` with kit entries → `ctx.kits('tools')` returns matching entries.
8. `buildStartupContext` → `ctx.kits('nonexistent')` returns `[]`.
9. `buildStartupContext` → two calls to `ctx.kits('tools')` return different array references with equal content.
10. `collectStartupWarnings` with apparatus supportKit contributing unconsume type → warning emitted.
11. `collectStartupWarnings` with apparatus supportKit contributing consumed type → no warning for that type.

**Integration tests (`arbor.test.ts`):**

12. Create guild with a kit contributing `{ tools: [...] }` and an apparatus with supportKit `{ tools: [...] }`. During apparatus `start()`, call `ctx.kits('tools')` — verify both contributions are present (2 KitEntry records).
13. Create guild with two apparatuses (B requires A). During B's start, verify `g.apparatuses()` contains A but not B. After createGuild returns, both are present.
14. Create guild with apparatus that has supportKit pages. Verify the pages appear in `ctx.kits('pages')` during start and no duplicate registration occurs (contribution count = 1).
15. Create guild with apparatus subscribing to `apparatus:started`. Verify the handler fires for subsequently-started apparatuses but not for previously-started ones.
16. Create guild with apparatus subscribing to `phase:started`. Verify it fires exactly once after all apparatuses have started.
17. Create guild with apparatus that has supportKit with `books`. Verify `ctx.kits('books')` returns the books contribution during start.

**Consumer test updates:**

18. Each consumer test file (`instrumentarium.test.ts`, `fabricator.test.ts`, `loom.test.ts`, `clerk.test.ts`, `spider.test.ts`, `oculus.test.ts`): update `buildTestContext`/`buildCtx` helpers to accept `kitEntries` and provide `ctx.kits()`. Verify existing test scenarios still pass with `ctx.kits()` providing the data instead of mock `g.kits()`/`g.apparatuses()` + `plugin:initialized` events.