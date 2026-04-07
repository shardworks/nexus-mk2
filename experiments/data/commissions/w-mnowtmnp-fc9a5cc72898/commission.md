---
author: plan-writer
estimated_complexity: 8
---

# Kit-Contributed Rig Templates, Writ Types, and Mappings

## Summary

Kits and apparatus supportKits can contribute writ types, rig templates, and writ-type-to-template mappings so that installing a plugin is sufficient to make a new work type functional. The Spider and Clerk consume these contributions at startup, merging them with guild config which retains override authority.

## Current State

### Spider (`packages/plugins/spider/src/spider.ts`)

The Spider manages rig execution. At startup it reads `SpiderConfig` from `guild().guildConfig().spider`:

```typescript
// packages/plugins/spider/src/types.ts
export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  variables?: Record<string, unknown>;
}
```

`rigTemplates` keys currently serve as both template names and writ-type-to-template mappings. `lookupTemplate()` does a direct property lookup:

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

Called from `trySpawn()` at line 737:

```typescript
const template = lookupTemplate(writ.type, spiderConfig);
```

The Spider validates config templates at startup via `validateTemplates()` — checking non-empty engines, duplicate IDs, unknown designIds (against Fabricator + builtins), upstream refs, cycles, resolutionEngine, and variable refs. All errors throw.

The Spider declares `consumes: ['blockTypes']` and scans kits using Phase 1 (`g.kits()`) + Phase 2 (`ctx.on('plugin:initialized', ...)`) via a `BlockTypeRegistry` class.

The Spider's apparatus declaration:

```typescript
apparatus: {
  requires: ['stacks', 'clerk', 'fabricator'],
  consumes: ['blockTypes'],
  // ...
}
```

### Clerk (`packages/plugins/clerk/src/clerk.ts`)

The Clerk manages writ lifecycle. It validates writ types at `post()` time:

