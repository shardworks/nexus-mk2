# Add Oculus Page for the Astrolabe

## Summary

Add a new Oculus dashboard page to the astrolabe apparatus that displays PlanDoc data in a list/detail view with status filtering, tabbed content sections, per-step AI cost breakdowns, and cross-links to brief and mandate writs. Establish and implement a URL query parameter convention for cross-page deep linking across all Oculus pages.

## Current State

The astrolabe apparatus (`packages/plugins/astrolabe/`) stores PlanDoc records in a Stacks book (`astrolabe.plans`) and exposes them through tools (`plan-show`, `plan-list`). The Oculus auto-maps these tools to REST endpoints (`GET /api/plan/show?planId=X`, `GET /api/plan/list?...`). There is currently no Oculus page for viewing plan data — the astrolabe supportKit has no `pages` contribution.

The astrolabe `package.json` files array is `["dist", "sage.md"]` — it does not include a pages directory.

The astrolabe supportKit in `astrolabe.ts` (line 335) has `recommends: ["spider", "loom", "fabricator", "oculus"]` but no `pages` entry.

The clerk writs page (`packages/plugins/clerk/pages/writs/index.html`) has a `scrollAndExpand(id)` function that scrolls to and expands a writ row, but does not check URL query parameters on load. Spider generates `/pages/clerk/?writ=ID` links (spider.js lines 211, 249) that navigate to the writs page but do not trigger auto-expansion.

Relevant types:

```typescript
// packages/plugins/astrolabe/src/types.ts
export type PlanStatus = 'reading' | 'analyzing' | 'reviewing' | 'writing' | 'completed' | 'failed';

export interface PlanDoc {
  [key: string]: unknown;
  id: string;
  codex: string;
  status: PlanStatus;
  inventory?: string;
  observations?: string;
  scope?: ScopeItem[];
  decisions?: Decision[];
  spec?: string;
  generatedWritId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeItem {
  id: string;
  description: string;
  rationale: string;
  included: boolean;
}

export interface Decision {
  id: string;
  scope: string[];
  question: string;
  context?: string;
  options: Record<string, string>;
  recommendation?: string;
  rationale?: string;
  selected?: string;
  patronOverride?: string;
}
```

## Requirements

- R1: The astrolabe apparatus must register a new Oculus page with id `"astrolabe"`, title `"Astrolabe"`, and dir `"pages/astrolabe"`.
- R2: The page must consist of three files: `index.html`, `astrolabe.js`, and `astrolabe.css` in `packages/plugins/astrolabe/pages/astrolabe/`.
- R3: The list view must display a table of plans with columns: Status (badge), Codex, Title (brief writ title, fetched via writ-show), Plan ID, Created date.
- R4: The list view must support status filter buttons for all PlanStatus values (reading, analyzing, reviewing, writing, completed, failed) plus an "All" button, using the `plan-list` API's status filter parameter.
- R5: The list view must support pagination with a "Load More" button, using the `plan-list` API's limit and offset parameters (limit: 20).
- R6: When a plan row is clicked, the page must switch to a detail view (hiding the list view, showing the detail view with a back button).
- R7: The detail view must show a metadata card containing: Plan ID, Status (badge), Codex, Brief Writ (cross-link), Mandate Writ (cross-link, if `generatedWritId` is set), Created date, Updated date, and a cost summary section.
- R8: The detail view must show a tab bar with tabs: Inventory, Scope, Decisions, Observations, Spec. Only tabs with content should be selectable; empty sections should show a disabled/dimmed tab.
- R9: Markdown content (inventory, observations, spec) must be rendered using a minimal client-side markdown function that handles: headings (`#` through `######`), bold (`**text**`), italic (`*text*` / `_text_`), inline code (`` `code` ``), fenced code blocks (`` ``` ``...`` ``` ``), unordered lists (`- item` / `* item`), ordered lists (`1. item`), and paragraphs. All text must be HTML-escaped before processing to prevent XSS.
- R10: Scope items must be rendered as a styled table with columns: ID, Description, Included (badge: green "included" / red "excluded"), Rationale.
- R11: Decisions must be rendered as a table with columns: ID, Question, Selected. Each row must be expandable (click to toggle) showing: Context, Options (key-description list), Recommendation, Rationale, and Patron Override (if set).
- R12: Status badges must use the following mapping: reading/analyzing/writing -> `badge--active`, reviewing -> `badge--warning`, completed -> `badge--success`, failed -> `badge--error`.
- R13: The metadata card must display per-step cost information for each anima-session engine (reader, analyst, spec-writer) showing: engine name, input tokens, output tokens, cost (USD). It must also show an aggregated total cost.
- R14: Cost data must be obtained via client-side fetch chain: `GET /api/rig/list?limit=100` -> filter results by `rig.writId === plan.id` -> for each engine with `designId === "anima-session"` and a `sessionId`, fetch `GET /api/session/show?id={sessionId}` -> extract `costUsd` and `tokenUsage`.
- R15: Brief writ cross-links must render as `<a href="/pages/clerk/?writ={plan.id}">{plan.id}</a>`. Mandate writ cross-links (when `generatedWritId` is set) must render as `<a href="/pages/clerk/?writ={plan.generatedWritId}">{plan.generatedWritId}</a>`.
- R16: The astrolabe page must support inbound deep linking via the `?plan=ID` query parameter. When present on page load, the page must fetch and display the detail view for that plan.
- R17: The clerk writs page must be updated to handle the `?writ=ID` query parameter on page load: parse the parameter, and after writs are loaded, call `scrollAndExpand(id)` to scroll to and expand the target writ. If the writ is not in the loaded list, fetch it via `writ-show` and prepend it to the writs array before expanding.
- R18: The astrolabe `package.json` files array must include `"pages"` so page assets are published with the package.

