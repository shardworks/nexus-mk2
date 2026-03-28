# Commission: Rig v1 — New CLI Entry Point

Establish the new `nsg` CLI entry point in `packages/cli`, built on the rig architecture. The existing CLI moves to `nsg1` and `src/v1/` as a preserved fallback. The new `nsg` starts fresh: it creates a `Rig` instance, lists installed tools filtered by `allowedContexts`, and delegates argument parsing to Commander. A new `packages/rig` package is created to house the guild runtime that the new CLI depends on.

See `commission-rig.md` for the full north star this is building toward.

## Motivation

The current `nsg` CLI is statically built from `nexus-stdlib` — all tools baked in at import time, no concept of which tools are for humans vs. animas. The new entry point is a dynamic loader: it discovers installed tools at runtime and routes them correctly. This is the foundation that plugin install, DB access, and Assessment all build on.

## Restructure `packages/cli`

Move all existing `src/` content into `src/v1/`. Update `package.json` bin entries:

```json
{
  "bin": {
    "nsg":  "dist/cli.js",
    "nsg1": "dist/v1/cli.js"
  }
}
```

`nsg1` is the existing CLI, fully preserved and functional. `nsg` is the new entry point, built in this commission. The guild continues to use `nsg1` for anything not yet migrated. Over time, `nsg1` is retired as commands migrate to `nsg`.

`src/v1/` should not be modified in this commission beyond what is necessary to make `nsg1` work as a standalone entry point. The goal is preservation, not improvement.

## New Package: `packages/rig` (`@shardworks/nexus-rig`)

Create the `rig` package. Minimal at this stage — just what the new CLI needs.

The primary entry point is `createRig(guildRoot)`, which returns a `Rig` object. Guild root discovery (`findGuildRoot`) is re-exported from core for convenience.

```typescript
// Creating a rig instance — sync, reads guild.json once
const rig = createRig(guildRoot);

// Plugin access
const plugins = await rig.listPlugins();           // NexusPlugin[]
const ledger  = await rig.findPlugin('nexus-ledger'); // NexusPlugin | null

// Tool access with optional filtering
const cliTools = await rig.listTools({ channel: 'cli' });
const mcpTools = await rig.listTools({ channel: 'mcp', roles: ['artificer'] });
const tool     = await rig.findTool('show-writ');  // NexusTool | null

// Config access
const config       = rig.getGuildConfig();
const pluginConfig = rig.getPluginConfig('nexus-ledger');
```

`createRig()` is synchronous — it reads `guild.json` immediately and returns. Plugin modules are loaded lazily on first call to `listPlugins()` or `listTools()`, then cached for the lifetime of the `Rig` instance.

### Key types

```typescript
interface NexusPlugin {
  packageName: string  // full npm package name, e.g. '@shardworks/nexus-ledger'
  key: string          // derived guild-facing key, e.g. 'nexus-ledger'
  version: string      // resolved from node_modules
  tools: NexusTool[]
}

interface NexusTool extends ToolDefinition {
  pluginName: string  // full npm package name of the owning plugin
}

interface ListToolsOptions {
  channel?: ToolChannel           // 'cli' | 'mcp' — filters by allowedContexts
  roles?: string[]                // filters to tools accessible to these roles
}
```

### Plugin key derivation

`derivePluginKey(packageName)` is exported from `@shardworks/nexus-rig`:

```
@shardworks/nexus-ledger  →  nexus-ledger   (official scope stripped)
@acme/my-plugin           →  acme/my-plugin (third-party: drop @ only)
my-plugin                 →  my-plugin      (unscoped: unchanged)
```

The `@shardworks` scope is the official Nexus namespace — its plugins use bare names everywhere. Third-party scoped packages retain their scope as a prefix (without `@`) to prevent collisions. `rig.findPlugin()` and `rig.getPluginConfig()` accept either form.

`rig` depends on `core` for `ToolDefinition`, `ToolChannel`, and related types. It reads from the existing `guild.json` tools section for now — plugin manifest integration comes in a later commission.

### Inter-plugin API convention

Plugin packages that expose an API to other plugins export a typed `fromRig(rig: Rig)` factory:

```typescript
// In nexus-assessments — depends on nexus-ledger
import { fromRig as ledgerApi } from '@shardworks/nexus-ledger';
const ledger = await ledgerApi(rig);
const writs = await ledger.listWrits({ status: 'completed' });
```

