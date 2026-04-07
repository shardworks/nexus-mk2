---
author: plan-writer
estimated_complexity: 13
---

# Spider Page for Oculus

## Summary

Add an Oculus dashboard page for the Spider apparatus, showing runtime rig/engine state and configuration (templates, engine designs, block types). This requires wiring a `recommends` dependency on Oculus, creating static page assets, contributing custom API routes, adding `listEngineDesigns()` to `FabricatorApi`, adding `listBlockTypes()` to `SpiderApi`, and creating two new tools.

## Current State

The Spider apparatus (`packages/plugins/spider/`) manages rig execution. Its apparatus declaration in `packages/plugins/spider/src/spider.ts`:

```typescript
return {
  apparatus: {
    requires: ['stacks', 'clerk', 'fabricator'],
    consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings'],
    supportKit: {
      books: { rigs: {...}, 'input-requests': {...} },
      engines: { draft, implement, review, revise, seal },
      blockTypes: { 'writ-status', 'scheduled-time', 'book-updated', 'patron-input' },
      tools: [ /* 13 tools */ ],
    },
    provides: api,
    start(ctx) { ... },
  },
};
```

There is no `recommends` field and no `pages` or `routes` on the supportKit. No plugin currently contributes a page to the Oculus.

The `FabricatorApi` (`packages/plugins/fabricator/src/fabricator.ts`) has only:

```typescript
export interface FabricatorApi {
  getEngineDesign(id: string): EngineDesign | undefined;
}
```

Its `EngineRegistry` stores designs in a `Map<string, EngineDesign>` without tracking which plugin contributed each design.

The `SpiderApi` (`packages/plugins/spider/src/types.ts`) has `getBlockType(id)` but no enumeration method. The `BlockTypeRegistry` in `spider.ts` stores block types in a `Map<string, BlockType>` without provenance.

The Oculus (`packages/plugins/oculus/`) serves plugin pages as static asset directories and registers custom API routes, both via supportKit `pages` and `routes` contributions.

## Requirements

- R1: The Spider apparatus must declare `recommends: ['oculus']` so it generates a startup warning when Oculus is absent but does not fail.
- R2: The Spider must contribute a page to the Oculus with id `'spider'` and title `'Spider'`, served from `src/static/` within the spider package.
- R3: The Spider's `package.json` must add `hono` as a dependency (for route handler typing) and add `'src/static'` to the `files` array for publishing. It must NOT add `@shardworks/oculus-apparatus` as a dependency.
- R4: The page must have two tabs: "Rigs" (runtime UI) and "Config" (configuration UI), implemented with vanilla HTML/CSS/JS and no framework.
- R5: The Rigs tab must display a rig list table with columns: id, writId (linked to `/pages/clerk/?writ={writId}`), status (as a colored badge), engine summary (e.g. "3/5 completed"), and createdAt.
- R6: The rig list must provide a status dropdown filter (server-side via the existing `rig-list` tool endpoint), a writId text input filter (client-side), and date range inputs for createdAt (client-side). Column headers must be clickable for client-side sorting.
- R7: The rig list must have a manual refresh button. No auto-refresh.
- R8: Clicking a rig in the list must switch to a detail view (replacing the list) with a back button to return.
- R9: The rig detail view must show a CSS-based pipeline/flowchart visualization of engines with arrows indicating upstream dependencies. Each engine node must display its id and status badge.
- R10: Clicking an engine node must populate a separate detail panel (below the pipeline) showing: status, designId, upstream, startedAt, completedAt, error (if any), sessionId (if any), block record (if blocked), and collapsible `<details>` sections for givensSpec and yields as readonly JSON.
- R11: Status badges must use existing Oculus CSS classes: completed → `badge--success`, running → `badge--active`, failed → `badge--error`, blocked → `badge--warning`, pending → `badge` (default dim), cancelled → `badge` (default dim).
- R12: `FabricatorApi` must gain a `listEngineDesigns()` method returning `EngineDesignInfo[]`. The `EngineRegistry` must track the contributing plugin ID for each design.
- R13: `SpiderApi` must gain a `listBlockTypes()` method returning `BlockTypeInfo[]`. The `BlockTypeRegistry` must track the contributing plugin ID for each block type.
- R14: A new `engine-designs` tool must be created in the spider's supportKit that calls `fabricator.listEngineDesigns()`, auto-mapped by Oculus to `GET /api/engine/designs`.
- R15: A new `block-types` tool must be created in the spider's supportKit that calls `spider.listBlockTypes()`, auto-mapped by Oculus to `GET /api/block/types`.
- R16: The Spider must contribute a custom API route `GET /api/spider/config` that returns an aggregated JSON response containing rig templates, engine designs (from `fabricator.listEngineDesigns()`), and block types (from `spider.listBlockTypes()`).
- R17: The Config tab must display each configured rig template in a `<pre><code>` block, labeled by its template key name (writ type or 'default').
- R18: The Config tab must display registered engine designs in a table with columns: id, contributing plugin, has-collect (boolean).
- R19: The Config tab must display registered block types in a table with columns: id, contributing plugin, pollIntervalMs.
- R20: The route handler code must live in `packages/plugins/spider/src/oculus-routes.ts`.

