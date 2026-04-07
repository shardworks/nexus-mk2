# Kit-Contributed Roles — Codebase Inventory

Brief: Plugins that ship tools, engines, or other components should be able to bundle purpose-built roles alongside them. Kits contribute roles via a `roles` field on the kit manifest. Kit-contributed roles are namespaced `{pluginId}.{roleName}`. Permissions are dependency-scoped. Guild-defined roles (same qualified name) fully override kit-contributed roles.

---

## Affected Code

### Files That Will Be Modified

| File | Change |
|------|--------|
| `packages/plugins/loom/src/loom.ts` | Primary implementation — new types, kit scanning, permission scoping, updated `weave()` |
| `packages/plugins/loom/src/index.ts` | Export `KitRoleDefinition` and potentially a `LoomKit` interface |
| `packages/plugins/loom/src/loom.test.ts` | New test suite for kit-contributed roles |

No other files are expected to change. The `Apparatus` type, `Kit` type, `LoadedKit`, `LoadedApparatus`, and Arbor are not modified.

---

## Current Type Signatures (Exact, From Code)

### `loom.ts` — current exported types

```typescript
/** Role definition in guild.json under the Loom's plugin section. */
export interface RoleDefinition {
  /** Permission grants in `plugin:level` format. */
  permissions: string[];
  /**
   * When true, permissionless tools are excluded unless the role grants
   * `plugin:*` or `*:*` for the tool's plugin. Default: false.
   */
  strict?: boolean;
}

/** Loom configuration from guild.json. */
export interface LoomConfig {
  /** Role definitions keyed by role name. */
  roles?: Record<string, RoleDefinition>;
}

export interface WeaveRequest {
  role?: string;
}

export interface AnimaWeave {
  systemPrompt?: string;
  tools?: ResolvedTool[];
  environment?: Record<string, string>;
}

export interface LoomApi {
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}
```

### `plugin.ts` — Kit type (unchanged)