This convention is established by the first plugin that needs inter-plugin calls. No framework magic — just typed npm dependencies and a function call.

## `allowedContexts` on `ToolDefinition` in `core`

Add `allowedContexts` to `ToolDefinition` in `@shardworks/nexus-core`:

```typescript
type ToolChannel = 'cli' | 'mcp'

interface ToolDefinition {
  name: string
  description: string
  params: ZodSchema
  handler: ToolHandler
  instructions?: string
  allowedContexts?: ToolChannel[]   // default: all channels
}
```

Defaults to all channels if unspecified — no change to existing tool behavior. The array form allows future channels (`'api'`, `'sdk'`, etc.) to be added without changing the shape. Plugin authors set this in `nexus-plugin.json`; tools defined with the `tool()` factory can also set it directly.

Update the `tool()` factory to accept and pass through `allowedContexts`.

Note: The type is named `ToolChannel` (not `ToolContext`) — `ToolContext` is already taken in core for the handler context `{ home: string }`.

## New `src/cli.ts` / `src/program.ts` — `nsg` Entry Point

The new `nsg` entry point. Uses Commander for argument parsing. Creates a `Rig` instance to discover installed tools at startup and registers them as commands.

Responsibilities:
- Pre-parse `--guild-root` from argv before tool discovery
- Find guild root (via rig's re-exported `findGuildRoot`)
- Create a `Rig` instance via `createRig(home)`
- Call `rig.listTools({ channel: 'cli' })` to get CLI-accessible tools
- Register each tool as a Commander command, auto-generating options from its Zod param schema
- Handle built-in rig commands (`nsg init`, etc.) alongside resolved tool commands in future commissions

Plugin tools appear in `nsg` automatically once installed — no manual registration. `nsg --help` shows only tools that include `'cli'` in their `allowedContexts`.

## MCP Server Update

Update `loadTool()` in the MCP server to filter by `allowedContexts`. After resolving a tool definition, skip it if `allowedContexts` is set and does not include `'mcp'`. Tools with no `allowedContexts` pass through unchanged.

This is a defensive filter at the MCP boundary — tools that explicitly declare `allowedContexts: ['cli']` will not be served via MCP even if they somehow end up in the config.

This is a targeted update — the MCP server's protocol handling, session lifecycle, and tool invocation path are unchanged.

## What This Commission Deliberately Does Not Do

- Does not implement `nsg plugin install` — that is `commission-rig-plugin-install`
- Does not introduce `nexus-plugin.json` — that is `commission-rig-plugin-install`
- Does not add migration support — that is `commission-rig-plugin-install`
- Does not read from `nexus/plugin-manifest.json` — `rig.listTools()` reads from existing `guild.json` tools section for now
- Does not migrate any existing tools to set `allowedContexts` — additive; existing tools work as before, defaulting to all channels
- Does not retire `nsg1` or `src/v1/`
- Does not update the session provider to use `rig.listTools({ channel: 'mcp' })` — that comes in a later commission; for now the MCP server's `loadTool()` filter is the `allowedContexts` enforcement point

## Key Decisions for the Artificer

- `nsg1` must remain fully functional throughout this commission. Do not break the existing CLI.
- `src/v1/` is a preservation zone — copy, don't refactor.
- `packages/rig` is a new package in the monorepo. It is a dependency of `packages/cli`, not the other way around.
- `rig` does not import Commander. Commander lives in `packages/cli` only.
- `allowedContexts` defaults to all channels. Existing tools need no changes to continue working in both contexts.
- `createRig()` is synchronous. Plugin loading is lazy (deferred to first `listTools()` / `listPlugins()` call) and cached on the `Rig` instance.

## Acceptance Criteria

- `nsg1` works identically to the current `nsg` — all existing commands functional
- `nsg` creates a `Rig` instance and registers installed tools as Commander commands
- `nsg --help` lists only tools with `'cli'` in `allowedContexts`
- MCP server's `loadTool()` skips tools where `allowedContexts` is set but excludes `'mcp'`
- `packages/rig` exists with `createRig()`, `Rig` interface, `NexusPlugin`, `NexusTool`, `ListToolsOptions`
- `ToolDefinition` in `core` includes `allowedContexts?: ToolChannel[]`; `tool()` factory passes it through
- A tool with `allowedContexts: ['mcp']` appears in MCP but not in `nsg --help`
- A tool with `allowedContexts: ['cli']` appears in `nsg --help` but is not served via MCP