```typescript
const BUILTIN_TYPES = new Set(['mandate']);

function resolveWritTypes(): Set<string> {
  const config = resolveClerkConfig();
  const declared = (config.writTypes ?? []).map((entry) => entry.name);
  return new Set([...BUILTIN_TYPES, ...declared]);
}
```

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
```

The Clerk currently has no `consumes` declaration and no kit scanning. Its `start()` ignores the `StartupContext` parameter:

```typescript
start(_ctx: StartupContext): void {
  const stacks = guild().apparatus<StacksApi>('stacks');
  writs = stacks.book<WritDoc>('clerk', 'writs');
  links = stacks.book<WritLinkDoc>('clerk', 'links');
},
```

### Adjacent pattern: The Loom (`packages/plugins/loom/src/loom.ts`)

The Loom consumes kit-contributed roles. Its pattern is the reference for this work:

- Qualified names: `${pluginId}.${roleName}`
- Config override at registration time: if config defines the qualified name, kit contribution is skipped
- Dependency-scoped validation: permissions only reference plugins in `requires`/`recommends`/self
- Three-phase scanning: Phase 1a (`g.kits()`), Phase 1b (`g.apparatuses()`), Phase 2 (`plugin:initialized` subscription)
- `consumes: ['roles']` declaration
- Exports `LoomKit` and `KitRoleDefinition` types from the implementation file, re-exported from the barrel

## Requirements

- R1: Kits may contribute rig templates via a `rigTemplates` field (`Record<string, RigTemplate>`). The Spider consumes these, registering each under the qualified name `pluginId.templateName`.
- R2: If `spider.rigTemplates` in guild config defines a key matching a kit's qualified template name, the kit contribution is silently skipped at registration time.
- R3: Kit-contributed rig templates are validated with all existing template checks (non-empty engines, duplicate IDs, upstream refs, cycles, resolutionEngine, variable refs) plus dependency-scoped designId validation. A kit template may only reference designIds from plugins in the kit's `requires`, `recommends`, the kit itself, or the Spider's built-in engines.
- R4: When a kit template fails any validation check, the Spider emits a `console.warn` identifying the kit and skips the entire template. Config templates continue to throw on validation failure.
- R5: Kits may contribute writ types via a `writTypes` field (`WritTypeEntry[]`). The Clerk consumes these. Writ type names are unqualified (not namespace-prefixed).
- R6: Config-defined writ types override kit contributions with the same name (silently skipped at registration time). When two kits contribute the same writ type name, the first-registered wins and a `console.warn` is emitted.
- R7: Kits may contribute rig template mappings via a `rigTemplateMappings` field (`Record<string, string>`). The Spider consumes these. Mapping keys are unqualified writ type names. Values may reference any registered template name (config or kit-contributed, any kit).
- R8: Config `rigTemplateMappings` override kit-contributed mappings for the same writ type. When two kits contribute mappings for the same writ type, the first-registered wins and a `console.warn` is emitted.
- R9: `lookupTemplate()` uses the following precedence chain: (1) config `rigTemplateMappings[writType]` → look up template name in merged registry, (2) kit `rigTemplateMappings[writType]` → look up template name in merged registry, (3) merged template registry `'default'` directly, (4) throw.
- R10: `spider.rigTemplates` config keys are pure template names. Writ types are bound to templates exclusively through `rigTemplateMappings` (config or kit-contributed).
- R11: `spider.rigTemplateMappings` supports a `'default'` key that serves as the fallback when no writ-type-specific mapping is found (checked before the 'default' template in step 3 of R9). Config `rigTemplateMappings['default']` is resolved as part of step 1 of the lookup chain.
- R12: Dangling mapping references (mapping points to a template name not in the merged registry) are validated after all Phase 1 scanning completes. Config dangling mappings throw; kit dangling mappings warn and are removed.
- R13: The Spider declares `consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings']`.
- R14: The Clerk declares `consumes: ['writTypes']`.
- R15: Both the Spider and Clerk use three-phase scanning: Phase 1a (`g.kits()`), Phase 1b (`g.apparatuses()` supportKits), Phase 2 (`ctx.on('plugin:initialized', ...)` for apparatus supportKits arriving later).
- R16: `SpiderKit` and `ClerkKit` interfaces are exported for kit authors to type-check contributions.
- R17: Malformed kit contribution fields (wrong type, missing sub-fields) are skipped with a `console.warn` identifying the kit. They never throw.
- R18: Kit validation warning messages use the format `[spider] Kit "pluginId" rigTemplates.templateName: issue` (and analogous for Clerk: `[clerk] Kit "pluginId" writTypes: issue`).
- R19: The Clerk's `resolveWritTypes()` reads from an in-memory `Set<string>` populated at startup from builtins + config + kit contributions, rather than re-deriving from config on every call. The set is updated via `plugin:initialized` for late-arriving apparatus supportKits.

## Design

### Type Changes

#### `packages/plugins/spider/src/types.ts` — SpiderConfig update

```typescript
export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  /**
   * Named rig templates. Keys are template names (not writ types).
   * Templates are looked up by name via rigTemplateMappings.
   * A template named 'default' is used as the fallback when no mapping matches.
   */
  rigTemplates?: Record<string, RigTemplate>;
  /**
   * Writ type → rig template name mappings.
   * 'default' key is the fallback for unmatched writ types.
   * Config mappings override kit-contributed mappings for the same writ type.
   */
  rigTemplateMappings?: Record<string, string>;
  variables?: Record<string, unknown>;
}
```

#### `packages/plugins/spider/src/spider.ts` — SpiderKit type

```typescript
/** Kit contribution interface for the Spider's rig template system. */
export interface SpiderKit {
  /** Named rig templates. Keys are unqualified; registered as pluginId.key. */
  rigTemplates?: Record<string, RigTemplate>;
  /** Writ type → rig template name mappings. Keys are unqualified writ type names. */
  rigTemplateMappings?: Record<string, string>;
}
```

#### `packages/plugins/clerk/src/clerk.ts` — ClerkKit type

