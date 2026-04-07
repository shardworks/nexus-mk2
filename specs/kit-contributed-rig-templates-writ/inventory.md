# Inventory: kit-contributed-rig-templates-writ

## Affected Code

### Files to Modify

| File | Why |
|------|-----|
| `packages/plugins/spider/src/spider.ts` | Core change: new kit registries (rigTemplates, rigTemplateMappings), `lookupTemplate()` rewrite, `validateTemplates()` extension, new scanning in `start()`, updated `consumes` declaration |
| `packages/plugins/spider/src/types.ts` | Add `SpiderKit` interface (optional type for kit authors), extend `SpiderConfig` to add separate `rigTemplateMappings` field (or clarify split), no breaking change needed if kit types are new additions |
| `packages/plugins/spider/src/index.ts` | Re-export any new public types (`SpiderKit`, updated config types) |
| `packages/plugins/clerk/src/clerk.ts` | Add `WritTypeRegistry` class or inline scan logic, update `resolveWritTypes()` to merge kit contributions, add `consumes: ['writTypes']` declaration, scan kits at startup + subscribe to `plugin:initialized` |
| `packages/plugins/clerk/src/types.ts` | No change needed for existing types; potentially export `ClerkKit` interface |
| `packages/plugins/clerk/src/index.ts` | Re-export any new public types |
| `packages/plugins/spider/src/spider.test.ts` | New test suites for kit-contributed templates, mappings, override semantics, validation with kit context |
| `packages/plugins/clerk/src/clerk.test.ts` | New test suites for kit-contributed writ types, override semantics |

### Files to Create

| File | Why |
|------|-----|
| _(none expected)_ | New functionality is added to existing files following existing patterns |

---

## Types and Interfaces Involved

### Existing: `SpiderConfig` (`packages/plugins/spider/src/types.ts:264`)

```typescript
export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  /**
   * Writ type → rig template mappings.
   * 'default' key is the fallback for unmatched writ types.
   * Spawning fails if no matching template is found.
   */
  rigTemplates?: Record<string, RigTemplate>;
  variables?: Record<string, unknown>;
}
```

**Problem**: `rigTemplates` currently serves double duty — keys are BOTH template names AND the writ-type-to-template mapping. Under the brief, these need to separate:
- Template registry: templates keyed by name
- Mapping registry: writ type → template name

The brief says `rigTemplateMappings` is a separate kit field (`Record<string, string>`), implying there needs to be a corresponding `spider.rigTemplateMappings` in guild config. However, the guild config `spider.rigTemplates` stays as-is (keys = writ type or 'default') for backward compatibility. Kit contributions introduce NAMED templates (qualified) plus explicit mappings.

### Existing: `RigTemplate` (`packages/plugins/spider/src/types.ts:141`)

```typescript
export interface RigTemplate {
  engines: RigTemplateEngine[];
  resolutionEngine?: string;
}
```

No change needed.

### Existing: `RigTemplateEngine` (`packages/plugins/spider/src/types.ts:119`)

```typescript
export interface RigTemplateEngine {
  id: string;
  designId: string;
  upstream?: string[];
  givens?: Record<string, unknown>;
}
```

No change needed.

### Existing: `WritTypeEntry` (`packages/plugins/clerk/src/types.ts:94`)

```typescript
export interface WritTypeEntry {
  name: string;
  description?: string;
}
```

No change needed — kit contributions use same shape.

### Existing: `ClerkConfig` (`packages/plugins/clerk/src/types.ts:104`)

```typescript
export interface ClerkConfig {
  writTypes?: WritTypeEntry[];
  defaultType?: string;
}
```

No change needed.

### New types to add

**In `spider/src/types.ts`** (or `spider/src/index.ts` barrel):
```typescript
// Kit contribution interface for the Spider
// (mirrors pattern from LoomKit in loom/src/loom.ts)
export interface SpiderKit {
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
}
```

