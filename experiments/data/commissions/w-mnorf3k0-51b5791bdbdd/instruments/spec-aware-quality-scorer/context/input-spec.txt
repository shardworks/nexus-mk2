---
author: plan-writer
estimated_complexity: 13
---

# The Oculus — Web Dashboard Apparatus

## Summary

A new apparatus (`@shardworks/oculus-apparatus`) that serves a web dashboard for the guild via Hono. Plugins contribute pages as static asset directories and custom API routes through kit contributions. Guild tools are automatically exposed as REST endpoints. A shared stylesheet and injected navigation chrome give contributed pages a cohesive appearance with zero boilerplate. Prerequisite: the `ToolCaller` type's `'cli'` value is renamed to `'patron'` across the codebase.

## Current State

The guild has two interface surfaces: the `nsg` CLI and the MCP tool server. There is no web dashboard.

**`ToolCaller` type** in `packages/plugins/tools/src/tool.ts`:

```typescript
export type ToolCaller = 'cli' | 'anima' | 'library';
```

The `'cli'` value is used in `callableBy` declarations across ~19 files (CLI framework commands, animator/summon, tests). The CLI filters tools via:

```typescript
// packages/framework/cli/src/program.ts line 175
.filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('cli'))
```

**Kit contribution scanning** is established via the `consumes` declaration and the `plugin:initialized` startup event. The Instrumentarium consumes `'tools'`; the Loom consumes `'roles'`. No apparatus currently consumes `'pages'` or `'routes'`.

**Tool permission field** uses two formats in the codebase: simple levels (`'read'`, `'write'`, `'delete'`) and plugin-prefixed (`'clerk:read'`, `'clerk:write'`, `'spider:write'`). Custom levels like `'animate'` also exist.

**Query param coercion** in `packages/framework/cli/src/helpers.ts` handles number coercion only (via `isNumberSchema` + `coerceCliOpts`). Boolean coercion is not needed by the CLI (Commander handles boolean flags natively).

## Requirements

- R1: The `ToolCaller` type must change from `'cli' | 'anima' | 'library'` to `'patron' | 'anima' | 'library'`. Every file referencing `'cli'` as a `ToolCaller` value must be updated.
- R2: A new package `@shardworks/oculus-apparatus` must be created at `packages/plugins/oculus/` following the established apparatus package conventions.
- R3: The Oculus apparatus must declare `requires: ['tools']` and `consumes: ['pages', 'routes']`.
- R4: The Oculus must start a Hono HTTP server in `start()`, awaiting port binding. The port must be configurable via `guild.json` under the `oculus` key (default: `7470`). It must log the listening URL at startup.
- R5: The Oculus must implement `stop()` to close the HTTP server.
- R6: The Oculus must scan page and route contributions from kits (via `g.kits()`), already-started apparatuses (via `g.apparatuses()`), and late-arriving apparatuses (via `ctx.on('plugin:initialized', ...)`).
- R7: Page contributions must specify `id`, `title`, and `dir` (relative to the package root). The Oculus must resolve `dir` to an absolute path via `node_modules/{packageName}/{dir}`. Pages must be served under `/pages/{id}/` by reading files from disk on each request.
- R8: When serving a page's `index.html` (and only `index.html`), the Oculus must inject a `<link>` to `/static/style.css` before `</head>` and a `<nav id="oculus-nav">` element after `<body>`. Pages without `<head>` or `<body>` tags must be served unmodified.
- R9: The nav must include a link to the home page (`/`) as the first item, followed by links to all registered pages.
- R10: The Oculus must serve its own static assets (stylesheet) from `/static/*`, resolved via `import.meta.dirname` relative to the source file.
- R11: The stylesheet must be a static CSS file providing CSS custom properties (Tokyo Night palette), element-type selectors for baseline styling, and utility classes for common patterns.
- R12: `GET /` must return a dynamically generated home page showing the guild name and a listing of all registered pages with links. The home page must include the stylesheet and nav directly in its HTML (no chrome injection pass).
- R13: The Oculus must auto-map patron-callable tools to REST endpoints. Tools are patron-callable when `callableBy` is absent or includes `'patron'`.
- R14: Tool names must be transformed to URL paths by splitting on the first hyphen only: `writ-list` becomes `/api/writ/list`; `signal` becomes `/api/signal`; `rig-for-writ` becomes `/api/rig/for-writ`.
- R15: HTTP method must be inferred from the tool's `permission` field. Extract the level (split on `:`, take the last segment). `'read'` or no permission maps to `GET`; `'write'` or `'admin'` maps to `POST`; `'delete'` maps to `DELETE`. Unknown levels default to `POST`.
- R16: GET endpoints must coerce query string parameters from strings to numbers and booleans based on the tool's Zod schema. POST/DELETE endpoints must parse a JSON request body.
- R17: Tool endpoint errors must return `400` for Zod validation failures (with `{ error: string, details: unknown }`) and `500` for handler errors (with `{ error: string }`). Successful responses return `200` with the handler result as JSON.
- R18: Tool routes must be registered at startup from `instrumentarium.list()`, with additional routes added for late-arriving tools via `plugin:initialized`.
- R19: Custom route contributions must specify `method`, `path`, and a Hono `Context` handler. The Oculus must reject routes whose path does not start with `/api/` (log warning, skip registration).
- R20: Custom routes must be registered before tool routes. When a tool route conflicts with a custom route path, the tool route must be skipped with a startup warning.
- R21: `GET /api/_tools` must return a JSON array of all auto-mapped tools, each with `name`, `route`, `method`, `description`, and `params` (using the `{ type, description, optional }` per-param format from tools-show).
- R22: The `OculusApi` provides object must expose `port(): number`.