```typescript
import type { WritTypeEntry } from './types.ts';

/** Kit contribution interface for the Clerk's writ type system. */
export interface ClerkKit {
  /** Writ type descriptors to register with the Clerk. Names are unqualified. */
  writTypes?: WritTypeEntry[];
}
```

### Behavior

#### Spider: RigTemplateRegistry class

A new `RigTemplateRegistry` class is added to `spider.ts`, following the `BlockTypeRegistry` pattern but with Loom-style qualified naming, config override, and dependency-scoped validation.

**State:**
- `templates: Map<string, RigTemplate>` — merged template registry (config + kit-contributed, keyed by name)
- `configMappings: Map<string, string>` — config writ-type-to-template-name mappings
- `kitMappings: Map<string, string>` — kit-contributed mappings (first-registered wins)
- `designSourceMap: Map<string, string>` — engine designId → pluginId, built once at initialization

**Registration (`registerFromKit(pluginId, kit, config)`):**

When processing a kit's `rigTemplates` field:
1. Verify `rigTemplates` is a non-null object. If not, `console.warn` per R17 and skip.
2. For each `[templateName, template]` entry:
   - Compute qualified name: `${pluginId}.${templateName}`
   - If `config.rigTemplates` has a key matching the qualified name, skip silently (R2).
   - Validate the template shape: must have an `engines` array. If not, warn and skip (R17).
   - Run all template validation checks (R3, R9 of existing validation): non-empty engines, duplicate engine IDs, upstream refs, cycles, resolutionEngine, variable refs.
   - Run dependency-scoped designId check (R3): compute `allowedPlugins = new Set([pluginId, ...(kit.requires ?? []), ...(kit.recommends ?? []), 'spider'])`. For each engine, check `designSourceMap.get(engine.designId)` is in `allowedPlugins`, OR `engine.designId` is a Spider built-in engine ID.
   - If any check fails, `console.warn` with format per R18 and skip the entire template (R4).
   - If all checks pass, add to `templates` map under the qualified name.

When processing a kit's `rigTemplateMappings` field:
1. Verify `rigTemplateMappings` is a non-null object. If not, warn and skip.
2. For each `[writType, templateName]` entry:
   - If `configMappings` has the same `writType` key, skip silently (R8).
   - If `kitMappings` already has the same `writType` key (from an earlier kit), `console.warn` about the duplicate (R8) and skip.
   - Otherwise, add to `kitMappings`.
3. Dangling reference validation is deferred (R12).

**The designSourceMap** is built once at the beginning of `start()`:
1. Spider's built-in engine IDs (`draft`, `implement`, `review`, `revise`, `seal`) map to `'spider'`.
2. Scan `g.kits()`: for each kit with an `engines` field, iterate entries. For each value that has `id: string` and `run: function`, map `value.id → kit.id`.
3. Scan `g.apparatuses()`: for each apparatus with `supportKit.engines`, same logic, map `value.id → apparatus.id`.

**`lookupTemplate(writType)` — uses closure state per D22:**

```
function lookupTemplate(writType: string): RigTemplate {
  // Step 1: Config mapping for this writ type
  const configMapped = configMappings.get(writType);
  if (configMapped !== undefined) {
    const t = templateRegistry.get(configMapped);
    if (t) return t;
    // Config points to nonexistent template — validated at startup, should not happen at runtime
  }

  // Step 2: Kit mapping for this writ type
  const kitMapped = kitMappings.get(writType);
  if (kitMapped !== undefined) {
    const t = templateRegistry.get(kitMapped);
    if (t) return t;
  }

  // Step 1 (default): Config mapping for 'default'
  const configDefault = configMappings.get('default');
  if (configDefault !== undefined) {
    const t = templateRegistry.get(configDefault);
    if (t) return t;
  }

  // Step 2 (default): Kit mapping for 'default'
  const kitDefault = kitMappings.get('default');
  if (kitDefault !== undefined) {
    const t = templateRegistry.get(kitDefault);
    if (t) return t;
  }

  // Step 3: Template named 'default' in merged registry
  const defaultTemplate = templateRegistry.get('default');
  if (defaultTemplate) return defaultTemplate;

  // Step 4: Throw
  throw new Error(
    `[spider] No rig template found for writ type "${writType}" and no "default" template or mapping configured.`
  );
}
```

