## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/oculus-spec.md`:

---

# The Oculus — Web Dashboard Apparatus

## Summary

A new apparatus that serves a web dashboard for the guild, providing a browser-based interface for observing and interacting with guild state. The Oculus consumes `pages` and `routes` contributions from kits and apparatus, auto-maps installed guild tools as REST endpoints, and serves a unified multi-page UI with shared chrome and styling.

## Motivation

The guild currently has two interface surfaces: the `nsg` CLI and the MCP tool server (for anima sessions). Both are effective for their audiences but neither provides a persistent, visual overview of guild state. The plan-workshop (`bin/plan-review.ts`) demonstrated the value of a web UI for complex workflows — but it's a 2,079-line monolith with ~900 lines of inline HTML, manual `node:http` routing, and no extensibility. A prior stress-test commission (w-mni87qen) attempted a web dashboard as a single apparatus and produced a broken 1000-line `html.ts` monolith.

The Oculus makes the web dashboard a framework-level capability that any plugin can extend with its own pages and API endpoints, following the same kit contribution pattern used by tools, engines, and relays.

## Current State

There is no web-serving apparatus in the framework. The relevant existing patterns:

- **The Instrumentarium** (`@shardworks/tools-apparatus`) consumes `tools` from kit contributions and resolves permission-gated tool sets. This is the model the Oculus follows for consuming `pages` and `routes`.
- **The CLI** (`@shardworks/nexus-cli`) auto-converts ToolDefinitions into Commander subcommands — Zod params become CLI flags, handler output is printed. This is the pattern the Oculus follows for auto-mapping tools to REST endpoints.
- **The MCP Server** (`@shardworks/claude-code`) serves tools via Streamable HTTP on an ephemeral port. Uses raw `node:http`.
- **ToolDefinition** already has `callableBy: ToolCaller[]` with values `'cli' | 'anima' | 'library'`. The Oculus adds `'web'` as a new caller type.
- **ToolDefinition.permission** uses `plugin:level` format where `level` is conventionally `read`, `write`, `delete`, or `admin`. The Oculus uses the permission level to infer HTTP method.

## Dependencies

- **Runtime dependency:** `hono` (zero-dependency web framework, ~1.4 MB unpacked, built-in TypeScript)
- **Framework dependency:** `requires: ['tools']` — needs the Instrumentarium for tool resolution and auto-mapping
- **Soft dependency:** `recommends: []` — no soft dependencies initially; pages from other apparatus arrive via kit contributions

## Requirements

### Apparatus Lifecycle

- R1: The Oculus is an apparatus with `requires: ['tools']`, `consumes: ['pages', 'routes']`.
- R2: On `start()`, the Oculus boots a Hono web server on a configurable port (default: `7470`). The port is read from the `oculus` section of `guild.json` (`oculus.port`).
- R3: On `stop()`, the Oculus shuts down the HTTP server and releases the port.
- R4: The Oculus logs the serving URL to the console on successful startup: `[oculus] Dashboard serving at http://localhost:{port}`.

### Page Contributions

- R5: Kits and apparatus contribute pages via a `pages` field on the kit manifest (or `supportKit`). The Oculus scans for these contributions at startup and via the `plugin:initialized` lifecycle event.
- R6: Each page contribution is a `PageDefinition` with the following fields:
  - `id: string` — unique page identifier (used in the URL path: `/pages/{id}`)
  - `title: string` — human-readable label displayed in the navigation
  - `navGroup?: string` — optional grouping label for navigation ordering (pages with the same navGroup cluster together)
  - `navOrder?: number` — sort order within the group (default: 0, lower sorts first)
  - `assetsDir: string` — absolute path to a directory containing the page's static assets (HTML, CSS, JS). Must contain an `index.html` file.
- R7: Pages are served at `/pages/{id}/`. Requests to `/pages/{id}` redirect to `/pages/{id}/`. All files in `assetsDir` are served under the page's URL prefix.
- R8: The Oculus provides a `PageDefinition` type and an `OculusKit` interface exported from the package for kit author type safety.

