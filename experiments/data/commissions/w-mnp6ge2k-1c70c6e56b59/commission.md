---
author: plan-writer
estimated_complexity: 8
---

# Oculus Spider Page Enhancements

## Summary

Enhance the Spider page in the Oculus dashboard with six feature areas: rig template tabular display with graphical expand, rigs list column reorder with writ titles, writ details panel in rig detail view, elapsed time on engine cards, session log for quick engines, and cost summary for completed quick engines. Backend changes add `listTemplates()` and `listTemplateMappings()` to `SpiderApi`, update the `/api/spider/config` route, and add a new `/api/spider/session-transcript` route.

## Current State

### Spider page static assets

Three files in `packages/plugins/spider/src/static/`:

- **`index.html`** — Two-tab layout (Rigs | Config). Rigs tab has a list view and a detail view. Config tab shows rig templates as raw JSON blocks, engine designs table, and block types table.
- **`spider.js`** — Vanilla JS IIFE (~490 lines). Key state: `rigs`, `currentRig`, `selectedEngineId`, `sortField`, `sortDir`, `configData`. Key functions: `fetchRigs()`, `renderRigList()`, `showRigDetail()`, `renderPipeline()`, `showEngineDetail()`, `fetchConfig()`, `renderConfig()`.
- **`spider.css`** — Page-specific styles using Oculus CSS custom properties.

### Rig list table columns (current)

```
ID (sortable) | Writ (sortable) | Status (sortable) | Engines | Created (sortable)
```

### Rig detail view (current)

```
Back button
Rig: <id> heading
Meta card: ID, Writ (link), Status, Created
Engine Pipeline (graphical nodes with arrows)
Engine Detail panel (shown on node click):
  Status | Design ID | Upstream | Started At | Completed At
  [Error if present] [Session ID if present] [Block info if present]
  <details> Givens Spec
  <details> Yields
```

### Config tab — rig templates (current)

Rendered by `renderConfig()`: one `div.template-block` per template with a heading (template name) and a `<pre><code>` block containing raw JSON.

### `/api/spider/config` route (current)