## Design

### Type Changes

**`packages/plugins/tools/src/tool.ts`** — rename only:

```typescript
export type ToolCaller = 'patron' | 'anima' | 'library';
```

**`packages/plugins/oculus/src/types.ts`** — new file:

```typescript
import type { Context } from 'hono';

/** A page contributed by a plugin kit or apparatus supportKit. */
export interface PageContribution {
  /** Unique page ID — becomes the URL segment: /pages/{id}/ */
  id: string;
  /** Human-readable title used in navigation. */
  title: string;
  /**
   * Path to the directory containing the page's static assets,
   * relative to the contributing package's root in node_modules.
   * Must contain an index.html entry point.
   */
  dir: string;
}

/** A custom route contributed by a plugin kit or apparatus supportKit. */
export interface RouteContribution {
  /** HTTP method (uppercase): 'GET', 'POST', 'DELETE', etc. */
  method: string;
  /** Hono path pattern. Must begin with /api/. */
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

/** The Oculus's public API, exposed via provides. */
export interface OculusApi {
  /** The port the server is listening on. */
  port(): number;
}
```

**`packages/plugins/oculus/src/index.ts`** — barrel with GuildConfig augmentation:

```typescript
import { createOculus } from './oculus.ts';

export {
  type OculusApi,
  type OculusConfig,
  type OculusKit,
  type PageContribution,
  type RouteContribution,
} from './types.ts';

export { createOculus } from './oculus.ts';

import type { OculusConfig } from './types.ts';
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    oculus?: OculusConfig;
  }
}

export default createOculus();
```

### Behavior

#### ToolCaller Rename (S1)

Every literal `'cli'` used as a `ToolCaller` value becomes `'patron'`. This is a mechanical find-and-replace scoped to ToolCaller contexts. The complete file list:

**Type definition:**
- `packages/plugins/tools/src/tool.ts` — the `ToolCaller` type union