## Design

### Registration Change

Add a `pages` entry to the astrolabe supportKit in `packages/plugins/astrolabe/src/astrolabe.ts`:

```typescript
supportKit: {
  // ... existing books, writTypes, roles, engines, etc. ...
  pages: [
    { id: 'astrolabe', title: 'Astrolabe', dir: 'pages/astrolabe' },
  ],
  // ... existing tools ...
},
```

This follows the clerk pattern exactly. The Oculus will resolve `pages/astrolabe/` relative to the `@shardworks/astrolabe-apparatus` package root in `node_modules`.

### Package.json Change

Update `packages/plugins/astrolabe/package.json` files array from `["dist", "sage.md"]` to `["dist", "sage.md", "pages"]`.

### Page Files

Create three files in `packages/plugins/astrolabe/pages/astrolabe/`:

**`index.html`** — minimal HTML shell following the spider pattern:
- `<link rel="stylesheet" href="astrolabe.css">` in `<head>`
- `<main style="padding: 24px;">` wrapper
- Two top-level divs: `#plan-list-view` (visible by default) and `#plan-detail-view` (hidden by default)
- List view contains: status filter buttons, data table with `<thead>` and `<tbody id="plan-tbody">`, empty state div, load-more button
- Detail view contains: back button, `<h2 id="detail-title">`, metadata card div, cost summary div, tab bar div, tab content container
- `<script src="astrolabe.js"></script>` before `</body>`

**`astrolabe.js`** — vanilla JS IIFE following the spider pattern:

State variables:
```javascript
var plans = [];
var currentPlan = null;
var activeTab = 'inventory';
var currentStatusFilter = '';
var offset = 0;
var LIMIT = 20;
```

