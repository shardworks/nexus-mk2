# Inventory: oculus-enhance-landing-page

## Brief

Remove the "Pages" widget from the Oculus landing page and replace it with a meaningful guild overview: installed plugins and their status, startup warnings, general status information (like the status tool returns), and a configuration summary (possibly including a display of guild.json).

---

## Affected Files

### Directly Modified

| File | Change |
|------|--------|
| `packages/plugins/oculus/src/oculus.ts` | Rewrite the `app.get('/')` handler to render the new overview page. Possibly add a new API endpoint (e.g. `GET /api/guild/status`). |
| `packages/plugins/oculus/src/oculus.test.ts` | Update/replace the "Oculus home page" integration test suite. |
| `packages/plugins/oculus/src/static/style.css` | Possibly extend with new CSS classes if needed; otherwise the existing palette is sufficient. |

### Possibly Modified

| File | Change |
|------|--------|
| `packages/framework/core/src/guild.ts` | If startup warnings need to be stored on the `Guild` interface, this file plus `packages/framework/arbor/src/arbor.ts` would need changes. Currently `Guild` has no `startupWarnings()` method. |
| `packages/framework/arbor/src/arbor.ts` | Would need to capture and store warnings if `Guild.startupWarnings()` is added. |
| `packages/framework/core/src/index.ts` | Would need to re-export any new types from `guild.ts` if Guild interface changes. |

### Created (if JSON API approach used)

| File | Change |
|------|--------|
| (none) | No new files required for server-rendered approach. A `/api/guild/status` route could be added inline. |

---

## Current Types and Interfaces

### `Guild` (packages/framework/core/src/guild.ts)

```typescript
export interface Guild {
  readonly home: string
  apparatus<T>(name: string): T
  config<T = Record<string, unknown>>(pluginId: string): T
  writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void
  guildConfig(): GuildConfig
  kits(): LoadedKit[]
  apparatuses(): LoadedApparatus[]
  failedPlugins(): FailedPlugin[]
}
```

Notable: no `startupWarnings()` method. Startup warnings are computed and emitted via `console.warn` in `arbor.ts` during `createGuild()` — they are discarded afterward.

### `GuildConfig` (packages/framework/core/src/guild-config.ts)

```typescript
export interface GuildConfig {
  name: string
  nexus: string
  plugins: string[]
  clockworks?: ClockworksConfig
  settings?: GuildSettings
}

export interface GuildSettings {
  model?: string
  autoMigrate?: boolean
}

export interface ClockworksConfig {
  events?: Record<string, EventDeclaration>
  standingOrders?: StandingOrder[]
}
```

Also: oculus module-augments `GuildConfig` with `oculus?: OculusConfig` in `packages/plugins/oculus/src/index.ts`.

### `LoadedKit` / `LoadedApparatus` / `FailedPlugin` (packages/framework/core/src/plugin.ts)

```typescript
export interface LoadedKit {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly kit:         Kit
}

export interface LoadedApparatus {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly apparatus:   Apparatus
}

export interface FailedPlugin {
  readonly id:     string
  readonly reason: string
}
```

### `OculusConfig` (packages/plugins/oculus/src/types.ts)

```typescript
export interface OculusConfig {
  port?: number;
}
```

### `PageContribution` / `RouteContribution` / `OculusKit` (packages/plugins/oculus/src/types.ts)

```typescript
export interface PageContribution {
  id: string;
  title: string;
  dir: string;
}

export interface RouteContribution {
  method: string;
  path: string;
  handler: (c: Context) => Response | Promise<Response>;
}

export interface OculusKit {
  pages?: PageContribution[];
  routes?: RouteContribution[];
}
```

---

## Key Functions

### `createOculus()` — packages/plugins/oculus/src/oculus.ts

The apparatus factory. Returns a `Plugin` with an `apparatus` containing:
- `start(ctx)`: Builds the Hono app, registers all routes, starts the HTTP server.
- `stop()`: Closes the HTTP server.
- `supportKit`: Exposes an `oculus` tool (blocks until process signal).