**Production code using `callableBy: 'cli'` or `callableBy: ['cli']`:**
- `packages/framework/cli/src/program.ts` — `.includes('cli')` filter
- `packages/framework/cli/src/cli.ts` — JSDoc comment mentioning `'cli'`
- `packages/framework/cli/src/commands/status.ts`
- `packages/framework/cli/src/commands/init.ts`
- `packages/framework/cli/src/commands/version.ts`
- `packages/framework/cli/src/commands/upgrade.ts`
- `packages/framework/cli/src/commands/plugin.ts` (4 tool definitions)
- `packages/plugins/animator/src/tools/summon.ts`

**Zod enum in tools-list:**
- `packages/plugins/tools/src/tools/tools-list.ts` — `z.enum(['cli', ...])`

**Test files (update string literals and assertions):**
- `packages/plugins/tools/src/tool.test.ts`
- `packages/plugins/tools/src/instrumentarium.test.ts`
- `packages/plugins/tools/src/tools/tools-list.test.ts`
- `packages/plugins/tools/src/tools/tools-show.test.ts`
- `packages/plugins/claude-code/src/mcp-server.test.ts`
- `packages/framework/cli/src/commands/version.test.ts`
- `packages/framework/cli/src/commands/plugin.test.ts`
- `packages/framework/cli/src/commands/status.test.ts`
- `packages/framework/cli/src/commands/upgrade.test.ts`

#### Apparatus Lifecycle (S2)

`createOculus()` returns a `Plugin` with an `apparatus` that:

1. Declares `requires: ['tools']`, `consumes: ['pages', 'routes']`, `provides: api`.
2. In `start()`:
   - Reads config: `const oculusConfig = guild().guildConfig().oculus ?? {}; const port = oculusConfig.port ?? 7470;`
   - Creates a `Hono` instance.
   - Scans contributions (pages + routes) from `g.kits()`, `g.apparatuses()`, and subscribes to `plugin:initialized` for late arrivals. Page `dir` is resolved to absolute path: `path.join(guild().home, 'node_modules', plugin.packageName, contribution.dir)`.
   - Registers custom routes first (validating `/api/` prefix — warn and skip invalid ones).
   - Gets `InstrumentariumApi` via `guild().apparatus<InstrumentariumApi>('tools')`, filters to patron-callable tools, registers tool routes (skipping conflicts with custom route paths, warning on conflict).
   - Registers `GET /api/_tools` endpoint.
   - Registers page-serving routes for each page: `/pages/{id}/*`.
   - Registers `/static/*` route for own assets.
   - Registers `GET /` for the home page.
   - Starts the server via `serve({ fetch: app.fetch, port })` and awaits the listen callback wrapping it in a Promise. Logs `[oculus] Listening on http://localhost:{port}`.
   - Updates the `api.port()` return value.
3. In `stop()`: closes the HTTP server via `server.close()`.
4. In `plugin:initialized` handler: scans late-arriving apparatus supportKit for pages and routes. For pages, registers new `/pages/{id}/*` routes. For routes, registers new custom routes. For new tools arriving via the Instrumentarium (query `instrumentarium.list()` for tools not yet mapped), registers new tool routes.

#### Page Serving (S2, S3)

When a request arrives for `/pages/{pageId}/*`:

1. Resolve the requested file path within the page's resolved directory. Prevent directory traversal (reject paths containing `..`).
2. If the file is `index.html` (the request path is `/pages/{id}/` or `/pages/{id}/index.html`):
   - Read the file from disk.
   - Apply chrome injection (R8): case-insensitive regex to find `</head>` and `<body` tags. Insert stylesheet link before `</head>`, insert nav HTML after `<body...>`. If either tag is absent, serve as-is.
   - Return with `Content-Type: text/html`.
3. For all other files: read from disk, determine Content-Type from extension, return.
4. If file not found: return 404.

**Content-Type lookup table** (built into the apparatus):

```typescript
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};
// Default: 'application/octet-stream'
```

#### Chrome Injection (S3)

`injectChrome(html: string, stylesheetPath: string, navHtml: string): string`

