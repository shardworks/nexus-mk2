# Tool Access Control Redesign & Core Cleanup

## Summary

Three related changes:

1. **Permission-based access control.** Replace `baseTools` + per-tool role lists with a permission model. Roles grant permissions as `plugin:level` strings. Tools declare what permission level they require. The Loom owns role config; the Instrumentarium resolves permissions to tool sets.

2. **Move all tool concepts out of core.** `tool()`, `ToolDefinition`, `ToolCaller`, `isToolDefinition()` move to `@shardworks/tools-apparatus`. Core becomes fully tool-agnostic.

3. **Simplify plugin commands.** `plugin-install` and `plugin-remove` become pure npm + guild.json operations. No tool discovery at install time.

## Motivation

### Core should not know about tools

Core exports `tool()`, `ToolDefinition`, `isToolDefinition()`, `resolveToolFromExport()`, `resolveAllToolsFromExport()`, and `discoverPluginTools()`. Tools are one contribution type among many (tools, engines, relays, books). Core should provide the plugin model and the guild singleton — not SDK for any single contribution type.

### `baseTools` and install-time discovery are unnecessary

With permission-based access, tools are available by default or gated by permission. No install-time discovery needed — `plugin-install` just registers the plugin id.

### Tool-to-role mappings are duplicated

Tool access config appears in two places: `GuildConfig.baseTools` / `GuildConfig.roles[x].tools` and `InstrumentariumConfig.baseTools` / `InstrumentariumConfig.roles`. Neither is the right model.

## Design

### Permission model

**Roles** (owned by the Loom) declare a `permissions` array — grants in `plugin:level` format:

```json
{
  "loom": {
    "roles": {
      "artificer": {
        "instructions": "roles/artificer.md",
        "permissions": ["nexus-stdlib:*", "clockworks:write", "clockworks:read"]
      },
      "auditor": {
        "instructions": "roles/auditor.md",
        "permissions": ["nexus-stdlib:read", "clockworks:read"],
        "strict": true
      }
    }
  }
}
```

**Tools** declare what permission level they require (optional):

```typescript
tool({
  name: 'create-writ',
  description: 'Create a new writ',
  permission: 'write',
  params: { ... },
  handler: async (params) => { ... },
})

tool({
  name: 'list-writs',
  description: 'List writs',
  permission: 'read',
  params: { ... },
  handler: async (params) => { ... },
})

// No permission declared — universal by default, excluded under strict
tool({
  name: 'signal',
  description: 'Emit a custom event',
  params: { ... },
  handler: async (params) => { ... },
})
```

Permission level names are freeform strings chosen by the tool author. Conventional names:

| Convention | Typical meaning |
|------------|----------------|
| `read` | Query/inspect operations |
| `write` | Create/update operations |
| `delete` | Destructive operations |
| `admin` | Configuration and lifecycle operations |

Plugins are free to define their own: a git plugin might use `merge`, a clockworks plugin might use `emit`. The framework does not enforce a vocabulary.

### Permission matching

A tool from plugin `P` with `permission: 'write'` is included when any grant matches:

| Grant | Match? | Reason |
|-------|--------|--------|
| `P:write` | ✅ | Exact plugin + level |
| `P:*` | ✅ | Wildcard — all levels for this plugin |
| `*:write` | ✅ | All plugins, this level |
| `*:*` | ✅ | Superuser — everything |
| `P:read` | ❌ | Wrong level |
| `other:*` | ❌ | Wrong plugin |

No hierarchy — `write` does not imply `read`. Grant both explicitly, or use `plugin:*`.

### Permissionless tools and `strict` mode

Gating serves two functions: (1) access control — preventing unauthorized operations, and (2) context management — minimizing unnecessary tools in anima sessions to save tokens. If tool authors are lazy and never declare permissions, guild operators need a way to manage context cost. The `strict` flag provides this.

**Default mode** (`strict` absent or `false`): permissionless tools are included unconditionally. This is the "install and go" experience — install a plugin, all its tools work immediately.

**Strict mode** (`strict: true` on the role): permissionless tools are excluded unless the role grants `plugin:*` or `*:*` for the tool's plugin. This lets mature guilds lock down context and only include tools that are explicitly permitted.

**Matching rules for permissionless tools:**