**In `clerk/src/types.ts`** (or `clerk/src/index.ts` barrel):
```typescript
// Kit contribution interface for the Clerk
export interface ClerkKit {
  writTypes?: WritTypeEntry[];
}
```

---

## Functions That Will Change

### `lookupTemplate()` — `packages/plugins/spider/src/spider.ts:154`

**Current signature:**
```typescript
function lookupTemplate(writType: string, config: SpiderConfig): RigTemplate
```

**Current implementation:**
```typescript
function lookupTemplate(writType: string, config: SpiderConfig): RigTemplate {
  const templates = config.rigTemplates;
  if (templates) {
    if (writType in templates) return templates[writType];
    if ('default' in templates) return templates['default'];
  }
  throw new Error(
    `[spider] No rig template found for writ type "${writType}" and no "default" template configured.`
  );
}
```

**Will change to:** Accept merged registries (template registry + mapping registry) instead of just `config`. Lookup chain:
1. Check merged mapping for `writType` → get template name
2. Look up template name in merged template registry
3. Fallback to 'default' template (either as a mapping or as a direct template key)
4. Throw with same error format

The function will need access to the merged state (accumulated at startup), not just config.

### `validateTemplates()` — `packages/plugins/spider/src/spider.ts:218`

**Current signature:**
```typescript
function validateTemplates(
  rigTemplates: Record<string, RigTemplate>,
  fabricator: FabricatorApi,
): void
```

**Current checks:**
- Non-empty engines list
- Duplicate engine IDs
- Unknown designId (checked against fabricator + builtins)
- Unknown upstream references
- Cycle detection (DFS)
- Unknown resolutionEngine
- Unrecognized `$`-prefixed variable refs

**Will change to:** Two validation modes:
1. Config templates: current behavior (any designId from fabricator or builtins)
2. Kit templates: same checks PLUS dependency-scoped designId validation — kit's rig template may only reference designIds from:
   - The kit's own `requires` plugins' contributed engines
   - The kit's `recommends` plugins' contributed engines
   - Spider's built-in engines (draft, implement, review, revise, seal)

Error messages for kit contributions need to include kit identity: `[spider] Kit "${kitId}" rigTemplates.${templateName}: ...`

### `resolveWritTypes()` — `packages/plugins/clerk/src/clerk.ts:70`

**Current signature:**
```typescript
function resolveWritTypes(): Set<string>
```

**Current implementation:**
```typescript
function resolveWritTypes(): Set<string> {
  const config = resolveClerkConfig();
  const declared = (config.writTypes ?? []).map((entry) => entry.name);
  return new Set([...BUILTIN_TYPES, ...declared]);
}
```

**Will change to:** Merge config-declared types with kit-contributed types (from a `WritTypeRegistry`). Config-declared types win on conflict (silently skip kit contribution with same name).

### `start()` in `createSpider()` — `packages/plugins/spider/src/spider.ts:903`

**Will change:**
1. Add scanning of kit `rigTemplates` contributions (qualified with `pluginId.templateName`)
2. Add scanning of kit `rigTemplateMappings` contributions
3. Apply config-override semantics at registration time
4. Run validation on merged registries
5. Update `consumes` declaration to include `'rigTemplates'` and `'rigTemplateMappings'` (or combined)
6. Pattern: scan `g.kits()`, then subscribe to `plugin:initialized` for apparatus supportKits

### `start()` in `createClerk()` — `packages/plugins/clerk/src/clerk.ts:257`

**Will change:**
1. Add scanning of kit `writTypes` contributions
2. Apply config-override semantics (config names win over kit contributions with same name)
3. Update `consumes` declaration to include `'writTypes'`
4. Pattern: scan `g.kits()`, then subscribe to `plugin:initialized` for apparatus supportKits

---

## Existing Apparatus Declarations (Relevant)

### Spider apparatus declaration (current)