Key functions:
- `esc(s)` — HTML-escape utility (same pattern as spider.js)
- `formatDate(iso)` — date formatting utility (same pattern as spider.js)
- `statusBadge(status)` — returns badge HTML using the D6 mapping: reading/analyzing/writing -> `badge badge--active`, reviewing -> `badge badge--warning`, completed -> `badge badge--success`, failed -> `badge badge--error`
- `renderMarkdown(md)` — minimal markdown-to-HTML renderer (see Markdown Rendering below)
- `fetchPlans(replace)` — calls `GET /api/plan/list?limit=20&offset=N` with optional status filter, updates `plans` array, calls `renderPlanList()`
- `renderPlanList()` — renders table rows; for each plan, fetches the brief writ title via `GET /api/writ/show?id={plan.id}` to display in the Title column (cache results in a lookup object to avoid re-fetching)
- `showPlanDetail(plan)` — hides list view, shows detail view, populates metadata card, fetches cost data, renders first non-empty tab
- `fetchCostData(planId)` — implements the client-side fetch chain (R14): fetches rigs, filters by writId, fetches sessions for anima-session engines, renders cost table in metadata card
- `renderTab(tabName)` — renders content for the selected tab in the content container
- `renderScopeTable(scope)` — renders scope items as a table (R10)
- `renderDecisionsTable(decisions)` — renders decisions as an expandable table (R11)
- `backToList()` — restores list view visibility
- `handleDeepLink()` — on DOMContentLoaded, checks `URLSearchParams` for `plan` parameter, fetches plan via `/api/plan/show?planId=X`, calls `showPlanDetail`

### Markdown Rendering (D5: basic-render)

The `renderMarkdown(md)` function performs a safe, minimal markdown-to-HTML conversion:

1. Return empty string for null/undefined/empty input.
2. HTML-escape the entire input first (using `esc()`) to prevent XSS.
3. Process in this order:
   - Fenced code blocks: `` ```...content...``` `` -> `<pre><code>...content...</code></pre>` (already escaped, no further processing inside)
   - Headings: lines starting with `# ` through `###### ` -> `<h1>` through `<h6>`
   - Bold: `**text**` -> `<strong>text</strong>`
   - Italic: `*text*` or `_text_` -> `<em>text</em>`
   - Inline code: `` `code` `` -> `<code>code</code>`
   - Unordered lists: consecutive lines starting with `- ` or `* ` -> `<ul><li>...`
   - Ordered lists: consecutive lines starting with `N. ` -> `<ol><li>...`
   - Paragraphs: consecutive non-empty lines wrapped in `<p>`
4. Wrap output in `<div class="md-content">` and return the HTML string. The tab content container sets `innerHTML` to this result.

### Status Badge Mapping (D6)

```javascript
function statusBadge(status) {
  var map = {
    reading: 'badge badge--active',
    analyzing: 'badge badge--active',
    writing: 'badge badge--active',
    reviewing: 'badge badge--warning',
    completed: 'badge badge--success',
    failed: 'badge badge--error'
  };
  var cls = map[status] || 'badge';
  return '<span class="' + cls + '">' + esc(status) + '</span>';
}
```

### Cost Data Fetch Chain (D7, D8)

```javascript
function fetchCostData(planId) {
  // 1. Fetch all rigs (no writId filter available server-side)
  fetch('/api/rig/list?limit=100')
    .then(function (r) { return r.json(); })
    .then(function (rigs) {
      // 2. Find the rig for this plan (rig.writId === planId)
      var rig = rigs.find(function (r) { return r.writId === planId; });
      if (!rig) {
        renderCostUnavailable();
        return;
      }

      // 3. Find anima-session engines with sessionIds
      var sessionEngines = (rig.engines || []).filter(function (e) {
        return e.designId === 'anima-session' && e.sessionId;
      });

      if (sessionEngines.length === 0) {
        renderCostUnavailable();
        return;
      }

      // 4. Fetch session data for each
      var fetches = sessionEngines.map(function (e) {
        return fetch('/api/session/show?id=' + encodeURIComponent(e.sessionId))
          .then(function (r) { return r.json(); })
          .then(function (session) {
            return { engineId: e.id, session: session };
          })
          .catch(function () { return null; });
      });

      return Promise.all(fetches);
    })
    .then(function (results) {
      if (!results) return;
      var valid = results.filter(Boolean);
      if (valid.length === 0) {
        renderCostUnavailable();
        return;
      }
      renderCostTable(valid);
    })
    .catch(function () {
      renderCostUnavailable();
    });
}
```

The `renderCostTable(results)` function renders into the cost summary div (`#cost-summary`) in the metadata card. It shows a small table:

| Step | Input Tokens | Output Tokens | Cost (USD) |
|------|-------------|--------------|------------|
| reader | N | N | $X.XXXX |
| analyst | N | N | $X.XXXX |
| spec-writer | N | N | $X.XXXX |
| **Total** | **N** | **N** | **$X.XXXX** |

Format costs as `$X.XXXX` (4 decimal places). Format token counts with `toLocaleString()`. If no cost data is available (no rig found, or engines have no sessions), `renderCostUnavailable()` sets the cost summary div content to a dim text message: "Cost data not available".

### Scope Table Rendering (D13)

```javascript
function renderScopeTable(scope) {
  if (!scope || scope.length === 0) return '<p class="empty-state">No scope items.</p>';
  var html = '<table class="data-table"><thead><tr>' +
    '<th>ID</th><th>Description</th><th>Status</th><th>Rationale</th>' +
    '</tr></thead><tbody>';
  for (var i = 0; i < scope.length; i++) {
    var s = scope[i];
    var badge = s.included
      ? '<span class="badge badge--success">included</span>'
      : '<span class="badge badge--error">excluded</span>';
    html += '<tr><td>' + esc(s.id) + '</td><td>' + esc(s.description) +
      '</td><td>' + badge + '</td><td>' + esc(s.rationale) + '</td></tr>';
  }
  html += '</tbody></table>';
  return html;
}
```

### Decisions Table Rendering (D13)

Decisions render as a table. Each row shows ID, Question, and Selected value. Clicking a row toggles an expanded detail section below it showing Context, Options, Recommendation, Rationale, and Patron Override.

```javascript
function renderDecisionsTable(decisions) {
  if (!decisions || decisions.length === 0) return '<p class="empty-state">No decisions.</p>';
  var html = '<table class="data-table" id="decisions-table"><thead><tr>' +
    '<th>ID</th><th>Question</th><th>Selected</th>' +
    '</tr></thead><tbody>';
  for (var i = 0; i < decisions.length; i++) {
    var d = decisions[i];
    html += '<tr class="decision-row" data-idx="' + i + '">' +
      '<td>' + esc(d.id) + '</td>' +
      '<td>' + esc(d.question) + '</td>' +
      '<td>' + esc(d.selected || '\u2014') + '</td></tr>';
  }
  html += '</tbody></table>';
  return html;
}
```

After inserting HTML, wire click handlers on `.decision-row` elements that toggle a detail `<tr>` below the clicked row. The detail row has class `decision-detail` and contains a single `<td colspan="3">` with:
- Context (if present): `<p>{context}</p>`
- Options: rendered as a `<dl>` — `<dt>option-key</dt><dd>option-description</dd>` for each entry in the options map
- Recommendation and Rationale: `<p><strong>Recommendation:</strong> {recommendation} — {rationale}</p>`
- Patron Override (if set): `<p style="color:var(--yellow)"><strong>Patron Override:</strong> {patronOverride}</p>`

### Tab Bar and Content (D4)

Tab bar HTML in detail view:
```html
<div class="tab-bar" id="plan-tabs">
  <button class="tab active" data-tab="inventory">Inventory</button>
  <button class="tab" data-tab="scope">Scope</button>
  <button class="tab" data-tab="decisions">Decisions</button>
  <button class="tab" data-tab="observations">Observations</button>
  <button class="tab" data-tab="spec">Spec</button>
</div>
<div id="tab-content"></div>
```

When rendering tabs in `showPlanDetail()`, check if the corresponding field on the plan is present and non-empty. If empty/null/undefined (or for arrays, length === 0), add `style="opacity:0.3;cursor:default"` to the tab button and set a `data-disabled="true"` attribute. When a tab is clicked, check for `data-disabled` and return early if set.

When a tab is clicked and not disabled:
- Update active class on tab buttons
- Set `activeTab` to the clicked tab name
- Call `renderTab(tabName)` which sets `#tab-content.innerHTML` to:
  - inventory/observations/spec: `renderMarkdown(currentPlan[tabName])`
  - scope: `renderScopeTable(currentPlan.scope)` then wire no additional handlers
  - decisions: `renderDecisionsTable(currentPlan.decisions)` then wire `.decision-row` click handlers for expand/collapse

