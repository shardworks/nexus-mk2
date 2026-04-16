# Writ Table UX: Copyable IDs, Detail View ID, Multi-Select Type Filter

## Summary

Add copy-to-clipboard functionality for writ IDs in both the table and detail views, change the type filter default to "All", and implement multi-select type filtering with backend array support.

## Current State

### Frontend — `packages/plugins/clerk/pages/writs/index.html`

A single-file HTML+JS page (~1215 lines) containing all writ table UI, detail view, type filter bar, and event wiring inside an IIFE in a `<script>` tag.

**State variables (line 142–151):**
```js
let writs = [];
let offset = 0;
let currentStatus = '';  // '' = all
let currentType = '';    // '' = all
let searchText = '';
let sortCol = 'createdAt';
let sortDir = 'desc';
let showChildren = true;
let childrenMap = {};
let repostSourceId = null;
const LIMIT = 20;
```

**`renderTable()` (line 299–334):** Builds table rows. Each `<tr>` has a click handler `showWritDetail(w.id)` on the entire row (line 329). The ID cell is `<td><code>w.id</code></td>` (line 317) with no copy mechanism and no stopPropagation.

**`renderDetail(writ)` (line 353–449):** Builds the detail view HTML. The writ ID is **not rendered** anywhere in this function. The detail title (line 830) is set to `writ.title ?? writ.id` — the ID only appears as a title fallback.

**`buildTypeFilterBar(types)` (line 923–957):** Creates type filter buttons. Defaults to `'mandate'` if present, else `''` (All). Single-select via `setTypeFilter(type)`.

**`setTypeFilter(type)` (line 1137–1143):** Sets `currentType` to a single string, toggles `active-filter` class on exactly one button, calls `loadWrits(true)`.

**`loadWrits(replace)` (line 839–880):** Sends `params.set('type', currentType)` — a single string — to the API.

**Detail view HTML structure (line 123–127):**
```html
<div id="writ-detail-view" style="display:none">
  <button id="back-btn" class="btn">← Back to list</button>
  <h2 id="detail-title"></h2>
  <div id="detail-content"></div>
</div>
```

**`showWritDetail` (line 828–830):** Sets `detail-title` textContent then renders detail content.

### Backend — `packages/plugins/clerk/src/tools/writ-list.ts`

Tool definition. The `type` param is `z.string().optional()` — single string. The `status` param already supports `z.union([z.enum([...]), z.array(z.enum([...])).min(1)])`.

### Backend — `packages/plugins/clerk/src/clerk.ts` (line 113–130)

`buildWhereClause` handles `status` as array (uses IN operator when length > 1). The `type` filter uses `['type', '=', filters.type]` — equality only, no array support.

### Backend — `packages/plugins/clerk/src/types.ts` (line 114–125)

```typescript
export interface WritFilters {
  status?: WritStatus | WritStatus[];
  type?: string;
  parentId?: string;
  limit?: number;
  offset?: number;
}
```

### Oculus query param handling — `packages/plugins/oculus/src/oculus.ts`

GET routes use `c.req.query()` (line 389) which returns `Record<string, string>` — Hono's default keeps only the **last** value for repeated keys. The `coerceParams()` function (line 93–108) handles number and boolean coercion but has no array support. Repeated query params like `?type=a&type=b` will lose all but the last value.

### Test files

- `packages/plugins/clerk/pages/writs/writs-type-filter.test.js` — Tests `buildTypeFilterBar()` and `applyTypeFilter()` using a minimal DOM shim. Tests default-to-mandate behavior and single-select toggling.
- `packages/plugins/clerk/pages/writs/writs-hierarchy.test.js` — Tests `sortedFilteredWrits()`, `statusBadge()`, detail rendering. Duplicates a simplified `renderDetail` function.

### Styles — `packages/plugins/oculus/src/static/style.css`

Contains `.filter-btn`, `.active-filter`, `.badge`, `.btn`, `.data-table`, `.toolbar` styles. No clipboard-related styles exist.

## Requirements