```typescript
return {
  apparatus: {
    requires: ['stacks', 'clerk', 'fabricator'],
    consumes: ['blockTypes'],
    // ...
  },
};
```

**Will change to add:** `consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings']` (or fold mappings into same token).

### Clerk apparatus declaration (current)

```typescript
return {
  apparatus: {
    requires: ['stacks'],
    supportKit: { ... },
    provides: api,
    start(_ctx: StartupContext): void { ... },
  },
};
```

**Will change to add:** `consumes: ['writTypes']` in the apparatus declaration.

---

## Adjacent Patterns: The Loom's `roles` Contribution (Reference Implementation)

The brief explicitly calls out the Loom's `roles` pattern as the model. Key implementation details from `packages/plugins/loom/src/loom.ts`:

**Registration function signature:**
```typescript
function registerKitRoles(
  pluginId: string,
  packageName: string,
  kit: Record<string, unknown>,
  home: string,
): void
```

**Qualified name:**
```typescript
const qualifiedName = `${pluginId}.${roleName}`;
```

**Guild override check (skip if config defines the qualified name):**
```typescript
if (config.roles && config.roles[qualifiedName]) continue;
```

**Dependency-scoped validation (permissions only reference declared plugins):**
```typescript
const allowedPlugins = new Set<string>([
  pluginId,
  ...((kit.requires as string[] | undefined) ?? []),
  ...((kit.recommends as string[] | undefined) ?? []),
]);
// then per-permission check:
if (permPluginId === '*' || !allowedPlugins.has(permPluginId)) {
  console.warn(`[loom] Kit "${pluginId}" role "${roleName}" permission "${perm}" references undeclared plugin "${permPluginId}" — dropped`);
  continue;
}
```

