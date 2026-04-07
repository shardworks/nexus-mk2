# Inventory — oculus-spider-page-enhancements

## Brief Summary

Enhance the Spider page (`/pages/spider/`) in the Oculus web dashboard with:
1. **Rig Templates** — tabular view with key metadata, click to expand to graphical + JSON view
2. **Rigs List** — add writ title column, reorder columns
3. **Rig Detail** — show writ title + body at top of detail view
4. **Elapsed Time** — show friendly elapsed time on completed engine cards
5. **Quick Engine Session Log** — show session message log (real-time if active)
6. **Quick Engine Costs** — show input/output tokens and USD cost for completed quick engines

---

## Files Directly Affected

### Spider page static assets (primary change surface)

| File | Status |
|------|--------|
| `packages/plugins/spider/src/static/index.html` | **Modify** |
| `packages/plugins/spider/src/static/spider.js` | **Modify** |
| `packages/plugins/spider/src/static/spider.css` | **Modify** |

### Spider API routes

| File | Status |
|------|--------|
| `packages/plugins/spider/src/oculus-routes.ts` | **Modify** — new routes needed |
| `packages/plugins/spider/src/spider-oculus.test.ts` | **Modify** — test new routes |

### Supporting type files (read-only reference, no changes expected)

| File | Notes |
|------|-------|
| `packages/plugins/spider/src/types.ts` | RigDoc, EngineInstance, RigTemplate, SpiderConfig |
| `packages/plugins/animator/src/types.ts` | SessionDoc, TokenUsage, TranscriptDoc, TranscriptMessage |
| `packages/plugins/clerk/src/types.ts` | WritDoc |
| `packages/plugins/fabricator/src/fabricator.ts` | EngineDesignInfo |

---

## Types and Interfaces Involved

### From `packages/plugins/spider/src/types.ts`

```typescript
export interface EngineInstance {
  id: string;
  designId: string;
  status: EngineStatus;  // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked'
  upstream: string[];
  givensSpec: Record<string, unknown>;
  yields?: unknown;
  error?: string;
  sessionId?: string;     // Present on quick engines when running/completed
  startedAt?: string;     // ISO timestamp
  completedAt?: string;   // ISO timestamp
  block?: BlockRecord;
}

export interface RigDoc {
  id: string;
  writId: string;
  status: RigStatus;  // 'running' | 'completed' | 'failed' | 'blocked'
  engines: EngineInstance[];
  createdAt: string;
  resolutionEngineId?: string;
}

export interface RigTemplate {
  engines: RigTemplateEngine[];
  resolutionEngine?: string;
}

export interface RigTemplateEngine {
  id: string;
  designId: string;
  upstream?: string[];
  givens?: Record<string, unknown>;
}

export interface SpiderConfig {
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
  variables?: Record<string, unknown>;
  // ...
}
```

### From `packages/plugins/animator/src/types.ts`

```typescript
export interface SessionDoc {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  tokenUsage?: TokenUsage;  // { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens? }
  costUsd?: number;
  output?: string;         // Final assistant text (last message's text blocks joined)
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TranscriptDoc {
  id: string;   // Same as session id
  messages: TranscriptMessage[];
  [key: string]: unknown;
}

export type TranscriptMessage = Record<string, unknown>;
// Claude Code shapes:
// { type: 'assistant', message: { content: [{ type: 'text', text: '...' }, { type: 'tool_use', name: '...' }] } }
// { type: 'user', content: [{ type: 'tool_result', tool_use_id: '...' }] }
// { type: 'result', session_id: '...', total_cost_usd: number, usage: { input_tokens, output_tokens, ... } }

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}
```

### From `packages/plugins/clerk/src/types.ts`

```typescript
export interface WritDoc {
  id: string;
  type: string;
  status: WritStatus;
  title: string;     // Short human-readable title
  body: string;      // Detail text (the writ spec/description)
  codex?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
  [key: string]: unknown;
}
```

### From `packages/plugins/fabricator/src/fabricator.ts`

```typescript
export interface EngineDesignInfo {
  id: string;
  pluginId: string;
  hasCollect: boolean;
}
```

