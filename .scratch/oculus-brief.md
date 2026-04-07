# The Oculus — Web Dashboard Apparatus — Commission Brief

## Problem

The guild has two interface surfaces: the `nsg` CLI and the MCP tool server (for anima sessions). Neither provides a persistent, visual overview of guild state. Previous attempts at a web dashboard produced a single monolithic apparatus and produced a broken 1000-line inline-HTML file — no extensibility, no separation of concerns, fatal JS syntax errors from escaped quotes in template literals.

What's missing is a framework-level web dashboard apparatus that any plugin can extend with its own pages and API endpoints, following the same kit contribution pattern used by tools, engines, and relays.

## Goal

A new apparatus ("The Oculus") that serves a web dashboard for the guild. Plugins contribute pages as static asset directories. Guild tools are automatically exposed as REST endpoints. The Oculus provides shared chrome (navigation) and a base stylesheet so contributed pages look cohesive with zero effort.

## Design Decisions

These decisions were made during design and should be treated as constraints, not suggestions.

### Web server: Hono

Use Hono as the HTTP framework. It has zero transitive dependencies (vs 65 for Express, 42 for Fastify, 30 for Koa), built-in TypeScript support, and a clean async API. It's a framework dependency of the Oculus package — not exposed to page authors.

### Pages as kit contributions, not widgets

The Oculus `consumes: ['pages', 'routes']`. Plugins contribute full pages — not widgets, cards, or dashboard fragments. Each page is a self-contained view. There is no cross-plugin layout coordination, no widget grid, no shared dashboard surface. If an overview/home page is wanted, the Oculus itself provides one (listing registered pages with links).

Pages may also be contributed through apparatus `supportKit`, following the same pattern as tools and engines.

### Pages are static asset directories

Each page contribution points to a directory containing static files (HTML, CSS, JS) with an `index.html` entry point. The Oculus serves these files under `/pages/{id}/`. No server-side rendering, no templating engine, no build step imposed by the Oculus. Plugins *may* use their own build steps (e.g., bundling a React app) in their publish pipeline, but that's the plugin's concern — the Oculus just serves the output directory.

Page assets are served from disk on each request (no caching). This gives hot-reload during development for free.

### Tool→REST auto-mapping with CLI-mirror naming

The Oculus automatically exposes guild tools as REST endpoints. The URL convention mirrors the CLI's hyphen-prefix grouping:

- `writ-list` → `GET /api/writ/list`
- `commission-post` → `POST /api/commission/post`
- `rig-for-writ` → `GET /api/rig/for-writ`
- `signal` → `POST /api/signal`

This is a mechanical transform — first hyphen splits prefix from rest, prepend `/api/`. No RESTful resource inference, no pluralization, no ambiguity.

HTTP method is inferred from the tool's `permission` level: `read` (or no permission) → GET, `write`/`admin` → POST, `delete` → DELETE.

For GET endpoints, query string parameters need the same string→number/boolean coercion the CLI applies (all query params arrive as strings; the tool's Zod schema expects typed values).

### Rename `'cli'` caller type to `'patron'`

`ToolCaller` in `@shardworks/tools-apparatus` is renamed from `'cli' | 'anima' | 'library'` to `'patron' | 'anima' | 'library'`. The `'patron'` caller covers all human-facing interfaces — CLI, web dashboard, any future patron tooling. The Oculus resolves tools with `caller: 'patron'`, same as the CLI. No new caller type needed.

### Custom route contributions for escape hatches

For things that don't fit the tool model (SSE streams, WebSocket connections, file uploads), plugins contribute explicit route definitions with a method, path pattern, and Hono handler function. Custom routes must be under `/api/`. If a custom route conflicts with an auto-mapped tool route, the custom route wins (with a startup warning).

### Chrome injection (server-side)

The Oculus intercepts page `index.html` responses and injects: (1) a stylesheet link in `<head>`, and (2) a navigation header after `<body>`. This means page authors get navigation and styling with zero boilerplate — just write an HTML file. Pages without `<head>` or `<body>` tags are served as-is.

### Shared stylesheet approach

The Oculus ships a static CSS file providing three layers:

1. **CSS custom properties** for theming — the standard dark palette (`--bg`, `--surface`, `--border`, `--text`, color accents)
2. **Element-type selectors** for baseline styling — `body`, `table`, `button`, `input`, `pre`, `code`, headings, links all look right with no classes
3. **Utility classes** for common patterns — `.card`, `.badge`, `.badge--success`, `.data-table`, `.btn`, `.toolbar`, `.empty-state`

The stylesheet is a static file in the package, not generated at runtime.

### Self-documenting API index

`GET /api/_tools` returns a JSON listing of all auto-mapped tools with their route, HTTP method, and parameter schemas. Page authors can hit this endpoint to discover what's available.

### Configuration

The Oculus reads `guild.json` under the `oculus` key. Only setting initially: `port` (default: `7470`).

### Style Direction

Dark, monospace, terminal-aesthetic. Key characteristics:

- **Palette** — Tokyo Night-inspired dark theme. Deep navy backgrounds, muted text, cyan/green/magenta/yellow accents.
- **Typography** — monospace font stack (`"SF Mono", "Fira Code", "JetBrains Mono", monospace`), 13px base, 1.6 line-height.
- **Surfaces** — layered backgrounds (`--bg` → `--surface` → `--surface2`) with subtle 1px borders. Rounded corners (6-8px).
- **Controls** — buttons are solid accent colors with dark text, not outlined. Inputs have dark backgrounds with border highlights on focus.
- **Status indication** — colored badges with translucent tinted backgrounds (e.g., `rgba(158,206,106,0.15)` with `--green` text). Pulsing animation for active/running states.
- **Density** — compact but not cramped. 13px font, 8-16px padding, 8px gaps. Information-dense like a terminal, not spacious like a marketing site.

Reference custom properties from the plan-workshop:

```css
:root {
  --bg: #1a1b26; --surface: #24283b; --surface2: #2f3549; --border: #3b4261;
  --text: #c0caf5; --text-dim: #565f89; --text-bright: #e0e6ff;
  --green: #9ece6a; --red: #f7768e; --yellow: #e0af68; --cyan: #7dcfff;
  --magenta: #bb9af7; --blue: #7aa2f7;
}
```

## Out of Scope

- Authentication or access control (the dashboard is localhost-only for now)
- WebSocket support in the core (custom routes can do it, but no framework-level WebSocket machinery)
- Page-to-page communication or shared client-side state
- Server-side rendering or templating
- Asset bundling, minification, or build tooling
- A component library (just CSS — JS components can come later as patterns emerge)
- Production caching headers or CDN concerns

## Dependencies

- Hono — npm package, zero transitive deps
- The Instrumentarium (`tools`) — required for tool resolution and auto-mapping
- Kit contribution scanning — existing `consumes` + `plugin:initialized` pattern
