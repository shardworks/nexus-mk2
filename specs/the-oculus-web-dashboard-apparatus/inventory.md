# Inventory — The Oculus Web Dashboard Apparatus

## Brief

A new apparatus ("The Oculus") that serves a web dashboard for the guild. Plugins contribute pages as static asset directories. Guild tools are automatically exposed as REST endpoints. Provides shared chrome (navigation) and a base stylesheet. Includes a rename of `ToolCaller`'s `'cli'` value to `'patron'`.

---

## Affected Code: Files

### New files to create

```
packages/plugins/oculus/
  package.json
  tsconfig.json
  src/
    index.ts               — barrel + GuildConfig augmentation + default export
    oculus.ts              — createOculus() apparatus factory
    types.ts               — OculusConfig, OculusApi, PageContribution, RouteContribution, OculusKit
    oculus.test.ts         — tests for route mapping, chrome injection, config scanning
    static/
      style.css            — shared stylesheet (Tokyo Night theme)
      index.html           — Oculus home page (lists registered pages)
```

### Files to modify

```
packages/plugins/tools/src/tool.ts
  — rename ToolCaller: 'cli' → 'patron'

packages/plugins/tools/src/tools/tools-list.ts
  — update caller enum param: ['cli', 'anima', 'library'] → ['patron', 'anima', 'library']

packages/framework/cli/src/program.ts
  — update caller filter: .includes('cli') → .includes('patron')

packages/plugins/tools/src/instrumentarium.test.ts
  — update all 'cli' ToolCaller references in fixtures to 'patron'

packages/plugins/tools/src/tool.test.ts
  — update all 'cli' ToolCaller references in fixtures to 'patron'
```

---

## Affected Code: Types and Interfaces

### Current signatures that change

**`packages/plugins/tools/src/tool.ts`**

```typescript
// CURRENT:
export type ToolCaller = 'cli' | 'anima' | 'library';

// AFTER:
export type ToolCaller = 'patron' | 'anima' | 'library';
```

**`packages/plugins/tools/src/tools/tools-list.ts`** — `caller` param of the `tools-list` tool:

```typescript
// CURRENT:
caller: z
  .enum(['cli', 'anima', 'library'])
  .optional()
  .describe('Filter to tools callable by this caller type.'),

// AFTER:
caller: z
  .enum(['patron', 'anima', 'library'])
  .optional()
  .describe('Filter to tools callable by this caller type.'),
```

**`packages/framework/cli/src/program.ts`** — tool filter in `main()`:

```typescript
// CURRENT (line ~175):
.filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('cli'))

// AFTER:
.filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'))
```

### New types to create

**`packages/plugins/oculus/src/types.ts`**

```typescript
/** A page contributed by a plugin kit or apparatus supportKit. */
export interface PageContribution {
  /** Unique page ID — becomes the URL segment: /pages/{id}/ */
  id: string;
  /** Human-readable title used in navigation. */
  title: string;
  /**
   * Absolute path to the directory containing the page's static assets.
   * Must contain an index.html entry point.
   */
  dir: string;
}

/** A custom route contributed by a plugin kit or apparatus supportKit. */
export interface RouteContribution {
  /** HTTP method (uppercase): 'GET', 'POST', 'DELETE', etc. */
  method: string;
  /** Hono path pattern. Must begin with /api/. e.g. '/api/my/stream' */
  path: string;
  /** Hono handler function. */
  handler: (c: Context) => Response | Promise<Response>;
}

/** Kit contribution interface — consumed by the Oculus. */
export interface OculusKit {
  pages?: PageContribution[];
  routes?: RouteContribution[];
}

/** The Oculus configuration from guild.json under 'oculus'. */
export interface OculusConfig {
  /** Port to listen on. Default: 7470. */
  port?: number;
}

/** The Oculus's public API (minimal — primarily the apparatus is used directly). */
export interface OculusApi {
  /** The port the server is listening on. */
  port(): number;
}
```

---

## Affected Code: Functions

### Current functions that change

**`packages/framework/cli/src/program.ts`** — `main()` (line ~173-177): the tool caller filter changes from `'cli'` to `'patron'`. No signature change, one-line body change.

### New functions to create

**`packages/plugins/oculus/src/oculus.ts`**

- `createOculus(): Plugin` — apparatus factory function
- `toolNameToRoute(name: string): { path: string }` — mechanical transform: `writ-list` → `/api/writ/list`, `signal` → `/api/signal`
- `toolPermissionToMethod(permission?: string): 'GET' | 'POST' | 'DELETE'` — `read` or undefined → `GET`, `write`/`admin` → `POST`, `delete` → `DELETE`
- `injectChrome(html: string, navHtml: string): string` — injects `<link>` in `<head>` and `<nav>` after `<body>`
- `buildNavHtml(pages: PageContribution[]): string` — generates nav HTML for all registered pages
- `coerceQueryParams(shape: ZodShape, query: Record<string, string>): Record<string, unknown>` — string→typed coercion for GET params (mirrors `coerceCliOpts` in cli/helpers.ts)