| Tool has permission? | Role strict? | Grant matches? | Included? |
|---------------------|-------------|----------------|-----------|
| Yes | Either | Yes | ✅ |
| Yes | Either | No | ❌ |
| No | `false` (default) | — | ✅ Always |
| No | `true` | `plugin:*` or `*:*` | ✅ |
| No | `true` | Anything else / none | ❌ |

`plugin:*` does double duty in strict mode: matches all permission levels AND opts in to permissionless tools from that plugin.

### Resolve algorithm

```
resolve({ permissions, strict, channel }):
  1. Parse each grant into (plugin, level) pairs
  2. For each registered tool:
     a. If tool has no permission:
        - If NOT strict → include
        - If strict → include only if grants contain <tool's plugin>:* or *:*
     b. If tool has a permission:
        - Match against grants: exact, plugin wildcard, level wildcard, or superuser
        - Include if any grant matches
  3. Filter by channel (callableFrom)
```

### Resolution flow at session time

1. The Loom is composing a session for an anima with roles `[artificer, auditor]`
2. The Loom unions the permissions across all roles: `["nexus-stdlib:*", "clockworks:write", "clockworks:read", "nexus-stdlib:read"]`
3. Strict is `true` if ANY of the anima's roles declares `strict: true`
4. The Loom calls `instrumentarium.resolve({ permissions, strict, channel: 'mcp' })`
5. The Instrumentarium evaluates each registered tool and returns the matching set
6. The Loom weaves the tool set into the session context

### CLI behavior

The CLI calls `instrumentarium.list()` — returns all tools, no permission filtering. The CLI is the patron's interface, not an anima's. Patrons aren't permission-gated.

### Ownership summary

| Concern | Owner |
|---------|-------|
| "What tools exist?" | Instrumentarium (tool registry) |
| "What permission does a tool require?" | Tool author (via `permission` on the definition) |
| "What roles exist and what do they grant?" | Loom (role config in `guild.json["loom"]`) |
| "Given these permissions, which tools match?" | Instrumentarium (permission resolver) |
| "What goes into this anima's session?" | Loom (composition orchestrator) |
| Tool authoring SDK (`tool()`, `ToolDefinition`) | `@shardworks/tools-apparatus` package |

### guild.json changes

**Before:**
```json
{
  "name": "my-guild",
  "nexus": "0.1.x",
  "plugins": ["nexus-stdlib", "tools"],
  "baseTools": ["commission-show", "signal", "writ-list"],
  "roles": {
    "artificer": {
      "seats": null,
      "tools": ["complete-session"],
      "instructions": "roles/artificer.md"
    }
  },
  "tools": {
    "baseTools": ["commission-show", "signal"],
    "roles": {
      "artificer": ["complete-session"]
    }
  }
}
```

**After:**
```json
{
  "name": "my-guild",
  "nexus": "0.1.x",
  "plugins": ["nexus-stdlib", "tools", "loom"],
  "loom": {
    "roles": {
      "artificer": {
        "instructions": "roles/artificer.md",
        "permissions": ["nexus-stdlib:*", "clockworks:*"]
      }
    }
  }
}
```

Changes:
- Top-level `baseTools` **removed**
- Top-level `roles` **removed** — role definitions move to `loom` plugin config
- `tools` plugin config section **removed** — no Instrumentarium config needed
- `loom.roles` is the canonical role registry, owned by the Loom

### Instrumentarium API change

**Before:**
```typescript
resolve(options: { roles: string[]; channel?: ToolCaller }): ResolvedTool[]
```

**After:**
```typescript
resolve(options: {
  permissions: string[];
  strict?: boolean;
  channel?: ToolCaller;
}): ResolvedTool[]
```

The Instrumentarium no longer knows about roles. It receives an already-resolved permissions array from the Loom.

### Validation (future state)

Not part of this commission. Document as a future enhancement in the Loom architecture doc:

- **Unknown plugin names:** At resolve time, the Instrumentarium knows all registered plugin ids. Permissions referencing unknown plugins can generate warnings. Could suggest close matches for likely typos.
- **Unknown permission levels:** The Instrumentarium can infer the valid permission vocabulary per plugin from the `permission` fields on its registered tools. Grants referencing levels that no tool in the plugin declares can generate warnings. Zero-config — no explicit vocabulary declaration needed from plugin authors.

### `ToolDefinition` changes