1. Find `</head>` (case-insensitive). If found, insert `<link rel="stylesheet" href="{stylesheetPath}">` before it.
2. Find `<body` followed by `>` (case-insensitive, tolerant of attributes). If found, insert `navHtml` after the closing `>` of the body tag.
3. If neither tag is found, return html unmodified.

The nav HTML is generated once at startup (and updated when late pages arrive):

```html
<nav id="oculus-nav">
  <a href="/">Guild</a>
  <a href="/pages/{id}/">{title}</a>
  <!-- one per registered page -->
</nav>
```

#### Shared Stylesheet (S3)

File: `packages/plugins/oculus/src/static/style.css`

Served at `/static/style.css`. Three layers:

**Layer 1 — Custom properties:**
```css
:root {
  --bg: #1a1b26;
  --surface: #24283b;
  --surface2: #2f3549;
  --border: #3b4261;
  --text: #c0caf5;
  --text-dim: #565f89;
  --text-bright: #e0e6ff;
  --green: #9ece6a;
  --red: #f7768e;
  --yellow: #e0af68;
  --cyan: #7dcfff;
  --magenta: #bb9af7;
  --blue: #7aa2f7;
  --font-mono: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
}
```

**Layer 2 — Element-type selectors:**
- `body` — `background: var(--bg); color: var(--text); font-family: var(--font-mono); font-size: 13px; line-height: 1.6; margin: 0; padding: 0;`
- `h1, h2, h3, h4` — `color: var(--text-bright); font-weight: 600;`
- `a` — `color: var(--cyan); text-decoration: none;` with hover underline
- `table` — `width: 100%; border-collapse: collapse;`
- `th, td` — `text-align: left; padding: 8px; border-bottom: 1px solid var(--border);`
- `th` — `color: var(--text-dim); font-weight: 500;`
- `button` — solid accent color, dark text, rounded corners (6px), 8px 16px padding
- `input, select, textarea` — dark background (`var(--surface)`), border `var(--border)`, focus border `var(--cyan)`
- `pre, code` — `background: var(--surface); border-radius: 4px;` — `code` inline gets small padding; `pre` block gets `padding: 16px; overflow-x: auto;`

**Layer 3 — Utility classes:**
- `#oculus-nav` — `display: flex; gap: 16px; align-items: center; padding: 8px 16px; background: var(--surface); border-bottom: 1px solid var(--border);`
- `#oculus-nav a` — `color: var(--text-dim); font-size: 12px;` with active/hover → `color: var(--text)`
- `.card` — `background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px;`
- `.badge` — `display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--surface2); color: var(--text-dim);`
- `.badge--success` — `background: rgba(158,206,106,0.15); color: var(--green);`
- `.badge--error` — `background: rgba(247,118,142,0.15); color: var(--red);`
- `.badge--warning` — `background: rgba(224,175,104,0.15); color: var(--yellow);`
- `.badge--info` — `background: rgba(125,207,255,0.15); color: var(--cyan);`
- `.badge--active` — same as `--info` plus a pulsing animation
- `.data-table` — inherits base table styles, with alternating row tint
- `.btn` — base button reset with cursor pointer
- `.btn--primary` — `background: var(--blue); color: var(--bg);`
- `.btn--success` — `background: var(--green); color: var(--bg);`
- `.btn--danger` — `background: var(--red); color: var(--bg);`
- `.toolbar` — `display: flex; gap: 8px; align-items: center; padding: 8px 0;`
- `.empty-state` — `text-align: center; padding: 48px 16px; color: var(--text-dim);`
- `@keyframes pulse` — subtle opacity pulse (`1 → 0.6 → 1` over 2s) applied to `.badge--active`

#### Tool→REST Auto-Mapping (S4)

**`toolNameToRoute(name: string): string`** — split on first hyphen:
```typescript
function toolNameToRoute(name: string): string {
  const idx = name.indexOf('-');
  if (idx === -1) return `/api/${name}`;
  return `/api/${name.slice(0, idx)}/${name.slice(idx + 1)}`;
}
```