- R1: When the user clicks a copy button in the ID cell of the writ table, the writ ID text must be copied to the clipboard and the row click handler must not fire.
- R2: When the user clicks anywhere else in the ID cell of the writ table (not the copy button), the row click handler must not fire, allowing normal text selection of the ID.
- R3: After a successful clipboard copy (in either table or detail view), the copy button must display a checkmark (✓) for approximately 1.5 seconds, then revert to the original copy icon (📋).
- R4: The detail view must display the writ ID in a `<code>` element on a subtitle line directly below the `<h2>` title, with a copy button adjacent to it.
- R5: The copy button in the detail view must copy the writ ID to the clipboard with the same visual feedback as the table copy button.
- R6: A shared `copyToClipboard(text, feedbackEl)` helper function must be used by both the table and detail view copy buttons.
- R7: On page load, the type filter must default to "All" (empty string / all types selected) regardless of which types are available.
- R8: The `currentType` state variable must be changed from a `string` to a `Set<string>`. An empty set means no types are selected and the table must show an empty state.
- R9: Clicking a type button must toggle that type on/off independently. Multiple type buttons can be active simultaneously, each showing the `active-filter` class.
- R10: The "All" button must select all individual type buttons when clicked. If all individual types are already selected, the "All" button must show the `active-filter` class automatically. If "All" is active and the user clicks an individual type button, every individual type must be deselected except the one that was clicked.
- R11: The `WritFilters.type` field must accept `string | string[]` (matching the `status` pattern).
- R12: The `writ-list` tool's `type` param must accept `z.union([z.string(), z.array(z.string()).min(1)])` (matching the `status` param pattern).
- R13: The `buildWhereClause` function in `clerk.ts` must handle `type` as an array, using the IN operator when length > 1 (matching the `status` handling).
- R14: The Oculus GET route query param parsing must support repeated query params (e.g., `?type=a&type=b`) by converting them to arrays when the Zod schema for that param expects a union containing an array type.
- R15: The frontend `loadWrits` function must send selected types as repeated query params: `?type=mandate&type=brief`.
- R16: When the `currentType` set is empty (no types selected), the `loadWrits` function must not send a `type` param, and the table must show an empty state (no API call needed, or the table renders "No writs found").
- R17: Test files must be updated to reflect the new default-to-All behavior and multi-select toggle semantics.

## Design

### Shared Clipboard Helper

Add a `copyToClipboard(text, feedbackEl)` function in the script IIFE, in the Helpers section (after line ~165, near the other helper functions):

```js
async function copyToClipboard(text, feedbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    const original = feedbackEl.textContent;
    feedbackEl.textContent = '✓';
    setTimeout(() => { feedbackEl.textContent = original; }, 1500);
  } catch (e) {
    console.error('Copy failed:', e);
  }
}
```

`feedbackEl` is the button element itself. The button text swaps to "✓" for 1.5s then reverts.

### Table ID Cell with Copy Button (S1)

In `renderTable()`, replace the ID cell rendering (currently line 317):

**Before:**
```js
'<td><code>' + w.id + '</code></td>' +
```

**After:**
```js
'<td class="id-cell"><code>' + w.id + '</code> <button class="btn copy-id-btn" data-copy-id="' + w.id + '" style="padding:0.1rem 0.3rem;font-size:0.7rem;cursor:pointer">📋</button></td>' +
```

After building the row, wire two event handlers:

1. **Stop propagation on the entire ID cell** — so clicking anywhere in the cell (text or button) does not trigger `showWritDetail`:
   ```js
   const idCell = tr.querySelector('.id-cell');
   if (idCell) {
     idCell.addEventListener('click', e => e.stopPropagation());
   }
   ```

2. **Wire the copy button:**
   ```js
   const copyBtn = tr.querySelector('.copy-id-btn');
   if (copyBtn) {
     copyBtn.addEventListener('click', () => {
       copyToClipboard(copyBtn.dataset.copyId, copyBtn);
     });
   }
   ```

Both handlers are wired inside the existing `for (const { writ: w, isChild } of visible)` loop, after the row action wiring (line 322–327) and before the row click listener (line 329).

### Detail View ID Subtitle (S2)

In `showWritDetail()`, after setting `detail-title` textContent (line 830), insert a subtitle element:

```js
// Remove any previous subtitle
const oldSubtitle = document.getElementById('detail-id-subtitle');
if (oldSubtitle) oldSubtitle.remove();

// Create subtitle with ID and copy button
const subtitle = document.createElement('div');
subtitle.id = 'detail-id-subtitle';
subtitle.style.cssText = 'margin-top:0.25rem;margin-bottom:0.75rem;font-size:0.875rem;opacity:0.7';
subtitle.innerHTML = '<code>' + writ.id + '</code> <button class="btn copy-id-btn" style="padding:0.1rem 0.3rem;font-size:0.7rem;cursor:pointer">📋</button>';

const detailTitle = document.getElementById('detail-title');
detailTitle.after(subtitle);

// Wire copy button
const detailCopyBtn = subtitle.querySelector('.copy-id-btn');
detailCopyBtn.addEventListener('click', () => {
  copyToClipboard(writ.id, detailCopyBtn);
});
```

This goes after line 830 and before line 832 (`const content = ...`).

### Type Filter Default to All (S3)

In `buildTypeFilterBar(types)` (line 950–956), replace the default selection logic:

**Before:**
```js
const hasMandateType = types.some(t => t.name === 'mandate');
const defaultType = hasMandateType ? 'mandate' : '';
currentType = defaultType;
bar.querySelectorAll('.type-filter-btn').forEach(btn => {
  btn.classList.toggle('active-filter', btn.dataset.type === defaultType);
});
```

**After:** Set `currentType` to a new `Set` containing all type names and activate all buttons plus the "All" button:
```js
currentType = new Set(types.map(t => t.name));
bar.querySelectorAll('.type-filter-btn').forEach(btn => {
  btn.classList.add('active-filter');
});
```

This defaults to all types selected, with the "All" button also active (since all individuals are selected).

### Multi-Select Type State (S4 — D11)

Change the `currentType` declaration (line 145) from:
```js
let currentType = '';    // '' = all
```
to:
```js
let currentType = new Set();  // Set<string> — empty = no types selected (empty state)
```

### Multi-Select Toggle Logic (S4 — D6, D7)

Replace `setTypeFilter(type)` (line 1137–1143) with a new function that implements multi-select toggling with the patron's "All" semantics:

```js
function setTypeFilter(type) {
  const bar = document.getElementById('type-filter-bar');
  const allBtn = bar.querySelector('.type-filter-btn[data-type=""]');
  const typeBtns = [...bar.querySelectorAll('.type-filter-btn:not([data-type=""])')];
  const allTypeNames = typeBtns.map(b => b.dataset.type);

  if (type === '') {
    // "All" clicked: select all individual types
    currentType = new Set(allTypeNames);
  } else {
    // Check if "All" is currently active (all types selected)
    const allActive = allTypeNames.length > 0 && allTypeNames.every(t => currentType.has(t));
    if (allActive) {
      // "All" was active — deselect everything except the clicked type
      currentType = new Set([type]);
    } else {
      // Normal toggle
      if (currentType.has(type)) {
        currentType.delete(type);
      } else {
        currentType.add(type);
      }
    }
  }

  // Update button visual state
  const nowAllActive = allTypeNames.length > 0 && allTypeNames.every(t => currentType.has(t));
  allBtn.classList.toggle('active-filter', nowAllActive);
  typeBtns.forEach(btn => {
    btn.classList.toggle('active-filter', currentType.has(btn.dataset.type));
  });

  loadWrits(true);
}
```

**Behavioral rules:**
- When "All" is clicked → `currentType` becomes a Set of all available type names. All buttons (including "All") get `active-filter`.
- When all individual types happen to be selected → "All" shows `active-filter` automatically.
- When "All" is active and user clicks an individual type → `currentType` becomes `new Set([clickedType])`. Only that one button is active. "All" loses `active-filter`.
- When "All" is not active and user clicks a type → that type toggles on/off independently.
- Empty set = no types selected → table shows empty state.

### Frontend loadWrits Update (S4/S5)

In `loadWrits(replace)` (line 846–848), replace the type param logic:

**Before:**
```js
if (currentType) params.set('type', currentType);
```

**After:**
```js
if (currentType.size === 0) {
  // No types selected — show empty state without hitting the API
  if (replace) { writs = []; }
  renderTable();
  document.getElementById('load-more-row').style.display = 'none';
  return;
}
for (const t of currentType) {
  params.append('type', t);
}
```