---

## Current Spider Page Structure

### `index.html` — current layout

```
Two tabs: [Rigs] [Config]

RIGS TAB:
  ├── rig-list-view (default shown)
  │   ├── toolbar (status filter, writ-filter input, date range, refresh)
  │   └── #rig-table
  │       columns: ID | Writ | Status | Engines | Created
  └── rig-detail-view (hidden, shown on rig click)
      ├── back button
      ├── #detail-meta table (ID, Writ, Status, Created)
      ├── #pipeline (engine graph nodes + arrows)
      └── #engine-detail panel (shown on engine click)
          ├── Status, Design ID, Upstream, Started At, Completed At
          ├── Error (if present)
          ├── Session ID (if present)
          ├── Block info (if blocked)
          ├── <details> Givens Spec (collapsible)
          └── <details> Yields (collapsible)

CONFIG TAB:
  ├── Rig Templates section (#templates-section)
  │   Currently: one div.template-block per template (name + raw JSON pre block)
  ├── Engine Designs table (ID | Plugin | Has Collect)
  └── Block Types table (ID | Plugin | Poll Interval)
```

### `spider.js` — current state

Key state variables:
- `rigs` — array of RigDoc from `/api/rig/list`
- `currentRig` — currently selected RigDoc
- `selectedEngineId` — currently selected engine in detail view
- `sortField`, `sortDir` — sort state for rig table
- `configData` — data from `/api/spider/config`
- `currentStatusFilter` — current status filter value

Key functions:
- `fetchRigs(statusFilter)` — GETs `/api/rig/list?limit=100`
- `renderRigList()` — renders filtered/sorted rig rows; columns are ID, Writ, Status, Engines, Created; rig ID is a link to detail
- `showRigDetail(rig)` — switches to detail view, renders pipeline
- `renderPipeline(rig)` — topoSort engines then render nodes
- `showEngineDetail(engine)` — populates engine-detail panel
- `fetchConfig()` — GETs `/api/spider/config`
- `renderConfig()` — renders templates as JSON blocks, engine designs and block types as tables