## Design

### Type Changes

#### `packages/plugins/fabricator/src/fabricator.ts` — new type and API method

```typescript
/** Summary info for a registered engine design. */
export interface EngineDesignInfo {
  /** Engine design id. */
  id: string;
  /** Plugin id that contributed this design. */
  pluginId: string;
  /** Whether the design defines a collect() method (indicates quick engine with custom yield assembly). */
  hasCollect: boolean;
}

/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
  /**
   * Look up an engine design by ID.
   * Returns the design if registered, undefined otherwise.
   */
  getEngineDesign(id: string): EngineDesign | undefined;

  /**
   * List all registered engine designs with summary info.
   */
  listEngineDesigns(): EngineDesignInfo[];
}
```

#### `packages/plugins/spider/src/types.ts` — new type and API method

```typescript
/** Summary info for a registered block type. */
export interface BlockTypeInfo {
  /** Block type id. */
  id: string;
  /** Plugin id that contributed this block type. */
  pluginId: string;
  /** Suggested poll interval in milliseconds, if set. */
  pollIntervalMs?: number;
}

export interface SpiderApi {
  // ... all existing methods unchanged ...

  /**
   * List all registered block types with summary info.
   */
  listBlockTypes(): BlockTypeInfo[];
}
```

### Behavior

#### Fabricator — EngineRegistry provenance tracking

The `EngineRegistry` class in `packages/plugins/fabricator/src/fabricator.ts` must be modified:

1. Add a private `provenance` map: `private readonly provenance = new Map<string, string>()`.
2. Thread the plugin ID from `register(plugin)` through to `registerFromKit(kit, pluginId)`.
3. When storing a design: `this.provenance.set(value.id, pluginId)`.
4. Add a `list()` method that iterates `this.designs` and joins with `this.provenance` to produce `EngineDesignInfo[]`.

When `register(plugin: LoadedPlugin)` is called, `plugin.id` provides the plugin ID (available on both `LoadedKit` and `LoadedApparatus`).

The `api.listEngineDesigns()` method delegates to `registry.list()`.

#### Spider — BlockTypeRegistry provenance tracking

The `BlockTypeRegistry` class in `packages/plugins/spider/src/spider.ts` must be modified:

1. Add a private `provenance` map: `private readonly provenance = new Map<string, string>()`.
2. Thread the plugin ID from `register(plugin)` through to `registerFromKit(kit, pluginId)`.
3. When storing a type: `this.provenance.set(value.id, pluginId)`.
4. Add a `list()` method that iterates `this.types` and joins with `this.provenance` to produce `BlockTypeInfo[]`.

The `api.listBlockTypes()` method delegates to `blockTypeRegistry.list()`.

#### Spider — apparatus declaration changes

In `packages/plugins/spider/src/spider.ts`, the apparatus return value changes:

```typescript
return {
  apparatus: {
    requires: ['stacks', 'clerk', 'fabricator'],
    recommends: ['oculus'],                          // NEW
    consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings'],
    supportKit: {
      // ... existing books, engines, blockTypes unchanged ...
      pages: [{                                       // NEW
        id: 'spider',
        title: 'Spider',
        dir: 'src/static',
      }],
      routes: spiderRoutes,                           // NEW — imported from oculus-routes.ts
      tools: [
        // ... existing 13 tools ...
        engineDesignsTool,                            // NEW
        blockTypesTool,                               // NEW
      ],
    },
    provides: api,
    start(ctx) { ... },
  },
};
```