**`permissionToMethod(permission: string | undefined): string`** — extract level, map:
```typescript
function permissionToMethod(permission: string | undefined): 'GET' | 'POST' | 'DELETE' {
  if (permission === undefined) return 'GET';
  const level = permission.includes(':') ? permission.slice(permission.lastIndexOf(':') + 1) : permission;
  if (level === 'read') return 'GET';
  if (level === 'write' || level === 'admin') return 'POST';
  if (level === 'delete') return 'DELETE';
  return 'POST'; // unknown levels default to POST
}
```

**Tool route handler** — for each tool:
```typescript
// For GET:
app.get(routePath, async (c) => {
  const rawQuery = c.req.query();          // Record<string, string>
  const coerced = coerceParams(shape, rawQuery);
  const validated = toolDef.params.parse(coerced);
  const result = await toolDef.handler(validated);
  return c.json(result);
});

// For POST/DELETE:
app.post(routePath, async (c) => {  // or app.delete()
  const body = await c.req.json();
  const validated = toolDef.params.parse(body);
  const result = await toolDef.handler(validated);
  return c.json(result);
});
```

Error handling wraps each handler:
- Zod parse failure → `c.json({ error: err.message, details: err.issues }, 400)`
- Handler exception → `c.json({ error: message }, 500)`

**`coerceParams(shape, params): Record<string, unknown>`** — extends the CLI's coercion with boolean support:
```typescript
function coerceParams(
  shape: Record<string, z.ZodTypeAny>,
  params: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...params };
  for (const [key, schema] of Object.entries(shape)) {
    const value = result[key];
    if (typeof value !== 'string') continue;
    if (isNumberSchema(schema)) {
      result[key] = Number(value);
    } else if (isBooleanSchema(schema)) {
      result[key] = value === 'true';
    }
  }
  return result;
}
```

Where `isNumberSchema` and `isBooleanSchema` replicate the pattern from `packages/framework/cli/src/helpers.ts` — unwrap `ZodOptional`/`ZodDefault`, then check the inner type with `instanceof z.ZodNumber` / `instanceof z.ZodBoolean`.

#### Custom Route Contributions (S5)

During contribution scanning, for each `route` in a kit's `routes` array:
1. Check `route.path.startsWith('/api/')`. If not, log `[oculus] Custom route "${route.path}" from "${pluginId}" must start with /api/ — skipped` and skip.
2. Register the route on the Hono app: `app[route.method.toLowerCase()](route.path, route.handler)`.
3. Add `route.path` to a `Set<string>` of custom route paths.

When registering tool routes, check each computed tool route path against this Set. If it's present, log `[oculus] Tool route ${method} ${path} conflicts with custom route from plugin — skipped` and skip the tool route.

#### API Tool Index (S6)

`GET /api/_tools` handler returns a JSON array:

```typescript
interface ToolIndexEntry {
  name: string;
  route: string;
  method: 'GET' | 'POST' | 'DELETE';
  description: string;
  params: Record<string, { type: string; description: string | null; optional: boolean }>;
}
```