**Startup scan pattern (from Loom's start()):**
```typescript
// Phase 1a: Scan all already-loaded standalone kits.
for (const kit of g.kits()) {
  registerKitRoles(kit.id, kit.packageName, kit.kit, home);
}
// Phase 1b: Scan already-started apparatus for supportKit.
for (const app of g.apparatuses()) {
  if (app.apparatus.supportKit) {
    registerKitRoles(app.id, app.packageName, app.apparatus.supportKit, home);
  }
}
// Phase 2: Subscribe to plugin:initialized for apparatus supportKits that start after Loom.
ctx.on('plugin:initialized', (plugin: unknown) => {
  const loaded = plugin as LoadedPlugin;
  if (isLoadedApparatus(loaded) && loaded.apparatus.supportKit) {
    registerKitRoles(loaded.id, loaded.packageName, loaded.apparatus.supportKit, home);
  }
});
```

Note: The Loom scans BOTH `g.kits()` AND `g.apparatuses()` in Phase 1. The Spider's existing blockType scanning only does `g.kits()` + subscribes for future apparatus events (since Spider requires stacks/clerk/fabricator, those apparatuses have already started before Spider). The new rig template scanning should likely follow the Loom's pattern (scan both) to be safe.

**Error messages include kit identity:**
```typescript
console.warn(`[loom] Kit "${pluginId}" role "${roleName}" is missing required "permissions" array — skipped`);
```

---

## Adjacent Patterns: BlockType Registry (Simpler Reference)

From `packages/plugins/spider/src/spider.ts:337`:

```typescript
class BlockTypeRegistry {
  private readonly types = new Map<string, BlockType>();

  register(plugin: LoadedPlugin): void {
    if (isLoadedKit(plugin)) {
      this.registerFromKit(plugin.kit);
    } else if (isLoadedApparatus(plugin)) {
      if (plugin.apparatus.supportKit) {
        this.registerFromKit(plugin.apparatus.supportKit);
      }
    }
  }

  private registerFromKit(kit: Record<string, unknown>): void {
    const raw = kit.blockTypes;
    if (typeof raw !== 'object' || raw === null) return;
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (isBlockType(value)) {
        this.types.set(value.id, value);
      }
    }
  }

  get(id: string): BlockType | undefined {
    return this.types.get(id);
  }
}
```

The BlockTypeRegistry does NOT do qualified naming or dependency-scoped validation — it's simpler than what the Loom does. The rig templates need the Loom pattern (qualified names, dependency-scoped validation, config override semantics).

---

## Adjacent Patterns: Fabricator Engine Registry

From `packages/plugins/fabricator/src/fabricator.ts:122`:

```typescript
class EngineRegistry {
  private readonly designs = new Map<string, EngineDesign>();

  register(plugin: LoadedPlugin): void {
    if (isLoadedKit(plugin)) this.registerFromKit(plugin.kit);
    else if (isLoadedApparatus(plugin)) {
      if (plugin.apparatus.supportKit) this.registerFromKit(plugin.apparatus.supportKit);
    }
  }

  private registerFromKit(kit: Record<string, unknown>): void {
    const rawEngines = kit.engines;
    if (typeof rawEngines !== 'object' || rawEngines === null) return;
    for (const value of Object.values(rawEngines as Record<string, unknown>)) {
      if (isEngineDesign(value)) {
        this.designs.set(value.id, value);
      }
    }
  }
}
```

The Fabricator's scan in start():
```typescript
// Scan standalone kits (already-fired events)
for (const kit of g.kits()) { registry.register(kit); }
// Subscribe for apparatus events after Fabricator
ctx.on('plugin:initialized', (plugin) => {
  if (isLoadedApparatus(loaded)) registry.register(loaded);
});
```

Note: Fabricator does NOT scan `g.apparatuses()`. This is consistent with the Spider's blockType scan. But the Loom adds that step. The difference: Fabricator/Spider require deps that start before them (so deps have already fired, but their supportKits only matter if they appear in `plugin:initialized`). The Loom explicitly covers this case.

**For dependency-scoped validation**: to check if a designId is from an allowed plugin, the Spider's new validation would need to know which plugin contributed each engine design. The current Fabricator just stores `Map<string, EngineDesign>` — it doesn't track which plugin contributed which design. This is a gap: the Spider would need to either (a) ask the Fabricator which plugin owns a designId (requires API change to Fabricator), or (b) scan kits directly at validation time, or (c) track kit contributions in the Spider's own rig template registry with their source kit.

**Option (c) is cleanest**: the Spider's new template registry stores `{ template: RigTemplate, kitId: string, allowedPlugins: Set<string> }` so it can validate at registration time (when the kit and its requires/recommends are known) rather than at spawn time.

---

## Current Validation Logic Details

### `validateTemplates()` call site in `start()`

```typescript
// Called ONCE at startup with config-defined templates only
if (spiderConfig.rigTemplates) {
  validateTemplates(spiderConfig.rigTemplates, fabricator);
}
```

**New behavior needed:**
1. Validate config templates at startup (same as now)
2. Validate kit templates at registration time (when kit is scanned)
3. Validate merged mappings: check that every mapping value points to an existing template name in the merged registry
4. Validate merged templates: run existing checks
5. For kit templates: also check designId dependency scope

---

## Current `lookupTemplate()` Callers

Only one call site: `trySpawn()` at line 737:
```typescript
const template = lookupTemplate(writ.type, spiderConfig);
```

**New behavior:** `lookupTemplate` (or its replacement) needs access to the merged registry state, not just `spiderConfig`. Options:
- Change signature to `lookupTemplate(writType, mergedRegistry)` where `mergedRegistry` is built at startup
- Or just use closure access to `kitTemplates` / `kitMappings` maps stored in the enclosing `createSpider()` scope

The closure pattern is consistent with how `spiderConfig`, `fabricator`, etc. are accessed.

---

## Test File Patterns

### `spider.test.ts` patterns
- Uses `buildFixture(guildConfig)` which accepts `Partial<GuildConfig>`
- Spider config passed via `guildConfig.spider`
- Tests use `buildCtx()` helper to create a StartupContext that can fire events
- The `fire('plugin:initialized', loadedPlugin)` pattern is used to simulate kit loading

### Kit simulation pattern in spider.test.ts
```typescript
const spiderLoaded: LoadedApparatus = {
  packageName: '@shardworks/spider-apparatus',
  id: 'spider',
  version: '0.0.0',
  apparatus: spiderApparatus,
};
void fire('plugin:initialized', spiderLoaded);
```

New tests for kit contributions would need to simulate LoadedKit events:
```typescript
const kitPlugin: LoadedKit = {
  packageName: '@acme/quality-tools',
  id: 'quality-tools',
  version: '1.0.0',
  kit: {
    requires: ['spider', 'clerk'],
    writTypes: [{ name: 'quality-audit', description: '...' }],
    rigTemplates: { audit: { engines: [...] } },
    rigTemplateMappings: { 'quality-audit': 'quality-tools.audit' },
  },
};
void fire('plugin:initialized', kitPlugin);
```

BUT: kits fire `plugin:initialized` BEFORE any apparatus starts. So in tests, kits need to fire before `spiderApparatus.start()`. The `buildFixture()` pattern would need to accept kit contributions to inject.

OR: the `fakeGuild.kits()` return value could be extended to return mock kits, and Spider's `start()` would scan them via `g.kits()`.

---

## Key Structural Observation: Separate Template Registry vs Merged Config

The current `SpiderConfig.rigTemplates` is `Record<string, RigTemplate>` where keys serve as:
1. Template names (when used as values in mappings — not currently a feature)
2. Writ type → template mappings (current use)

Under the new model, there are two distinct concepts:
- **Template registry**: named templates (`pluginId.templateName` for kit contributions, unqualified for config)
- **Mapping registry**: writ type → template name

The guild config (`guild.json`) currently conflates these in `spider.rigTemplates`. The brief implies a new `spider.rigTemplateMappings?: Record<string, string>` field in guild config (for config-defined mappings that override kit mappings). But `spider.rigTemplates` itself seems to stay as-is for backward compatibility — its keys may be used as BOTH templates AND implicit mappings (writ type = template name = key).

Actually looking more carefully: under the new model:
- `spider.rigTemplates` keys = template names (possibly matching writ type for implicit mapping)
- `spider.rigTemplateMappings` keys = writ types, values = template names (for explicit remapping)

The `lookupTemplate` new logic would be:
1. Check `mergedMappings[writType]` → template name
2. Look up template name in `mergedTemplateRegistry`
3. If no explicit mapping, check `mergedTemplateRegistry[writType]` directly (backward compat: template name = writ type)
4. If still no match, check `mergedMappings['default']` or `mergedTemplateRegistry['default']`
5. Throw

---

## Dependency-Scoped Validation: Key Challenge

The brief says:
> "a kit's rig template may only reference engine designIds from plugins declared in its `requires` or `recommends`, plus the Spider's own built-in engines."

To validate this, the Spider needs to know:
1. Which designIds a given plugin contributes (its engines)
2. Whether a given designId is from a plugin in the kit's `requires`/`recommends`

The Fabricator's `getEngineDesign()` only returns the design, not its source plugin. To implement dependency-scoped validation, the Spider's template registry scanner needs to cross-check at registration time by:
- Computing `allowedPlugins = new Set([kitId, ...kit.requires, ...kit.recommends, 'spider'])`
- For each engine in the template, checking whether its `designId` is from an allowed plugin

But how to check "is designId from pluginX"? Options:
1. The Spider knows its own built-in designIds (draft, implement, review, revise, seal)
2. For other plugins, the Spider would need to inspect their kits/supportKits to find which engines they contribute

This means the validation needs to inspect the loaded kit/apparatus plugins to map plugin → contributed designIds. This is available via `g.kits()` and `g.apparatuses()` during `start()`.

The validation function would need something like:
```typescript
function buildDesignSourceMap(kits: LoadedKit[], apparatuses: LoadedApparatus[]): Map<string, string> {
  // Returns designId → pluginId
}
```

Then validation checks: `designSourceMap.get(designId) ∈ allowedPlugins OR isBuiltinEngine(designId)`.

This is different from the Loom's dependency-scoped validation (which just checks the `plugin:` prefix in permission strings). The Spider's check requires actually scanning the loaded plugins.

---

## Existing Tests for Affected Functions

### Spider template tests (`spider.test.ts`, line ~1854)

Test suite: `describe('Spider — template dispatch', ...)`

Tests:
- `'spawns a rig using the type-specific template when writ type matches'` — uses `rigTemplates: { mandate: mandateTemplate }`
- `'falls back to default template when no type-specific match exists'` — uses `rigTemplates: { default: defaultTemplate }`
- `'uses type-specific template over default when both exist'`
- (validate tests in same suite area based on grep results for validate)

These tests pass config directly — they don't test kit contributions. New tests needed for:
- Kit-contributed template registration
- Qualified name scoping
- Config override semantics
- Mapping + template separation
- Dependency-scoped validation for kit templates
- Dangling mapping reference detection

### Clerk writ type tests (`clerk.test.ts`, line ~142)

Tests:
- `'accepts a type declared in clerk writTypes config'` — config-based
- `'rejects a type that is not in clerk writTypes'` — config-based

New tests needed for:
- Kit-contributed writ types
- Config override semantics
- kit type validated at post time

---

## Existing Context: Docs and Config

### `docs/architecture/apparatus/spider.md` — outdated
The Spider spec doc describes the static pipeline only. It mentions `rigTemplates` as config but not kit contributions. This doc would need updating post-implementation.

### `docs/architecture/apparatus/clerk.md`
Notes: "The Clerk does not consume kit contributions. No `consumes` declaration." This doc needs updating.

### `docs/architecture/plugins.md`
Contains the reactive consumption pattern description that this feature implements.

---

## Doc/Code Discrepancies

1. **`docs/architecture/apparatus/clerk.md` line ~34**: States "The Clerk does not consume kit contributions. No `consumes` declaration." — This will be false after this work. Doc is currently accurate but will become stale.

2. **`docs/architecture/apparatus/spider.md`**: Still describes "The Static Graph" as a fixed 5-engine pipeline. The template system exists in code but the doc wasn't updated when templates were added. Doc is partially stale.

3. **Spider's `consumes`**: Currently `consumes: ['blockTypes']`. The `collectStartupWarnings` in `guild-lifecycle.ts` uses `consumes` to generate warnings for kits that contribute unconsumed types. Adding `'rigTemplates'` and `'rigTemplateMappings'` to `consumes` will suppress false warnings for kits that contribute these types.

---

## Summary of Change Surface

**Spider changes:**
1. New `RigTemplateRegistry` class (or inline logic) that tracks qualified kit templates + config templates merged
2. New mapping registry (qualified kit mappings + config mappings merged)  
3. `lookupTemplate()` rewrite to use merged registry
4. `validateTemplates()` extension for kit-contributed templates (dependency-scoped designId validation)
5. `start()` gains kit scanning loop + `plugin:initialized` subscription for rigTemplates and rigTemplateMappings
6. `consumes` updated
7. New types exported (optional `SpiderKit` interface)

**Clerk changes:**
1. New `WritTypeRegistry` (or inline state + logic)
2. `resolveWritTypes()` merges kit contributions
3. `start()` gains kit scanning loop + `plugin:initialized` subscription  
4. `consumes: ['writTypes']` added
5. New types exported (optional `ClerkKit` interface)

**No framework changes needed**: The pattern is already established in Loom/Fabricator/BlockTypeRegistry. No Arbor changes, no core changes.