The `app.get('/')` handler (lines 457–494) is the landing page — the primary change target.

### Home page handler (current, lines 457–494)

```typescript
app.get('/', (c) => {
  const guildName = g.guildConfig().name;
  const navHtml = buildNavHtml(pages);

  const pageLinks =
    pages.length > 0
      ? pages.map((p) => `<li><a href="/pages/${p.id}/">${p.title}</a></li>`).join('\n        ')
      : '<li class="empty-state">No pages registered.</li>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guildName} — Guild Dashboard</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
${navHtml}
<main style="padding: 24px;">
  <h1>${guildName}</h1>
  <div class="card">
    <h2>Pages</h2>
    <ul>
        ${pageLinks}
    </ul>
  </div>
</main>
</body>
</html>`;

  return c.html(html);
});
```

### `buildNavHtml(pages)` — packages/plugins/oculus/src/oculus.ts (lines 134–142)

Builds the `<nav id="oculus-nav">` bar from `PageContribution[]`. Always includes `<a href="/">Guild</a>` as the first link. This function is unchanged by the brief.

### `collectStartupWarnings(kits, apparatuses)` — packages/framework/arbor/src/guild-lifecycle.ts

```typescript
export function collectStartupWarnings(
  kits: LoadedKit[],
  apparatuses: LoadedApparatus[],
): string[]
```

Returns advisory warning strings. Checks:
- Apparatus `recommends` entries that aren't installed
- Kit `recommends` entries that aren't installed
- Kit contribution keys that no installed apparatus declares in `consumes`

**Not imported by oculus** — it lives in `@shardworks/nexus-arbor` which is a framework-internal package, not a public dependency. The oculus depends only on `@shardworks/nexus-core` and `@shardworks/tools-apparatus`.

### `VERSION` — packages/framework/core/src/index.ts

```typescript
export const VERSION: string  // the current nexus framework version
```

Exported from `@shardworks/nexus-core`. Used by the `status` CLI tool to show the nexus version.

---

## Data Available at Route Handler Time

When `app.get('/')` fires, the guild is fully started. The following data is directly accessible via `guild()`:

| Data | Access | Notes |
|------|--------|-------|
| Guild name | `g.guildConfig().name` | Always present |
| Guild home path | `g.home` | Absolute path on disk |
| Nexus framework version | `VERSION` (import from nexus-core) | Package version |
| Default model | `g.guildConfig().settings?.model` | May be undefined |
| Installed plugin ids | `g.guildConfig().plugins` | From guild.json; all declared plugins |
| Loaded kits | `g.kits()` | Only successfully loaded ones |
| Loaded apparatuses | `g.apparatuses()` | Only successfully loaded ones |
| Failed plugins | `g.failedPlugins()` | `{id, reason}[]` |
| Full guild.json | `g.guildConfig()` | The raw parsed config object |
| Plugin-specific config | `g.config(pluginId)` | Arbitrary JSON |
| Startup warnings | **not available** | Computed and discarded by arbor before oculus starts |

---

## Startup Warnings Gap

The `Guild` interface has **no `startupWarnings()` method**. Warnings are computed by `collectStartupWarnings()` in `guild-lifecycle.ts` and immediately printed via `console.warn` in `arbor.ts` — then discarded. The guild object does not retain them.

To display startup warnings in the dashboard, options are:

1. **Add `Guild.startupWarnings(): string[]`** — requires modifying `guild.ts` (interface), `arbor.ts` (implementation), and `index.ts` (re-export). A clean, direct solution.

2. **Re-compute warnings in the oculus** — the oculus has `g.kits()` and `g.apparatuses()`, which is exactly what `collectStartupWarnings` takes as input. But the function is not exported from any public package — it's internal to `@shardworks/nexus-arbor`. The oculus could re-implement a subset of the logic inline, but this creates duplication.

3. **Expose `collectStartupWarnings` from arbor** — not appropriate; arbor is a framework-internal package not listed in oculus's dependencies.

---

## The Status Tool (for reference)

`packages/framework/cli/src/commands/status.ts` — a `patron`-callable tool that, when run, returns:

```typescript
{
  guild:         config.name,
  nexus:         VERSION,
  home,
  model:         config.settings?.model ?? '(not set)',
  plugins:       [...config.plugins].sort(),
  failedPlugins: failed,
}
```

Note: the status tool reads `config.plugins` (declared plugins) — it does NOT discriminate kits from apparatuses. It reads from the raw guild.json and relies on `g.failedPlugins()`. This is different from what the oculus can access at handler time (it has actual `g.kits()` and `g.apparatuses()`, not just declared names).

The oculus can do better than the status tool — it has the live runtime data.

---

## Existing CSS (style.css)

The existing `style.css` uses a Tokyo Night dark palette with these utility classes available for use without changes:

- `.card` — surface card with border and padding
- `.badge`, `.badge--success`, `.badge--error`, `.badge--warning`, `.badge--info`, `.badge--active` (pulsing)
- `.data-table` — alternating row table
- `.btn`, `.btn--primary`, `.btn--success`, `.btn--danger`
- `.toolbar` — flex row for buttons
- `.empty-state` — centered dim text

Custom properties:
- `--bg`, `--surface`, `--surface2`, `--border`
- `--text`, `--text-dim`, `--text-bright`
- `--green`, `--red`, `--yellow`, `--cyan`, `--magenta`, `--blue`

---

## Adjacent Patterns

### No existing plugin page contributions

No plugin currently contributes `PageContribution[]` items to the oculus aside from test fixtures. The oculus's static `/pages/{id}/` serving infrastructure exists and is tested, but no real plugin page exists yet.

### Other apparatus pages (none)

No apparatus has a `supportKit` with pages. This means the home page enhancement is the first real "built-in" page in the dashboard.

### Server-rendered pattern

The current home page and all nav injection is purely server-rendered — no client-side JavaScript. The oculus has no bundling infrastructure. If the new landing page needs interactivity (e.g., editable guild.json), inline `<script>` tags would be required, or a separate static assets approach (a directory under `src/static/`).

### The `/api/_tools` endpoint

Added in `oculus.ts` as a custom in-file route. Pattern for adding further internal API routes: add `app.get('/api/_something', ...)` before the static fallback, after custom and tool routes. The `_` prefix signals a framework-owned route.

### `guild()` in route handlers

All Hono handlers in `start()` close over `g = guild()`, which is captured once at the top of `start()`. This means all data accessed in route handlers reflects the live guild state at the time of the request — appropriate for non-mutating reads.

---

## Test Patterns

The `oculus.test.ts` file uses:
- `describe` / `it` / `before` / `after` / `afterEach` from Node's built-in test runner
- `assert` from `node:assert/strict`
- `wireGuild()` to mock the `Guild` singleton with typed fixtures
- Real HTTP fetch against a live bound server (random ports in 17xxx range)
- `makeTmpDir()` / `cleanupTmpDir()` for filesystem fixtures

The "Oculus home page" test (lines 449–494) tests the current `GET /` behavior:
- Checks for guild name and page links in the response HTML
- Checks for `/static/style.css` link and nav element

This test will need to be updated when the landing page changes.

---

## Doc/Code Discrepancies

None observed within the oculus package. The `status.ts` doc comment says "Type discrimination (kit vs apparatus) requires loading the modules, which is deferred to avoid startup cost for status" — this is accurate for the CLI `status` command which runs before guild startup. It is NOT a limitation for the oculus, which runs inside a started guild where `g.kits()` and `g.apparatuses()` are live.

---

## Scratch Notes / Known Gaps

- `_planning/brief.md` — the source brief (no additional planning context found)
- No prior commissions touching this code found in the codebase
- No `docs/architecture/apparatus/oculus.md` exists — the oculus is not yet documented in the apparatus docs directory