### Current rig table column ordering (from `renderRigList`):
```
ID | Writ | Status | Engines | Created
```
(in the HTML `<thead>` it's `ID | Writ | Status | Engines | Created`)

### Current detail-meta (from `showRigDetail`):
```
ID | <value>
Writ | <link>
Status | <badge>
Created | <timestamp>
```

### Current engine detail (from `showEngineDetail`):
```
Status | Design ID | Upstream | Started At | Completed At
[Error if present]
[Session ID if present]
[Block info if present]
<details> Givens Spec
<details> Yields
```
No elapsed time, no session log, no cost summary.

---

## Current API Endpoints (relevant)

All tool routes are automatically wired by the Oculus from patron-callable tools.

### Spider tools → REST routes

| Tool | Route | Method |
|------|-------|--------|
| `rig-list` | `GET /api/rig/list` | GET — params: `status`, `limit`, `offset` |
| `rig-show` | `GET /api/rig/show` | GET — params: `id` |
| `rig-for-writ` | `GET /api/rig/for-writ` | GET — params: `writId` |
| `engine-designs` | `GET /api/engine/designs` | GET |
| `block-types` | `GET /api/block/types` | GET |

### Clerk tools → REST routes

| Tool | Route | Method |
|------|-------|--------|
| `writ-show` | `GET /api/writ/show` | GET — params: `id` |
| `writ-list` | `GET /api/writ/list` | GET — params: `status`, `type`, `limit`, `offset` |

### Animator tools → REST routes

| Tool | Route | Method |
|------|-------|--------|
| `session-show` | `GET /api/session/show` | GET — params: `id` |
| `session-list` | `GET /api/session/list` | GET — params: `status`, `provider`, `conversationId`, `limit` |

### Spider custom routes (oculus-routes.ts)

| Route | Returns |
|-------|---------|
| `GET /api/spider/config` | `{ rigTemplates, engineDesigns, blockTypes }` |

---

## Oculus Route Registration Architecture

Custom routes are contributed via `supportKit.routes` in spider's `supportKit`:

```typescript
// In spider.ts
supportKit: {
  pages: [{ id: 'spider', title: 'Spider', dir: 'src/static' }],
  routes: spiderRoutes,   // from oculus-routes.ts
  // ...
}
```

The Oculus scans `routes` arrays from both kit contributions and apparatus `supportKit`s during startup (and for late-arriving plugins). Custom routes MUST start with `/api/`. Tool-mapped routes are skipped if a custom route has the same path.

### Route handler pattern in `oculus-routes.ts`:
```typescript
export const spiderRoutes = [
  {
    method: 'GET',
    path: '/api/spider/config',
    handler: (c: Context) => {
      const g = guild();
      // ... read from stacks/apparatus ...
      return c.json({ ... });
    },
  },
];
```

---

## Data Flow Analysis

### Writ title for rig list

The rig list (`/api/rig/list`) returns `RigDoc[]` which contains `writId` but NOT the writ title. 

Options:
1. **Client-side enrichment**: After fetching rigs, batch-fetch each unique writ via `GET /api/writ/show?id=xxx` (N+1 problem)
2. **New custom route**: Add `GET /api/spider/rigs` route that internally fetches rigs + writs and returns enriched data
3. **Batch writ fetch**: Add a `GET /api/writ/list?limit=100` call to get all writs at once and build a lookup map

Option 3 is simplest: fetch writs with a high limit in parallel with rigs, build a `writId → title` map, join client-side.

### Session log for running quick engine

**Critical constraint**: The `animator/transcripts` book is only written AFTER a session completes (in `recordSession()`, called after `providerResultPromise` resolves). For a running session, there are NO transcript messages persisted yet.

The `session-show` tool returns `SessionDoc` which includes `output` (final text, only set when complete) but not the transcript messages.

For real-time display, options:
1. **Polling with session-show**: Poll `GET /api/session/show?id=xxx` at intervals to check status; when complete, fetch transcript via separate route
2. **New transcript route**: A new custom route that reads the `animator/transcripts` book for a given session id
3. **SSE/streaming**: Full streaming endpoint — complex, would need architecture changes

Since the transcript is only written at completion, "real-time display of new messages" during an active session is not achievable via stacks reads. The practical implementation for running sessions would be:
- Show a spinner indicating session is active
- Poll session-show for status changes
- When session transitions to terminal, fetch and display the transcript

**Doc/code discrepancy**: The brief says "new messages should be displayed in real time as they are received" but the current stacks architecture only persists transcript at session end. True real-time would require either: (a) in-memory chunk store, or (b) incremental transcript writes. Neither exists today.

### Transcript access

There is currently NO API endpoint to read transcript messages. The `session-show` tool reads the `sessions` book (not `transcripts`). The `transcripts` book records are only accessible via direct Stacks queries.

A new custom route in `oculus-routes.ts` would be needed:
```
GET /api/spider/session-transcript?id=<sessionId>
```
This would call `stacks.readBook<TranscriptDoc>('animator', 'transcripts').get(sessionId)` and return the messages array.

### Elapsed time calculation

The `EngineInstance` has `startedAt` and `completedAt` ISO timestamps. Elapsed = `completedAt - startedAt`. For a running engine with only `startedAt`, elapsed = `now - startedAt`. This is a pure client-side calculation.

Format requested: `1h 13m 22s` — needs a formatting function in spider.js.

### Rig templates graphical view

`RigTemplate.engines` is `RigTemplateEngine[]`, each having `id`, `designId`, `upstream?`. This is structurally very similar to `EngineInstance[]` in a RigDoc. The existing `renderPipeline()` function works on an array of engine instances and renders nodes.

For the template graphical view, we would need to map `RigTemplateEngine[]` to a shape compatible with `renderPipeline()`, treating all engines as "pending" status (no runtime data). A new `renderTemplatePipeline(templateEngines)` function could handle this, or `renderPipeline` could be made to accept a more general shape.

### Rig template metadata for table

The brief says "key metadata (id, contributing plugin/guild config, # of engines, writ type mappings, resolution engine)".

Current `GET /api/spider/config` response:
```json
{
  "rigTemplates": { "<name>": { engines: [...], resolutionEngine?: "..." } },
  "engineDesigns": [...],
  "blockTypes": [...]
}
```

The `rigTemplates` object keys are template names but there's no metadata about which plugin or config contributed each template. The Spider's `RigTemplateRegistry` tracks `configTemplateNames` (config-declared) vs kit-registered templates (qualified as `pluginId.templateName`), but this information is NOT returned by the config route.

To show "contributing plugin/guild config", the config route would need enhancement. Options:
1. Add provenance metadata to the config route response
2. Return enriched `rigTemplates` with source info: `{ template, source: 'config' | pluginId }`
3. Parse the template name: if it contains a `.`, it was kit-contributed as `pluginId.templateName`

Option 3 is heuristic (naming convention) but avoids backend changes beyond the current `RigTemplateRegistry`.

Writ type mappings: the `SpiderConfig.rigTemplateMappings` maps writ types to template names. These are in the guild config but NOT in the current `/api/spider/config` route response. Need to be added.

---

## Adjacent Patterns

### How the Clerk page handles pages (for reference)

The clerk plugin doesn't contribute an Oculus page. No static HTML pages from clerk to compare against.

### How the Oculus home page displays data

`packages/plugins/oculus/src/oculus.ts` — server-rendered HTML, not relevant to spider page (which is all client-side JS).

### How other test files are structured

- Spider tests use Node native test runner (`node:test`)
- Tests in `spider-oculus.test.ts` mock the full guild singleton with minimal fakes
- Route testing pattern: create a mock Context with a `.json()` capturer, call `route.handler(ctx)`, assert on captured JSON
- Tool testing pattern: set guild via `setGuild(makeGuild(...))`, call `tool.handler({})`, assert result

---

## What the Config Route Currently Returns

From `oculus-routes.ts` + `spider-oculus.test.ts`:

```json
{
  "rigTemplates": {
    "default": {
      "engines": [
        { "id": "draft", "designId": "draft", "upstream": [] }
      ],
      "resolutionEngine": "..."
    }
  },
  "engineDesigns": [
    { "id": "draft", "pluginId": "spider", "hasCollect": false }
  ],
  "blockTypes": [
    { "id": "writ-status", "pluginId": "spider" }
  ]
}
```

**Currently missing** for the brief's requirements:
- `rigTemplateMappings` (which writ types map to which template)
- Provenance info per template (guild config vs which plugin)

---

## Existing Test Coverage

### `packages/plugins/spider/src/spider-oculus.test.ts`

Tests for:
- `engine-designs` tool: name, permission, delegates to fabricator
- `block-types` tool: name, permission, delegates to spider
- `GET /api/spider/config` route: shape, rigTemplates, engineDesigns, blockTypes, empty cases

No tests for client-side JS logic (expected — it's vanilla browser JS with no test harness).

### `packages/plugins/spider/src/spider.test.ts`

Tests the Spider's crawl pipeline (collect, checkBlocked, run, spawn). Not directly related to UI.

---

## Key Observations / Potential Issues

1. **Real-time session messages gap**: The brief requests real-time display of session messages, but the current `animator/transcripts` stacks book is only written at session end. "Real-time" for a running session would require either: (a) an in-memory session chunk store exposed via a streaming/polling endpoint, or (b) incremental stacks writes during session execution. Neither exists today. The analyst must surface this as a decision.

2. **No transcript API**: There is no existing REST endpoint for reading transcript messages. A new custom route needs to be added to `oculus-routes.ts`. The Stacks read API (`stacks.readBook<TranscriptDoc>('animator', 'transcripts')`) would need to be used inside the new route handler.

3. **RigTemplateRegistry provenance is unexposed**: The registry internally tracks whether a template came from config or a kit plugin, but this is not surfaced in the config route response. The template name format (`pluginId.templateName` for kits, plain name for config) is the only heuristic available without backend changes.

4. **`/api/rig/list` does not return writ titles**: The rig list endpoint returns `RigDoc[]` without writ data. For the "Writ Title" column in the rigs list, client-side enrichment (parallel fetch of writs) or a new enriched route is needed.

5. **`writ-show` URL mapping**: The tool is named `writ-show`. Applying the `toolNameToRoute` function: `writ-show` → `/api/writ/show`. Permission `clerk:read` → level `read` → `GET`. So `GET /api/writ/show?id=xxx` works from client-side JS.

6. **Missing `rigTemplateMappings` in config route**: The `spiderRoutes` config handler reads `spiderConfig.rigTemplateMappings` but does NOT currently include it in the route response. The brief wants to show "writ type mappings" in the rig template table — this requires adding `rigTemplateMappings` to the route response.

7. **No `listBlockTypes` in SpiderApi mock** (minor): `spider-oculus.test.ts` mock declares `listBlockTypes` on the mock spider. Confirmed this is present.

8. **Engine elapsed time is all client-side**: `startedAt` and `completedAt` are already in `EngineInstance`. No backend changes needed for this feature.

9. **Cost/token data available on `SessionDoc`**: The `session-show` endpoint returns `SessionDoc` which includes `tokenUsage` (inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens) and `costUsd`. No backend changes needed for costs — just client-side fetch and display.

10. **Pipeline graph is already implemented**: `renderPipeline(rig)` in spider.js does a topoSort and renders `pipeline-node` elements with arrows. The template graphical view can reuse this pattern with synthetic `{id, designId, upstream, status: 'pending'}` engine objects.

11. **`details` expand/collapse pattern already in use**: Givens Spec and Yields in the engine detail panel already use `<details class="collapsible">` with styled `<summary>` elements. The template spec JSON and template graphical view should follow this pattern for expansion.

---

## Package Structure Notes

- Spider page static assets live in `packages/plugins/spider/src/static/` — served via `dir: 'src/static'` in the page contribution
- The page contribution is in `spider.ts`'s `supportKit.pages`: `[{ id: 'spider', title: 'Spider', dir: 'src/static' }]`
- Custom routes in `oculus-routes.ts` are in `supportKit.routes`
- `oculus-routes.ts` explicitly avoids importing from `@shardworks/oculus-apparatus` to prevent circular deps — new routes must maintain this pattern
- The Stacks read API is accessed via `guild().apparatus<StacksApi>('stacks').readBook(...)` — no direct stacks import needed in route handlers
- Route handlers receive a Hono `Context` (`c: Context`) and return `c.json(...)` or `new Response(...)`

---

## Spider's `supportKit` (abridged)

```typescript
supportKit: {
  books: {
    rigs: { indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'] },
    'input-requests': { indexes: [...] },
  },
  engines: { draft, implement, review, revise, seal },
  blockTypes: { 'writ-status', 'scheduled-time', 'book-updated', 'patron-input' },
  pages: [{ id: 'spider', title: 'Spider', dir: 'src/static' }],
  routes: spiderRoutes,
  tools: [crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool, rigResumeTool, ...],
}
```

---

## Summary of Changes Required

| Area | Files | Notes |
|------|-------|-------|
| Rig list columns | `index.html`, `spider.js` | New column order: Status, Writ Title, Engines, Rig Id, Writ Id, Created; need writ title fetch |
| Writ title fetch | `spider.js` | Parallel fetch writs to build lookup map |
| Rig detail writ info | `index.html`, `spider.js` | Add writ title + body textarea at top of detail view |
| Engine elapsed time | `spider.js` | Client-side calc from startedAt/completedAt timestamps |
| Session log | `spider.js`, `oculus-routes.ts`, `spider-oculus.test.ts` | New transcript route; poll/display |
| Engine costs | `spider.js` | Fetch session-show for completed quick engines; display tokenUsage + costUsd |
| Template table | `index.html`, `spider.js`, `spider.css`, `oculus-routes.ts` | Table with metadata; add rigTemplateMappings to config route |
| Template graphical view | `spider.js`, `spider.css` | Click to expand; reuse renderPipeline logic |
| Template spec JSON | `index.html`, `spider.js` | Show raw template JSON in expanded view |
| Add `rigTemplateMappings` to config route | `oculus-routes.ts`, `spider-oculus.test.ts` | Route currently omits it |