```typescript
// packages/plugins/spider/src/oculus-routes.ts
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

Returns only guild.json config templates — kit-contributed templates are invisible.

### `SpiderApi` (current)

```typescript
export interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
  show(id: string): Promise<RigDoc>;
  list(filters?: RigFilters): Promise<RigDoc[]>;
  forWrit(writId: string): Promise<RigDoc | null>;
  resume(rigId: string, engineId: string): Promise<void>;
  getBlockType(id: string): BlockType | undefined;
  listBlockTypes(): BlockTypeInfo[];
}
```

No template listing methods.

### `RigTemplateRegistry` (current, in spider.ts)

Internal class with:
- `readonly templates: Map<string, RigTemplate>` — merged registry
- `readonly configMappings: Map<string, string>` — config writ-type → template-name
- `readonly kitMappings: Map<string, string>` — kit writ-type → template-name
- `private configTemplateNames: Set<string>` — names declared in config

Config templates are stored under plain names (e.g. `"default"`). Kit templates under qualified names (e.g. `"myPlugin.myTemplate"`).

### Relevant API endpoints (auto-mapped from tools by Oculus)

| Endpoint | Returns |
|----------|---------|
| `GET /api/rig/list?limit=N&status=S` | `RigDoc[]` — no writ title |
| `GET /api/writ/show?id=X` | `WritDoc` (includes title, body) |
| `GET /api/writ/list?limit=N` | `WritDoc[]` |
| `GET /api/session/show?id=X` | `SessionDoc` (includes tokenUsage, costUsd) |

### Transcript storage

Transcripts are stored in the `animator/transcripts` stacks book as `TranscriptDoc`:
```typescript
interface TranscriptDoc {
  id: string;         // same as session id
  messages: TranscriptMessage[];  // Record<string, unknown>[]
}
```

Transcripts are only written after session completion (`recordSession()` in animator.ts). No existing API endpoint reads transcripts. No transcript data is available for running sessions.

Transcript message shapes (from claude-code provider):
```
{ type: 'assistant', message: { content: [{ type: 'text', text: '...' }, { type: 'tool_use', name: '...' }] } }
{ type: 'user', content: [{ type: 'tool_result', tool_use_id: '...' }] }
{ type: 'result', session_id: '...', total_cost_usd: N, usage: { input_tokens, output_tokens, ... } }
```

## Requirements

- R1: The `SpiderApi` interface must include `listTemplates()` returning `RigTemplateInfo[]` and `listTemplateMappings()` returning `Record<string, string>`.
- R2: The `RigTemplateInfo` type must include `name: string`, `source: 'config' | string` (pluginId for kit-contributed), and `template: RigTemplate`.
- R3: `listTemplateMappings()` must return the merged effective mapping (config mappings override kit mappings for the same writ type).
- R4: The `GET /api/spider/config` route must return `{ templates: RigTemplateInfo[], templateMappings: Record<string, string>, engineDesigns: EngineDesignInfo[], blockTypes: BlockTypeInfo[] }` — replacing the old `rigTemplates` key.
- R5: A new route `GET /api/spider/session-transcript?sessionId=xxx` must return `{ messages: TranscriptMessage[], sessionStatus: string }`. When the session is running (transcript not yet persisted), it must return `{ messages: [], sessionStatus: 'running' }`. When the session id is not found at all, it must return a 404 error.
- R6: The config tab must display rig templates in a table with columns: Name, Source, Engines (count), Resolution Engine, Writ Types.
- R7: When a rig template table row is clicked, a detail panel must appear below the table showing: (a) the template's engine pipeline rendered graphically using the same pipeline visualization as running rigs, with all engine nodes showing status `'pending'`; (b) a collapsible `<details>` block containing the template's full JSON spec.
- R8: Clicking an engine node in the template pipeline must show: Design ID, upstream list, and givens spec (raw template values, not resolved).
- R9: The rigs list table columns must be reordered to: Status (sortable) | Writ Title (not sortable) | Engines (not sortable) | Rig Id (sortable) | Writ Id (sortable) | Created (sortable).
- R10: The Writ Title column must display the writ's `title` field, fetched via `GET /api/writ/list?limit=100` in parallel with the rig list fetch. When a writ is not in the lookup map, display `'—'`.
- R11: Writ data must be re-fetched on every rig list refresh.
- R12: When entering rig detail view, the writ details must be fetched via `GET /api/writ/show?id=<writId>` and displayed as a new card between the rig meta table and the engine pipeline heading. The card must show the writ's title as a heading and the writ's body in a readonly `<textarea>` with default height 200px and `resize: vertical`.
- R13: The engine detail panel must show an "Elapsed" field after "Completed At". For completed engines (both `startedAt` and `completedAt` present), display elapsed time in compact format omitting zero leading units (e.g. `1h 13m 22s`, `5m 12s`, `42s`). For running engines (only `startedAt`), display a `'running...'` placeholder with a spinner/pulsing indicator.
- R14: When `showEngineDetail()` is called for a completed engine with a `sessionId`, the system must fetch `GET /api/session/show?id=<sessionId>`. When `tokenUsage` and/or `costUsd` are present on the response, display "Input Tokens", "Output Tokens", and "Cost (USD)" fields in the engine detail `<dl>`. Format cost as `$X.XXXX` (dollar sign, 4 decimal places). When cost data is absent, hide these fields entirely.
- R15: When `showEngineDetail()` is called for an engine with a `sessionId` and status `'running'`, start polling `GET /api/spider/session-transcript?sessionId=<sessionId>` every 3 seconds. Display a readonly `<textarea>` (default 300px height, `resize: vertical`) below the engine detail `<dl>`. While `sessionStatus` is `'running'`, show a spinner/activity indicator above or next to the textarea. When `sessionStatus` transitions to a terminal state, render transcript messages into the textarea and stop polling.
- R16: Transcript messages must be rendered as human-readable text: assistant text content as-is, tool_use as `[tool: <name>]`, tool_result as `[result: <tool_use_id>]`. Messages with `type: 'result'` are ignored (metrics already shown in cost summary).
- R17: Polling must stop when: navigating back to the rig list, selecting a different engine, or the session reaches a terminal state.
- R18: Session data (status, transcript, costs) must be re-fetched every time an engine with a sessionId is selected — no caching.
- R19: All changes must remain within the vanilla JS IIFE pattern. No modules, no imports, no build step.

## Design

### Type Changes

Add to `packages/plugins/spider/src/types.ts`:

```typescript
/** Summary info for a registered rig template. */
export interface RigTemplateInfo {
  /** Template name (plain for config, qualified pluginId.name for kit). */
  name: string;
  /** 'config' for guild.json templates, or the pluginId for kit-contributed templates. */
  source: string;
  /** The template definition. */
  template: RigTemplate;
}
```

Extend `SpiderApi` with two new methods:

```typescript
export interface SpiderApi {
  // ... existing methods unchanged ...