---

## Existing Test Patterns

### Test file patterns in the codebase

All test files use **Node's built-in test runner** (`node:test`, not Vitest/Jest):

```typescript
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
```

**Guild mocking pattern** (used in instrumentarium.test.ts, loom.test.ts):

```typescript
import { setGuild, clearGuild } from '@shardworks/nexus-core';

afterEach(() => { clearGuild(); });

function wireGuild(opts: { kits?: LoadedKit[]; apparatuses?: LoadedApparatus[]; home?: string }) {
  setGuild({ home: opts.home ?? '/tmp/test-guild', apparatus() {...}, config() {...}, ... } as never);
}
```

**StartupContext mock pattern** (used in instrumentarium.test.ts):

```typescript
function buildTestContext(): { ctx: StartupContext; fire: (event, ...args) => Promise<void> } {
  const handlers = new Map<string, Array<...>>();
  const ctx: StartupContext = {
    on(event, handler) { handlers.get(event)?.push(handler) ?? handlers.set(event, [handler]); }
  };
  async function fire(event, ...args) { for (const h of handlers.get(event) ?? []) await h(...args); }
  return { ctx, fire };
}
```

**Run pattern** (from root package.json and all package.json test scripts):
```
node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'
```

---

## Adjacent Patterns

### How comparable apparatus packages are structured

**Pattern: Apparatus with kit scanning (Instrumentarium)**

```typescript
export function createInstrumentarium(): Plugin {
  const registry = new ToolRegistry();
  const api: InstrumentariumApi = { resolve, find, list };

  return {
    apparatus: {
      requires: [],
      consumes: ['tools'],
      provides: api,
      supportKit: { tools: [toolsList, toolsShow] },
      start(ctx: StartupContext): void {
        const g = guild();
        registry.setHome(g.home);
        // Scan kits loaded before startup
        for (const kit of g.kits()) registry.register(kit);
        // Subscribe to late-arriving apparatus supportKits
        ctx.on('plugin:initialized', (plugin: unknown) => {
          const loaded = plugin as LoadedPlugin;
          if (isLoadedApparatus(loaded)) registry.register(loaded);
        });
      },
    },
  };
}
```

**Pattern: Apparatus reading guild config (Loom)**

```typescript
start(ctx: StartupContext): void {
  const g = guild();
  config = g.guildConfig().loom ?? {};  // typed via module augmentation
  // ...
}
```

**Pattern: GuildConfig module augmentation (Loom index.ts)**

```typescript
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    loom?: LoomConfig;
  }
}
```

**Pattern: Apparatus barrel (all plugins)**

```typescript
// src/index.ts
import { createOculus } from './oculus.ts';
export { type OculusApi, type OculusConfig, ... } from './types.ts';
export { createOculus } from './oculus.ts';
export default createOculus();
```

**Pattern: Apparatus requires another apparatus**

```typescript
apparatus: {
  requires: ['tools'],   // declared → Arbor ensures 'tools' starts before this
  start(ctx) {
    const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
    // ...
  }
}
```

### Comparable implementations (kit scanning)

**Loom** scans `roles` from kit contributions. Pattern at startup:
1. Scan `g.kits()` for all already-loaded standalone kits
2. Scan `g.apparatuses()` for already-started apparatus supportKits
3. Subscribe `ctx.on('plugin:initialized', ...)` for late-arriving apparatus

The Instrumentarium skips step 2 (scans apparatuses only via step 3) because kits fire before apparatus start, but it could handle apparatus supportKits in `g.apparatuses()` too. Both patterns are valid; Loom's is the more comprehensive one for late-scanning.

### How the CLI handles tool→command mapping

From `packages/framework/cli/src/program.ts`:

```typescript
// Filter tools by caller type
const pluginTools = instrumentarium.list()
  .filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('cli'))
  .map((r) => r.definition);

// Group by hyphen prefix (writ-list + writ-show → 'writ' group)
const groupPrefixes = findGroupPrefixes(tools);
// 'writ-list' → group='writ', sub='list'
```

The Oculus does the same mechanical prefix-splitting but for URL paths, not Commander groups.

### How the CLI coerces query params

From `packages/framework/cli/src/helpers.ts`:

```typescript
export function coerceCliOpts(
  shape: Record<string, z.ZodTypeAny>,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...opts };
  for (const [key, schema] of Object.entries(shape)) {
    const value = result[key];
    if (typeof value !== 'string') continue;
    if (isNumberSchema(schema)) result[key] = Number(value);
  }
  return result;
}
```

This only handles number coercion. For the Oculus, query params also need boolean coercion (`'true'` → `true`, `'false'` → `false`) since HTTP query strings are all strings.

### Package.json conventions

All apparatus packages follow this `package.json` structure:

```json
{
  "name": "@shardworks/{name}-apparatus",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "@shardworks/nexus-core": "workspace:*" },
  "devDependencies": { "@types/node": "25.5.0" },
  "files": ["dist"],
  "publishConfig": {
    "exports": {
      ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
    }
  }
}
```

The Oculus will add `hono` as a direct dependency and `@shardworks/tools-apparatus` as a workspace dependency.

### tsconfig.json convention

All packages extend `@tsconfig/node24/tsconfig.json` with:

```json
{
  "extends": "@tsconfig/node24/tsconfig.json",
  "compilerOptions": {
    "declaration": true, "declarationMap": true, "sourceMap": true,
    "verbatimModuleSyntax": true, "rewriteRelativeImportExtensions": true,
    "composite": true
  }
}
```

---

## Existing Context

### Plugin IDs

`@shardworks/oculus-apparatus` → plugin id = `oculus` (by `derivePluginId` in `resolve-package.ts`: strips `@shardworks/` and `-apparatus` suffix)

`guild().config<OculusConfig>('oculus')` → reads `guild.json["oculus"]`

### Existing `consumes` tokens in the codebase

- `'tools'` — consumed by Instrumentarium
- `'roles'` — consumed by Loom

The Oculus introduces: `'pages'` and `'routes'`

### Instrumentarium `consumes` declaration

The Instrumentarium declares `consumes: ['tools']`. The Oculus consumes `'pages'` and `'routes'` — completely different contribution fields with no overlap.

### How the CLI already uses `InstrumentariumApi`

```typescript
const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
const pluginTools = instrumentarium.list()
  .filter(r => !r.definition.callableBy || r.definition.callableBy.includes('cli'))
  .map(r => r.definition);
```

The Oculus uses `instrumentarium.list()` the same way, then maps each tool to a Hono route. The filter changes to `'patron'` (same as CLI after the rename).

### Startup context event subscription

`ctx.on('plugin:initialized', ...)` fires for both kits and apparatuses as they initialize. The handler receives a `LoadedPlugin` (discriminated union: `LoadedKit | LoadedApparatus`). Kit contributions are in `plugin.kit`, apparatus supportKit in `plugin.apparatus.supportKit`.

### The `failedPlugins` concern

Apparatuses that failed to start do NOT fire `plugin:initialized`. The Oculus will only see successfully loaded plugins, consistent with other consuming apparatuses.

### guild() access in start()

Per the architecture, `guild()` is available inside `start()`. The guild singleton is set before any apparatus `start` is called (see `arbor.ts` line ~178: `setGuild(guildInstance)` before the apparatus loop). Config reads, `g.kits()`, `g.apparatuses()` are all valid in `start()`.

### The previous "web dashboard" reference in CLAUDE.md

CLAUDE.md lists `parlour` as "web dashboard" but the actual `parlour.ts` code implements multi-turn conversation management (consult/convene conversations). The "broken 1000-line inline-HTML file" mentioned in the brief is not present in the current codebase — it was a previous/discarded attempt, not committed here.

---

## Doc / Code Discrepancies

1. **CLAUDE.md** lists `packages/plugins/parlour/` as "web dashboard" but the actual implementation is "multi-turn conversation management apparatus". The web dashboard was a prior attempt (not present in repo).

2. **CLAUDE.md** lists a `walker` package as "deprecated — renamed to spider" but there is no `walker` directory in `packages/plugins/`. The `spider` package exists; `walker` was presumably removed.

3. **`docs/architecture/kit-components.md`** describes a `nexus-tool.json` / `nexus-engine.json` descriptor file model and a `GUILD_ROOT/tools/`, `GUILD_ROOT/engines/` on-disk layout. The actual codebase uses a **kit contribution model** (`export default { kit: { tools: [...] } }`) with no descriptor files and no `GUILD_ROOT/tools/` directory. The docs describe the Mk 1.x / conceptual architecture, not the current Mk 2.x implementation.

4. **`docs/architecture/kit-components.md`** references `guild().apparatus("nexus-books")` which suggests a `nexus-books` apparatus. No such package exists; it's `stacks` / `@shardworks/stacks-apparatus`.

5. **`instrumentarium.test.ts` `mockGuild()`** returns a `guildConfig()` with `workshops: {}` which is not in the current `GuildConfig` interface. Stale test fixture.

