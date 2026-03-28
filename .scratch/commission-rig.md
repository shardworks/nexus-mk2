# Commission: Rig — Plugin Host Infrastructure (North Star)

> **Note:** This is the north star document. Do not commission this directly. The incremental commissions building toward this are:
> 1. `commission-rig-cli.md` — new nsg entry point, allowedContexts, rig package with `createRig()` / `Rig` object
> 2. `commission-rig-plugin-install.md` — nsg plugin install/remove, nexus-plugin.json, migrations
> 3. `commission-rig-db.md` — BooksDatabase interface, URL-based adapter, handler context injection
> 4. `commission-patron-assessment.md` — Assessment as the first real plugin (depends on all three)

Redesign the Nexus framework around a first-class plugin model. All installable capabilities (tools, engines, curricula, temperaments, session providers) become plugins described by a single `nexus-plugin.json` descriptor. A new `rig` package houses the guild machinery; `core` is slimmed to a clean public SDK for plugin authors.

## Motivation

The current framework has a proliferation of descriptor types (`nexus-tool.json`, `nexus-engine.json`, `nexus-curriculum.json`, `nexus-temperament.json`) added incrementally, each with its own install path. There is no concept of schema ownership — plugins cannot carry their own migrations. And `core` conflates public plugin-author API with internal guild machinery, making the boundary unclear.

This architecture establishes the correct model: a minimal `rig` package that hosts plugins, a clean `core` SDK that plugin authors depend on, and a single `nexus-plugin.json` descriptor that covers all contribution types — including migrations. Everything else is a plugin.

## Package: `packages/rig` (`@shardworks/nexus-rig`)

The guild machinery — never imported by plugin authors, used internally by the CLI and framework.

The primary entry point is `createRig(guildRoot)`, which returns a stateful `Rig` object. The Rig is the runtime carrier for the guild — callers create one at startup, hold it for the process lifetime, and use it to access plugins, tools, config, and (eventually) database connections.

```typescript
const rig = createRig(guildRoot);             // sync — reads guild.json once
const tools = await rig.listTools({ channel: 'cli' });
const db    = await rig.getDatabase();        // future: BooksDatabase
```

`rig` is responsible for:
- Guild lifecycle: `nsg init`, guild root discovery (walk up from cwd for `guild.json`)
- Plugin registry: `nsg plugin install`, `nsg plugin remove`
- Plugin manifest generation: writes `nexus/plugin-manifest.json`
- Migration runner: discovers and applies plugin migrations from the manifest
- `guild.json` read/write
- `BooksDatabase` adapter: reads the `database` URL from `guild.json`, constructs the appropriate driver implementation, injects it into handler contexts via the `Rig` object

Inter-plugin API: plugins that expose an API to other plugins export a typed `fromRig(rig: Rig)` factory. Callers import the plugin package and call `fromRig(rig)` to get a typed, initialized reference.

`rig` depends on `core` for shared types.

## Package: `packages/core` (`@shardworks/nexus-core`) — slimmed

Move all internal guild machinery out of `core` into `rig`. After this work, `core` contains only what a plugin author needs:

- `tool()` factory
- TypeScript types: `ToolDefinition`, `ToolHandler`, `HandlerContext`
- `BooksDatabase` interface and `SqlResult` type
- Zod re-export
- `PluginDescriptor` type (mirrors `nexus-plugin.json` schema)

`core` has no database dependency, no filesystem path resolution, no install logic. Plugin authors import from `core`; they never import from `rig`.

## `BooksDatabase` — Database Interface

Defined in `core`. URL-based — the adapter (SQLite, PostgreSQL, etc.) is selected by `rig` at runtime based on the `database` field in `guild.json`. Plugin authors program against the interface; they never know which adapter is running.

```typescript
// In core
interface BooksDatabase {
  execute(sql: string, args?: unknown[]): Promise<SqlResult>
  // transaction() — future addition
}

interface SqlResult {
  rows: Record<string, unknown>[]
  rowsAffected: number
  lastInsertRowid?: number | bigint
}
```

The handler context:

```typescript
interface HandlerContext {
  home: string           // guild root path
  booksDatabase: BooksDatabase
}
```

Plugin authors use it as:

```typescript
import { tool } from '@shardworks/nexus-core'

export default tool({
  params: { writId: z.string() },
  handler: async ({ writId }, { booksDatabase }) => {
    const result = await booksDatabase.execute(
      'SELECT * FROM assessments WHERE writ_id = ?',
      [writId]
    )
    return result.rows
  }
})
```

## `guild.json` — Database URL

`guild.json` gains a `database` field. Defaults to `file:.nexus/nexus.db` if absent (SQLite, current behavior). Future guilds can point at other databases via URL.

```json
{
  "database": "file:.nexus/nexus.db"
}
```

`rig` reads this at startup and creates the appropriate `BooksDatabase` implementation. Current implementation: `better-sqlite3` wrapped in resolved promises. Future: libsql, pg, or other adapters keyed to URL scheme.

## `nexus-plugin.json` — Universal Descriptor

Single descriptor format for all installable artifacts. Replaces `nexus-tool.json`, `nexus-engine.json`, `nexus-curriculum.json`, `nexus-temperament.json`.

