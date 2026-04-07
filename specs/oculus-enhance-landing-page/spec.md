---
author: plan-writer
estimated_complexity: 5
---

# Oculus: Enhance Landing Page

## Summary

Replace the Oculus landing page's "Pages" widget with a comprehensive guild status overview showing guild identity, startup warnings, installed plugins with type/status discrimination, and a read-only guild.json display. Add `Guild.startupWarnings()` to the framework core so the oculus can access advisory warnings. Add a `GET /api/_status` JSON endpoint.

## Current State

The Oculus landing page (`app.get('/')` in `packages/plugins/oculus/src/oculus.ts`, lines 457–494) is a server-rendered HTML template that shows:
- The guild name as an `<h1>`
- A single `.card` containing "Pages" — a `<ul>` of links to registered plugin pages, or an empty-state message

The nav bar (`buildNavHtml`) already includes links to all registered pages, making the pages card redundant.

The `Guild` interface (`packages/framework/core/src/guild.ts`) exposes `failedPlugins(): FailedPlugin[]` but has no method for startup warnings. Warnings are computed by `collectStartupWarnings()` in `packages/framework/arbor/src/guild-lifecycle.ts` and emitted via `console.warn` in `packages/framework/arbor/src/arbor.ts` (line 123) — then discarded.

Current type signatures:

```typescript
// packages/framework/core/src/guild.ts
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

The test helper `wireGuild` in `packages/plugins/oculus/src/oculus.test.ts` (lines 101–136) builds a mock `Guild` that matches this interface. The "Oculus home page" test suite (lines 449–494) asserts the current page content.

## Requirements

- R1: The `Guild` interface in `packages/framework/core/src/guild.ts` must include a `startupWarnings(): string[]` method that returns advisory warning strings collected during guild startup.
- R2: The Arbor runtime in `packages/framework/arbor/src/arbor.ts` must capture the return value of `collectStartupWarnings()` and expose it via the guild instance's `startupWarnings()` method.
- R3: The landing page (`GET /`) must display a guild identity card containing: guild name, nexus version, home path, default model (or "(not set)"), oculus port.
- R4: When `g.failedPlugins()` returns any entries, those entries must appear inline in the plugins table with a red `badge--error` "failed" badge and the failure reason displayed.
- R5: The landing page must display all loaded plugins in a single table with columns: id, type ("apparatus" or "kit"), version, and a status badge. Apparatus rows use `badge--success` (green). Kit rows use `badge--info` (cyan). Failed plugin rows use `badge--error` (red).
- R6: When `g.startupWarnings()` returns a non-empty array, the landing page must display a "Warnings" card between the identity card and the plugins table, listing each warning string. When there are no warnings, this card must not appear.
- R7: The landing page must display the raw guild.json file contents in a read-only `<pre>` block inside a `<details>`/`<summary>` element that is collapsed by default.
- R8: The raw guild.json content for the landing page must be read from disk using `fs.readFileSync` on the guild.json file path (not from the in-memory config object).
- R9: The "Pages" widget must be completely removed from the landing page. Page links remain accessible only via the nav bar.
- R10: The landing page sections must appear in this order: Identity card, Warnings (conditional), Plugins table, Configuration.
- R11: A `GET /api/_status` endpoint must be registered, returning a JSON object with the shape: `{ guild: string, nexus: string, home: string, model: string, port: number, apparatuses: Array<{id, version}>, kits: Array<{id, version}>, failedPlugins: Array<{id, reason}>, warnings: string[], config: object }`.
- R12: The `/api/_status` endpoint must return the in-memory config from `g.guildConfig()` for the `config` field (no disk I/O).
- R13: The landing page must remain server-rendered (HTML template string in the route handler) with no client-side JavaScript.
- R14: Minimal new CSS must be added to `packages/plugins/oculus/src/static/style.css` for the guild.json `<pre>` display block and `<details>`/`<summary>` styling.

## Design

### Type Changes

#### `Guild` interface — `packages/framework/core/src/guild.ts`

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
  /** Advisory warnings collected during guild startup (missing recommends, unconsumed contributions). */
  startupWarnings(): string[]
}
```

No new types are introduced. The method returns `string[]` — the same format `collectStartupWarnings()` already produces.

### Behavior

#### Arbor: capture and expose startup warnings

In `packages/framework/arbor/src/arbor.ts`, the current code at lines 121–125:

```typescript
for (const warning of collectStartupWarnings(kits, apparatuses)) {
  console.warn(warning);
}
```

Must become:

```typescript
const allWarnings = collectStartupWarnings(kits, apparatuses);
for (const warning of allWarnings) {
  console.warn(warning);
}
```

Then, in the `guildInstance` object literal (line 137+), add alongside the existing `failedPlugins()`:

```typescript
startupWarnings() { return [...allWarnings]; },
```

This follows the identical pattern used for `failedPlugins()` / `allFailures`.

#### Oculus: new landing page handler

The `app.get('/')` handler in `packages/plugins/oculus/src/oculus.ts` must be rewritten. The handler reads data from the guild singleton and renders server-side HTML. Pseudostructure:

1. **Guild identity card** — a `.card` containing a key-value list:
   - Guild: `g.guildConfig().name`
   - Nexus: `VERSION` (imported from `@shardworks/nexus-core`)
   - Home: `g.home`
   - Model: `g.guildConfig().settings?.model ?? '(not set)'`
   - Port: `oculusConfig.port ?? 7470` (the `port` variable already in scope from line 215)

2. **Warnings card** (conditional) — when `g.startupWarnings().length > 0`, render a `.card` with a `<h2>Warnings</h2>` and a `<ul>` of warning strings. Each `<li>` should use the `badge--warning` class for the bullet or wrap the text in a warning-styled container. When there are no warnings, this entire card is omitted from the HTML.

3. **Plugins table** — a `.card` containing a `<table class="data-table">`:
   - Header row: Id, Type, Version, Status
   - One row per apparatus from `g.apparatuses()`: id, "apparatus", version, `<span class="badge badge--success">apparatus</span>`
   - One row per kit from `g.kits()`: id, "kit", version, `<span class="badge badge--info">kit</span>`
   - One row per failed plugin from `g.failedPlugins()`: id, "—", "—", `<span class="badge badge--error">failed</span>`, with the failure reason in a second line or `title` attribute on the badge
   - When there are no plugins at all (no kits, no apparatuses, no failed), show an empty-state row

4. **Configuration** — a `.card` containing a `<details>` element:
   - `<summary>` text: "guild.json"
   - Inside: a `<pre><code>` block containing the raw guild.json file text, read via `fs.readFileSync(path.join(g.home, 'guild.json'), 'utf-8')`. The text must be HTML-escaped (replace `<`, `>`, `&` with entities) to prevent injection.

The handler must import `VERSION` from `@shardworks/nexus-core` and `guildConfigPath` from `@shardworks/nexus-core` (or construct the path with `path.join(g.home, 'guild.json')` — the latter is simpler since `path` is already imported).

#### Oculus: `/api/_status` endpoint

Register `app.get('/api/_status', ...)` in the same location as the existing `app.get('/api/_tools', ...)` (after tool route registration, before static assets). The handler returns:

```typescript
app.get('/api/_status', (c) => {
  const config = g.guildConfig();
  return c.json({
    guild: config.name,
    nexus: VERSION,
    home: g.home,
    model: config.settings?.model ?? '(not set)',
    port: port,
    apparatuses: g.apparatuses().map(a => ({ id: a.id, version: a.version })),
    kits: g.kits().map(k => ({ id: k.id, version: k.version })),
    failedPlugins: g.failedPlugins().map(f => ({ id: f.id, reason: f.reason })),
    warnings: g.startupWarnings(),
    config: config,
  });
});
```

#### CSS additions

Add to `packages/plugins/oculus/src/static/style.css`:

```css
/* ── Config display ──────────────────────────────────────────────── */
.config-block {
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}

details summary {
  cursor: pointer;
  color: var(--text-dim);
  font-size: 13px;
  padding: 4px 0;
}

details summary:hover {
  color: var(--text);
}

details[open] summary {
  margin-bottom: 8px;
}
```

#### HTML escaping

The raw guild.json text must be HTML-escaped before insertion into the template. Add a small helper function in `oculus.ts`:

```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

#### Test helper update

The `wireGuild` mock in `packages/plugins/oculus/src/oculus.test.ts` must add a `startupWarnings()` method to the mock `Guild` object. Default to returning `[]`. Accept an optional `startupWarnings?: string[]` parameter in the `wireGuild` options to enable testing the warnings display.

### Non-obvious Touchpoints

- **`packages/framework/core/src/guild.ts`** — The `Guild` interface change. Any code that creates a `Guild`-shaped object (arbor.ts, test mocks) must add the new method. The oculus test's `wireGuild` is one such mock.
- **`packages/framework/arbor/src/arbor.ts`** — The startup warnings capture. The change is 3 lines: rename the loop variable to a const, add the method to guildInstance.
- **`packages/framework/arbor/src/guild-lifecycle.test.ts`** — Does NOT need changes. It tests `collectStartupWarnings` directly, not through the Guild interface.
- **`packages/plugins/oculus/src/oculus.ts` import line** — Must add `VERSION` to the import from `@shardworks/nexus-core` (line 17 currently imports only `guild`).

### Dependencies

The `Guild.startupWarnings()` interface change (R1, R2) must land before the oculus changes can compile. These can be in the same commit but the core/arbor changes are prerequisites.

## Validation Checklist

- V1 [R1]: Verify `Guild` interface in `packages/framework/core/src/guild.ts` includes `startupWarnings(): string[]`. Run `grep 'startupWarnings' packages/framework/core/src/guild.ts` — must match.
- V2 [R2]: Verify arbor captures warnings. Run `grep 'allWarnings' packages/framework/arbor/src/arbor.ts` — must show the const capture and the guildInstance method.
- V3 [R3, R10, R13]: Fetch `GET /` in tests. Response HTML must contain the guild name, "Nexus", "Home", "Model", "Port", and `/static/style.css`. No `<script>` tags in the response.
- V4 [R5, R22]: Fetch `GET /` with a guild containing both kits and apparatuses. Response HTML must contain `badge--success` (for apparatus), `badge--info` (for kit), and a `<table` or `data-table` class.
- V5 [R4]: Fetch `GET /` with a guild containing failed plugins. Response HTML must contain `badge--error` and the failure reason text.
- V6 [R6]: Fetch `GET /` with a guild where `startupWarnings()` returns non-empty. Response HTML must contain "Warnings" and the warning text. Fetch `GET /` with empty warnings — "Warnings" must NOT appear.
- V7 [R7, R8, R9]: Fetch `GET /`. Response must contain `<details` and `<summary` and `guild.json`. Response must NOT contain the old "Pages" `<h2>` or page link `<li>`. Verify the raw file content appears (write a known guild.json to the tmp dir and check the response contains its text).
- V8 [R11, R12, R19, R20]: Fetch `GET /api/_status`. Response must be valid JSON with keys: `guild`, `nexus`, `home`, `model`, `port`, `apparatuses` (array of {id, version}), `kits` (array of {id, version}), `failedPlugins` (array of {id, reason}), `warnings` (array), `config` (object). The `config` field must be an object (not a string).
- V9 [R14]: Verify `packages/plugins/oculus/src/static/style.css` contains `.config-block` and `details summary` rules. Run `grep 'config-block' packages/plugins/oculus/src/static/style.css`.
- V10 [R1, R2]: Run `cd packages/framework/arbor && npm test` — all existing arbor tests pass.
- V11 [R3, R4, R5, R6, R7, R8, R9, R11]: Run `cd packages/plugins/oculus && npm test` — all oculus tests pass including updated/new home page tests and new _status endpoint tests.

## Test Cases

### Landing page — guild identity card
- **Scenario**: Guild with name "my-guild", nexus "0.0.0", model "opus", port 17800.
- **Expected**: `GET /` returns HTML containing "my-guild", "0.0.0", the home path, "opus", "17800".

### Landing page — model not set
- **Scenario**: Guild with no `settings.model`.
- **Expected**: `GET /` returns HTML containing "(not set)" for the model field.

### Landing page — plugins table with apparatuses and kits
- **Scenario**: Guild with 1 apparatus (id: "tools", version: "1.0.0") and 1 kit (id: "my-kit", version: "2.0.0").
- **Expected**: `GET /` returns HTML with a table containing both rows. "tools" row has `badge--success`. "my-kit" row has `badge--info`.

### Landing page — failed plugins inline
- **Scenario**: Guild with `failedPlugins()` returning `[{id: "broken", reason: "missing dependency"}]`.
- **Expected**: `GET /` returns HTML with "broken" in the table, `badge--error`, and "missing dependency" visible.

### Landing page — warnings displayed when present
- **Scenario**: Guild with `startupWarnings()` returning `['[arbor] warn: "x" recommends "y" but it is not installed.']`.
- **Expected**: `GET /` returns HTML containing "Warnings" heading and the warning text.

### Landing page — no warnings card when empty
- **Scenario**: Guild with `startupWarnings()` returning `[]`.
- **Expected**: `GET /` returns HTML that does NOT contain a "Warnings" heading.

### Landing page — guild.json display
- **Scenario**: Write a guild.json to the test tmp dir with known content `{"name":"test","nexus":"0.0.0","plugins":[]}`.
- **Expected**: `GET /` returns HTML containing `<details`, `<summary`, and the raw JSON text. The content is inside a `<pre>` block.

### Landing page — pages widget removed
- **Scenario**: Guild with registered pages.
- **Expected**: `GET /` returns HTML that does NOT contain a "Pages" `<h2>` or page `<li>` links. The nav bar still contains page links.

### Landing page — HTML escaping of config
- **Scenario**: Guild.json contains characters that need escaping: `<script>alert("xss")</script>`.
- **Expected**: `GET /` returns HTML where the config block contains `&lt;script&gt;` (escaped), NOT raw `<script>`.

### API — /api/_status returns complete status
- **Scenario**: Guild with 1 apparatus, 1 kit, 0 failed plugins, 0 warnings.
- **Expected**: `GET /api/_status` returns 200 with JSON containing all expected keys. `apparatuses` is an array with 1 entry having `id` and `version`. `kits` is an array with 1 entry. `failedPlugins` is `[]`. `warnings` is `[]`. `config` is an object.

### API — /api/_status includes failed plugins and warnings
- **Scenario**: Guild with failed plugins and warnings.
- **Expected**: `GET /api/_status` returns JSON where `failedPlugins` contains entries with `id` and `reason`, and `warnings` contains string entries.

### API — /api/_status config is object not string
- **Scenario**: Any guild.
- **Expected**: `GET /api/_status` returns JSON where `typeof response.config === 'object'` (not a raw string).