### Cross-Linking Convention (D9)

The convention is: each Oculus page may accept entity-specific query parameters. On page load, the page reads `new URLSearchParams(window.location.search)` and, if a known parameter is present, navigates directly to that entity's detail view.

Documented parameter names:
- Writs page: `?writ=ID` — scrolls to and expands the target writ
- Astrolabe page: `?plan=ID` — opens the detail view for the target plan

### Clerk Writs Page Deep Link Update (D10)

In `packages/plugins/clerk/pages/writs/index.html`, replace the bare initialization block at the end of the `<script>` (around lines 959-962):

**Current code (lines 959-962):**
```javascript
    // ── Init ────────────────────────────────────────────────────────────
    loadWritTypes();
    loadCodexes();
    loadWrits(true);
```

**New code:**
```javascript
    // ── Init ────────────────────────────────────────────────────────────
    loadWritTypes();
    loadCodexes();

    // Deep-link: ?writ=ID
    (async function () {
      var params = new URLSearchParams(window.location.search);
      var writId = params.get('writ');

      await loadWrits(true);

      if (!writId) return;

      // If writ is in loaded list, scroll to it
      if (writs.find(function (w) { return w.id === writId; })) {
        scrollAndExpand(writId);
        return;
      }

      // Otherwise, fetch it and prepend to list
      try {
        var writ = await api('GET', '/api/writ/show?id=' + encodeURIComponent(writId));
        writs.unshift(writ);
        renderTable();
        scrollAndExpand(writId);
      } catch (e) {
        console.error('Deep-link writ not found:', writId);
      }
    })();
```

This replaces the bare `loadWrits(true)` call. The deep-link handler calls `loadWrits(true)` itself, then checks for the writ parameter. When no `?writ=` parameter is present, behavior is identical to the current code.

### Non-obvious Touchpoints

- **`packages/plugins/astrolabe/package.json` `files` array** — must add `"pages"` or the page assets won't be published to npm and the Oculus won't find them at runtime.
- **`packages/plugins/oculus/src/types.ts`** — provides the `OculusKit` and `PageContribution` interfaces consumed by the astrolabe supportKit. Not modified, but the implementing agent needs to know the shape.
- **The Oculus auto-injects nav chrome and the shared stylesheet** — the astrolabe page should NOT include its own `<link>` to `/static/style.css`. The Oculus injects it automatically before `</head>`. The page-specific `astrolabe.css` is the only stylesheet the page needs to reference.
- **`packages/plugins/astrolabe/src/supportkit.test.ts`** — existing test validates supportKit structure. Adding `pages` to the supportKit may require updating this test if it asserts specific keys.

### CSS (astrolabe.css)