Note on lookup chain: the 'default' key in config/kit mappings is checked as part of steps 1-2 (as a special case of the mapping lookup), before the direct 'default' template lookup in step 3. This means `rigTemplateMappings: { "default": "quality-tools.audit" }` correctly routes unmatched writ types to the named kit template.

**Deferred mapping validation (end of Phase 1, before Phase 2 subscription starts):**

After all Phase 1a and 1b scanning is done:
1. For each entry in `configMappings`: if the template name is not in `templateRegistry`, throw (R12, R24).
2. For each entry in `kitMappings`: if the template name is not in `templateRegistry`, `console.warn` and remove the entry from `kitMappings` (R12, R24).

**Phase 2 (plugin:initialized) incremental registration:**

When a late-arriving apparatus supportKit is registered:
1. Process its `rigTemplates` normally (validate, register qualified names).
2. Process its `rigTemplateMappings` normally — for dangling references, validate immediately against the current `templateRegistry` state. If dangling, warn and skip (since the deferred pass already ran).

#### Spider: `start()` changes

The new `start()` flow:

```
start(ctx: StartupContext): void {
  const g = guild();
  spiderConfig = g.guildConfig().spider ?? {};
  // ... existing apparatus lookups ...

  // 1. Build designId → pluginId map
  buildDesignSourceMap(g.kits(), g.apparatuses());

  // 2. Register config templates into templateRegistry
  //    (validate with existing validateTemplates — throws on error)
  if (spiderConfig.rigTemplates) {
    validateTemplates(spiderConfig.rigTemplates, fabricator);
    for (const [name, template] of Object.entries(spiderConfig.rigTemplates)) {
      templateRegistry.set(name, template);
    }
  }

  // 3. Register config mappings into configMappings
  if (spiderConfig.rigTemplateMappings) {
    for (const [writType, templateName] of Object.entries(spiderConfig.rigTemplateMappings)) {
      configMappings.set(writType, templateName);
    }
  }

  // 4. Phase 1a: Scan standalone kits
  for (const kit of g.kits()) {
    rigTemplateRegistry.registerFromKit(kit.id, kit.kit, spiderConfig);
  }

  // 5. Phase 1b: Scan already-started apparatus supportKits
  for (const app of g.apparatuses()) {
    if (app.apparatus.supportKit) {
      rigTemplateRegistry.registerFromKit(app.id, app.apparatus.supportKit, spiderConfig);
    }
  }

  // 6. Deferred mapping validation
  validateMappings();

  // 7. Phase 2: Subscribe for late-arriving apparatus
  ctx.on('plugin:initialized', (plugin: unknown) => {
    const loaded = plugin as LoadedPlugin;
    if (isLoadedApparatus(loaded) && loaded.apparatus.supportKit) {
      rigTemplateRegistry.registerFromKit(loaded.id, loaded.apparatus.supportKit, spiderConfig);
      // Validate this kit's mappings immediately
      validateIncrementalMappings(loaded.id);
    }
    // Also register block types (existing behavior)
    if (isLoadedApparatus(loaded)) {
      blockTypeRegistry.register(loaded);
    }
  });

  // ... existing book setup, kit block type scan, CDC handler ...
}
```

The apparatus declaration changes to:

```typescript
apparatus: {
  requires: ['stacks', 'clerk', 'fabricator'],
  consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings'],
  // ...
}
```

#### Clerk: writ type kit consumption

**New inline state** in `createClerk()` closure:

```typescript
/** Merged set of valid writ type names: builtins + config + kit contributions. */
let mergedWritTypes: Set<string>;

/** Config-declared writ type names, for override checking during kit registration. */
let configWritTypeNames: Set<string>;
```