```typescript
interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly params: z.ZodObject<any>;
  readonly handler: (params: any) => unknown | Promise<unknown>;
  readonly callableFrom?: ToolCaller[];
  readonly instructions?: string;
  readonly instructionsFile?: string;
  /** Permission level required to invoke this tool. Matched against role grants. */
  readonly permission?: string;  // NEW
}
```

## What moves where

### Out of `@shardworks/nexus-core`

| Export | Destination | Reason |
|--------|-------------|--------|
| `tool()` | `@shardworks/tools-apparatus` | Tool authoring SDK belongs with the tool registry |
| `ToolDefinition` | `@shardworks/tools-apparatus` | Type follows the factory |
| `ToolCaller` | `@shardworks/tools-apparatus` | Type follows the factory |
| `isToolDefinition()` | `@shardworks/tools-apparatus` | Type guard follows the type |
| `resolveToolFromExport()` | `claude-code-session-provider` | Only consumer; inlined next to `loadTool()` |
| `resolveAllToolsFromExport()` | **Deleted** | Not needed — Instrumentarium has its own `registerToolsFromKit`; no legacy shapes |
| `discoverPluginTools()` | **Deleted** | No install-time discovery needed |
| `GuildConfig.baseTools` | **Deleted** | Replaced by permission model |
| `RoleDefinition` | **Deleted** | Roles move to Loom config; core has no role type |
| `GuildConfig.roles` | **Deleted** | Roles are Loom-owned plugin config, not framework-level |

### Import changes for plugin authors (stdlib, etc.)

**Before:**
```typescript
import { tool, guild } from '@shardworks/nexus-core';
```

**After:**
```typescript
import { tool } from '@shardworks/tools-apparatus';
import { guild } from '@shardworks/nexus-core';
```

### Import changes for CLI framework commands

**Before:**
```typescript
import { tool, VERSION, readGuildConfig, guild } from '@shardworks/nexus-core';
```

**After:**
```typescript
import { tool } from '@shardworks/tools-apparatus';
import { VERSION, readGuildConfig, guild } from '@shardworks/nexus-core';
```

### Arbor: no legacy export handling

Arbor only loads `kit` and `apparatus` exports. Unrecognized exports produce a warning and are skipped. No legacy format support in new code.

```typescript
if (isApparatus(raw)) {
  apparatuses.push({ ... });
} else if (isKit(raw)) {
  kits.push({ ... });
} else {
  console.warn(`[arbor] Plugin "${packageName}" has unrecognized export shape — skipping. ` +
    `Plugins must export { kit: ... } or { apparatus: ... }.`);
}
```

### `plugin-install` simplified

```typescript
handler: async (params) => {
  const { home } = guild();
  const { source } = params;
  const installType = params.type ?? 'registry';

  let packageName: string;
  if (installType === 'link') {
    // resolve local dir, npm install --save file:...
  } else {
    npm(['install', '--save', source], home);
    packageName = parsePackageName(source) ?? detectInstalledPackage(home);
  }

  const pluginId = derivePluginId(packageName);
  const config = readGuildConfig(home);
  if (!config.plugins.includes(pluginId)) {
    config.plugins.push(pluginId);
  }
  writeGuildConfig(home, config);

  return `Installed plugin: ${pluginId} (${packageName})`;
}
```

No tool discovery. No `--roles` flag. No access control writes.

### `plugin-remove` simplified

```typescript
handler: async (params) => {
  const { home } = guild();
  const config = readGuildConfig(home);
  const targetId = params.name.startsWith('@')
    ? derivePluginId(params.name) : params.name;

  if (!config.plugins.includes(targetId)) {
    throw new Error(`Plugin "${targetId}" is not installed.`);
  }

  config.plugins = config.plugins.filter(id => id !== targetId);
  writeGuildConfig(home, config);

  const packageName = resolvePackageNameForPluginId(home, targetId);
  if (packageName) {
    try { npm(['uninstall', packageName], home); } catch { /* ok */ }
  }

  return `Removed plugin: ${targetId}`;
}
```

Stale permission grants referencing removed plugins are harmless — the Instrumentarium ignores grants for unknown plugins (future validation can warn about these).

## File-by-file change list

### Core (`@shardworks/nexus-core`)