  /**
   * List all registered rig templates with provenance info.
   */
  listTemplates(): RigTemplateInfo[];

  /**
   * Return the merged effective writ-type → template-name mapping.
   * Config mappings override kit mappings for the same writ type.
   */
  listTemplateMappings(): Record<string, string>;
}
```

### Behavior

#### RigTemplateRegistry changes (`spider.ts`)

Add a `listTemplates()` method to `RigTemplateRegistry`:

```
When listTemplates() is called:
  For each entry in this.templates (name → template):
    If configTemplateNames.has(name), source = 'config'
    Else, source = name.slice(0, name.indexOf('.'))
      (Kit templates are always stored as pluginId.templateName;
       the pluginId is everything before the first dot)
    Push { name, source, template } to the result array
  Return the array
```

Rationale for source derivation: Config template names are tracked in `configTemplateNames` (a Set). Kit templates are always registered under `${pluginId}.${templateName}` in `registerKitTemplates()`. The name format is enforced by the registration code — this is not a heuristic, it is the naming scheme the registry uses.

Add a `listTemplateMappings()` method to `RigTemplateRegistry`:

```
When listTemplateMappings() is called:
  Start with a copy of kitMappings entries as a Record
  Overlay configMappings entries (config wins on collision)
  Return the merged Record<string, string>
```

#### SpiderApi wiring (`spider.ts`)

Add to the `api` object inside `createSpider()`:

```typescript
listTemplates(): RigTemplateInfo[] {
  return rigTemplateRegistry.listTemplates();
},

listTemplateMappings(): Record<string, string> {
  return rigTemplateRegistry.listTemplateMappings();
},
```

#### Config route change (`oculus-routes.ts`)

Replace the config route handler body:

```
When GET /api/spider/config is called:
  Read spider apparatus via guild().apparatus<SpiderApi>('spider')
  Read fabricator apparatus via guild().apparatus<FabricatorApi>('fabricator')
  Return JSON:
    templates: spider.listTemplates()
    templateMappings: spider.listTemplateMappings()
    engineDesigns: fabricator.listEngineDesigns()
    blockTypes: spider.listBlockTypes()
```

The old `rigTemplates` key is removed. The route no longer reads `guildConfig().spider`.

#### New transcript route (`oculus-routes.ts`)

Add a second entry to `spiderRoutes`:

```
When GET /api/spider/session-transcript?sessionId=xxx is called:
  Read sessionId from query string
  If sessionId is missing, return 400 { error: 'sessionId is required' }

  Read stacks via guild().apparatus<StacksApi>('stacks')
  Read session from stacks.readBook<SessionDoc>('animator', 'sessions').get(sessionId)

  If session is null, return 404 { error: 'Session not found' }

  If session.status === 'running':
    Return 200 { messages: [], sessionStatus: 'running' }

  Read transcript from stacks.readBook<TranscriptDoc>('animator', 'transcripts').get(sessionId)
  Return 200 {
    messages: transcript?.messages ?? [],
    sessionStatus: session.status
  }