The params extraction replicates the `extractParams`/`extractSingleParam`/`zodTypeToJsonType` logic from `packages/plugins/tools/src/tools/tools-show.ts`. This is reimplemented locally (not imported, since tools-show doesn't export these functions).

#### Home Page (S7)

`GET /` returns a dynamically generated HTML string with:
- The stylesheet linked directly (`<link rel="stylesheet" href="/static/style.css">`)
- The nav included directly (same HTML as injected chrome)
- The guild name from `guild().guildConfig().name` in an `<h1>`
- A listing of registered pages, each as a link to `/pages/{id}/` with the page title

No chrome injection pass needed — the home page includes everything directly.

### Non-obvious Touchpoints

- `packages/plugins/tools/src/tools/tools-list.ts` — the Zod `z.enum` for the `caller` param must change from `['cli', 'anima', 'library']` to `['patron', 'anima', 'library']`.
- `packages/plugins/animator/src/tools/summon.ts` — uses `callableBy: 'cli'` which must become `'patron'`.
- `packages/plugins/claude-code/src/mcp-server.test.ts` — test fixtures reference `'cli'` as a ToolCaller value.
- `packages/framework/cli/src/commands/plugin.ts` — has 4 separate tool definitions each with `callableBy: ['cli']`.
- `pnpm-workspace.yaml` already includes `packages/plugins/*` so the new oculus package is automatically a workspace member.

### Dependencies

The `'cli'` → `'patron'` rename (S1) is a prerequisite for the Oculus apparatus. The Oculus filters tools with `caller: 'patron'`; if the rename hasn't happened, no tools will match. Implement S1 first, verify tests pass, then proceed to S2–S7.

## Validation Checklist

- V1 [R1]: Run `grep -r "'cli'" packages/plugins/tools/src/ packages/framework/cli/src/ packages/plugins/animator/src/tools/summon.ts packages/plugins/claude-code/src/mcp-server.test.ts` and confirm zero matches in ToolCaller contexts. Run all existing tests: `pnpm -r test` — all must pass with `'patron'` everywhere.
- V2 [R2, R3]: Confirm `packages/plugins/oculus/package.json` exists with name `@shardworks/oculus-apparatus`, deps on `hono`, `@hono/node-server`, `@shardworks/nexus-core`, `@shardworks/tools-apparatus`, and `zod`. Confirm `tsconfig.json` follows repo conventions. Confirm `apparatus.requires` is `['tools']` and `apparatus.consumes` is `['pages', 'routes']`.
- V3 [R4, R5, R22]: Write a test that calls `createOculus()`, wires a mock guild with a mock Instrumentarium, calls `start()`, confirms the server is listening (fetch `http://localhost:{port}/`), confirms `api.port()` returns the port, then calls `stop()` and confirms the port is released.
- V4 [R6, R7]: Write a test that creates a temp directory with an `index.html`, registers a mock kit with a page contribution pointing to that directory, starts the Oculus, and confirms `GET /pages/{id}/index.html` returns the file content.
- V5 [R8, R9]: Confirm chrome injection by fetching a page's `index.html` and verifying the response contains both `<link rel="stylesheet" href="/static/style.css">` and `<nav id="oculus-nav">` with a home link and page links. Fetch a non-`index.html` file from the same page and confirm no injection occurs.
- V6 [R10, R11]: Confirm `GET /static/style.css` returns a CSS file containing `--bg: #1a1b26`, `.card`, `.badge`, `.badge--success`, `#oculus-nav`, and the monospace font stack.
- V7 [R12]: Confirm `GET /` returns HTML containing the guild name, links to registered pages, the stylesheet link, and the nav.
- V8 [R13, R14, R15]: Register tools named `writ-list` (permission: `'read'`), `commission-post` (permission: `'clerk:write'`), `codex-remove` (permission: `'delete'`), `signal` (no permission), and an anima-only tool. Confirm: `GET /api/writ/list` is registered, `POST /api/commission/post` is registered, `DELETE /api/codex/remove` is registered, `GET /api/signal` is registered, and the anima-only tool has no route.
- V9 [R16]: Call `GET /api/writ/list?limit=5&offset=0` and confirm the handler receives `limit` as number `5` and `offset` as number `0`, not strings. Call a GET endpoint with `?verbose=true` for a tool with a boolean param and confirm the handler receives boolean `true`.
- V10 [R17]: Call a tool endpoint with invalid params and confirm 400 status with `{ error, details }` shape. Call a tool whose handler throws and confirm 500 status with `{ error }` shape.
- V11 [R19, R20]: Register a custom route at `/api/custom/stream`. Then register tool routes. Confirm the custom route is accessible. Register a custom route that conflicts with a tool's auto-mapped path and confirm the tool route is skipped (custom route handles the path).
- V12 [R19]: Register a custom route with path `/not-api/foo`. Confirm it is skipped with a warning (not registered).
- V13 [R21]: Confirm `GET /api/_tools` returns a JSON array where each entry has `name`, `route`, `method`, `description`, and `params` with per-parameter `{ type, description, optional }`.

## Test Cases

**ToolCaller rename:**
- Scenario: All existing tests pass after renaming `'cli'` to `'patron'` in every file. Expected: `pnpm -r test` exits 0.

**toolNameToRoute:**
- `'writ-list'` → `'/api/writ/list'`
- `'commission-post'` → `'/api/commission/post'`
- `'rig-for-writ'` → `'/api/rig/for-writ'`
- `'signal'` → `'/api/signal'`
- `'tools-list'` → `'/api/tools/list'`

**permissionToMethod:**
- `undefined` → `'GET'`
- `'read'` → `'GET'`
- `'write'` → `'POST'`
- `'admin'` → `'POST'`
- `'delete'` → `'DELETE'`
- `'clerk:read'` → `'GET'`
- `'clerk:write'` → `'POST'`
- `'spider:write'` → `'POST'`
- `'animate'` → `'POST'` (unknown level defaults to POST)

**coerceParams:**
- `{ limit: '5' }` with `z.number()` schema → `{ limit: 5 }`
- `{ verbose: 'true' }` with `z.boolean()` schema → `{ verbose: true }`
- `{ verbose: 'false' }` with `z.boolean()` schema → `{ verbose: false }`
- `{ name: 'hello' }` with `z.string()` schema → `{ name: 'hello' }` (untouched)
- `{ limit: '5' }` with `z.number().optional()` schema → `{ limit: 5 }` (unwraps optional)

**injectChrome:**
- Input: `<html><head><title>Test</title></head><body><p>Hi</p></body></html>` → Output contains stylesheet link before `</head>` and nav after `<body>`.
- Input: `<html><HEAD><TITLE>Test</TITLE></HEAD><BODY class="main"><p>Hi</p></BODY></html>` → Works case-insensitively and handles body attributes.
- Input: `<p>No head or body tags</p>` → Returned unmodified.
- Input: `<html><head></head><body></body></html>` → Both injections happen even with empty head/body.

**Page serving:**
- Request `/pages/my-page/` → serves `index.html` with chrome injection.
- Request `/pages/my-page/index.html` → serves `index.html` with chrome injection.
- Request `/pages/my-page/app.js` → serves JavaScript file, no injection.
- Request `/pages/my-page/sub/file.html` → serves HTML file, no injection (not index.html at page root).
- Request `/pages/my-page/../../../etc/passwd` → rejected (directory traversal), returns 404 or 400.
- Request `/pages/nonexistent/` → 404.

**Custom route conflict:**
- Custom route registered at `/api/writ/list`. Tool `writ-list` maps to the same path. → Custom route wins; tool route skipped with warning.

**Home page:**
- `GET /` returns HTML with `<h1>` containing guild name, links to `/pages/{id}/` for each registered page.
- `GET /` with zero registered pages → still renders, shows empty state or just the guild name.

**API index:**
- `GET /api/_tools` returns array with entry for each mapped tool. Each entry has all 5 fields. Params for a tool with `{ limit: z.number().optional(), status: z.enum([...]) }` shows `limit` as `{ type: 'number', description: ..., optional: true }` and `status` as `{ type: 'string', description: ..., optional: true }`.

**Server lifecycle:**
- Start the Oculus, confirm port is bound. Stop it, confirm port is released (starting again on same port succeeds).
- Start with a port already in use → `start()` rejects with a clear error (EADDRINUSE).

**Kit scanning phases:**
- Kit with pages loaded before Oculus start → pages registered and served.
- Apparatus supportKit with pages that started before Oculus (via requires ordering) → pages registered.
- Apparatus supportKit with pages that starts after Oculus (via plugin:initialized) → pages registered and served.