**New registration function:**

```typescript
function registerKitWritTypes(pluginId: string, kit: Record<string, unknown>): void {
  const raw = kit.writTypes;
  if (!Array.isArray(raw)) return;

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || typeof (entry as Record<string, unknown>).name !== 'string') {
      console.warn(`[clerk] Kit "${pluginId}" writTypes: entry is missing required "name" field — skipped`);
      continue;
    }
    const name = (entry as WritTypeEntry).name;

    // Config override: skip silently
    if (configWritTypeNames.has(name)) continue;

    // Duplicate kit contribution: warn
    if (mergedWritTypes.has(name)) {
      console.warn(`[clerk] Kit "${pluginId}" writTypes: type "${name}" already registered by another kit — skipped`);
      continue;
    }

    mergedWritTypes.add(name);
  }
}
```

**`resolveWritTypes()` changes:**

```typescript
function resolveWritTypes(): Set<string> {
  return mergedWritTypes;
}
```

This function is now a simple getter — the set was populated at startup and updated by `plugin:initialized`.

**`start()` changes:**

```typescript
start(ctx: StartupContext): void {
  const g = guild();
  const stacks = g.apparatus<StacksApi>('stacks');
  writs = stacks.book<WritDoc>('clerk', 'writs');
  links = stacks.book<WritLinkDoc>('clerk', 'links');

  // Initialize merged writ types from builtins + config
  const config = resolveClerkConfig();
  configWritTypeNames = new Set((config.writTypes ?? []).map((e) => e.name));
  mergedWritTypes = new Set([...BUILTIN_TYPES, ...configWritTypeNames]);

  // Phase 1a: Scan standalone kits
  for (const kit of g.kits()) {
    registerKitWritTypes(kit.id, kit.kit);
  }

  // Phase 1b: Scan already-started apparatus supportKits
  for (const app of g.apparatuses()) {
    if (app.apparatus.supportKit) {
      registerKitWritTypes(app.id, app.apparatus.supportKit);
    }
  }

  // Phase 2: Subscribe for late-arriving apparatus supportKits
  ctx.on('plugin:initialized', (plugin: unknown) => {
    const loaded = plugin as LoadedPlugin;
    if (isLoadedApparatus(loaded) && loaded.apparatus.supportKit) {
      registerKitWritTypes(loaded.id, loaded.apparatus.supportKit);
    }
  });
},
```

The apparatus declaration changes to:

```typescript
apparatus: {
  requires: ['stacks'],
  consumes: ['writTypes'],
  // ...
}
```

Note: the `start` parameter changes from `_ctx: StartupContext` to `ctx: StartupContext`.

### Non-obvious Touchpoints

- **`packages/plugins/spider/src/index.ts`** — must re-export `SpiderKit` from `./spider.ts`. The `SpiderConfig` type is already re-exported from `./types.ts`; the new `rigTemplateMappings` field on `SpiderConfig` is automatically included.
- **`packages/plugins/clerk/src/index.ts`** — must re-export `ClerkKit` from `./clerk.ts`.
- **`packages/plugins/spider/src/types.ts`** — the `GuildConfig` augmentation at the bottom already declares `spider?: SpiderConfig`. Since `SpiderConfig` gains `rigTemplateMappings`, the augmentation covers it automatically.
- **`packages/plugins/clerk/src/types.ts`** — the `GuildConfig` augmentation already declares `clerk?: ClerkConfig`. No changes needed.
- **Spider's existing blockType `plugin:initialized` handler** — currently only handles `isLoadedApparatus`. The new handler for rig templates also only fires for `isLoadedApparatus` (since kits are scanned in Phase 1a). These two subscriptions can be combined into a single `plugin:initialized` handler that does both block type and rig template registration.
- **`packages/plugins/spider/src/spider.test.ts`** — the `buildFixture()` function's `fakeGuild` object currently returns empty arrays from `kits()` and `apparatuses()`. Tests that exercise kit contributions need to extend `buildFixture()` to accept `LoadedKit[]` and return them from `kits()`.
- **`packages/plugins/clerk/src/clerk.test.ts`** — similarly, `fakeGuild.kits()` returns `[]` and `fakeGuild.apparatuses()` returns `[]`. Tests need to inject mock kits.