| File | Change |
|------|--------|
| `core/src/tool.ts` | **Delete entire file** |
| `core/src/resolve-package.ts` | Delete `discoverPluginTools()`. Remove `resolveAllToolsFromExport` and `ToolDefinition` imports. |
| `core/src/guild-config.ts` | Remove `baseTools` field. Remove `RoleDefinition` type. Remove `roles` field. Remove `baseTools: []` and `roles: {}` from `createInitialGuildConfig()`. |
| `core/src/index.ts` | Remove all tool exports. Remove `RoleDefinition` export. |
| `core/src/legacy/1/tool.ts` | Stops re-exporting from `../../tool.ts`. Legacy code keeps its own copy or imports from tools-apparatus. |

### Tools Apparatus (`@shardworks/tools-apparatus`)

| File | Change |
|------|--------|
| `tools-apparatus/src/tool.ts` | **New file** — moved from core. Contains `tool()`, `ToolDefinition` (with new `permission` field), `ToolCaller`, `isToolDefinition()`. No resolve/discovery helpers. |
| `tools-apparatus/src/instrumentarium.ts` | Remove `InstrumentariumConfig` type. Remove `baseTools` logic. Rewrite `resolve()`: accepts `{ permissions, strict?, channel? }`, implements permission matching against tool `permission` and plugin provenance. Import `isToolDefinition` from local `./tool.ts`. |
| `tools-apparatus/src/instrumentarium.test.ts` | Rewrite resolve tests for permission model: exact match, plugin wildcard, level wildcard, superuser, permissionless in default mode, permissionless in strict mode, strict + `plugin:*` includes permissionless, channel filtering with permissions. |
| `tools-apparatus/src/index.ts` | Export `tool`, `ToolDefinition`, `ToolCaller`, `isToolDefinition` from `./tool.ts` (direct, not re-exported from core). Remove `InstrumentariumConfig` export. |

### CLI (`@shardworks/nexus`)

| File | Change |
|------|--------|
| `cli/src/commands/plugin.ts` | Remove tool discovery from install/remove. Remove `--roles` param from install. Simplify handlers to npm + guild.json. Import `tool` from tools-apparatus. |
| `cli/src/commands/plugin.test.ts` | Remove baseTools/role assertions from install. Simplify remove assertions. |
| `cli/src/commands/init.ts` | Import `tool` from `@shardworks/tools-apparatus`. Remove from core import. |
| `cli/src/commands/status.ts` | Import `tool` from `@shardworks/tools-apparatus`. Remove from core import. |
| `cli/src/commands/version.ts` | Import `tool` from `@shardworks/tools-apparatus`. Remove from core import. |
| `cli/src/commands/upgrade.ts` | Import `tool` from `@shardworks/tools-apparatus`. Remove from core import. |
| `cli/src/commands/index.ts` | Import `ToolDefinition` from `@shardworks/tools-apparatus`. |
| `cli/src/program.ts` | Import `ToolDefinition` from `@shardworks/tools-apparatus`. |

### Arbor (`@shardworks/nexus-arbor`)

| File | Change |
|------|--------|
| `arbor/src/arbor.ts` | Remove `resolveAllToolsFromExport` import. Replace legacy export wrapping with warning + skip. |
| `arbor/src/arbor.test.ts` | Remove/update legacy export tests. Remove baseTools assertions. |

### MCP Server (`claude-code-session-provider`)

| File | Change |
|------|--------|
| `claude-code-session-provider/src/mcp-server.ts` | Inline `resolveToolFromExport()` next to `loadTool()`. Import `ToolDefinition` from `@shardworks/tools-apparatus`. |

### Stdlib (`@shardworks/nexus-stdlib`)

| File | Change |
|------|--------|
| All ~35 tool files in `stdlib/src/tools/` | Split import: `tool` from `@shardworks/tools-apparatus`, `guild` from `@shardworks/nexus-core`. Optionally add `permission` field — can be a follow-up commission. |

### Documentation

