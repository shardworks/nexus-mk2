# Inventory: Fix Startup Lifecycle Phases and Unified Kit Wiring

Slug: `fix-startup-lifecycle-phases-and`

---

## Affected Code

### Files Likely Modified

**Framework — core types and lifecycle:**
- `packages/framework/core/src/plugin.ts` — Add `KitEntry` interface; update `StartupContext` to add `kits(type)` method
- `packages/framework/core/src/index.ts` — Export `KitEntry` type
- `packages/framework/core/src/guild.ts` — Fix `apparatuses()` doc comment (already says "started" but the implementation doesn't enforce it; the comment is currently aspirational)
- `packages/framework/arbor/src/arbor.ts` — Add Wire phase, fix `g.apparatuses()` to return only started apparatuses, fire `apparatus:started` + deprecated `plugin:initialized`, fire `phase:started`
- `packages/framework/arbor/src/guild-lifecycle.ts` — Add `wireKitEntries()`, update `buildStartupContext()` to accept kit entries and expose `ctx.kits()`, rename event logic

**Consumer apparatuses:**
- `packages/plugins/oculus/src/oculus.ts` — Replace scan+subscribe with `ctx.kits('pages')` + `ctx.kits('routes')`
- `packages/plugins/tools/src/instrumentarium.ts` — Replace scan+subscribe with `ctx.kits('tools')`
- `packages/plugins/fabricator/src/fabricator.ts` — Replace scan+subscribe with `ctx.kits('engines')`
- `packages/plugins/loom/src/loom.ts` — Replace scan+subscribe with `ctx.kits('roles')`
- `packages/plugins/spider/src/spider.ts` — Replace scan+subscribe with `ctx.kits('engines')`, `ctx.kits('rigTemplates')`, `ctx.kits('blockTypes')`; update `buildDesignSourceMap` to use kit entries
- `packages/plugins/clerk/src/clerk.ts` — Replace scan+subscribe with `ctx.kits('writTypes')`

**Test files:**
- `packages/framework/arbor/src/arbor.test.ts` — New tests for Wire phase, `ctx.kits()`, event renaming, `g.apparatuses()` returns only started
- `packages/framework/arbor/src/guild-lifecycle.test.ts` — New tests for `wireKitEntries`, updated `buildStartupContext` tests
- `packages/plugins/oculus/src/oculus.test.ts` — Update mock StartupContext to include `kits()`; remove plugin:initialized handler tests
- `packages/plugins/tools/src/instrumentarium.test.ts` — Update mock StartupContext; replace plugin:initialized tests with ctx.kits tests
- `packages/plugins/fabricator/src/fabricator.test.ts` — Same
- `packages/plugins/loom/src/loom.test.ts` — Same
- `packages/plugins/spider/src/spider.test.ts` — Same
- `packages/plugins/clerk/src/clerk.test.ts` — Same

**Adjacent apparatus with a dependency on `g.apparatuses()` — must also change:**
- `packages/plugins/stacks/src/stacks.ts` — Currently calls `[...g.kits(), ...g.apparatuses()]` in `start()` to get all plugins for book schema reconciliation. Fixing R4 (g.apparatuses() returns only started) will break Stacks unless it is updated.

---

## Current Types and Interfaces

### `StartupContext` (packages/framework/core/src/plugin.ts, line 52)

```typescript
export interface StartupContext {
  /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
}
```

After change: gains `kits(type: string): KitEntry[]` method.

### `Kit` (packages/framework/core/src/plugin.ts, line 72)

```typescript
export type Kit = {
  requires?:   string[]
  recommends?: string[]
  [key: string]: unknown
}
```

Unchanged, but the Wire phase will iterate its open record fields.

### `Apparatus` (packages/framework/core/src/plugin.ts, line 104)

```typescript
export type Apparatus = {
  requires?:    string[]
  recommends?:  string[]
  provides?:    unknown
  start:        (ctx: StartupContext) => void | Promise<void>
  stop?:        () => void | Promise<void>
  supportKit?:  Kit
  consumes?:    string[]
}
```

`start` will receive an enriched `StartupContext` that includes `kits()`.

### `LoadedKit` / `LoadedApparatus` (packages/framework/core/src/plugin.ts)

```typescript
export interface LoadedKit {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly kit:         Kit
}

export interface LoadedApparatus {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly apparatus:   Apparatus
}
```

Unchanged. Both are inputs to the Wire phase.

### `Guild` interface (packages/framework/core/src/guild.ts, line 26)

```typescript
export interface Guild {
  readonly home: string
  apparatus<T>(name: string): T
  config<T = Record<string, unknown>>(pluginId: string): T
  writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void
  guildConfig(): GuildConfig
  kits(): LoadedKit[]             // returns standalone kit plugins only (NOT supportKits) — doc says "including apparatus supportKits" which is wrong
  apparatuses(): LoadedApparatus[] // doc says "all started apparatuses" but code returns ALL ordered apparatuses (bug)
  failedPlugins(): FailedPlugin[]
  startupWarnings(): string[]
}
```

`g.kits()` continues to return only standalone kits (unchanged, by design — see scope notes).
`g.apparatuses()` needs to be fixed to return only started ones (R4).

### `KitEntry` (to be created in packages/framework/core/src/plugin.ts)

```typescript
interface KitEntry {
  pluginId: string;
  packageName: string;
  /** The contribution key: 'tools', 'pages', 'routes', 'engines', 'roles', etc. */
  type: string;
  /** The contributed value — an array of tool defs, page defs, etc. */
  value: unknown;
}
```

### `EventHandlerMap` (packages/framework/arbor/src/guild-lifecycle.ts, line 21)

```typescript
export type EventHandlerMap = Map<
  string,
  Array<(...args: unknown[]) => void | Promise<void>>
>;
```

Unchanged. Used by `buildStartupContext` and `fireEvent`.

---

## Functions That Will Change

### `arbor.ts` — `createGuild()`

Current signature: `export async function createGuild(root?: string): Promise<Guild>`

Current logic phases:
1. Load — imports all plugins, discriminates kit vs apparatus
2. Validation — validateRequires, filterFailedPlugins, collectStartupWarnings
3. Start — sets guild singleton, fires plugin:initialized for kits, then starts each apparatus and fires plugin:initialized after each

After change, new phase sequence:
1. Load — unchanged
2. Validation — unchanged
3. **Wire** — collect KitEntry[] from all kits + apparatus.supportKits (new)
4. Start — unchanged structure but: `g.apparatuses()` returns only started ones (progressive), fires `apparatus:started` + deprecated `plugin:initialized` per apparatus, fires `phase:started` after all start

The `provides.set` tracking already exists. Need a parallel `startedApparatuses: LoadedApparatus[]` array that the guild's `apparatuses()` returns instead of `orderedApparatuses`.

### `guild-lifecycle.ts` — `buildStartupContext()`

Current signature: `export function buildStartupContext(eventHandlers: EventHandlerMap): StartupContext`

After change needs to accept kit entries and return enriched context:
`export function buildStartupContext(eventHandlers: EventHandlerMap, kitEntries: KitEntry[]): StartupContext`

Returns context with both `on()` and `kits(type)` methods.

### `guild-lifecycle.ts` — new `wireKitEntries()`

New function (pure logic, no I/O):
```typescript
export function wireKitEntries(
  kits: LoadedKit[],
  orderedApparatuses: LoadedApparatus[],
  skipTypes?: Set<string>,
): KitEntry[]
```

Iterates `[...kits, ...orderedApparatuses]`, extracts contributions, skips framework fields (`requires`, `recommends`) and optionally `books`.

### `oculus.ts` — `createOculus()` start()

Current pattern:
```typescript
// Scan already-loaded kits and apparatuses
for (const kit of g.kits()) { scanKit(kit); }
for (const apparatus of g.apparatuses()) { scanApparatus(apparatus); }
// Subscribe for late-arrivals
ctx.on('plugin:initialized', (plugin: unknown) => { scan... });
```

After: remove `scanKit`/`scanApparatus`/`plugin:initialized` subscription. Replace with:
```typescript
for (const entry of ctx.kits('pages')) { ... }
for (const entry of ctx.kits('routes')) { ... }
```

### `instrumentarium.ts` — `createInstrumentarium()` start()

Current pattern:
```typescript
for (const kit of g.kits()) { registry.register(kit); }
ctx.on('plugin:initialized', (plugin: unknown) => {
  if (isLoadedApparatus(loaded)) { registry.register(loaded); }
});
```

After:
```typescript
for (const entry of ctx.kits('tools')) {
  // register tools from entry
}
```

### `fabricator.ts` — `createFabricator()` start()

Current pattern: same structure as Instrumentarium for `engines` type. After: `ctx.kits('engines')`.

### `loom.ts` — `createLoom()` start()

Current pattern: `g.kits()` + `g.apparatuses()` + `plugin:initialized` for `roles`. After: `ctx.kits('roles')`.

### `clerk.ts` — `createClerk()` start()

Current pattern: `g.kits()` + `g.apparatuses()` + `plugin:initialized` for `writTypes`. After: `ctx.kits('writTypes')`.

### `spider.ts` — `createSpider()` start()

Current pattern: multi-step scan for `engines` (via `buildDesignSourceMap` + direct scan) + `rigTemplates` + `blockTypes` + `plugin:initialized`. After: `ctx.kits('engines')`, `ctx.kits('rigTemplates')`, `ctx.kits('blockTypes')`.

The `buildDesignSourceMap(kits, apparatuses)` method on `RigTemplateRegistry` is called with `g.kits()` and `g.apparatuses()` to build a designId→pluginId map. With the change, this method can be updated to accept `KitEntry[]` instead.

---

## Test Patterns

All apparatus test files share the same pattern for `StartupContext`:

```typescript
function buildTestContext(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, ...>();
  const ctx: StartupContext = {
    on(event, handler) { ... },
  };
  async function fire(event: string, ...args: unknown[]) { ... }
  return { ctx, fire };
}
```

After the change, `buildTestContext()` in each test file needs to:
1. Accept a `kitEntries?: KitEntry[]` parameter
2. Add `kits(type: string): KitEntry[]` method to the ctx object

The `wireGuild()` / `mockGuild` helpers in each test file mock `g.apparatuses()` and `g.kits()`. Those mocks continue to work for the guild singleton (needed for config, home, apparatus() calls). The `ctx.kits()` mocking is separate.

Tests currently checking `plugin:initialized` subscription behavior will need to be either:
- Removed (scan+subscribe is gone)
- Updated to verify `ctx.kits()` is called correctly

The `arbor.test.ts` `installFakeApparatus` helper has no `supportKit` option. A new helper or option will be needed to test Wire phase behavior.

---

## Adjacent Patterns

### Stacks — books schema reconciliation (IMPORTANT DEPENDENCY)

`packages/plugins/stacks/src/stacks.ts` line 47:
```typescript
start(_: StartupContext): void {
  const g = guild();
  // ...
  if (autoMigrate) {
    const allPlugins = [...g.kits(), ...g.apparatuses()];
    this.reconcileSchemas(allPlugins);
  }
}
```

Stacks calls `g.apparatuses()` during its own start to discover `books` contributions from ALL plugins (including unstarted apparatuses). Stacks has `requires: []` so it starts first. At that time, all future apparatuses (Clerk, Spider, etc.) are in `g.apparatuses()` (because `g.apparatuses()` currently returns ALL ordered apparatuses). This is INTENTIONAL for Stacks — it needs to create database tables for apparatuses that haven't started yet.

**Fixing R4 (g.apparatuses() returns only started) breaks Stacks unless Stacks is also updated.**

The brief's scope note says "Books excluded from KitEntry collection — Stacks handles book registration through its own mechanism." This implies Stacks will NOT use `ctx.kits('books')`. This is a gap: if books are excluded from KitEntry and `g.apparatuses()` is fixed, there is no mechanism for Stacks to discover book contributions from unstarted apparatuses via the new API.

Possible resolutions:
- Include `books` in KitEntry despite scope note, let Stacks use `ctx.kits('books')` (simplest)
- Provide a private/internal "all apparatus list" passed to Stacks separately
- Skip the `g.apparatuses()` fix for Stacks by giving Stacks access to `orderedApparatuses` directly

This tension must be resolved in the spec. It is not addressed explicitly in the brief.

### `plugin:initialized` references in docs

`docs/architecture/plugins.md` explicitly documents `plugin:initialized` in multiple places:
- Line 280: `ctx.on("plugin:initialized", (p) => registerRelays(p))`
- Line 328: `ctx.on('plugin:initialized', handler)` in StartupContext section
- Line 467: `ctx.on("plugin:initialized", ...)` in Lifecycle Hooks section

These docs will need to be updated to reference `apparatus:started` with a deprecation note for `plugin:initialized`.

### `collectStartupWarnings` gap (no behavior change needed, but notable)

`guild-lifecycle.ts` `collectStartupWarnings()` (line 228) checks kit contribution types against apparatus `consumes` tokens — but only for STANDALONE kits, not for apparatus supportKits. For example, if a supportKit contributes `engines` but no apparatus declares `consumes: ['engines']`, no warning is emitted.

This is a pre-existing omission and not in scope for this brief, but the Wire phase will make the data available to fix it in a future pass.

---

## How Each Apparatus Currently Scans

### Oculus (`oculus.ts`, start() lines 426–636)

Pattern: **BROKEN** — double-registration bug exists

```
g.kits()           → scanKit(kit)           [standalone kits only]
g.apparatuses()    → scanApparatus(app)      [ALL ordered, not just started!]
ctx.on('plugin:initialized', ...) → scan(plugin)  [fires AFTER each apparatus starts]
```

Result: any apparatus that starts AFTER Oculus (Loom, Clerk, Spider) gets scanned twice — once by the `g.apparatuses()` loop (before they've started) and once by `plugin:initialized` (after they start). This produces duplicate `pages` registrations → duplicate nav bar entries.

Oculus consumes: `pages`, `routes`
Oculus requires: `['tools']`

### Instrumentarium (`instrumentarium.ts`, start() lines 332–360)

Pattern: **CORRECT** (no double-registration, but could be simplified)

```
g.kits()       → registry.register(kit)  [standalone kits only]
ctx.on('plugin:initialized', ...) → register(apparatus) if isLoadedApparatus  [skips kits]
```

Kits have `plugin:initialized` fired BEFORE any apparatus starts (per arbor.ts loop), so kits are caught by `g.kits()` scan. Apparatus supportKits are caught by `plugin:initialized`. No double-registration because it skips kits in the event handler.

Subtle latent bug: apparatus supportKits that started BEFORE Instrumentarium are not caught (plugin:initialized for them fired before Instrumentarium registered). In practice, no apparatus starts before Instrumentarium with `tools` contributions in its supportKit.

Instrumentarium consumes: `['tools']`
Instrumentarium requires: `[]`

### Fabricator (`fabricator.ts`, start() lines 211–229)

Pattern: Same as Instrumentarium — **CORRECT** (same latent bug, same practical safety)

```
g.kits()       → registry.register(kit)
ctx.on('plugin:initialized', ...) → register(apparatus) if isLoadedApparatus
```

Fabricator consumes: `['engines']`
Fabricator requires: `[]`

### Loom (`loom.ts`, start() lines 411–435)

Pattern: **POTENTIALLY BUGGY** (same `g.apparatuses()` issue as Oculus, but not manifesting because no apparatus after Loom contributes `roles`)

```
g.kits()       → registerKitRoles(kit)
g.apparatuses() → registerKitRoles(app.supportKit)  [ALL ordered, not just started!]
ctx.on('plugin:initialized', ...) → registerKitRoles if isLoadedApparatus
```

Loom requires: `['tools']`. Apparatus that start after Loom (Clerk, Spider, Oculus) would be double-registered if they contributed `roles`. None currently do.

Comment in code: "apparatus that started before it (e.g. Instrumentarium) have already fired plugin:initialized" — this is true, BUT `g.apparatuses()` still returns ALL apparatuses including unstarted ones. The comment is misleading: the scan catches unstarted apparatuses too.

Loom consumes: `['roles']`
Loom requires: `['tools']`

### Clerk (`clerk.ts`, start() lines 349–367)

Pattern: Same `g.apparatuses()` issue as Loom — **LATENT BUG**, not manifesting

```
g.kits()       → registerKitWritTypes(kit)
g.apparatuses() → registerKitWritTypes(app.supportKit)  [ALL ordered!]
ctx.on('plugin:initialized', ...) → registerKitWritTypes if isLoadedApparatus
```

Clerk requires: `['stacks']`. Apparatus after Clerk (Spider, Oculus) would be double-registered if they contributed `writTypes`. None do.

Clerk consumes: `['writTypes']`
Clerk requires: `['stacks']`

### Spider (`spider.ts`, start() lines 1288–1336)

Pattern: Most complex — **POTENTIALLY BUGGY**, multiple scan paths

```
// Design source map (for rigTemplate engine validation):
rigTemplateRegistry.buildDesignSourceMap(g.kits(), g.apparatuses())  // uses ALL apparatuses!

// Phase 1a: Standalone kits
for (const kit of g.kits()) {
  blockTypeRegistry.register(kit);          // blockTypes
  rigTemplateRegistry.registerFromKit(...)  // rigTemplates
}

// Phase 1b: Apparatus supportKits
for (const app of g.apparatuses()) {        // ALL ordered!
  rigTemplateRegistry.registerFromKit(...)  // rigTemplates
}
// NOTE: blockTypes NOT scanned in Phase 1b loop! (only in Phase 1a for standalone kits)

// Phase 2: Late-arriving apparatus
ctx.on('plugin:initialized', ...) → blockTypeRegistry.register + rigTemplateRegistry.registerFromKit
```

Bug: `blockTypeRegistry.register` in Phase 1b is missing — only called in Phase 1a (standalone kits) and Phase 2 (`plugin:initialized`). Apparatus supportKit `blockTypes` that start BEFORE Spider (none currently) would be missed. This is a latent gap.

Spider requires: `['stacks', 'clerk', 'fabricator']`. Since Spider is near the end of the dependency chain, few (if any) apparatuses start after it that could cause double-registration.

Spider consumes: `['blockTypes', 'rigTemplates', 'rigTemplateMappings']`
Spider requires: `['stacks', 'clerk', 'fabricator']`

---

## Doc/Code Discrepancies

1. **`Guild.kits()` doc comment**: Says "Snapshot of all loaded kits (including apparatus supportKits)" (`guild.ts` line 68). **Actual code** in `arbor.ts` returns `[...kits]` where `kits` is ONLY the `LoadedKit[]` from standalone kit plugins — apparatus supportKits are NOT included. The doc is aspirationally correct (the intent was to include them) but the implementation does not.

2. **`Guild.apparatuses()` doc comment**: Says "Snapshot of all started apparatuses" (`guild.ts` line 72). **Actual code** returns `[...orderedApparatuses]` which is populated BEFORE any apparatus starts and contains ALL ordered apparatuses regardless of start status. The doc is aspirationally correct but the implementation doesn't enforce it.

3. **docs/architecture/plugins.md** example at line 280: shows `for (const p of [...guild().kits(), ...guild().apparatuses()])` as the Clockworks pattern for kit scanning. This pattern has the `g.apparatuses()` bug but is presented as the recommended approach. Will need to be updated.

4. **`plugin:initialized` event for kits**: Per arbor.ts code, `plugin:initialized` fires for each kit plugin BEFORE any apparatus starts. But consuming apparatus (Instrumentarium, Fabricator) scan kits via `g.kits()` and skip kits in the `plugin:initialized` handler. The event fires for kits but consumers ignore it. After the rename, `apparatus:started` will only fire for apparatuses (name makes purpose clearer).

5. **Spider `blockTypes` Phase 1b gap**: Spider scans `g.apparatuses()` in Phase 1b for `rigTemplates` but NOT for `blockTypes`. blockTypes are only collected from standalone kits (Phase 1a) and `plugin:initialized` (Phase 2). This means apparatus supportKit `blockTypes` that start BEFORE Spider in the dependency chain are missed. Not a visible bug today but is an inconsistency in the spider's own scan logic.

---

## Existing Context

No `_planning/` files pre-exist beyond the brief itself. No commission log entries or scratch notes found for this area.

The docs/architecture/plugins.md "Future Enhancements" section (line 548) mentions "Dynamic Kit Discovery in Handlers" (`guild().fromKit(type, name?)`) as deferred. The `ctx.kits(type)` method being added is a startup-time version of this pattern (not a runtime handler-invocation query) and is separate from the deferred future enhancement.

---

## File Index (all files read)

| File | Role | Change Status |
|------|------|---------------|
| `packages/framework/core/src/plugin.ts` | Types: Kit, Apparatus, StartupContext, LoadedKit, LoadedApparatus | MODIFY — add KitEntry, update StartupContext |
| `packages/framework/core/src/guild.ts` | Guild interface + singleton | MODIFY — fix apparatuses() implementation |
| `packages/framework/core/src/index.ts` | Core exports barrel | MODIFY — export KitEntry |
| `packages/framework/arbor/src/arbor.ts` | Guild runtime: createGuild() | MODIFY — Wire phase, event renaming, g.apparatuses() fix |
| `packages/framework/arbor/src/guild-lifecycle.ts` | Pure lifecycle logic | MODIFY — wireKitEntries(), buildStartupContext() update |
| `packages/framework/arbor/src/arbor.test.ts` | Integration tests for createGuild | MODIFY — add Wire tests |
| `packages/framework/arbor/src/guild-lifecycle.test.ts` | Unit tests for lifecycle logic | MODIFY — add wireKitEntries tests |
| `packages/plugins/oculus/src/oculus.ts` | Oculus apparatus | MODIFY — replace scan+subscribe (R7) |
| `packages/plugins/oculus/src/oculus.test.ts` | Oculus tests | MODIFY — update ctx mock, fix tests |
| `packages/plugins/oculus/src/types.ts` | PageContribution, RouteContribution, OculusKit | NO CHANGE |
| `packages/plugins/tools/src/instrumentarium.ts` | Instrumentarium apparatus | MODIFY — replace scan+subscribe (R8) |
| `packages/plugins/tools/src/instrumentarium.test.ts` | Instrumentarium tests | MODIFY — update ctx mock |
| `packages/plugins/tools/src/index.ts` | Tools barrel export | NO CHANGE |
| `packages/plugins/fabricator/src/fabricator.ts` | Fabricator apparatus | MODIFY — replace scan+subscribe (R9) |
| `packages/plugins/fabricator/src/fabricator.test.ts` | Fabricator tests | MODIFY — update ctx mock |
| `packages/plugins/loom/src/loom.ts` | Loom apparatus | MODIFY — replace scan+subscribe (R10) |
| `packages/plugins/loom/src/loom.test.ts` | Loom tests | MODIFY — update ctx mock |
| `packages/plugins/spider/src/spider.ts` | Spider apparatus | MODIFY — replace scan+subscribe (R11), update buildDesignSourceMap |
| `packages/plugins/spider/src/spider.test.ts` | Spider tests | MODIFY — update ctx mock |
| `packages/plugins/clerk/src/clerk.ts` | Clerk apparatus | MODIFY — replace scan+subscribe (R12) |
| `packages/plugins/clerk/src/clerk.test.ts` | Clerk tests | MODIFY — update ctx mock |
| `packages/plugins/stacks/src/stacks.ts` | Stacks apparatus | LIKELY MODIFY — depends on how books exclusion is handled |
| `docs/architecture/plugins.md` | Plugin system architecture | MODIFY — update plugin:initialized references, new lifecycle description |
| `docs/reference/event-catalog.md` | Event catalog | NO CHANGE (covers Clockworks events, not arbor startup events) |