The page-specific CSS file must include tab-bar styles (duplicated from spider.css since they're not in the shared stylesheet) and astrolabe-specific styles:

```css
/* Tab bar (duplicated from spider pattern — not yet in shared stylesheet) */
.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border, #333);
  padding-bottom: 0;
}

.tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-dim, #888);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: -1px;
  padding: 8px 16px;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover { color: var(--text, #eee); }
.tab.active {
  border-bottom-color: var(--cyan, #0ff);
  color: var(--cyan, #0ff);
}

/* Plan list table */
#plan-tbody tr { cursor: pointer; }
#plan-tbody tr:hover { opacity: 0.85; }

/* Filter buttons */
.filter-btn { margin-right: 4px; }
.filter-btn.active-filter {
  background: var(--blue, #7aa2f7);
  color: var(--bg, #1a1b26);
}

/* Decision expandable rows */
.decision-row { cursor: pointer; }
.decision-row:hover { opacity: 0.85; }
.decision-detail td {
  background: var(--bg2, #1a1b26);
  padding: 1rem;
}
.decision-detail dl {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 4px 12px;
  margin: 0;
}
.decision-detail dt {
  color: var(--text-dim, #888);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}
.decision-detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}

/* Cost table */
.cost-table { margin-top: 12px; }
.cost-table th { font-size: 11px; text-transform: uppercase; color: var(--text-dim, #888); }
.cost-total { font-weight: 600; border-top: 2px solid var(--border, #333); }

/* Metadata grid */
.meta-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  font-size: 0.875rem;
}
.meta-grid dt { color: var(--text-dim, #888); font-weight: 600; text-transform: uppercase; font-size: 12px; }
.meta-grid dd { margin: 0; }

/* Rendered markdown */
.md-content h1, .md-content h2, .md-content h3,
.md-content h4, .md-content h5, .md-content h6 {
  margin: 1em 0 0.5em;
}
.md-content h1 { font-size: 1.4em; }
.md-content h2 { font-size: 1.2em; }
.md-content h3 { font-size: 1.1em; }
.md-content p { margin: 0.5em 0; }
.md-content ul, .md-content ol { padding-left: 1.5em; margin: 0.5em 0; }
.md-content pre { max-height: 400px; overflow: auto; }
.md-content code { font-size: 12px; }
```

## Validation Checklist

- V1 [R1, R18]: After changes, the astrolabe supportKit has a `pages` array with one entry `{ id: "astrolabe", title: "Astrolabe", dir: "pages/astrolabe" }`. The `package.json` files array includes `"pages"`. Verify: `grep -r 'pages' packages/plugins/astrolabe/src/astrolabe.ts` shows the pages contribution; `cat packages/plugins/astrolabe/package.json` shows `"pages"` in files.
- V2 [R2]: Three files exist: `packages/plugins/astrolabe/pages/astrolabe/index.html`, `packages/plugins/astrolabe/pages/astrolabe/astrolabe.js`, `packages/plugins/astrolabe/pages/astrolabe/astrolabe.css`.
- V3 [R3, R4, R5]: Load the Astrolabe page in a browser. The plan list table shows Status, Codex, Title, Plan ID, Created columns. Status filter buttons work (clicking "completed" shows only completed plans; clicking "All" shows all). The "Load More" button appears when 20+ plans exist and loads the next page.
- V4 [R6]: Click a plan row in the list. The list view hides and the detail view appears with a back button. Click back — the list view reappears.
- V5 [R7, R15]: In the detail view, the metadata card shows Plan ID, Status badge, Codex, Brief Writ (as a link to `/pages/clerk/?writ={id}`), and Created/Updated dates. When `generatedWritId` is set, a Mandate Writ link appears pointing to `/pages/clerk/?writ={generatedWritId}`.
- V6 [R8]: The detail view shows a tab bar with Inventory, Scope, Decisions, Observations, Spec tabs. Tabs for empty/null fields appear dimmed and do not render content when clicked.
- V7 [R9]: With a plan that has markdown content (inventory, spec), verify the rendered output shows headings as styled headers, code blocks in `<pre><code>`, lists as `<ul>/<ol>`, and bold/italic text with proper formatting. Verify that HTML in markdown content is escaped (no XSS).
- V8 [R10]: The Scope tab shows a table with ID, Description, Status (green "included" / red "excluded" badges), Rationale columns.
- V9 [R11]: The Decisions tab shows a table with ID, Question, Selected columns. Clicking a row toggles an expanded detail section showing Context, Options, Recommendation, Rationale, and Patron Override (if set, in yellow).
- V10 [R12]: Verify badge classes: a plan with status "reading" shows `badge--active` (cyan pulse), "reviewing" shows `badge--warning` (yellow), "completed" shows `badge--success` (green), "failed" shows `badge--error` (red).
- V11 [R13, R14]: In the detail view for a completed plan, the cost section shows a table with per-step rows (reader, analyst, spec-writer) and a total row. Each row shows input tokens, output tokens, and cost in $X.XXXX format. For a plan without a rig or sessions, the cost section shows "Cost data not available".
- V12 [R16]: Navigate to `/pages/astrolabe/?plan={planId}`. The page loads directly into the detail view for that plan, skipping the list view.
- V13 [R17]: Navigate to `/pages/clerk/?writ={writId}`. The writs page loads, then scrolls to and expands the target writ. If the writ is not in the initial page of results, it is fetched individually and displayed.
- V14 [R1]: Run `node --experimental-transform-types --test packages/plugins/astrolabe/src/supportkit.test.ts` — the existing supportKit test passes (it validates the supportKit structure, which now includes `pages`).

## Test Cases

1. **List loads and displays plans.** Call `/api/plan/list?limit=20&offset=0`. Expect: table rows rendered with correct status badges, codex, plan IDs, and dates.
2. **Status filter narrows results.** Click "completed" filter. Expect: only `/api/plan/list?limit=20&offset=0&status=completed` is called, table shows only completed plans. Click "All" — status filter removed.
3. **Pagination works.** When first load returns 20 results, "Load More" button is visible. Click it. Expect: `/api/plan/list?limit=20&offset=20` is called, results appended. When fewer than 20 returned, button hides.
4. **Detail view shows correct metadata.** Click a plan row. Expect: metadata card shows plan.id, status badge, codex, cross-link to brief writ, created/updated dates. For a plan with `generatedWritId`, mandate writ link appears.
5. **Tabs switch content.** Click each tab. Expect: content container updates. Inventory/Observations/Spec show rendered markdown. Scope shows structured table. Decisions show expandable table.
6. **Empty tabs are dimmed.** For a plan with `status: "reading"` (no scope, decisions, observations, spec), tabs other than Inventory appear dimmed.
7. **Markdown rendering — headings.** Input: `"# H1\n## H2\n### H3"`. Expect: `<h1>H1</h1><h2>H2</h2><h3>H3</h3>`.
8. **Markdown rendering — code blocks.** Input: `` "```js\nconst x = 1;\n```" ``. Expect: content inside `<pre><code>`, HTML-escaped.
9. **Markdown rendering — XSS prevention.** Input: `"<script>alert(1)</script>"`. Expect: script tag is HTML-escaped, not executed.
10. **Markdown rendering — lists.** Input: `"- item1\n- item2"`. Expect: `<ul><li>item1</li><li>item2</li></ul>`.
11. **Markdown rendering — null input.** Input: `null`. Expect: empty string returned.
12. **Scope table rendering.** Input: two scope items, one included, one excluded. Expect: table with two rows, green "included" badge on first, red "excluded" badge on second.
13. **Decisions expandable rows.** Click a decision row. Expect: detail row appears below showing context, options, recommendation. Click again — detail row removed.
14. **Decisions with patron override.** A decision with `patronOverride` set. Expect: override text displayed in yellow.
15. **Cost data — happy path.** Plan has a rig with 3 anima-session engines, all completed with sessions. Expect: cost table shows 3 step rows + total row with correct sums.
16. **Cost data — no rig found.** Plan has no associated rig. Expect: "Cost data not available" message.
17. **Cost data — partial sessions.** Rig exists but only 2 of 3 engines have sessions. Expect: cost table shows only the 2 engines with data; total sums those 2.
18. **Deep link — astrolabe `?plan=ID`.** Load `/pages/astrolabe/?plan=validId`. Expect: detail view shown for that plan. Load with invalid ID — list view shown (graceful fallback).
19. **Deep link — clerk `?writ=ID` (writ in list).** Load `/pages/clerk/?writ=existingId`. Expect: writs load, page scrolls to target writ, detail row expanded.
20. **Deep link — clerk `?writ=ID` (writ not in list).** Load `/pages/clerk/?writ=oldWritId`. Expect: initial writs load, target not found in list, individual fetch via writ-show, prepended to list, scrolled to and expanded.
21. **Deep link — clerk no param.** Load `/pages/clerk/` with no query params. Expect: normal behavior, no errors.
22. **Status badge mapping.** For each of the 6 PlanStatus values, verify the correct CSS class is applied per D6.
23. **Cross-links navigate correctly.** Click the brief writ link in the astrolabe detail view. Expect: navigates to `/pages/clerk/?writ={planId}`. On the writs page, the target writ is scrolled to and expanded.