### Chrome and Navigation

- R9: The Oculus serves a root page at `/` that renders a navigation shell: a sidebar or header listing all registered pages with links. This is the "chrome" — the consistent frame around page content.
- R10: The chrome injects a base stylesheet link (`/oculus/styles.css`) into every page response. The Oculus intercepts requests for `index.html` in each page's assets and injects a `<link>` tag and a navigation header before serving.
- R11: The navigation lists pages grouped by `navGroup` and sorted by `navOrder` within each group. Pages with no `navGroup` appear in an "Other" group at the end.

### Shared Stylesheet

- R12: The Oculus ships a base stylesheet at `/oculus/styles.css` providing:
  - CSS custom properties for theming (`--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-dim`, `--text-bright`, `--green`, `--red`, `--yellow`, `--cyan`, `--magenta`, `--blue` — matching the plan-workshop palette)
  - Element-type selectors for baseline styling: `body`, `table`, `th`, `td`, `button`, `input`, `select`, `textarea`, `pre`, `code`, `h1`–`h6`, `a`, `label`
  - Utility classes for common patterns: `.card`, `.badge`, `.badge--success`, `.badge--warning`, `.badge--error`, `.badge--info`, `.toolbar`, `.empty-state`, `.data-table`, `.btn`, `.btn--primary`, `.btn--danger`
  - Navigation chrome styles (header bar, nav links, active state)
- R13: The stylesheet file lives in the apparatus package directory and is served as a static asset. It is not generated at runtime.

### Tool-to-REST Auto-Mapping

- R14: At startup (and on `plugin:initialized`), the Oculus resolves all tools from the Instrumentarium that are callable by `'web'` (or have no `callableBy` restriction). These tools are auto-mapped to REST endpoints.
- R15: The URL convention mirrors the CLI grouping: tool name `{prefix}-{action}` maps to `/{prefix}/{action}`. Tools with no hyphen map to `/{name}`. All routes are prefixed with `/api/`.
  - `writ-list` → `/api/writ/list`
  - `writ-show` → `/api/writ/show`
  - `commission-post` → `/api/commission/post`
  - `signal` → `/api/signal`
  - `rig-for-writ` → `/api/rig/for-writ`
- R16: HTTP method is inferred from the tool's `permission` level:
  - `read` → GET (params from query string)
  - `write`, `delete`, `admin` → POST (params from JSON request body)
  - No permission (permissionless tools) → GET
- R17: For GET endpoints, query string parameters are parsed and coerced to match the tool's Zod schema types (same coercion logic as the CLI's `coerceCliOpts`). For POST endpoints, the JSON request body is validated directly against the Zod schema.
- R18: Successful tool invocations return `200` with `Content-Type: application/json` and the handler's return value JSON-serialized. Failed Zod validation returns `400` with `{ error: string }`. Handler errors return `500` with `{ error: string }`.
- R19: The Oculus exposes a `GET /api/_tools` endpoint that lists all auto-mapped tools with their route, method, and parameter schemas (as JSON Schema derived from Zod). This serves as a self-documenting API index for page authors.

### Custom Route Contributions

- R20: Kits and apparatus contribute custom routes via a `routes` field on the kit manifest. The Oculus scans for these alongside page contributions.
- R21: Each route contribution is a `RouteDefinition` with:
  - `method: 'GET' | 'POST' | 'PUT' | 'DELETE'`
  - `path: string` — Hono route pattern (e.g., `/api/session/:id/stream`). Must start with `/api/`.
  - `handler: (c: Context) => Response | Promise<Response>` — a Hono handler function. The Oculus passes through the Hono `Context` directly.
- R22: Custom routes are registered after auto-mapped tool routes. If a custom route conflicts with an auto-mapped tool route, the custom route wins (registered later in Hono, which uses last-match-wins). A startup warning is emitted for conflicts.
- R23: The Oculus provides a `RouteDefinition` type exported from the package.

### ToolCaller Extension