```typescript
export type Kit = {
  requires?:   string[]
  recommends?: string[]
  [key: string]: unknown
}

export interface LoadedKit {
  readonly packageName: string   // npm package name e.g. "@shardworks/my-kit"
  readonly id:          string   // derived plugin id e.g. "my-kit"
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

### `apparatus.ts` — Apparatus type (unchanged)

```typescript
export type Apparatus = {
  requires?:    string[]
  recommends?:  string[]
  provides?:    unknown
  start:        (ctx: StartupContext) => void | Promise<void>
  stop?:        () => void | Promise<void>
  supportKit?:  Kit          // ← kit contributions from apparatus, same shape as Kit
  consumes?:    string[]     // ← kit contribution field names this apparatus scans
}
```

---

## Current Loom `start()` Logic

```typescript
start(_ctx: StartupContext): void {
  const g = guild();
  config = g.guildConfig().loom ?? {};         // reads loom.roles from guild.json
  const home = g.home;

  // Read charter content at startup and cache it.
  charterContent = undefined;
  // … reads charter.md or charter/*.md from guild home …

  // Read role instruction files at startup for all configured roles.
  roleInstructions = new Map();
  if (config.roles) {
    for (const roleName of Object.keys(config.roles)) {
      const rolePath = path.join(home, 'roles', `${roleName}.md`);
      try {
        const content = fs.readFileSync(rolePath, 'utf-8');
        if (content) {
          roleInstructions.set(roleName, content);  // key: unqualified role name
        }
      } catch {
        // File doesn't exist — silently omit.
      }
    }
  }
},
```

## Current Loom `weave()` Logic

```typescript
async weave(request: WeaveRequest): Promise<AnimaWeave> {
  const weave: AnimaWeave = {};

  // Resolve tools if a role is provided and has a definition.
  if (request.role && config.roles) {
    const roleDef = config.roles[request.role];   // direct map lookup by role name
    if (roleDef) {
      // … calls instrumentarium.resolve({ permissions, strict, caller: 'anima' }) …
    }
  }

  // Derive git identity from role name.
  if (request.role) {
    // GIT_AUTHOR_NAME = capitalized role name
    // GIT_AUTHOR_EMAIL = role@nexus.local
  }

  // Compose system prompt: charter → tool instructions → role instructions
  if (request.role && roleInstructions.has(request.role)) {
    layers.push(roleInstructions.get(request.role)!);  // direct lookup by role name
  }
  // …
}
```

**Key observation:** Both `config.roles` and `roleInstructions` use unqualified role names as keys. Kit-contributed roles will use fully qualified names (`my-kit.artificer`) as keys in both maps.

---

## Current Loom Apparatus Declaration

```typescript
return {
  apparatus: {
    requires: ['tools'],
    provides: api,
    start(_ctx: StartupContext): void { … },
  },
};
```

**Missing:** No `consumes` declaration. The Instrumentarium (comparable apparatus) declares `consumes: ['tools']` so Arbor can warn when kits contribute tools but no consumer is installed. The Loom will need `consumes: ['roles']`.

---

## Established Kit-Consumption Pattern

Both the **Instrumentarium** and **Spider** follow the same two-phase consumption pattern:

### Phase 1: Scan already-loaded kits at startup

```typescript
start(ctx: StartupContext): void {
  // Phase 1: kits fire plugin:initialized BEFORE any apparatus starts,
  // so they're fully loaded in guild().kits() by the time start() runs.
  for (const kit of g.kits()) {
    registry.register(kit);   // handles LoadedKit
  }

  // Phase 2: apparatus supportKits fire plugin:initialized AFTER their
  // apparatus starts — subscribe to catch them.
  ctx.on('plugin:initialized', (plugin: unknown) => {
    const loaded = plugin as LoadedPlugin;
    if (isLoadedApparatus(loaded)) {         // ← skip kits (already scanned)
      registry.register(loaded);             // handles LoadedApparatus.apparatus.supportKit
    }
  });
}
```

### Phase 2: `plugin:initialized` for apparatus supportKits

The `plugin:initialized` handler skips standalone kits (already scanned). It only processes `LoadedApparatus` entries, accessing `apparatus.supportKit` if present.

### Important: `guild().kits()` vs `guild().apparatuses()`

- `guild().kits()` — returns `LoadedKit[]` (standalone kit packages only, NOT apparatus supportKits)
- `guild().apparatuses()` — returns `LoadedApparatus[]` (already-started apparatus; supportKit is in `.apparatus.supportKit`)
- `plugin:initialized` fires for both kits and apparatuses after each one loads/starts

**The Loom start() must also scan `guild().apparatuses()` if it needs supportKit roles from apparatus that started before the Loom.** Looking at Instrumentarium: it scans only `g.kits()`, not `g.apparatuses()`, in its startup loop. Then it catches apparatus supportKits via `plugin:initialized`. Since the Loom requires `['tools']`, it starts after the Instrumentarium. But kit roles from apparatus supportKits that start before the Loom would need to be caught via the initial `guild().apparatuses()` scan OR via `plugin:initialized`. The brief says to follow the established pattern — check if the existing pattern covers the case by scanning `guild().kits()` and subscribing to `plugin:initialized`.

Instrumentarium code (exact):
```typescript
// Scan all already-loaded kits.
for (const kit of g.kits()) {
  registry.register(kit);
}
// Subscribe to plugin:initialized for apparatus supportKits that fire after us.
ctx.on('plugin:initialized', (plugin: unknown) => {
  const loaded = plugin as LoadedPlugin;
  if (isLoadedApparatus(loaded)) {  // skip kits — already scanned above
    registry.register(loaded);
  }
});
```

Spider code (exact pattern, same logic).

---

## Permission System (Instrumentarium)

Permissions are `"pluginId:level"` strings with wildcard support:

```typescript
function matchesPermission(pluginId, permission, grants): boolean {
  // Exact match:           plugin:level
  // Plugin wildcard:       plugin:*
  // Level wildcard:        *:level
  // Superuser:             *:*
}
```

The Loom passes permissions from `RoleDefinition.permissions` to `instrumentarium.resolve({ permissions, strict, caller: 'anima' })`. The Instrumentarium handles the matching — the Loom just passes the array.

**For dependency-scoped permission validation:** when a kit's role references `pluginId` in a permission string, the Loom must check that `pluginId` is in `{kit.id, ...(kit.kit.requires ?? []), ...(kit.kit.recommends ?? [])}`. The `*` wildcard as a plugin prefix (`*:level` or `*:*`) needs a decision: is it allowed or does it count as "undeclared plugin ID"?

---

## Instructions Resolution

### Current: guild-defined roles
```typescript
// Reads from: {guild.home}/roles/{roleName}.md
const rolePath = path.join(home, 'roles', `${roleName}.md`);
const content = fs.readFileSync(rolePath, 'utf-8');
roleInstructions.set(roleName, content);
```

### Parallel: Instrumentarium instructionsFile
```typescript
// Resolves instructionsFile relative to kit's npm package dir:
const packageDir = path.join(this.guildHome, 'node_modules', packageName);
const filePath = path.join(packageDir, tool.instructionsFile);
const content = fs.readFileSync(filePath, 'utf-8');
```

**For kit-contributed roles**, `instructionsFile` would resolve to:
```typescript
path.join(g.home, 'node_modules', kit.packageName, instructionsFile)
```

Note `kit.packageName` (npm package name, e.g. `@shardworks/my-kit`) vs `kit.id` (derived plugin id, e.g. `my-kit`). The path uses `packageName`.

---

## How guild.json Stores Loom Config

The Loom reads its config via GuildConfig module augmentation:

```typescript
// In loom/src/index.ts:
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    loom?: LoomConfig;
  }
}
```

At startup:
```typescript
config = g.guildConfig().loom ?? {};
```

So `guild.json` has:
```json
{
  "loom": {
    "roles": {
      "artificer": { "permissions": ["stacks:read", "stacks:write"] },
      "scribe":    { "permissions": ["stacks:read"], "strict": true }
    }
  }
}
```

**Guild override (requirement 5):** If `guild.json` has `loom.roles['my-kit.artificer']`, it fully overrides the kit-contributed `my-kit.artificer` — no merging. This check happens at startup when scanning kit contributions: if `config.roles[qualifiedName]` already exists, skip the kit's version.

---

## How the Animator Calls the Loom

```typescript
// In Animator.summon():
const context = await loom.weave({
  role: request.role,   // passes the role name from SummonRequest
});
```

`SummonRequest.role` is typed as `string | undefined`. The role name is passed through unchanged. Callers (spider engines, summon tool, operator) must now use qualified names for kit roles (`my-kit.artificer`) and unqualified names for guild roles (`artificer`). This is a non-breaking change since guild roles remain unqualified.

---

## Adjacent Patterns: Comparable Implementations

### 1. Instrumentarium — consumes `tools` from kits

- Kit field: `tools: ToolDefinition[]`
- Registry: `Map<string, ResolvedTool>` (keyed by tool name)
- Pre-loading: `preloadInstructions()` reads `instructionsFile` at scan time into inline `instructions`
- No namespacing — tool names are global (last-write-wins for duplicates)
- Declares `consumes: ['tools']`

### 2. Spider — consumes `blockTypes` from kits

- Kit field: `blockTypes: Record<string, BlockType>` (object, not array)
- Registry: `Map<string, BlockType>` (keyed by `blockType.id`)
- No namespacing — block type IDs are global
- Declares `consumes: ['blockTypes']`

### 3. Fabricator — likely consumes `engines` from kits (not read in detail)

**Key difference for roles:** Unlike tools and block types, roles need **namespacing** (`{pluginId}.{roleName}`) to avoid collisions. Kit authors write short names; Loom qualifies them. This is a pattern addition not present in the comparable implementations.

---

## Test File: `loom.test.ts`

The existing test file tests:
- `createLoom()` returns correct apparatus shape
- `weave()` with no role (no tools, no system prompt, no environment)
- `weave()` with tool resolution via mock Instrumentarium
- `weave()` with charter content (file and directory variants)
- `weave()` with role instructions (`roles/{role}.md`)
- `weave()` with tool instructions
- Composition order: charter → tool instructions → role instructions
- Startup caching (content read at start, not at weave-time)

**Test helpers pattern:**
```typescript
function setupGuild(opts: {
  loomConfig?: LoomConfig;
  apparatuses?: Record<string, unknown>;
  home?: string;
}) {
  setGuild({
    home: opts.home ?? '/tmp/test-guild',
    apparatus: <T>(id: string): T => { … },
    guildConfig: () => ({
      name: 'test-guild', nexus: '0.0.0', plugins: [],
      loom: opts.loomConfig,
    }),
    kits: () => [],          // ← returns empty by default
    apparatuses: () => [],   // ← returns empty by default
  } as never);
}
```

New tests will need to extend `setupGuild` to accept `kits` and `apparatuses` arrays and wire mock `plugin:initialized` event firing. The current `startLoom()` helper invokes `apparatus.start({ on: () => {} })` — the `on` callback would need to be wired to actually fire `plugin:initialized` for apparatus supportKit testing.

---

## Existing Scratch Notes / Docs

### `docs/architecture/apparatus/loom.md`

No mention of kit-contributed roles. The doc notes future composition work (curricula, temperaments) but nothing about kit roles. The role ownership section says roles live in `guild.json` under the Loom's plugin id — this will be partially superseded.

### `docs/architecture/plugins.md`

Documents the kit pattern extensively. Mentions `consumes` for startup warnings. States "the contribution fields (`relays`, `engines`, `tools`, or anything else) are defined by the apparatus packages that consume them, not by the framework." This is the contract the Loom's `roles` field will follow.

---

## Doc/Code Discrepancies

1. **Legacy `roles`/`workshops`/`baseTools` in test mocks:** Several test files (`loom.test.ts`, `animator.test.ts`, `parlour.test.ts`) include `roles: {}`, `workshops: {}`, and `baseTools: []` in mock `GuildConfig` objects. These fields do not exist in the current `GuildConfig` type definition. They appear to be leftover from an older schema. Not a blocking issue — tests cast with `as never` — but they indicate stale test boilerplate that may confuse future readers.

2. **`loom.md` doc vs. code:** The architecture doc describes the composition order as: guild charter → tool instructions → role instructions (active); curriculum and temperament as future. The code matches. No discrepancy in implemented behavior.

3. **`docs/architecture/kit-components.md` role gating section:** Describes a different (older) role model where roles live in `guild.json` with a `tools` array and `instructions` file path. This appears to be pre-Loom documentation describing a legacy system. The current system uses `loom.roles` with permission grants, not tool name lists. Major discrepancy — the kit-components doc's role section is fully stale and describes a different architecture.

---

## Key Open Questions (for Analyst)

1. **Wildcard permissions (`*:*`, `*:level`) from kit roles:** The brief says "permissions referencing undeclared plugins produce a startup warning and are dropped." Does the `*` plugin wildcard count as "referencing an undeclared plugin"? `*:*` is a superuser grant — allowing a kit to grant it would let a kit give a role access to all tools from all plugins. This is likely too permissive.

2. **`guild().apparatuses()` scan at Loom startup:** The established pattern scans only `guild().kits()` in the startup loop and catches apparatus supportKits via `plugin:initialized`. Since the Loom `requires: ['tools']`, it starts after the Instrumentarium. If any apparatus that starts before the Loom has a supportKit with `roles`, those would only be caught via `plugin:initialized`. The current pattern (kits scan + plugin:initialized) is sufficient for this use case since `plugin:initialized` fires for every apparatus after it starts, including those that started before the Loom subscribed.

   Wait — actually, re-reading arbor.ts:
   ```typescript
   // Start each apparatus in dependency order
   const startupCtx = buildStartupContext(eventHandlers);
   for (const app of orderedApparatuses) {
     await app.apparatus.start(startupCtx);  // eventHandlers is shared
     await fireEvent(eventHandlers, 'plugin:initialized', app);
   }
   ```
   The `buildStartupContext(eventHandlers)` creates a shared context. When the Loom's `start()` calls `ctx.on('plugin:initialized', handler)`, the handler is added to `eventHandlers`. Subsequently, when apparatus that start AFTER the Loom fire `plugin:initialized`, the Loom's handler runs. But apparatus that fired `plugin:initialized` BEFORE the Loom subscribed will NOT be captured. This means the Loom may need to also scan `guild().apparatuses()` for already-started apparatus supportKits, just as it scans `guild().kits()`. The Instrumentarium doesn't need to do this because it starts first (nothing depends on it, and it has no `requires`). But the Loom `requires: ['tools']` so the Instrumentarium already started and fired `plugin:initialized` before the Loom subscribed.
   
   For kit-contributed roles, the concern is: any apparatus that starts before the Loom and has a `supportKit.roles`. Since the Loom starts after the Instrumentarium (tools), any apparatus that starts even earlier (stacks has no requires that include loom) could have supportKit roles that are missed. The Loom should also scan `guild().apparatuses()` in its startup loop to catch supportKits from already-started apparatus.

3. **Role name collision:** If two kits both define a role with the same short name (e.g., both define `artificer`), they become `kit-a.artificer` and `kit-b.artificer` — no collision. The namespacing prevents this. But if a kit defines `kit-a.artificer` explicitly as the key in its `roles` field (already qualified), what happens? The brief says kit authors only specify short names, so this shouldn't occur, but a malformed kit could try it.

---

## Summary: New Code Needed

### New type: `KitRoleDefinition`
```typescript
// Proposed shape (for analyst review)
export interface KitRoleDefinition {
  permissions: string[];
  strict?: boolean;
  instructions?: string;         // inline text
  instructionsFile?: string;     // relative to kit's npm package dir
}
```

### New type (for kit authors): exported interface for type safety
```typescript
export interface LoomKit {
  roles?: Record<string, KitRoleDefinition>;
}
```

### Modified `LoomConfig` (if kit-contributed definitions need to be merged)
Not needed — kit contributions are stored in a separate internal registry, not merged into `config`. Guild config takes precedence by checking `config.roles[qualifiedName]` before registering a kit role.

### New internal state in `createLoom()`
```typescript
// Maps qualified role name → role definition
// Populated from kit contributions at startup (after guild config check)
let kitRoles: Map<string, RoleDefinition> = new Map();
```

### Modified `Apparatus` declaration
```typescript
apparatus: {
  requires: ['tools'],
  consumes: ['roles'],    // ← new
  provides: api,
  start(ctx: StartupContext): void { … }
}
```

### Modified `start()` logic
1. Read guild config (existing)
2. Read charter (existing)
3. Scan `guild().kits()` for kit roles → qualify + scope-check → add to `kitRoles` if no guild override
4. Scan `guild().apparatuses()` for supportKit roles → same treatment
5. Subscribe to `plugin:initialized` for apparatus supportKits that start after the Loom
6. Read role instruction files for guild roles (existing)
7. For kit roles: read instructions/instructionsFile at scan time (cache in `roleInstructions` under qualified name)

### Modified `weave()` logic
1. Look up `request.role` in `config.roles` first (guild-defined)
2. If not found, look up in `kitRoles`
3. Rest unchanged
4. Role instructions lookup already works — key is just the full qualified name

---

## File: `packages/plugins/loom/src/index.ts` (current, exact)

```typescript
import { createLoom } from './loom.ts';

export {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  type LoomConfig,
  type RoleDefinition,
  createLoom,
} from './loom.ts';

// GuildConfig augmentation
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    loom?: LoomConfig;
  }
}

export default createLoom();
```

Needs: export `KitRoleDefinition` and `LoomKit` (if defined).