When the set is empty, skip the API call entirely and render an empty table. When types are selected, use `params.append` (not `params.set`) to produce repeated query params like `?type=mandate&type=brief`.

### Backend: WritFilters Type (S5 — D8)

In `packages/plugins/clerk/src/types.ts`, change `WritFilters.type`:

```typescript
export interface WritFilters {
  /** Filter by status. Accepts a single status or an array of statuses (OR). */
  status?: WritStatus | WritStatus[];
  /** Filter by writ type. Accepts a single type or an array of types (OR). */
  type?: string | string[];
  /** Filter to children of this parent writ. */
  parentId?: string;
  /** Maximum number of results (default: 20). */
  limit?: number;
  /** Number of results to skip. */
  offset?: number;
}
```

### Backend: writ-list Tool Schema (S5 — D9, D12)

In `packages/plugins/clerk/src/tools/writ-list.ts`, change the `type` param:

**Before:**
```typescript
type: z.string().optional().describe('Filter by writ type'),
```

**After:**
```typescript
type: z
  .union([z.string(), z.array(z.string()).min(1)])
  .optional()
  .describe('Filter by writ type (repeatable — pass multiple to match any)'),
```

### Backend: buildWhereClause Update (S5 — D13)

In `packages/plugins/clerk/src/clerk.ts`, replace the type filter handling (line 123–125):

**Before:**
```typescript
if (filters?.type) {
  conditions.push(['type', '=', filters.type]);
}
```

**After:**
```typescript
if (filters?.type) {
  const types = Array.isArray(filters.type) ? filters.type : [filters.type];
  if (types.length === 1) {
    conditions.push(['type', '=', types[0]!]);
  } else if (types.length > 1) {
    conditions.push(['type', 'IN', types]);
  }
}
```

This mirrors the existing `status` handling exactly (lines 115–121).

### Oculus: Repeated Query Param Support (S5 — D14)

In `packages/plugins/oculus/src/oculus.ts`, the GET route handler (line 386–405) uses `c.req.query()` which returns `Record<string, string>` — losing repeated params. This must be changed to detect repeated keys and convert them to arrays when the Zod schema expects an array type.

Add a helper function to detect if a Zod schema accepts an array:

```typescript
function isArrayAcceptingSchema(schema: z.ZodTypeAny): boolean {
  let inner: z.ZodTypeAny = schema;
  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
  if (inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodTypeAny;
  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
  if (inner instanceof z.ZodArray) return true;
  if (inner instanceof z.ZodUnion) {
    return (inner.options as z.ZodTypeAny[]).some(
      (opt) => opt instanceof z.ZodArray,
    );
  }
  return false;
}
```

Replace `c.req.query()` in the GET handler with raw URL parsing that preserves repeated params:

```typescript
function parseQueryParams(
  url: string,
  shape: Record<string, z.ZodTypeAny>,
): Record<string, unknown> {
  const searchParams = new URL(url, 'http://localhost').searchParams;
  const result: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    if (values.length > 1 && shape[key] && isArrayAcceptingSchema(shape[key])) {
      result[key] = values;
    } else {
      result[key] = values[values.length - 1];
    }
  }
  return result;
}
```

In the GET route handler, replace:
```typescript
const rawQuery = c.req.query();
const coerced = coerceParams(shape, rawQuery);
```
with:
```typescript
const rawQuery = parseQueryParams(c.req.url, shape);
const coerced = coerceParams(shape, rawQuery as Record<string, string>);
```

Update `coerceParams` to skip entries that are already arrays (non-string values):

In the `coerceParams` function, the existing check `if (typeof value !== "string") continue;` already handles this — array values will be skipped by the coercion loop and passed through as-is. No change needed to `coerceParams`.

### Type Changes

**`WritFilters` (packages/plugins/clerk/src/types.ts):**
```typescript
export interface WritFilters {
  status?: WritStatus | WritStatus[];
  type?: string | string[];
  parentId?: string;
  limit?: number;
  offset?: number;
}
```

**Frontend state change (packages/plugins/clerk/pages/writs/index.html):**
```js
// Before: let currentType = '';
// After:
let currentType = new Set();  // Set<string>
```

### Behavior