- R24: The `ToolCaller` type in `@shardworks/tools-apparatus` is extended to include `'web'` as a valid caller: `'cli' | 'anima' | 'library' | 'web'`. This is the only change to existing framework code outside the Oculus package.
- R25: Existing tools with no `callableBy` restriction remain available to all callers, including `'web'`. Tools that explicitly set `callableBy` must include `'web'` to be auto-mapped.

### Configuration

- R26: The Oculus reads its configuration from `guild.json` under the `oculus` key:
  ```json
  {
    "oculus": {
      "port": 7470
    }
  }
  ```
- R27: If the `oculus` key is absent or empty, defaults apply (port 7470).

### Provides API

- R28: The Oculus exposes a minimal `OculusApi` via `provides`:
  - `port(): number` — the port the server is listening on
  - `url(): string` — the full base URL (e.g., `http://localhost:7470`)
  - `pages(): PageInfo[]` — list of registered pages with id, title, and URL

## Design

### Package Structure

```
packages/plugins/oculus/
├── package.json
├── src/
│   ├── index.ts              ← barrel exports + default apparatus export
│   ├── oculus.ts             ← createOculus() factory (apparatus lifecycle, Hono setup)
│   ├── pages.ts              ← page registration, chrome injection, asset serving
│   ├── tools-bridge.ts       ← tool→REST auto-mapping logic
│   ├── routes.ts             ← custom route registration
│   └── types.ts              ← PageDefinition, RouteDefinition, OculusKit, OculusApi
└── assets/
    ├── styles.css            ← shared base stylesheet
    ├── chrome.html           ← navigation shell template (header, sidebar, script)
    └── home.html             ← root page listing all registered pages
```

### Type Definitions

```typescript
// types.ts

/** A page contributed by a kit or apparatus. */
export interface PageDefinition {
  /** Unique page identifier — used in URL path: /pages/{id}/ */
  id: string;
  /** Human-readable title for navigation. */
  title: string;
  /** Optional navigation group label. Pages with the same group cluster together. */
  navGroup?: string;
  /** Sort order within navGroup. Default: 0. Lower sorts first. */
  navOrder?: number;
  /**
   * Absolute path to a directory containing the page's static assets.
   * Must contain an index.html file. All files in this directory are served
   * under /pages/{id}/.
   */
  assetsDir: string;
}

/** A custom API route contributed by a kit or apparatus. */
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Hono route pattern. Must start with /api/. */
  path: string;
  /** Hono handler — receives Context, returns Response. */
  handler: (c: HonoContext) => Response | Promise<Response>;
}

/** Kit contribution interface for the Oculus. */
export interface OculusKit {
  pages?: PageDefinition[];
  routes?: RouteDefinition[];
}

/** Public API exposed via `provides`. */
export interface OculusApi {
  /** The port the server is listening on. */
  port(): number;
  /** The full base URL. */
  url(): string;
  /** List of registered pages. */
  pages(): PageInfo[];
}

export interface PageInfo {
  id: string;
  title: string;
  url: string;
  navGroup?: string;
}
```

### Tool→REST Bridge (`tools-bridge.ts`)

The bridge function mirrors the CLI's `buildToolCommand` pattern:

```typescript
import type { Hono } from 'hono';
import type { ResolvedTool } from '@shardworks/tools-apparatus';

/**
 * Derive HTTP method from a tool's permission level.
 * read → GET, write/delete/admin → POST, no permission → GET.
 */
function httpMethodFor(tool: ResolvedTool): 'GET' | 'POST' {
  const level = tool.definition.permission?.split(':')[1];
  if (!level || level === 'read') return 'GET';
  return 'POST';
}

/**
 * Derive the route path from a tool name.
 * writ-list → /api/writ/list
 * signal → /api/signal
 * rig-for-writ → /api/rig/for-writ
 */
function routePathFor(name: string): string {
  const firstHyphen = name.indexOf('-');
  if (firstHyphen === -1) return `/api/${name}`;
  const prefix = name.slice(0, firstHyphen);
  const rest = name.slice(firstHyphen + 1);
  return `/api/${prefix}/${rest}`;
}

/**
 * Register auto-mapped tool routes on a Hono app.
 * Returns a manifest of registered routes for the _tools index endpoint.
 */
export function registerToolRoutes(
  app: Hono,
  tools: ResolvedTool[],
): ToolRouteInfo[] { ... }
```