The `SpiderApi` object must add the `listBlockTypes` method:

```typescript
const api: SpiderApi = {
  // ... existing methods ...
  listBlockTypes(): BlockTypeInfo[] {
    return blockTypeRegistry.list();
  },
};
```

#### New tools

**`packages/plugins/spider/src/tools/engine-designs.ts`**

```typescript
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { FabricatorApi } from '@shardworks/fabricator-apparatus';

export default tool({
  name: 'engine-designs',
  description: 'List all registered engine designs with contributing plugin info',
  params: {},
  permission: 'read',
  handler: async () => {
    const fabricator = guild().apparatus<FabricatorApi>('fabricator');
    return fabricator.listEngineDesigns();
  },
});
```

Auto-mapped by Oculus to `GET /api/engine/designs`.

**`packages/plugins/spider/src/tools/block-types.ts`**

```typescript
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'block-types',
  description: 'List all registered block types with contributing plugin info',
  params: {},
  permission: 'read',
  handler: async () => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.listBlockTypes();
  },
});
```

Auto-mapped by Oculus to `GET /api/block/types`.

#### Custom API route — `/api/spider/config`

**`packages/plugins/spider/src/oculus-routes.ts`**

This file exports an array of route contributions. It must NOT import from `@shardworks/oculus-apparatus`. The route/page shapes are defined inline since the supportKit is `Record<string, unknown>`.

The route handler for `GET /api/spider/config`:

1. Read `guild().guildConfig().spider?.rigTemplates ?? {}` for rig templates.
2. Call `guild().apparatus<FabricatorApi>('fabricator').listEngineDesigns()` for engine designs.
3. Call `guild().apparatus<SpiderApi>('spider').listBlockTypes()` for block types.
4. Return `c.json({ rigTemplates, engineDesigns, blockTypes })`.

Import `Context` from `hono` for route handler typing.

```typescript
import type { Context } from 'hono';
import { guild } from '@shardworks/nexus-core';
import type { FabricatorApi } from '@shardworks/fabricator-apparatus';
import type { SpiderApi, SpiderConfig } from './types.ts';

export const spiderRoutes = [
  {
    method: 'GET',
    path: '/api/spider/config',
    handler: (c: Context) => {
      const g = guild();
      const spiderConfig: SpiderConfig = g.guildConfig().spider ?? {};
      const fabricator = g.apparatus<FabricatorApi>('fabricator');
      const spider = g.apparatus<SpiderApi>('spider');

      return c.json({
        rigTemplates: spiderConfig.rigTemplates ?? {},
        engineDesigns: fabricator.listEngineDesigns(),
        blockTypes: spider.listBlockTypes(),
      });
    },
  },
];
```

#### Static page — `packages/plugins/spider/src/static/index.html`

The HTML structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spider</title>
  <link rel="stylesheet" href="spider.css">
</head>
<body>
<main style="padding: 24px;">
  <h1>Spider</h1>

  <div class="tab-bar">
    <button class="tab active" data-tab="rigs">Rigs</button>
    <button class="tab" data-tab="config">Config</button>
  </div>

  <!-- Rigs tab -->
  <div id="rigs-tab" class="tab-content">
    <div id="rig-list-view">
      <div class="toolbar">
        <select id="status-filter">
          <option value="">All statuses</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="blocked">blocked</option>
        </select>
        <input id="writ-filter" type="text" placeholder="Filter by writ ID...">
        <label>From <input id="date-from" type="date"></label>
        <label>To <input id="date-to" type="date"></label>
        <button id="refresh-btn" class="btn btn--primary">Refresh</button>
      </div>
      <table class="data-table" id="rig-table">
        <thead>
          <tr>
            <th data-sort="id">ID</th>
            <th data-sort="writId">Writ</th>
            <th data-sort="status">Status</th>
            <th>Engines</th>
            <th data-sort="createdAt">Created</th>
          </tr>
        </thead>
        <tbody id="rig-tbody"></tbody>
      </table>
      <div id="rig-empty" class="empty-state" style="display:none">No rigs found.</div>
    </div>

    <div id="rig-detail-view" style="display:none">
      <button id="back-btn" class="btn">&#8592; Back to list</button>
      <h2 id="detail-title"></h2>
      <div class="card" style="margin-bottom:16px">
        <table class="data-table" id="detail-meta"></table>
      </div>
      <h3>Engine Pipeline</h3>
      <div id="pipeline" class="pipeline"></div>
      <div id="engine-detail" class="card" style="margin-top:16px;display:none">
        <h3 id="engine-detail-title"></h3>
        <div id="engine-detail-body"></div>
      </div>
    </div>
  </div>

  <!-- Config tab -->
  <div id="config-tab" class="tab-content" style="display:none">
    <h2>Rig Templates</h2>
    <div id="templates-section"></div>
    <h2>Engine Designs</h2>
    <table class="data-table" id="designs-table">
      <thead><tr><th>ID</th><th>Plugin</th><th>Has Collect</th></tr></thead>
      <tbody id="designs-tbody"></tbody>
    </table>
    <h2>Block Types</h2>
    <table class="data-table" id="blocktypes-table">
      <thead><tr><th>ID</th><th>Plugin</th><th>Poll Interval (ms)</th></tr></thead>
      <tbody id="blocktypes-tbody"></tbody>
    </table>
  </div>