---

## Key Implementation Notes

### Tool→REST mapping mechanics

The transform is purely mechanical (first hyphen = prefix/rest split):

| Tool name | HTTP method | URL |
|-----------|------------|-----|
| `writ-list` | GET (permission: `clerk:read`) | `/api/writ/list` |
| `writ-show` | GET | `/api/writ/show` |
| `commission-post` | POST (permission: `clerk:write`) | `/api/commission/post` |
| `rig-for-writ` | GET | `/api/rig/for-writ` |
| `signal` | POST (no permission) | `/api/signal` |
| `tools-list` | GET (permission: `read`) | `/api/tools/list` |
| `tools-show` | GET (permission: `read`) | `/api/tools/show` |

Wait: for `signal`, which has no permission — per the brief, "no permission → GET". But `signal` is likely a write action. The brief is explicit: permission field drives HTTP method, `undefined` → GET. This is a design decision to document.

Tools registered in Instrumentarium include the Instrumentarium's own `tools-list` and `tools-show` tools (pluginId: `'tools'`, permission: `'read'`).

Permission format is `plugin:level` (e.g. `clerk:read`, `clerk:write`) — but for HTTP method inference, only the **level** part matters. The level is extracted by splitting on `:` and taking the second segment.

### Chrome injection

The Oculus intercepts `index.html` file reads (for each served page) and:
1. Inserts `<link rel="stylesheet" href="/static/style.css">` before `</head>`
2. Inserts a `<nav>...</nav>` block after `<body>` (or `<body ...>`)

Pages without `<head>` or `<body>` are served as-is.

The nav needs to know all registered pages at request time (pages are registered at startup, so nav is stable). The nav can be generated once at startup.

### Static file serving

Hono has built-in static file serving middleware. The Oculus uses it for:
- `/static/*` — serving the shared stylesheet (and any other Oculus-owned static files)
- `/pages/{id}/*` — serving plugin-contributed page directories

All file reads are synchronous/per-request (no caching). The brief is explicit: "serves files from disk on each request".

### Hono framework

Hono has zero transitive dependencies. Import as:
```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
```
Wait — `@hono/node-server` is a separate package for Node.js HTTP server adapter. The brief says "Hono" but the Node adapter is a required companion. Need to confirm this in the package.json — likely both `hono` and `@hono/node-server` are needed unless Hono v4+ bundles the Node adapter. Should document this as a decision.

### The self-documenting `GET /api/_tools` endpoint

Returns a JSON array of all auto-mapped tools with:
- `name` — tool name
- `route` — full URL path (e.g. `/api/writ/list`)
- `method` — HTTP method
- `params` — Zod params schema structure (similar to `tools-show` output)

This is the discovery endpoint for page authors.

### `guild().config<OculusConfig>('oculus')`

At `start()`, read config:
```typescript
const config = guild().config<OculusConfig>('oculus');
const port = config.port ?? 7470;
```

With module augmentation:
```typescript
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    oculus?: OculusConfig;
  }
}
```

### The `start()` / `stop()` lifecycle

The Hono server starts listening in `start()`. The `stop()` method shuts it down. This is non-blocking — `start()` returns while the server runs in the background (Node's event loop keeps it alive).

### Hono handler for tool auto-mapping

For each tool, the route handler:
1. Extracts params from query string (GET) or JSON body (POST/DELETE)
2. Coerces string values using Zod schema inspection
3. Validates with `toolDef.params.parse(coerced)`
4. Calls `toolDef.handler(validated)`
5. Returns `Response.json(result)` or `Response.json({ error })` on failure

### Custom route priority over auto-mapped routes

Custom routes contributed via `routes` kit field take priority over auto-mapped tool routes. On startup, the Oculus registers custom routes first, then auto-maps tools. If a custom route path matches an auto-mapped tool path, a warning is logged and the custom route wins (Hono matches first-registered wins).

Actually in Hono, route registration order determines priority — first registered wins. So: register custom routes first, then tool routes. If there's an overlap, the first-registered (custom) route handles it.

---

## Package Dependencies Summary

New package `@shardworks/oculus-apparatus`:

- **`hono`** — npm, zero transitive deps, HTTP framework
- **`@hono/node-server`** — npm, Node.js HTTP adapter for Hono (needed unless Hono v4 bundles it)
- **`@shardworks/nexus-core`** — workspace dependency (guild, Plugin types)
- **`@shardworks/tools-apparatus`** — workspace dependency (InstrumentariumApi, ToolDefinition)
- **`zod`** — workspace convention (for query param schema inspection)

**Note**: Need to verify whether `@hono/node-server` is needed or if Hono 4.x has a built-in Node adapter. This is a dependency decision.