```

The route imports `StacksApi` from `@shardworks/stacks-apparatus`, `SessionDoc` from `@shardworks/animator-apparatus`, and a local type alias for TranscriptDoc (to avoid adding the animator import for a type that's just `{ id: string, messages: Record<string, unknown>[] }`).

To avoid importing TranscriptDoc from the animator package (which is not a dependency of spider), define a minimal inline type:

```typescript
interface TranscriptEntry {
  id: string;
  messages: Record<string, unknown>[];
  [key: string]: unknown;
}
```

The `SessionDoc` import is already used by spider.ts (imported from `@shardworks/animator-apparatus`). For the route file, use the same import pattern already in spider.ts. Actually, `oculus-routes.ts` currently only imports from `@shardworks/nexus-core` and `@shardworks/fabricator-apparatus`. The route file will need to add `@shardworks/stacks-apparatus` and `@shardworks/animator-apparatus` imports for the transcript route. Check that these are listed as dependencies in `packages/plugins/spider/package.json` — they are (spider requires stacks, clerk, fabricator, and reads from animator sessions already in spider.ts).

#### HTML changes (`index.html`)

**Config tab** — Replace the `#templates-section` div with a table and detail area:

```html
<h2>Rig Templates</h2>
<table class="data-table" id="templates-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Source</th>
      <th>Engines</th>
      <th>Resolution Engine</th>
      <th>Writ Types</th>
    </tr>
  </thead>
  <tbody id="templates-tbody"></tbody>
</table>
<div id="template-empty" class="empty-state" style="display:none">No rig templates configured.</div>
<div id="template-detail" style="display:none">
  <h3 id="template-detail-title"></h3>
  <div id="template-pipeline" class="pipeline"></div>
  <div id="template-engine-detail" class="card" style="margin-top:16px;display:none">
    <h3 id="template-engine-detail-title"></h3>
    <div id="template-engine-detail-body"></div>
  </div>
  <details class="collapsible">
    <summary>Template Spec (JSON)</summary>
    <pre><code id="template-json"></code></pre>
  </details>
</div>
```

**Rigs tab — list view `<thead>`** — Reorder to:

```html
<tr>
  <th data-sort="status">Status</th>
  <th>Writ Title</th>
  <th>Engines</th>
  <th data-sort="id">Rig Id</th>
  <th data-sort="writId">Writ Id</th>
  <th data-sort="createdAt">Created</th>
</tr>
```

**Rigs tab — detail view** — Add writ details card between `#detail-meta` card and the "Engine Pipeline" heading:

```html
<div id="writ-details-card" class="card" style="margin-bottom:16px;display:none">
  <h3 id="writ-detail-title"></h3>
  <textarea id="writ-detail-body" readonly class="writ-body-textarea"></textarea>
</div>
```

**Engine detail** — Add session log textarea container inside `#engine-detail`, after `#engine-detail-body`:

```html
<div id="session-log-section" style="display:none">
  <h4>Session Log <span id="session-log-spinner" class="badge badge--active" style="display:none">loading...</span></h4>
  <textarea id="session-log" readonly class="session-log-textarea"></textarea>
</div>
```

#### CSS changes (`spider.css`)

Add styles:

```css
/* ── Writ body textarea ─────────────────────────────────────────────── */

.writ-body-textarea {
  background: var(--bg, #0d0d0d);
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  color: var(--text, #eee);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  height: 200px;
  margin-top: 8px;
  padding: 10px;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}

/* ── Session log textarea ───────────────────────────────────────────── */

.session-log-textarea {
  background: var(--bg, #0d0d0d);
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  color: var(--text, #eee);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  height: 300px;
  margin-top: 8px;
  padding: 10px;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}

/* ── Template table row interactivity ───────────────────────────────── */

#templates-tbody tr {
  cursor: pointer;
  transition: background 0.15s;
}

#templates-tbody tr:hover {
  background: var(--surface2, #2f3549);
}

#templates-tbody tr.selected {
  background: var(--surface2, #2f3549);
  border-left: 3px solid var(--cyan, #0ff);
}

/* ── Elapsed placeholder ────────────────────────────────────────────── */

.elapsed-running {
  color: var(--cyan, #7dcfff);
  animation: pulse 2s infinite;
  font-style: italic;
}
```

#### JavaScript changes (`spider.js`)

All changes within the existing IIFE.

**New state variables:**

```javascript
var writLookup = {};          // writId → WritDoc (for titles and detail)
var sessionPollTimer = null;  // setInterval id for session status polling
var selectedTemplateName = null; // currently selected template in config tab
```

**New utility function — `formatElapsed(startedAt, completedAt)`:**