For GET requests, query parameters arrive as strings. The bridge applies the same coercion logic the CLI uses (`coerceCliOpts` from `@shardworks/nexus-cli/helpers`). To avoid a dependency on the CLI package, this coercion logic should be extracted to a shared location — either into `@shardworks/tools-apparatus` or duplicated (it's ~30 lines). The coercion walks the Zod shape and converts strings to numbers/booleans as needed.

### Chrome Injection (`pages.ts`)

When a request arrives for `/pages/{id}/` (or `/pages/{id}/index.html`), the Oculus reads the page's `index.html` from disk, then injects:

1. A `<link rel="stylesheet" href="/oculus/styles.css">` tag in `<head>` (before `</head>`)
2. A navigation header HTML snippet after `<body>` (before the page's own content)
3. A small script that highlights the current page in the nav

The injection is simple string manipulation (find `</head>`, insert before it; find `<body>` or `<body ...>`, insert after it). Pages that don't include `<head>` or `<body>` tags are served as-is without injection.

All other files in the page's `assetsDir` (JS, CSS, images, etc.) are served as static assets without modification.

### Startup Sequence

```
start(ctx):
  1. Read config from guild().guildConfig().oculus ?? {}
  2. Create Hono app
  3. Register static asset routes (/oculus/styles.css, /oculus/chrome.js)
  4. Scan guild().kits() and guild().apparatuses() for pages and routes
  5. Subscribe to ctx.on('plugin:initialized') for late-arriving contributions
  6. Resolve tools from Instrumentarium (caller: 'web'), register auto-mapped routes
  7. Register custom routes (from route contributions)
  8. Register page asset routes (/pages/{id}/*)
  9. Register root route (/) → home page
  10. Start Hono server on configured port
  11. Log serving URL
```

### Apparatus Declaration

```typescript
export default createOculus();

function createOculus() {
  const api: OculusApi = { ... };

  return {
    apparatus: {
      requires: ['tools'],
      consumes: ['pages', 'routes'],
      provides: api,

      start(ctx: StartupContext): Promise<void> { ... },
      stop(): Promise<void> { ... },
    },
  };
}
```

### Non-obvious Touchpoints

1. **`@shardworks/tools-apparatus` ToolCaller type** — must be extended to include `'web'`. This is a one-line type union change in `tool.ts`. The Instrumentarium's `ResolveOptions.caller` already accepts `ToolCaller`, so no further changes needed there.

2. **Query string coercion** — the CLI's `coerceCliOpts` helper converts string values to numbers/booleans based on the Zod schema. The Oculus needs the same logic for GET request query params. Two options:
   - Extract `coerceCliOpts` to `@shardworks/tools-apparatus` (preferred — it's tool-schema logic, not CLI logic)
   - Duplicate the ~30-line function in the Oculus

3. **Hono Context type** — `RouteDefinition.handler` receives a Hono `Context`. This means `hono` is a type-level dependency for any kit author contributing custom routes. This is acceptable — the kit already depends on the Oculus, and Hono's Context is its public API.

4. **Page asset resolution** — `assetsDir` is an absolute path. For kit-contributed pages, this will typically be something like `path.join(__dirname, '../assets/my-page')` in the kit's source, which resolves to a path inside `node_modules/` at runtime. The Oculus doesn't need to know where the assets come from — it just serves the directory.

5. **Hot reload** — pages are served from disk on each request (no caching). This means page authors can edit HTML/CSS/JS and refresh the browser without restarting the guild. This is a deliberate choice for development ergonomics. Production caching can be added later.

## Validation Checklist

- V1 [R1, R2, R3, R4]: Start a guild with the Oculus installed. Verify the server starts on the configured port, logs the URL, and responds to `GET /`. Stop the guild and verify the port is released.

- V2 [R5, R6, R7]: Create a kit with a `pages: [{ id: 'test', title: 'Test', assetsDir: '/path/to/assets' }]` contribution where the assets dir contains `index.html`. Verify `/pages/test/` serves the HTML and `/pages/test/` appears in the navigation.

- V3 [R8]: Verify `PageDefinition` and `OculusKit` are importable from `@shardworks/oculus-apparatus`.

- V4 [R9, R11]: Register 3 pages with different `navGroup` and `navOrder` values. Verify the root page lists them grouped and sorted correctly.

- V5 [R10]: Request a page's `index.html`. Verify it contains the injected `<link>` to `/oculus/styles.css` and the navigation header HTML.

- V6 [R12, R13]: Request `/oculus/styles.css`. Verify it returns valid CSS containing the custom properties, element-type selectors, and utility classes listed in R12.

- V7 [R14, R15, R16]: Install tools `writ-list` (permission: `clerk:read`), `commission-post` (permission: `clerk:write`), and a permissionless tool `guild-status`. Verify:
  - `GET /api/writ/list` works
  - `POST /api/commission/post` works
  - `GET /api/guild-status` works (permissionless → GET)

- V8 [R17]: `GET /api/writ/list?limit=5` — verify `limit` is coerced from string `"5"` to number `5` before passing to the tool handler.

- V9 [R18]: Call an auto-mapped tool with invalid params. Verify `400` with `{ error: ... }`. Call with valid params. Verify `200` with JSON result. Trigger a handler error. Verify `500`.

- V10 [R19]: `GET /api/_tools` returns a JSON array listing all auto-mapped tools with route, method, and JSON Schema params.

- V11 [R20, R21, R22]: Create a kit with a custom route `GET /api/custom/stream`. Verify the route is registered and callable. Create a custom route that conflicts with an auto-mapped tool route. Verify the custom route wins and a startup warning is logged.

- V12 [R23]: Verify `RouteDefinition` is importable from `@shardworks/oculus-apparatus`.

- V13 [R24, R25]: Add `callableBy: ['cli']` to a tool. Verify it is NOT auto-mapped. Add `callableBy: ['web']`. Verify it IS auto-mapped. Remove `callableBy` entirely. Verify it IS auto-mapped (default: all callers).

- V14 [R26, R27]: Set `oculus.port` to `8080` in `guild.json`. Verify the server starts on 8080. Remove the `oculus` key entirely. Verify it defaults to 7470.

- V15 [R28]: Access the `OculusApi` via `guild().apparatus<OculusApi>('oculus')`. Verify `port()`, `url()`, and `pages()` return correct values.

## Test Cases

**Apparatus lifecycle — start and stop cleanly:**
Start a guild with the Oculus. Verify the server responds on the configured port. Stop the guild. Verify the port is released (connection refused on subsequent request).

**Page contribution — kit contributes a page, served correctly:**
A kit contributes `pages: [{ id: 'writs', title: 'Writs', assetsDir: '/tmp/test-assets' }]`. The assets dir contains `index.html` with `<html><head></head><body><h1>Writs</h1></body></html>`. `GET /pages/writs/` returns the HTML with injected stylesheet link and navigation header.

**Page contribution — non-HTML assets served without injection:**
The same assets dir contains `app.js`. `GET /pages/writs/app.js` returns the JS file with correct `Content-Type` and no HTML injection.

**Page contribution — missing index.html:**
A page contribution's `assetsDir` exists but contains no `index.html`. `GET /pages/{id}/` returns 404.

**Page contribution — via plugin:initialized:**
An apparatus with `supportKit: { pages: [...] }` starts after the Oculus. Verify the page becomes available after the lifecycle event fires.

**Navigation — pages grouped and sorted:**
Three pages: `{ id: 'a', navGroup: 'System', navOrder: 2 }`, `{ id: 'b', navGroup: 'System', navOrder: 1 }`, `{ id: 'c' }` (no group). Navigation shows "System" group with b before a, then "Other" group with c.

**Tool auto-mapping — read tool → GET:**
Tool `writ-list` with `permission: 'clerk:read'`. `GET /api/writ/list?status=active&limit=10` returns JSON. `POST /api/writ/list` returns 405 Method Not Allowed.

**Tool auto-mapping — write tool → POST:**
Tool `commission-post` with `permission: 'clerk:write'`. `POST /api/commission/post` with JSON body returns 200. `GET /api/commission/post` returns 405.

**Tool auto-mapping — permissionless tool → GET:**
Tool `guild-status` with no permission field. `GET /api/guild-status` works.

**Tool auto-mapping — query string coercion:**
Tool with `limit: z.number()` param. `GET /api/x/list?limit=5` — handler receives number `5`, not string `"5"`.

**Tool auto-mapping — boolean coercion:**
Tool with `verbose: z.boolean().optional()` param. `GET /api/x/show?verbose=true` — handler receives boolean `true`.

**Tool auto-mapping — Zod validation failure:**
`GET /api/writ/list?limit=not-a-number` returns `400 { error: "..." }` with Zod error message.

**Tool auto-mapping — handler error:**
Tool handler throws. Endpoint returns `500 { error: "..." }`.

**Tool auto-mapping — callableBy filtering:**
Tool with `callableBy: ['cli']` is NOT auto-mapped. Tool with `callableBy: ['web', 'cli']` IS auto-mapped.

**Tool index — _tools endpoint:**
`GET /api/_tools` returns JSON array with entries like `{ name: 'writ-list', route: '/api/writ/list', method: 'GET', params: { ... } }`.

**Custom route — registered and callable:**
Kit contributes `routes: [{ method: 'GET', path: '/api/custom/hello', handler: (c) => c.json({ hi: true }) }]`. `GET /api/custom/hello` returns `{ hi: true }`.

**Custom route — overrides auto-mapped tool:**
Tool `custom-hello` auto-maps to `/api/custom/hello`. Kit also contributes a custom route at the same path. Custom route wins. Startup warning logged.

**Stylesheet — served correctly:**
`GET /oculus/styles.css` returns CSS with `Content-Type: text/css` containing `--bg`, `--surface`, `.card`, `.badge`, `.data-table`, `.btn` definitions.

**Chrome injection — head and body present:**
Page `index.html` contains `<head>` and `<body>`. Served response contains `<link rel="stylesheet" href="/oculus/styles.css">` inside `<head>` and navigation HTML after `<body>`.

**Chrome injection — no head tag:**
Page `index.html` has no `<head>` tag. Served as-is without stylesheet injection. Navigation still injected if `<body>` is present.

**Chrome injection — no body tag:**
Page `index.html` has no `<body>` tag. Served as-is without navigation injection.

**Configuration — custom port:**
`guild.json` has `"oculus": { "port": 9999 }`. Server starts on 9999.

**Configuration — default port:**
No `oculus` key in `guild.json`. Server starts on 7470.

**Provides API — port(), url(), pages():**
After startup, `guild().apparatus<OculusApi>('oculus').port()` returns the listening port. `.url()` returns `http://localhost:{port}`. `.pages()` returns an array of registered pages with correct id, title, and url fields.

**Home page — lists all pages:**
`GET /` returns HTML listing all registered pages with links to `/pages/{id}/`.

**No pages registered — home page shows empty state:**
No kits contribute pages. `GET /` returns HTML with an empty-state message.

**Hot reload — page assets served from disk each request:**
Register a page. Request `GET /pages/{id}/`. Modify the `index.html` file on disk. Request again. Response reflects the updated content without restarting the guild.

---

## Summary

Work shipped via writ w-mnorf3k0-51b5791bdbdd. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/oculus-spec.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mnorf3k0-51b5791bdbdd.