## Validation Checklist

- V1 [R1, R2]: Create a test where a kit contributes `rigTemplates: { audit: { engines: [...] } }` with pluginId `quality-tools`. Verify the template is registered under `quality-tools.audit`. Add a config template with the same qualified name and verify the kit contribution is skipped.
- V2 [R3, R4]: Create a test where a kit template references a designId from a plugin NOT in its `requires`/`recommends`. Verify a `console.warn` is emitted containing the kit name and the template is not registered. Then test with a designId from a declared dependency — verify it passes.
- V3 [R5, R6]: Create a test where a kit contributes `writTypes: [{ name: 'quality-audit' }]`. Post a writ with `type: 'quality-audit'` and verify it succeeds. Then add a config writType with the same name and verify the kit contribution is skipped. Then have two kits contribute the same name and verify a warning is logged.
- V4 [R7, R8]: Create a test where a kit contributes `rigTemplateMappings: { 'quality-audit': 'quality-tools.audit' }`. Verify that spawning a rig for a `quality-audit` writ uses the `quality-tools.audit` template. Then add a config mapping for the same writ type and verify the config mapping wins.
- V5 [R9, R10, R11]: Create a test with config `rigTemplates: { standard: {...} }, rigTemplateMappings: { mandate: 'standard', default: 'standard' }`. Post a mandate writ and verify it spawns using the `standard` template. Post an unknown-type writ and verify it falls back to `standard` via the `default` mapping.
- V6 [R9]: Create a test with NO mappings and a template named `default`. Verify that a writ of any type uses the `default` template (step 3 of lookup chain).
- V7 [R12]: Create a test where a kit mapping references a nonexistent template name. Verify a `console.warn` is emitted and the mapping is removed. Create a config mapping referencing a nonexistent template — verify startup throws.
- V8 [R13]: Verify Spider's apparatus declaration includes `consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings']`.
- V9 [R14]: Verify Clerk's apparatus declaration includes `consumes: ['writTypes']`.
- V10 [R15]: Create a test where an apparatus supportKit contributes `rigTemplates` and verify Phase 1b scanning picks it up. Create a test where a late-arriving apparatus fires `plugin:initialized` with a supportKit containing `rigTemplateMappings` and verify Phase 2 registration works.
- V11 [R16]: Verify `SpiderKit` is exported from `@shardworks/spider-apparatus` and `ClerkKit` is exported from `@shardworks/clerk-apparatus`.
- V12 [R17, R18]: Create a test where a kit's `rigTemplates` field is a non-object (e.g., a number). Verify a `console.warn` is emitted with the kit name. Create a test where a kit template is missing the `engines` array. Verify a warning with the format `[spider] Kit "pluginId" rigTemplates.templateName: ...`.
- V13 [R19]: Verify that `resolveWritTypes()` returns the merged set including kit contributions, and that posting a writ with a kit-contributed type succeeds without re-reading config.

## Test Cases

### Spider — kit-contributed templates

1. **Happy path: kit template registered under qualified name.** Kit `quality-tools` contributes `rigTemplates: { audit: { engines: [{ id: 'step1', designId: 'draft' }] } }`. After startup, spawning a writ with a mapping to `quality-tools.audit` uses that template. Verify rig has 1 engine with id `step1`.

2. **Config override: qualified name in config skips kit.** Config has `rigTemplates: { 'quality-tools.audit': { engines: [...different...] } }`. Kit `quality-tools` also contributes `audit`. Verify the config template is used, not the kit's.

3. **Dependency-scoped validation: allowed designId passes.** Kit with `requires: ['fabricator']` contributes a template referencing a designId contributed by the fabricator kit. Verify it registers.

4. **Dependency-scoped validation: disallowed designId is rejected.** Kit with `requires: ['spider']` (no fabricator) contributes a template referencing a designId from fabricator. Verify console.warn and template not registered.

5. **Dependency-scoped validation: kit's own engines are allowed.** Kit contributes both `engines: { custom: customEngine }` and `rigTemplates: { pipeline: { engines: [{ id: 'c', designId: 'custom' }] } }`. Verify template registers successfully.

6. **Built-in Spider engines are always allowed.** Kit with empty `requires` contributes a template referencing `'draft'` (Spider built-in). Verify it registers.

7. **Malformed kit template: missing engines array.** Kit contributes `rigTemplates: { bad: { notEngines: [] } }`. Verify console.warn and template not registered.

8. **Malformed kit field: rigTemplates is not an object.** Kit contributes `rigTemplates: 'invalid'`. Verify console.warn, no crash.

### Spider — kit-contributed mappings

9. **Happy path: kit mapping routes writ type to template.** Kit contributes `rigTemplateMappings: { 'quality-audit': 'quality-tools.audit' }` and `rigTemplates: { audit: {...} }`. Spawn a `quality-audit` writ. Verify the `quality-tools.audit` template is used.

10. **Config mapping overrides kit mapping.** Config has `rigTemplateMappings: { 'quality-audit': 'standard' }`. Kit also maps `quality-audit`. Verify config mapping wins.

11. **Two kits map same writ type: first wins with warning.** Kit A and kit B both map `quality-audit`. Verify first-registered wins and console.warn is emitted.

12. **Dangling mapping: kit mapping to nonexistent template.** Kit maps `quality-audit` to `nonexistent.template`. Verify console.warn after Phase 1 and mapping removed.

13. **Dangling mapping: config mapping to nonexistent template.** Config maps `mandate` to `nonexistent`. Verify startup throws.

14. **Cross-kit mapping reference.** Kit A contributes template `a.pipeline`. Kit B contributes mapping `{ 'task': 'a.pipeline' }` (B does NOT contribute the template). Verify the mapping resolves correctly.

15. **Default mapping in config.** Config has `rigTemplateMappings: { 'default': 'quality-tools.audit' }`, kit contributes the template. Writ with an unmapped type. Verify it uses the `quality-tools.audit` template.

16. **Default template fallback (no mappings at all).** Config has `rigTemplates: { 'default': {...} }`, no mappings. Writ with any type. Verify 'default' template is used.

### Spider — lookup chain edge cases

17. **No template, no mapping, no default.** Empty registries. Verify throw with descriptive error.

18. **Config mapping takes precedence over kit mapping for same writ type.** Both define mappings for `mandate`. Verify config wins.

### Clerk — kit-contributed writ types

19. **Happy path: kit writ type allows posting.** Kit contributes `writTypes: [{ name: 'quality-audit' }]`. Post a writ with `type: 'quality-audit'`. Verify success.

20. **Config override: config writType with same name skips kit.** Config has `writTypes: [{ name: 'quality-audit' }]`. Kit also contributes `quality-audit`. Verify no warning (silent skip).

21. **Duplicate kit contributions: warning emitted.** Two kits contribute `writTypes: [{ name: 'quality-audit' }]`. Verify first wins, console.warn emitted.

22. **Kit writ type does not affect built-in types.** Kit contributes `writTypes: [{ name: 'mandate' }]`. Verify `mandate` still works (it's built-in, so the kit contribution is redundant but harmless).

23. **Unknown type still rejected.** No kit or config contributes `unknown-type`. Verify posting with that type throws.

24. **Malformed kit writTypes entry.** Kit contributes `writTypes: [{ notName: 'bad' }]`. Verify console.warn and entry skipped.

25. **Late-arriving apparatus supportKit writ type.** An apparatus fires `plugin:initialized` after Clerk starts, with `supportKit: { writTypes: [{ name: 'late-type' }] }`. Verify `late-type` is valid for posting.