```
Compute diffMs = new Date(completedAt) - new Date(startedAt)
Convert to hours, minutes, seconds
Build parts array, omitting leading zeros:
  if hours > 0: push hours + 'h'
  if hours > 0 || minutes > 0: push minutes + 'm'
  push seconds + 's'
Return parts.join(' ')
If diffMs <= 0, return '<1s'
```

**New utility function — `renderTranscript(messages)`:**

```
For each message in messages:
  If message.type === 'assistant':
    Extract content blocks from message.message.content
    For each block:
      If block.type === 'text': append block.text + '\n'
      If block.type === 'tool_use': append '[tool: ' + block.name + ']\n'
  If message.type === 'user':
    Extract content blocks from message.content
    For each block:
      If block.type === 'tool_result': append '[result: ' + block.tool_use_id + ']\n'
  Skip messages with type === 'result'
Return the joined string
```

**New utility function — `buildWritLookup(writs)`:**

```
writLookup = {}
For each writ in writs:
  writLookup[writ.id] = writ
```

**Modified `fetchRigs(statusFilter)`:**

```
When fetchRigs is called:
  Fetch /api/rig/list?limit=100 (+ status filter if present) AND
  Fetch /api/writ/list?limit=100 in parallel (Promise.all or parallel .then chains)
  On rig response: store rigs array
  On writ response: call buildWritLookup(writs)
  After both complete: call renderRigList()
```

Since the IIFE uses plain `fetch().then()` (no async/await), the parallel fetch pattern:
```javascript
var rigPromise = fetch(rigUrl).then(function(r) { return r.json(); });
var writPromise = fetch('/api/writ/list?limit=100').then(function(r) { return r.json(); });
Promise.all([rigPromise, writPromise]).then(function(results) {
  rigs = Array.isArray(results[0]) ? results[0] : [];
  buildWritLookup(Array.isArray(results[1]) ? results[1] : []);
  renderRigList();
}).catch(function(err) {
  console.error('Failed to fetch rigs/writs:', err);
  rigs = [];
  renderRigList();
});
```

**Modified `renderRigList()`:**

Change the row generation to produce columns in the new order:

```
Status | Writ Title | Engines | Rig Id | Writ Id | Created

Where Writ Title = writLookup[rig.writId]?.title || '—'
Rig Id cell is the clickable link (was the ID cell before)
```

The writ filter input should also match against writ title (in addition to writId) for better discoverability.

**Modified `showRigDetail(rig)`:**

After rendering the meta table, fetch writ details:

```
When showRigDetail(rig) is called:
  ... existing meta table render ...
  Fetch GET /api/writ/show?id=<rig.writId>
  On success:
    Show #writ-details-card
    Set #writ-detail-title textContent to writ.title
    Set #writ-detail-body value to writ.body
  On failure:
    Hide #writ-details-card (writ may not exist)

  Clear any running session poll timer (stopSessionPoll())
  Hide #session-log-section
  ... existing renderPipeline(rig) ...
```

**Modified `showEngineDetail(engine)`:**

After the existing `<dl>` content generation:

1. **Elapsed time (R13):** After the Completed At `<dd>`, insert an Elapsed field:
   ```
   If engine.status === 'completed' and engine.startedAt and engine.completedAt:
     html += '<dt>Elapsed</dt><dd>' + esc(formatElapsed(engine.startedAt, engine.completedAt)) + '</dd>'
   Else if engine.status === 'running' and engine.startedAt:
     html += '<dt>Elapsed</dt><dd><span class="elapsed-running">running\u2026</span></dd>'
   ```

2. **Session costs (R14):** After the existing sessionId and block fields, if `engine.sessionId` is present and `engine.status === 'completed'`:
   ```
   Fetch GET /api/session/show?id=<engine.sessionId>
   On success:
     If session.tokenUsage exists:
       Append 'Input Tokens' <dd> with session.tokenUsage.inputTokens
       Append 'Output Tokens' <dd> with session.tokenUsage.outputTokens
     If session.costUsd exists:
       Append 'Cost (USD)' <dd> with '$' + session.costUsd.toFixed(4)
   ```
   Since the fetch is async and the `<dl>` is already rendered synchronously, the cost fields must be appended to the `<dl>` after the fetch completes. Approach: render the `<dl>` with a placeholder `<span id="cost-placeholder"></span>` at the end (before `</dl>`), then on fetch success, insert cost `<dt>/<dd>` pairs before the placeholder.