```json
{
  "version": "1.0.0",
  "description": "Human-readable description",
  "migrations": "migrations/",
  "tools": [
    { "name": "assess-writ", "entry": "index.js", "instructions": "instructions.md" }
  ],
  "engines": [
    { "name": "manifest", "entry": "engine.js" }
  ],
  "curricula": [
    { "name": "artificer-craft", "entry": "curriculum.md" }
  ],
  "temperaments": [
    { "name": "candid", "entry": "temperament.md" }
  ],
  "sessionProviders": [
    { "name": "claude-code", "entry": "provider.js" }
  ],
  "dependencies": {
    "nexus-ledger": ">=1.0.0"
  }
}
```

All fields except `version` are optional. Directory name (derived from npm package name) is the plugin's identity — no `name` field.

## `guild.json` — Clean Human-Facing Format

```json
{
  "nexusVersion": "0.2.0",
  "defaultModel": "claude-sonnet-4-5",
  "database": "file:.nexus/nexus.db",
  "workshops": [
    { "name": "nexus", "url": "..." }
  ],
  "standingOrders": [
    { "on": "writ.ready", "run": "summon", "role": "artificer" }
  ],
  "plugins": [
    "nexus-register",
    "nexus-ledger",
    "nexus-clockworks",
    "nexus-manifest",
    "claude-code"
  ],
  "roles": {
    "artificer": {
      "seats": null,
      "tools": ["show-writ", "create-writ", "complete-session", "fail-writ", "signal"],
      "instructions": "roles/artificer.md"
    }
  }
}
```

Plugin version resolved from `node_modules` at manifest generation time — not stored in `guild.json`. Existing `tools`, `engines`, `curricula`, `temperaments` top-level sections are retired; operational detail lives in `nexus/plugin-manifest.json`.

## `nexus/plugin-manifest.json` — Generated Operational Index

Generated by `rig` on `plugin install`/`plugin remove`, and lazily regenerated whenever `guild.json` is newer than the manifest. Committed to the guild repo. Never hand-edited.

```json
{
  "generated": "2026-03-27T12:00:00Z",
  "plugins": {
    "nexus-ledger": {
      "package": "@shardworks/nexus-ledger",
      "version": "1.0.0",
      "tools": {
        "show-writ": {
          "entry": "node_modules/@shardworks/nexus-ledger/tools/show-writ/index.js",
          "instructions": "node_modules/@shardworks/nexus-ledger/tools/show-writ/instructions.md"
        }
      },
      "engines": {},
      "migrations": "nexus/migrations/nexus-ledger/"
    }
  }
}
```

The manifest engine, MCP server, and `ledger-migrate` all read from this file.

## `nsg plugin install` / `nsg plugin remove`

Replace `nsg tool install` / `nsg tool remove`.

**Install flow:**
1. Install npm package (registry, git-url, workshop, tarball, or link)
2. Find and validate `nexus-plugin.json`
3. Check declared dependencies are present in `guild.json` plugins; fail clearly if not
4. Add plugin name to `guild.json` plugins array
5. Regenerate `nexus/plugin-manifest.json`
6. Copy plugin migrations to `nexus/migrations/<plugin-name>/`
7. Run `ledger-migrate`
8. Commit

**Remove flow:** Reverse of install. Applied migrations are not rolled back.

## Migration Discovery

`ledger-migrate` reads `nexus/plugin-manifest.json` for all plugin migration paths. Migrations namespaced by plugin name. Framework-owned migrations in `nexus/migrations/` remain; extracted into plugins over time.

## CLI and Rig — Separate Packages

`packages/cli` and `packages/rig` remain separate packages with a clean boundary. Commander.js, argument parsing, help text, and exit code handling are CLI concerns — they do not belong in rig.

The boundary is an API surface. `rig` exposes a function that returns resolved command definitions; `cli` maps those onto Commander. Neither imports the other's domain:

```typescript
// rig exposes — no Commander dependency
const rig = createRig(guildRoot)
const tools = await rig.listTools({ channel: 'cli' })   // NexusTool[]

// cli consumes — no manifest or plugin-loading logic
tools.forEach(tool => registerAsCommand(program, tool))
```

`rig` reads `nexus/plugin-manifest.json`, dynamically imports plugin handlers, and returns `NexusTool[]` (a `rig` type extending `ToolDefinition` from `core`). `cli` maps those definitions to Commander commands using auto-generated option schemas (from the Zod params). Plugins add themselves to the CLI simply by being installed — rig discovers them; cli registers them.

Package dependency graph:

```
core     — public SDK, types, tool() factory, BooksDatabase interface
rig      — plugin host, manifest, migrations, resolveGuildCommands()
cli      — nsg binary, Commander.js, maps ToolDefinition[] → commands
plugins  — import from core only
```

In v1, this is not yet implemented. Plugin install uses the existing tool install path as a side effect, which handles CLI registration through the current mechanism. The dynamic manifest-driven loader is introduced when the old `tools` section is retired from `guild.json`.

## Starter Kit

Updated to be a plugin itself — its `nexus-plugin.json` declares which plugins constitute a standard guild setup. `nsg init` installs the starter kit; the starter kit installs everything else.

## Convert Existing Artifacts

All existing packages in the monorepo converted to `nexus-plugin.json`. Legacy descriptor types removed. Guild recreated from scratch — no migration script required.