</main>
<script src="spider.js"></script>
</body>
</html>
```

Oculus chrome injection adds the shared stylesheet (`/static/style.css`) and the nav bar before this content.

#### Static page — `packages/plugins/spider/src/static/spider.css`

Page-specific styles for the tab bar, pipeline visualization, and engine nodes. Must use the CSS custom properties from the shared oculus stylesheet (`--bg`, `--surface`, `--border`, `--text`, `--text-dim`, `--cyan`, `--green`, `--red`, `--yellow`, etc.).

Key CSS structures:

- `.tab-bar` — flex container for tab buttons.
- `.tab` — tab button; `.tab.active` — highlighted.
- `.pipeline` — flex container for the engine flowchart. Uses flexbox `row` for linear pipelines. Each engine node is a clickable box. Arrows between nodes use CSS `::after` pseudo-elements.
- `.pipeline-node` — individual engine box, clickable. Contains engine id text and a badge.
- `.pipeline-node.selected` — highlight for the currently-inspected engine.
- `.pipeline-arrow` — an arrow element between nodes (a simple `→` character or CSS triangle).

The pipeline layout:
- When all engines form a linear chain (each has exactly one upstream that is the previous engine), render as a horizontal flex row with arrows between nodes.
- When the DAG has branching (an engine has multiple downstreams, or multiple engines share no upstream), use a simple topological-order row with arrows drawn from each upstream. For complex DAGs, a horizontal row with listed upstream IDs in each node is acceptable — full graph rendering is not required.

#### Static page — `packages/plugins/spider/src/static/spider.js`

Vanilla JavaScript, no modules, no imports. All logic in an IIFE or top-level scope.

**State:**
- `rigs` — the currently-loaded array of RigDoc objects.
- `currentRig` — the RigDoc being viewed in detail, or null.
- `selectedEngineId` — the engine selected in the pipeline, or null.
- `sortField` / `sortDir` — current sort column and direction.
- `configData` — the loaded config response, or null.

**Key functions:**

1. `fetchRigs(statusFilter)` — `GET /api/rig/list?status={s}&limit=100` (or without `?status=` if empty). Stores result in `rigs`. Calls `renderRigList()`.
2. `renderRigList()` — filters `rigs` by writId text input and date range (client-side), sorts by `sortField`/`sortDir`, renders the `<tbody>`. Each row:
   - ID cell: clickable text that calls `showRigDetail(rig)`.
   - Writ cell: `<a href="/pages/clerk/?writ={writId}">{writId}</a>`.
   - Status cell: `<span class="badge badge--{class}">{status}</span>` per D27 mapping.
   - Engines cell: e.g. `"3/5 completed"` computed as `{count of completed}/{total engines}`.
   - Created cell: formatted ISO date.
3. `showRigDetail(rig)` — sets `currentRig`, hides list view, shows detail view. Renders rig metadata table (id, writId, status, createdAt). Calls `renderPipeline(rig)`.
4. `renderPipeline(rig)` — builds engine nodes in topological order. For each engine, creates a clickable `.pipeline-node` div with engine id + status badge. Inserts `.pipeline-arrow` elements based on upstream relationships. Click handler calls `showEngineDetail(engine)`.
5. `showEngineDetail(engine)` — populates the engine detail panel. Shows: status badge, designId, upstream list, startedAt, completedAt, error (if any), sessionId (if any). If `engine.block` is present: show block type, condition (JSON), blockedAt, message, lastCheckedAt. Shows `<details>` elements for givensSpec and yields with `<pre><code>JSON.stringify(value, null, 2)</code></pre>`.
6. `backToList()` — hides detail view, shows list view, clears `currentRig` and `selectedEngineId`.
7. `fetchConfig()` — `GET /api/spider/config`. Stores result in `configData`. Calls `renderConfig()`.
8. `renderConfig()` — renders rig templates as labeled `<pre><code>` blocks. Renders engine designs and block types tables.

**Event wiring:**
- Tab buttons: toggle `.tab-content` visibility and `.tab.active` class. When Config tab is activated, call `fetchConfig()` if `configData` is null (lazy-load).
- Status dropdown `change`: calls `fetchRigs(value)`.
- WritId input `input`: calls `renderRigList()` (client-side re-filter).
- Date range inputs `change`: calls `renderRigList()` (client-side re-filter).
- Refresh button `click`: calls `fetchRigs(currentStatusFilter)`.
- Column header `click`: toggles sort field/direction, calls `renderRigList()`.
- Back button `click`: calls `backToList()`.

**Badge mapping (D27):**
```javascript
function badgeClass(status) {
  switch (status) {
    case 'completed': return 'badge--success';
    case 'running':   return 'badge--active';
    case 'failed':    return 'badge--error';
    case 'blocked':   return 'badge--warning';
    case 'pending':
    case 'cancelled':
    default:          return '';
  }
}
```

**Client-side filtering logic:**
- WritId filter: `rig.writId.includes(filterText)` (case-insensitive).
- Date range: compare `rig.createdAt` ISO string against `dateFrom` and `dateTo` inputs. When a date input has a value, filter rigs where `createdAt >= dateFrom` and/or `createdAt <= dateTo + 'T23:59:59'`.

**Initial load:** On DOMContentLoaded, call `fetchRigs('')` (all statuses).

### Non-obvious Touchpoints

- **`packages/plugins/fabricator/src/index.ts`** — must re-export the new `EngineDesignInfo` type.
- **`packages/plugins/spider/src/index.ts`** — must re-export the new `BlockTypeInfo` type.
- **`packages/plugins/spider/src/tools/index.ts`** — must add barrel exports for the two new tools (`engineDesignsTool`, `blockTypesTool`).
- **`packages/plugins/spider/package.json`** — `files` array must change from `["dist"]` to `["dist", "src/static"]`. `dependencies` must add `"hono"` (use the same version as oculus: `"^4.7.11"`).
- **`packages/plugins/fabricator/package.json`** — no changes needed (no new dependencies).

### Dependencies

The `FabricatorApi.listEngineDesigns()` method (R12) and the `SpiderApi.listBlockTypes()` method (R13) are prerequisites for the tools (R14, R15), the config route (R16), and the Config tab UI (R17, R18, R19). They must be implemented first.

## Validation Checklist

- V1 [R1]: Verify `packages/plugins/spider/src/spider.ts` apparatus declaration includes `recommends: ['oculus']`. Grep for `recommends.*oculus` in that file.
- V2 [R2, R5]: Start the Oculus and verify `GET /pages/spider/` returns the index.html with chrome injected (nav bar and shared stylesheet). Verify the Rigs tab renders a table with columns: ID, Writ, Status, Engines, Created.
- V3 [R3]: Verify `packages/plugins/spider/package.json` has `hono` in `dependencies` and `"src/static"` in the `files` array. Verify `@shardworks/oculus-apparatus` is NOT in dependencies.
- V4 [R4]: Load `/pages/spider/` and verify two tabs ("Rigs" and "Config") are present. Click each tab and verify the corresponding content shows/hides.
- V5 [R5, R7]: Verify the writ column contains links with `href="/pages/clerk/?writ={writId}"`. Verify a "Refresh" button exists and re-fetches data on click.
- V6 [R6]: Verify a status dropdown filter exists and re-fetches rigs with `?status=` query param. Verify a writId text input filters the displayed list client-side. Verify date range inputs filter by createdAt. Verify column headers are clickable and sort the list.
- V7 [R8, R9, R10, R11]: Click a rig in the list. Verify: the list is replaced by a detail view with a back button; a pipeline visualization shows engine nodes with arrows; clicking an engine shows a detail panel with all specified fields; status badges use the correct CSS classes.
- V8 [R12]: Verify `FabricatorApi` interface in `packages/plugins/fabricator/src/fabricator.ts` includes `listEngineDesigns(): EngineDesignInfo[]`. Verify the `EngineRegistry` tracks pluginId via a provenance map and the `list()` method returns entries with correct `pluginId` and `hasCollect` values. Run `pnpm --filter @shardworks/fabricator-apparatus typecheck`.
- V9 [R13]: Verify `SpiderApi` interface in `packages/plugins/spider/src/types.ts` includes `listBlockTypes(): BlockTypeInfo[]`. Verify the `BlockTypeRegistry` tracks pluginId. Run `pnpm --filter @shardworks/spider-apparatus typecheck`.
- V10 [R14]: Verify `packages/plugins/spider/src/tools/engine-designs.ts` exists, exports a tool with `name: 'engine-designs'` and `permission: 'read'`, and is listed in `packages/plugins/spider/src/tools/index.ts` and in the supportKit tools array. Verify `GET /api/engine/designs` returns an array of `{ id, pluginId, hasCollect }` objects.
- V11 [R15]: Verify `packages/plugins/spider/src/tools/block-types.ts` exists, exports a tool with `name: 'block-types'` and `permission: 'read'`, and is listed in the tools barrel and supportKit. Verify `GET /api/block/types` returns an array of `{ id, pluginId, pollIntervalMs? }` objects.
- V12 [R16, R20]: Verify `packages/plugins/spider/src/oculus-routes.ts` exists and exports a route array. Verify `GET /api/spider/config` returns JSON with keys `rigTemplates`, `engineDesigns`, `blockTypes`.
- V13 [R17]: On the Config tab, verify each rig template is displayed in a `<pre><code>` block with its key name as a heading.
- V14 [R18, R19]: On the Config tab, verify engine designs table has columns ID, Plugin, Has Collect. Verify block types table has columns ID, Plugin, Poll Interval (ms).
- V15 [R1, R3, R12, R13]: Run the full test suites: `pnpm --filter @shardworks/fabricator-apparatus test` and `pnpm --filter @shardworks/spider-apparatus test`. Verify no existing tests break.

## Test Cases

### Fabricator — listEngineDesigns

1. **Happy path**: Register two engine designs from different plugins. Call `listEngineDesigns()`. Expect an array of two `EngineDesignInfo` objects with correct `id`, `pluginId`, and `hasCollect` values.
2. **Engine with collect method**: Register an engine design that has a `collect` function. Verify `hasCollect: true`. Register one without. Verify `hasCollect: false`.
3. **Empty registry**: Call `listEngineDesigns()` before registering anything. Expect an empty array.
4. **Duplicate ID**: Register two designs with the same ID from different plugins. The second overwrites the first. `listEngineDesigns()` returns one entry with the second plugin's ID.

### Spider — listBlockTypes

5. **Happy path**: Register two block types from different plugins. Call `listBlockTypes()`. Expect an array of two `BlockTypeInfo` objects with correct `id`, `pluginId`, and `pollIntervalMs`.
6. **Block type without pollIntervalMs**: Register a block type with no `pollIntervalMs`. Verify the field is `undefined` in the result.
7. **Empty registry**: Call `listBlockTypes()` before registering anything. Expect an empty array.

### Tools

8. **engine-designs tool**: Mock a guild with a fabricator that returns known designs. Call the tool handler. Verify the return value matches `fabricator.listEngineDesigns()`.
9. **block-types tool**: Mock a guild with a spider that returns known block types. Call the tool handler. Verify the return value matches `spider.listBlockTypes()`.

### Config route

10. **GET /api/spider/config**: With configured rig templates and registered designs/block types, verify the response JSON contains all three keys with correct data.
11. **Empty config**: With no rig templates configured and no designs/block types registered, verify the response returns `{ rigTemplates: {}, engineDesigns: [], blockTypes: [] }`.

### Static page

12. **Page served at /pages/spider/**: Verify the Oculus serves the index.html with chrome injected (check for `id="oculus-nav"` in response).
13. **spider.js and spider.css served**: Verify `GET /pages/spider/spider.js` and `GET /pages/spider/spider.css` return correct MIME types.