3. **Session log (R15):** After rendering the `<dl>` and collapsibles, handle session log:
   ```
   Stop any existing session poll timer
   Hide #session-log-section

   If engine.sessionId exists:
     If engine.status === 'running':
       Show #session-log-section
       Show #session-log-spinner
       Clear #session-log textarea
       Start polling:
         sessionPollTimer = setInterval(function() {
           fetch('/api/spider/session-transcript?sessionId=' + engine.sessionId)
             .then(r => r.json())
             .then(function(data) {
               if (data.sessionStatus !== 'running') {
                 // Session completed — render transcript, stop polling
                 stopSessionPoll()
                 hide spinner
                 set textarea value to renderTranscript(data.messages)
                 scroll textarea to bottom
               }
               // While running, textarea stays empty, spinner shows
             })
         }, 3000)

     Else if engine.status is terminal (completed/failed):
       Show #session-log-section
       Hide spinner
       Fetch transcript once:
         fetch('/api/spider/session-transcript?sessionId=' + engine.sessionId)
           .then(r => r.json())
           .then(function(data) {
             set textarea value to renderTranscript(data.messages)
           })
   ```

**New function — `stopSessionPoll()`:**

```javascript
function stopSessionPoll() {
  if (sessionPollTimer !== null) {
    clearInterval(sessionPollTimer);
    sessionPollTimer = null;
  }
}
```

**Modified `backToList()`:**

Add `stopSessionPoll()` call at the beginning.

**Modified `renderConfig()`:**

Replace the templates rendering block entirely. Instead of rendering `div.template-block` with raw JSON, render a table:

```
When renderConfig() is called with configData:
  var templates = configData.templates || [];
  var templateMappings = configData.templateMappings || {};

  Build a reverse mapping: templateName → [writType1, writType2, ...]
    For each writType → templateName in templateMappings:
      reverseMappings[templateName] = reverseMappings[templateName] || []
      reverseMappings[templateName].push(writType)

  If templates.length === 0:
    Show #template-empty, hide #templates-table
  Else:
    Hide #template-empty, show #templates-table
    For each template info in templates:
      Render row: Name | Source | engine count | resolutionEngine or '—' | writ types joined or '—'

  Wire click handlers on rows:
    On row click: set selectedTemplateName, call showTemplateDetail(templateInfo)

  ... existing engine designs and block types rendering unchanged ...
```

**New function — `showTemplateDetail(info)`:**

```
When showTemplateDetail(info) is called:
  Show #template-detail
  Set #template-detail-title to 'Template: ' + info.name

  Highlight the selected row in the table (add 'selected' class, remove from others)

  Build synthetic engine instances from info.template.engines:
    syntheticEngines = info.template.engines.map(function(e) {
      return {
        id: e.id,
        designId: e.designId,
        status: 'pending',
        upstream: e.upstream || [],
        givensSpec: e.givens || {}
      };
    })

  Render pipeline into #template-pipeline using the same renderPipeline pattern
    but targeting #template-pipeline instead of #pipeline,
    and using #template-engine-detail / #template-engine-detail-title / #template-engine-detail-body
    for the engine detail panel.

  Set #template-json textContent to JSON.stringify(info.template, null, 2)
```

To reuse the pipeline rendering logic without duplicating code, refactor `renderPipeline` to accept a target container ID and an engine detail config:

```javascript
function renderPipelineInto(containerId, engines, detailConfig) {
  // detailConfig: { panelId, titleId, bodyId, onClick }
  // ... same topoSort + node rendering logic ...
  // On node click: call detailConfig.onClick(engine) instead of showEngineDetail(engine)
}
```

Then `renderPipeline(rig)` becomes:
```javascript
function renderPipeline(rig) {
  renderPipelineInto('pipeline', rig.engines || [], {
    panelId: 'engine-detail',
    titleId: 'engine-detail-title',
    bodyId: 'engine-detail-body',
    onClick: showEngineDetail
  });
}
```