**Copy button in table:**
- When user clicks the 📋 button in an ID cell, `navigator.clipboard.writeText(writId)` is called. The button text changes to "✓" for 1.5s, then reverts to "📋".
- When user clicks anywhere in the ID cell (including the `<code>` text), `stopPropagation` prevents the row click handler from firing. The user can select text normally.
- When clipboard API fails (e.g., permissions denied), the error is logged to console. No UI error is shown. (Clipboard is always available in Oculus's localhost context.)

**Copy button in detail view:**
- Appears as a subtitle line below the `<h2>` title: `<code>w-abc123</code> 📋`
- Same feedback behavior as table: "✓" for 1.5s.
- The subtitle element is created dynamically in `showWritDetail()` and removed/recreated on each detail view navigation (avoids stale IDs).

**Type filter default:**
- On page load, `buildTypeFilterBar` sets `currentType = new Set(allTypeNames)` — all types selected.
- All type buttons and the "All" button display `active-filter`.

**Multi-select toggling:**
- Clicking an individual type when "All" is NOT active: toggles that type in/out of the set.
- Clicking an individual type when "All" IS active (all types selected): deselects all types except the one clicked. Result: only that type is selected.
- Clicking "All": selects all individual types. All buttons get `active-filter`.
- When all individual types happen to be manually selected: "All" gets `active-filter` automatically (computed after every toggle).
- When the set becomes empty (user deselects all): no API call is made, table renders empty state ("No writs found."). Neither "All" nor any type button shows `active-filter`.

**API query params:**
- Single type selected: `?type=mandate`
- Multiple types selected: `?type=mandate&type=brief`
- All types selected: `?type=mandate&type=brief&type=quest` (all types sent explicitly — "All" is a UI convenience, not an API concept).
- No types selected: no API call made.

### Non-obvious Touchpoints

- **`packages/plugins/oculus/src/oculus.ts`** — The Oculus GET route query param parser must be updated to handle repeated params. This file is in a different plugin package from the clerk changes. Without this change, the backend will only see the last `type` value in repeated params.
- **`packages/plugins/clerk/pages/writs/writs-type-filter.test.js`** — Tests the `buildTypeFilterBar` and `applyTypeFilter` functions with a DOM shim. Must be updated to reflect: (a) default is all types selected, not mandate; (b) `currentType` is a Set, not a string; (c) multi-select toggle behavior.
- **`packages/plugins/clerk/pages/writs/writs-hierarchy.test.js`** — Contains a duplicated simplified `renderDetail` function. If the tests exercise detail rendering, they may need updating to account for the ID subtitle. At minimum, verify the tests still pass; update if they reference the detail view structure.
- **Children table in detail view (line 434–445 in `renderDetail`)** — The children table also renders `<td><code>${child.id}</code></td>`. Per scope, only the main table and the detail view title get copy buttons. The children table in the detail view is out of scope and should remain unchanged.

## Validation Checklist

- V1 [R1, R2]: In the browser, click the 📋 button in a table ID cell — verify the writ ID is in the clipboard and the detail view does NOT open. Then click the `<code>` text in the ID cell — verify the detail view does NOT open and the text is selectable.
- V2 [R3]: After clicking any copy button (table or detail), verify the button text changes to "✓" and reverts to "📋" after ~1.5 seconds.
- V3 [R4, R5]: Navigate to a writ detail view. Verify the writ ID appears in a `<code>` element on a line directly below the `<h2>` title, with a 📋 button next to it. Click the button and verify the ID is copied to clipboard.
- V4 [R6]: Search the index.html source for `copyToClipboard` — verify it is defined once as a function and called from both the table row rendering logic and the detail view rendering logic. Verify no inline clipboard logic exists elsewhere.
- V5 [R7]: Load the writs page. Verify the type filter defaults to all types selected (all type buttons and "All" have `active-filter` class). Verify the table shows writs of all types.
- V6 [R8]: In the source, verify `currentType` is declared as `new Set()` (not a string). Verify all code that reads `currentType` treats it as a Set.
- V7 [R9, R10]: Test the multi-select interaction:
  - Click "All" → all type buttons activate, table shows all types.
  - Click one type button when "All" is active → only that type remains selected, "All" deactivates.
  - Click another type button → both types are now selected.
  - Manually select all types one by one → "All" activates automatically.
  - Deselect all types → table shows empty state, no buttons active.
- V8 [R11]: In `packages/plugins/clerk/src/types.ts`, verify `WritFilters.type` is `string | string[]`.
- V9 [R12]: In `packages/plugins/clerk/src/tools/writ-list.ts`, verify the `type` param uses `z.union([z.string(), z.array(z.string()).min(1)])`.
- V10 [R13]: In `packages/plugins/clerk/src/clerk.ts`, verify `buildWhereClause` handles `type` as an array with the IN operator, matching the `status` pattern.
- V11 [R14]: Send a GET request to `/api/writ/list?type=mandate&type=brief` — verify the response contains writs of both types and no others. Verify in `packages/plugins/oculus/src/oculus.ts` that the query parser uses `searchParams.getAll()` for array-accepting schemas.
- V12 [R15]: In the browser, select two types in the filter bar. Inspect the network request and verify the URL contains repeated `type` params (e.g., `?type=mandate&type=brief`).
- V13 [R16]: Deselect all type buttons. Verify no network request is made and the table shows "No writs found."
- V14 [R17]: Run `node --test packages/plugins/clerk/pages/writs/writs-type-filter.test.js` and `node --test packages/plugins/clerk/pages/writs/writs-hierarchy.test.js` — both must pass.

## Test Cases

### Copy to Clipboard Helper
- **Happy path:** Call `copyToClipboard('test-id', buttonEl)` → `navigator.clipboard.writeText` is called with `'test-id'`, buttonEl.textContent changes to '✓', reverts after 1500ms.
- **Clipboard failure:** `navigator.clipboard.writeText` rejects → error is logged, button text does not change (or reverts gracefully).

### Table ID Cell
- **Copy button click:** Click 📋 in ID cell → clipboard contains the writ ID, row detail view does NOT open.
- **Cell text click:** Click the `<code>` text in ID cell → row detail view does NOT open, text is selectable.
- **Other cell click:** Click the title cell → row detail view opens as before.

### Detail View ID
- **ID displayed:** Open detail view → writ ID appears below the title in `<code>` with a copy button.
- **Copy works:** Click the detail copy button → clipboard contains the writ ID, "✓" feedback shown.
- **Navigation between details:** Open writ A detail, then navigate to writ B detail → subtitle shows writ B's ID (no stale ID from writ A).

### Type Filter Default
- **Default to all:** On page load with types [mandate, brief, quest] → `currentType` is `Set(['mandate', 'brief', 'quest'])`, all buttons have `active-filter`, table shows all types.
- **No types available:** On page load with empty types array → `currentType` is empty Set, "All" button exists but no type buttons, table shows empty state.

### Multi-Select Toggle
- **Toggle on:** Click "brief" when only "mandate" is selected → both "mandate" and "brief" are active.
- **Toggle off:** Click "mandate" when "mandate" and "brief" are selected → only "brief" is active.
- **All button selects all:** Click "All" → all individual type buttons activate, "All" activates.
- **Click type when All active:** With all types selected, click "mandate" → only "mandate" is selected, all others deselected, "All" deactivates.
- **Auto-activate All:** Manually select every type one by one → "All" activates automatically when the last one is added.
- **Empty set:** Deselect all types → no buttons active, table shows "No writs found", no API request made.

### Backend Array Support
- **Single type:** `GET /api/writ/list?type=mandate` → returns only mandate writs.
- **Multiple types:** `GET /api/writ/list?type=mandate&type=brief` → returns mandate and brief writs.
- **No type param:** `GET /api/writ/list` → returns writs of all types.
- **Single type + status combo:** `GET /api/writ/list?type=mandate&status=open` → returns only open mandates.

### Oculus Query Param Parsing
- **Repeated params with array schema:** `?type=a&type=b` with a union schema accepting arrays → parsed as `{ type: ['a', 'b'] }`.
- **Single param with array schema:** `?type=a` with a union schema accepting arrays → parsed as `{ type: 'a' }` (string, not array).
- **Repeated params without array schema:** `?parentId=a&parentId=b` with a plain string schema → parsed as `{ parentId: 'b' }` (last value wins, preserving existing behavior).
- **Number coercion still works:** `?limit=20` → parsed as `{ limit: 20 }` (number).