| File | Change |
|------|--------|
| `docs/architecture/apparatus/instrumentarium.md` | **Major rewrite.** Tool Definition Contract: update imports to `@shardworks/tools-apparatus`, document `permission` field. Configuration section: remove `baseTools` and `InstrumentariumConfig`, explain that the Instrumentarium receives permissions from the Loom and is role-agnostic. Role-Gating Resolution: replace with permission matching algorithm. Remove "tool() location during transition" note (transition complete). |
| `docs/architecture/apparatus/loom.md` | **Add role ownership section.** The Loom owns role definitions in `guild.json["loom"].roles`. Document `permissions` grant format (`plugin:level`), wildcard matching (`plugin:*`, `*:level`, `*:*`). Document `strict` mode — what it does, why it exists (context management + access control). Add **Future State** note on validation: unknown plugin names, unknown permission levels inferred from registered tools. |
| `docs/architecture/index.md` | **guild.json section:** remove `baseTools` and `roles` from framework keys. Note that role definitions live in Loom plugin config. **Kit Components > Tools > Role gating:** rewrite to describe permission model. **Installation section:** simplify `nsg install`/`nsg remove` (no tool discovery). **Arbor section:** note unrecognized exports warned+skipped. |
| `packages/cli/README.md` | **Plugin Management:** simplify plugin-install/remove descriptions. Remove `--roles` flag. Remove "Tools are added to `baseTools`" paragraph. |
| `packages/tools-apparatus/README.md` | **Top of file:** `tool()` now lives here canonically. **API section:** update `ResolveOptions` to show `permissions`/`strict` instead of `roles`. Update usage examples. **Configuration section:** remove `baseTools`/`InstrumentariumConfig`, explain permission-based resolution. **Exports section:** show direct exports. |
| `packages/arbor/README.md` | **Plugin Lifecycle > Load:** note unrecognized exports produce a warning. Remove legacy format mention. |
| `packages/core/README.md` | **Major rewrite.** Remove `tool()`, `ToolDefinition`, `ToolCaller`, resolution helpers, `Rig`/`RigContext` (legacy). Remove `baseTools`/`RoleDefinition` from guild-config section. Focus on: plugin model, guild singleton, guild config, path resolution, session provider registry. |
| `docs/guides/building-tools.md` | Update imports to `@shardworks/tools-apparatus`. Document `permission` field. Update role-gating explanation to permission model. |
| `docs/reference/schema.md` | Remove `baseTools` and `roles` from guild.json schema. Add `loom.roles` with permissions/strict. |
| `docs/reference/core-api.md` | Remove tool-related entries. Note tool SDK moved to `@shardworks/tools-apparatus`. |

## Migration

- **Existing `baseTools`:** becomes unread. Harmless. Future `nsg upgrade` can strip it.
- **Existing top-level `roles`:** becomes unread. Roles must be re-declared in `loom.roles` with permissions.
- **Existing `tools` plugin config section:** becomes unread.
- **Plugin authors importing `tool` from core:** must update to `@shardworks/tools-apparatus`. Breaking change — coordinate with version bump.
- **Adding `permission` to existing tools:** recommended but not required for this commission. Tools without `permission` work in default (non-strict) mode. Adding permissions to stdlib tools can be a follow-up.

## Test plan

- [ ] `plugin-install` adds plugin id to `plugins[]` — no tool discovery, no role writes
- [ ] `plugin-remove` removes plugin id from `plugins[]` — no tool scanning
- [ ] Permission matching: exact `plugin:level`
- [ ] Permission matching: `plugin:*` wildcard matches any level
- [ ] Permission matching: `*:level` wildcard matches any plugin
- [ ] Permission matching: `*:*` superuser matches everything
- [ ] Permission matching: non-matching grants correctly exclude
- [ ] Default mode: permissionless tools always included
- [ ] Strict mode: permissionless tools excluded
- [ ] Strict mode: `plugin:*` includes permissionless tools from that plugin
- [ ] Strict mode: `*:*` includes all permissionless tools
- [ ] Strict mode: specific `plugin:level` does NOT include permissionless tools
- [ ] `list()` returns all tools regardless of permissions
- [ ] Channel filtering works alongside permission filtering
- [ ] CLI tool discovery still works (uses `list()`, no permissions)
- [ ] `nsg init` produces guild.json without `baseTools` or `roles`
- [ ] Arbor warns and skips unrecognized plugin exports
- [ ] `tool()` importable from `@shardworks/tools-apparatus`
- [ ] `isToolDefinition()` importable from `@shardworks/tools-apparatus`
- [ ] MCP server loads tools without importing from core
- [ ] Core exports zero tool-related symbols
- [ ] `permission` field on ToolDefinition is optional (backward compat)