And `showTemplateDetail` uses:
```javascript
renderPipelineInto('template-pipeline', syntheticEngines, {
  panelId: 'template-engine-detail',
  titleId: 'template-engine-detail-title',
  bodyId: 'template-engine-detail-body',
  onClick: showTemplateEngineDetail
});
```

**New function — `showTemplateEngineDetail(engine)`:**

```
When showTemplateEngineDetail(engine) is called:
  Show #template-engine-detail
  Set #template-engine-detail-title to 'Engine: ' + engine.id

  Render into #template-engine-detail-body:
    <dl class="engine-detail-field">
      <dt>Design ID</dt><dd>{engine.designId}</dd>
      <dt>Upstream</dt><dd>{engine.upstream.join(', ') || '(none)'}</dd>
    </dl>
    <details class="collapsible">
      <summary>Givens Spec</summary>
      <pre><code>{JSON.stringify(engine.givensSpec, null, 2)}</code></pre>
    </details>
```

### Non-obvious Touchpoints

- **`packages/plugins/spider/package.json`** — Verify that `@shardworks/stacks-apparatus` and `@shardworks/animator-apparatus` are listed as dependencies. They should be already (spider.ts imports from both), but the new `oculus-routes.ts` imports need them too.

- **`packages/plugins/spider/src/spider-oculus.test.ts`** — Tests for `GET /api/spider/config` route need updating: the response shape changes from `{ rigTemplates, engineDesigns, blockTypes }` to `{ templates, templateMappings, engineDesigns, blockTypes }`. The mock spider must also include `listTemplates()` and `listTemplateMappings()`.

- **`packages/plugins/spider/src/tools/tools.test.ts`** — The `makeGuild` helper's mock SpiderApi is missing `listBlockTypes()` (known gap). It also needs `listTemplates()` and `listTemplateMappings()` added.

- **`packages/plugins/spider/src/index.ts`** — If this re-exports types from `types.ts`, the new `RigTemplateInfo` type needs to be included in the exports.

## Validation Checklist

- V1 [R1, R2]: Run `grep -n 'listTemplates\|listTemplateMappings\|RigTemplateInfo' packages/plugins/spider/src/types.ts` — must find the interface and method signatures.

- V2 [R1, R3]: In `packages/plugins/spider/src/spider.ts`, verify the `api` object implements both new methods. Call `listTemplateMappings()` in a test where config has mapping `{ "mandate": "default" }` and kit has mapping `{ "task": "myPlugin.taskTemplate" }` — result must include both, and config entry wins on collision.

- V3 [R4]: Run the spider-oculus test suite (`node --test packages/plugins/spider/src/spider-oculus.test.ts`). The config route test must pass with the new response shape — assert `result.templates` is an array, `result.templateMappings` is an object, `result.rigTemplates` is undefined.

- V4 [R5]: Add test cases to `spider-oculus.test.ts` for the new transcript route: (a) missing sessionId returns 400, (b) unknown sessionId returns 404, (c) running session returns `{ messages: [], sessionStatus: 'running' }`, (d) completed session returns `{ messages: [...], sessionStatus: 'completed' }`.

- V5 [R6, R7, R8]: Open the Spider page in a browser, navigate to Config tab. Verify templates display in a table with the five specified columns. Click a row — verify graphical pipeline appears below with `pending` badges, and collapsible JSON block is present. Click an engine node — verify Design ID, Upstream, and Givens Spec display.

- V6 [R9, R10, R11]: Open the Rigs tab. Verify column order is Status | Writ Title | Engines | Rig Id | Writ Id | Created. Verify writ titles display for rigs with known writs, '—' for unknown. Verify sortable columns (Status, Rig Id, Writ Id, Created) have clickable headers. Click Refresh — verify writ titles update.

- V7 [R12]: Click a rig to enter detail view. Verify a card appears between the meta table and "Engine Pipeline" heading showing the writ title and body in a readonly, resizable textarea.

- V8 [R13]: In the engine detail panel, select a completed engine — verify an "Elapsed" field shows (e.g. `5m 12s`). Select a running engine — verify "Elapsed" shows `running…` with pulsing animation.

- V9 [R14, R18]: Select a completed quick engine (one with a sessionId). Verify "Input Tokens", "Output Tokens", and "Cost (USD)" fields appear in the `<dl>` with correct formatting (`$X.XXXX`). Re-select the same engine — verify the data is re-fetched (check network tab).

- V10 [R15, R16, R17]: Select a running quick engine. Verify the session log textarea appears with a spinner. Wait for the session to complete (or mock the transcript endpoint). Verify transcript messages render as human-readable text (assistant text as-is, tool calls as `[tool: name]`, results as `[result: id]`). Navigate back to list — verify polling stops (check network tab, no further requests to session-transcript).

- V11 [R19]: Verify `packages/plugins/spider/src/static/spider.js` remains a single IIFE with no `import`/`export` statements, no `require()`, no module syntax.

## Test Cases

### Backend — RigTemplateRegistry.listTemplates()

1. **Config-only templates**: Register two config templates `"default"` and `"fast"`. Call `listTemplates()`. Expect two entries with `source: 'config'` for both.

2. **Kit-contributed template**: Register a config template `"default"` and a kit template that becomes `"myPlugin.standard"`. Call `listTemplates()`. Expect two entries: `{ name: 'default', source: 'config' }` and `{ name: 'myPlugin.standard', source: 'myPlugin' }`.

3. **Empty registry**: Call `listTemplates()` on a fresh registry. Expect empty array.

### Backend — RigTemplateRegistry.listTemplateMappings()

4. **Config-only mappings**: Register config mappings `{ "mandate": "default" }`. Call `listTemplateMappings()`. Expect `{ "mandate": "default" }`.

5. **Merged mappings**: Register config mapping `{ "mandate": "default" }` and kit mapping `{ "task": "myPlugin.standard", "mandate": "myPlugin.fast" }`. Call `listTemplateMappings()`. Expect `{ "mandate": "default", "task": "myPlugin.standard" }` — config wins for "mandate".

6. **Empty mappings**: No mappings registered. Expect `{}`.

### Backend — Transcript route

7. **Missing sessionId parameter**: GET `/api/spider/session-transcript` with no query param. Expect 400 response with error message.

8. **Unknown session**: GET `/api/spider/session-transcript?sessionId=nonexistent`. Session not found in sessions book. Expect 404.

9. **Running session**: GET `/api/spider/session-transcript?sessionId=ses-running`. Session exists with `status: 'running'`. Expect `{ messages: [], sessionStatus: 'running' }`.

10. **Completed session with transcript**: GET `/api/spider/session-transcript?sessionId=ses-done`. Session exists with `status: 'completed'`. Transcript exists with messages. Expect `{ messages: [...], sessionStatus: 'completed' }`.

11. **Completed session without transcript**: Session completed but no transcript in book (edge case — provider didn't produce one). Expect `{ messages: [], sessionStatus: 'completed' }`.

### Frontend — formatElapsed()

12. **Hours, minutes, seconds**: `formatElapsed('2024-01-01T00:00:00Z', '2024-01-01T01:13:22Z')` → `'1h 13m 22s'`.

13. **Minutes and seconds only**: `formatElapsed('2024-01-01T00:00:00Z', '2024-01-01T00:05:12Z')` → `'5m 12s'`.

14. **Seconds only**: `formatElapsed('2024-01-01T00:00:00Z', '2024-01-01T00:00:42Z')` → `'42s'`.

15. **Sub-second**: `formatElapsed('2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.500Z')` → `'<1s'`.

### Frontend — renderTranscript()

16. **Assistant text**: Input `[{ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello world' }] } }]`. Output contains `'Hello world'`.

17. **Tool use**: Input `[{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'bash' }] } }]`. Output contains `'[tool: bash]'`.

18. **Tool result**: Input `[{ type: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_123' }] }]`. Output contains `'[result: tu_123]'`.

19. **Result message ignored**: Input `[{ type: 'result', total_cost_usd: 0.05 }]`. Output is empty.

20. **Empty messages**: Input `[]`. Output is empty string.

### Config route response shape

21. **Updated shape**: Call `GET /api/spider/config`. Response must have keys `templates` (array), `templateMappings` (object), `engineDesigns` (array), `blockTypes` (array). Must NOT have key `rigTemplates`.