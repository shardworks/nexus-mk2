# Handle Parent/Child Relationships in Oculus Writs View

## Summary

Add parent/child writ hierarchy to the Oculus writs dashboard: display children indented beneath parents in the main table with a show/hide toggle, and replace the current inline expand/collapse detail view with a Spider-style separate detail page that shows parent links and a children table.

## Current State

The writs page (`packages/plugins/clerk/pages/writs/index.html`) is a single-file HTML page (~1165 lines) with inline CSS and JS. It renders a flat list of writs loaded from `/api/writ/list` with no parent/child awareness.

**Key state variables** (line 134):
```javascript
let writs = [];
let offset = 0;
let currentStatus = '';
let currentType = '';
let searchText = '';
let sortCol = 'createdAt';
let sortDir = 'desc';
let expandedId = null;
let repostSourceId = null;
```

**Current data flow**: `loadWrits()` fetches `/api/writ/list?status=X&type=Y&limit=20&offset=N`, stores flat `WritDoc[]` in `writs`, client-side sorts via `sortedFilteredWrits()`, renders via `renderTable()`. Row clicks call `toggleExpand(id)` which inserts an inline detail `<tr>` below the clicked row.

**Current table columns**: Status, Title, Type, ID, Created, Actions (6 columns).

**Status filter buttons** (line 54-63): hardcoded HTML buttons for new, ready, active, completed, failed, cancelled. `waiting` is missing. `statusBadge()` has no entry for `waiting`.

**Backend support already exists**:
- `WritDoc` has `parentId?: string`
- `writ-list` supports `parentId` filter parameter
- `writ-show` returns `parent: { id, title, status } | null` and `children: { summary, items }`

## Requirements

- R1: The main writs table must fetch writs from `/api/writ/list` and partition them client-side: writs without `parentId` are roots, writs with `parentId` are discarded from the main list (their parent will fetch them separately).
- R2: After identifying root writs, the system must fetch all children for each root via separate `/api/writ/list?parentId=X` calls. The page limit of 20 applies to roots; children are fetched independently and do not count against this limit.
- R3: Child rows must appear directly beneath their parent row in the table, visually indented via left padding on the title cell (`padding-left: 2rem`).
- R4: Sorting (column header clicks) must apply only to root writs. Children always appear beneath their parent regardless of sort column/direction.
- R5: Children within a parent group must be sorted by `createdAt` ascending (oldest first).
- R6: A toggle button labeled "Children" must exist in the toolbar that hides/shows child writ rows. Children must be shown by default (toggle starts in the active/on state with `active-filter` class).
- R7: The toggle button must use the `btn` class and `active-filter` class when active, matching the existing filter button pattern.
- R8: When children are hidden via the toggle, text search must not match against child writs — they are fully excluded from the visible set.
- R9: When the toggle is active (children shown), text search must filter both root and child writs by title.
- R10: The inline expand/collapse detail view must be replaced with a Spider-style separate detail view — a `#writ-detail-view` div that is shown while `#writ-list-view` is hidden.
- R11: The detail view must have a "← Back to list" button that returns to the list view, following the Spider's `#back-btn` pattern.
- R12: Clicking any writ row (parent or child) in the list must navigate to the detail view for that writ by calling `showWritDetail(id)`.
- R13: The detail view must render the same content as the current `renderDetail` function: edit form, details grid (timestamps/metadata), transition actions, repost button, links section.
- R14: When a writ has a parent, the detail view's Details grid must include a "Parent" row (after Codex, before timestamps) displaying the parent's title as a clickable link with a status badge.
- R15: Clicking the parent link must navigate to `?writ=parentId` (full page navigation).
- R16: When a writ has children, the detail view must display a "Children" section below the links section, containing a status summary and a data table of children.
- R17: The children table in the detail view must have columns: Status, Title, Type, ID, Actions — same as the main table except Created is omitted.
- R18: Clicking a child row in the detail-view children table must navigate to that child's detail view within the same page (call `showWritDetail(childId)`).
- R19: A `waiting` status filter button must be added to the hardcoded status filter bar HTML, between `active` and `completed`.
- R20: The `statusBadge()` function must map `waiting` to `badge badge--warning`.
- R21: The deep-link `?writ=ID` query parameter must navigate directly to the detail view for that writ (call `showWritDetail(id)` after loading writs), replacing the previous scroll-and-expand behavior.
- R22: The "Load more" button must load the next batch of root writs (20 more) and fetch their children, appending to the existing list.

## Design

### Structural Change: List/Detail View Toggle

Replace the inline expand/collapse pattern with a Spider-style two-panel layout in the same HTML page.

**HTML structure** — wrap existing list content in `#writ-list-view` and add a new `#writ-detail-view`:

```html
<main style="padding: 24px;">
  <h1>Writs</h1>

  <div id="writ-list-view">
    <!-- existing: toolbar card, post-section, table card, load-more, datalist -->
  </div>

  <div id="writ-detail-view" style="display:none">
    <button id="back-btn" class="btn">&#8592; Back to list</button>
    <h2 id="detail-title"></h2>
    <div id="detail-content"></div>
  </div>
</main>
```

The `#writ-list-view` wraps everything currently between `<main>` and `</main>` (the toolbar card, post section, writs table card, load-more button, and the link-types datalist). The `#writ-detail-view` is a new sibling div.

### State Changes

**Remove**: `expandedId` state variable (no inline expand/collapse).

**Add**:
```javascript
let showChildren = true;    // toggle state — children shown by default (D3)
let childrenMap = {};       // { parentId: WritDoc[] } — fetched children keyed by parent id
```

The `writs` array now stores only root writs. Children live in `childrenMap`.

### Data Loading: Parent-Fetch Strategy

`loadWrits()` must be rewritten to implement the parent-fetch strategy (D1) with the patron-specified pagination model (D5 override):

```javascript
async function loadWrits(replace = true) {
  if (replace) {
    offset = 0;
    writs = [];
    childrenMap = {};
  }

  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (currentStatus) params.set('status', currentStatus);
  if (currentType) params.set('type', currentType);

  let result;
  try {
    result = await api('GET', '/api/writ/list?' + params);
  } catch (e) {
    console.error('Failed to load writs:', e);
    return;
  }

  // Partition: roots (no parentId) vs children (have parentId)
  const roots = result.filter(w => !w.parentId);
  // Children from the flat list are discarded — they will be fetched
  // per-parent below (D6: hide orphans whose parent is not loaded)

  if (replace) {
    writs = roots;
  } else {
    writs = writs.concat(roots);
  }

  offset += result.length;

  // Fetch all children for each newly loaded root (D5 patron override)
  await fetchChildrenForRoots(roots);

  renderTable();

  // Update load-more visibility
  const loadMoreRow = document.getElementById('load-more-row');
  if (result.length < LIMIT) {
    loadMoreRow.style.display = 'none';
  } else {
    loadMoreRow.style.display = 'block';
  }
}

async function fetchChildrenForRoots(roots) {
  const fetches = roots.map(async (root) => {
    try {
      const children = await api('GET',
        '/api/writ/list?parentId=' + encodeURIComponent(root.id) + '&limit=1000');
      if (children.length > 0) {
        // Sort children by createdAt ascending — oldest first (D7)
        children.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
        childrenMap[root.id] = children;
      }
    } catch (e) {
      console.error('Failed to fetch children for ' + root.id, e);
    }
  });
  await Promise.all(fetches);
}
```

### Table Rendering: Hierarchical Display

`sortedFilteredWrits()` changes to return an ordered array of `{ writ, isChild }` objects:

```javascript
function sortedFilteredWrits() {
  let roots = writs.slice();

  // Text filter on roots
  if (searchText) {
    const q = searchText.toLowerCase();
    roots = roots.filter(w => (w.title ?? '').toLowerCase().includes(q));
  }

  // Sort roots by current sort column
  roots.sort((a, b) => {
    const cmp = compareVal(a, b, sortCol);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Interleave children beneath each root
  const result = [];
  for (const root of roots) {
    result.push({ writ: root, isChild: false });
    if (showChildren) {
      let children = childrenMap[root.id] ?? [];
      // Text filter on children too (D9: search applies to visible children)
      if (searchText) {
        const q = searchText.toLowerCase();
        children = children.filter(w => (w.title ?? '').toLowerCase().includes(q));
      }
      for (const child of children) {
        result.push({ writ: child, isChild: true });
      }
    }
  }
  return result;
}
```

`renderTable()` iterates this array. For child rows, add a `child-row` CSS class and indent the title cell:

```javascript
function renderTable() {
  const tbody = document.getElementById('writ-tbody');
  const visible = sortedFilteredWrits();

  if (visible.length === 0 && writs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">No writs found.</div></td></tr>';
    return;
  }

  tbody.innerHTML = '';
  for (const { writ: w, isChild } of visible) {
    const tr = document.createElement('tr');
    tr.className = 'writ-row' + (isChild ? ' child-row' : '');
    tr.dataset.id = w.id;
    tr.innerHTML =
      '<td>' + statusBadge(w.status) + '</td>' +
      '<td' + (isChild ? ' style="padding-left:2rem"' : '') + '>' + escHtml(w.title ?? '') + '</td>' +
      '<td>' + (w.type ?? '') + '</td>' +
      '<td><code>' + w.id + '</code></td>' +
      '<td>' + (isChild ? '' : fmtDate(w.createdAt)) + '</td>' +
      '<td class="row-actions" style="white-space:nowrap">' + rowActions(w) + '</td>';

    // Wire row-action buttons (stop propagation to prevent row click)
    tr.querySelectorAll('.row-action-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        handleRowAction(btn.dataset.action, btn.dataset.id, btn);
      });
    });

    // Click row -> show detail view (D9 patron override: separate detail page)
    tr.addEventListener('click', () => showWritDetail(w.id));
    tbody.appendChild(tr);
  }

  updateSortIndicators();
}
```

**Child row visual treatment**:
- `padding-left: 2rem` on the title cell (D2: padding indentation)
- Created column cell is empty for child rows (D10 override: omit Created to free space for indentation)
- `child-row` CSS class for subtle visual distinction

**CSS addition** (inline `<style>` block):
```css
tr.child-row { opacity: 0.85; }
```

### Toggle Button

Add a toggle button in the toolbar HTML, after the search input:

```html
<button class="btn active-filter" id="btn-toggle-children">Children</button>
```

Wire it in the event wiring section:

```javascript
document.getElementById('btn-toggle-children').addEventListener('click', () => {
  showChildren = !showChildren;
  document.getElementById('btn-toggle-children').classList.toggle('active-filter', showChildren);
  renderTable();
});
```

When `showChildren` is false, `sortedFilteredWrits()` skips child interleaving. Search does not match hidden children (D12).

### Detail View: Spider-Style Navigation

**showWritDetail** — the new function that replaces `toggleExpand`:

```javascript
async function showWritDetail(id) {
  let writ;
  try {
    writ = await api('GET', '/api/writ/show?id=' + encodeURIComponent(id));
  } catch (e) {
    console.error('Failed to load writ detail:', e);
    return;
  }

  // Update local data if this writ is already in our arrays
  const idx = writs.findIndex(w => w.id === id);
  if (idx >= 0) writs[idx] = writ;

  // Fetch full children data for the detail children table (D10 override:
  // need type column which writ-show children.items doesn't include)
  if (writ.children && writ.children.items.length > 0) {
    try {
      const fullChildren = await api('GET',
        '/api/writ/list?parentId=' + encodeURIComponent(id) + '&limit=1000');
      // Sort by createdAt ascending (D7)
      fullChildren.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      writ._fullChildren = fullChildren;
    } catch (e) {
      writ._fullChildren = null;
    }
  }

  // Toggle views
  document.getElementById('writ-list-view').style.display = 'none';
  document.getElementById('writ-detail-view').style.display = '';
  document.getElementById('detail-title').textContent = writ.title ?? writ.id;

  const content = document.getElementById('detail-content');
  content.innerHTML = renderDetail(writ);
  wireDetailEvents(content, writ);
}
```

**Back to list**:
```javascript
document.getElementById('back-btn').addEventListener('click', () => {
  document.getElementById('writ-detail-view').style.display = 'none';
  document.getElementById('writ-list-view').style.display = '';
});
```

### Detail View Content: renderDetail Modifications

The `renderDetail` function keeps all existing sections (edit form, Details grid, transition actions, repost, links) and adds two new sections:

**1. Parent link in Details grid** (D8, D13) — insert after the Codex row, before the Created row:

```javascript
// Inside the Details grid section of renderDetail:
if (writ.parent) {
  html += '<dt>Parent</dt><dd><a href="?writ=' +
    encodeURIComponent(writ.parent.id) + '" style="color:var(--blue,#7aa2f7);text-decoration:underline;cursor:pointer">' +
    escHtml(writ.parent.title) + '</a> ' + statusBadge(writ.parent.status) + '</dd>';
}
```

The parent link is a standard `<a href="?writ=parentId">` — clicking it triggers full page navigation (D13: always navigate via URL).

**2. Children section** (D16, D17, D18) — add after the links section:

```javascript
// After the links section in renderDetail:
const childItems = writ._fullChildren ?? writ.children?.items ?? [];
if (childItems.length > 0) {
  html += '<div class="detail-section">';
  html += '<h4>Children</h4>';

  // Summary badges
  if (writ.children?.summary) {
    html += '<div style="margin-bottom:0.5rem">';
    for (const [status, count] of Object.entries(writ.children.summary)) {
      html += statusBadge(status) + ' <span style="margin-right:0.75rem">' + count + '</span>';
    }
    html += '</div>';
  }

  // Children table: Status, Title, Type, ID, Actions (D10 override: same as parents except Created)
  html += '<table class="data-table"><thead><tr>';
  html += '<th>Status</th><th>Title</th><th>Type</th><th>ID</th><th>Actions</th>';
  html += '</tr></thead><tbody>';
  for (const child of childItems) {
    html += '<tr class="writ-row child-detail-row" data-child-id="' + child.id + '" style="cursor:pointer">';
    html += '<td>' + statusBadge(child.status) + '</td>';
    html += '<td>' + escHtml(child.title ?? '') + '</td>';
    html += '<td>' + escHtml(child.type ?? '') + '</td>';
    html += '<td><code>' + child.id + '</code></td>';
    html += '<td class="row-actions" style="white-space:nowrap">' + rowActions(child) + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';
}
```

### wireDetailEvents Adaptation

`wireDetailEvents` currently receives a `<tr>` element and queries `tr.querySelector('td')`. In the new design it receives the `#detail-content` div. Change the function to accept a generic container:

```javascript
function wireDetailEvents(container, writ) {
  // Populate edit dropdowns for draft writs
  if (writ.status === 'new') {
    populateEditDropdowns(writ);
  }

  // Transition action buttons + other data-action buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      handleDetailAction(action, id, btn, container, writ);
    });
  });

  // Link-id clicks (links section — NOT the parent <a href> which uses native navigation)
  container.querySelectorAll('.link-id[data-writ-id]').forEach(a => {
    a.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      showWritDetail(a.dataset.writId);
    });
  });

  // Child row clicks — navigate to child detail (D18)
  container.querySelectorAll('.child-detail-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't navigate if clicking an action button inside the row
      if (e.target.closest('.row-action-btn')) return;
      showWritDetail(row.dataset.childId);
    });
  });

  // Wire row-action buttons inside children table
  container.querySelectorAll('.child-detail-row .row-action-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleRowAction(btn.dataset.action, btn.dataset.id, btn);
    });
  });
}
```

### refreshDetail Adaptation

`refreshDetail` currently re-renders an inline `<tr>`. Change it to re-render the `#detail-content` div:

```javascript
async function refreshDetail(id) {
  let writ;
  try {
    writ = await api('GET', '/api/writ/show?id=' + encodeURIComponent(id));
  } catch (e) {
    return;
  }
  const idx = writs.findIndex(w => w.id === id);
  if (idx >= 0) writs[idx] = writ;

  // Fetch full children if needed
  if (writ.children && writ.children.items.length > 0) {
    try {
      const fullChildren = await api('GET',
        '/api/writ/list?parentId=' + encodeURIComponent(id) + '&limit=1000');
      fullChildren.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      writ._fullChildren = fullChildren;
    } catch (e) { writ._fullChildren = null; }
  }

  const content = document.getElementById('detail-content');
  if (content) {
    content.innerHTML = renderDetail(writ);
    wireDetailEvents(content, writ);
  }

  // Also refresh the list view row status/actions (for when user returns to list)
  updateRowStatus(id);
  updateRowActions(id);
}
```

### handleRowAction Adaptation

`handleRowAction` calls `refreshDetail(id)` which in the new design re-renders the detail-content div. When called from a list-view row-action button (not in detail view), `refreshDetail` is a no-op since `#detail-content` won't have content for that writ. The existing `updateRowStatus` and `updateRowActions` calls handle the list-view row update. This continues to work correctly.

### openRepost Adaptation

`openRepost(writ)` scrolls to the post form. When called from the detail view, it must switch back to the list view first:

```javascript
function openRepost(writ) {
  // If in detail view, switch back to list view first
  document.getElementById('writ-detail-view').style.display = 'none';
  document.getElementById('writ-list-view').style.display = '';

  openPostForm();
  // ... rest of the existing openRepost logic unchanged
}
```

### Waiting Status Badge and Filter (S5)

**Status filter button** — add `waiting` between `active` and `completed` in the hardcoded HTML (line 59-60):

```html
<button class="btn filter-btn" data-status="active">active</button>
<button class="btn filter-btn" data-status="waiting">waiting</button>
<button class="btn filter-btn" data-status="completed">completed</button>
```

**statusBadge()** — add `waiting` entry (D11: badge--warning):
```javascript
const map = {
  new: 'badge badge--draft',
  ready: 'badge',
  active: 'badge badge--active',
  waiting: 'badge badge--warning',
  completed: 'badge badge--success',
  failed: 'badge badge--error',
  cancelled: 'badge badge--warning',
};
```

### Deep-Link Support

Replace the existing `?writ=ID` handling (lines 1134-1160) to navigate to the detail view:

```javascript
(async function () {
  await loadWritTypes();
  var params = new URLSearchParams(window.location.search);
  var writId = params.get('writ');

  await loadWrits(true);

  if (writId) {
    showWritDetail(writId);
  }
})();
```

The `scrollAndExpand` function is no longer needed and must be removed.

### Removed Code

These functions and patterns are replaced and must be removed:
- `expandedId` state variable
- `toggleExpand()` function
- `buildDetailRow()` function
- `scrollAndExpand()` function
- The inline detail row insertion in `renderTable()` (the `if (expandedId === w.id)` block and the `expanded` class toggling on writ-rows)

### Non-obvious Touchpoints

- **`wireDetailEvents` first line** — currently `const td = tr.querySelector('td'); if (!td) return;` — must be removed/changed since the detail container is a `<div>`, not a `<tr>` containing `<td>`.
- **`handleDetailAction` receives the container** — the `td` parameter used throughout `handleDetailAction`, `showConfirm`, etc. is now the `#detail-content` div. Selectors like `td.querySelector('#action-error-${id}')` still work because `querySelector` works on any element.
- **`openRepost`** — must switch views before scrolling to the post form (see Adaptation section above).
- **`datalist#link-types`** — must remain accessible from the detail view. Since both views are in the same page, it works as long as it's inside `#writ-list-view` or directly under `<main>`. Move it outside `#writ-list-view` to be safe (place it as a direct child of `<main>`, after both view divs).
- **Row action buttons in both list and detail children table** — `handleRowAction` updates the list-view row via `updateRowStatus`/`updateRowActions`. When a row action is performed on a child in the detail-view children table, `refreshDetail` should also be called to update the children table.

## Validation Checklist

- V1 [R1, R2]: Load the writs page with parent writs that have children. Verify network requests: one `/api/writ/list` call for the main list, then one `/api/writ/list?parentId=X` call per root writ. Confirm roots are displayed and children are fetched separately.
- V2 [R3, R5]: With parent writs that have children, verify child rows appear directly beneath their parent in the table. Confirm child title cells are indented (2rem left padding). Confirm children are sorted oldest-first by createdAt.
- V3 [R4]: Click a column header to sort (e.g., by Title ascending). Verify root writs re-sort but children remain beneath their respective parents in createdAt ascending order.
- V4 [R6, R7]: Locate the "Children" toggle button in the toolbar. Verify it has the `active-filter` class on page load. Click it — verify child rows disappear from the table. Click again — verify they reappear.
- V5 [R8, R9]: With children visible, type a search term matching a child's title — verify the child is visible. Toggle children off, repeat the same search — verify the child does not appear.
- V6 [R10, R11, R12]: Click any writ row (parent or child). Verify the list view is hidden and a detail view appears with a "← Back to list" button and the writ's title as heading. Click Back — verify the list view returns with the table intact.
- V7 [R13]: In the detail view, verify all sections are present: edit form (title, body, and type/codex selects for drafts), Details grid with timestamps, transition action buttons (Start/Accept/Complete/Fail/Cancel as appropriate), links section with add-link form.
- V8 [R14, R15]: Open the detail view for a child writ (one with a parent). Verify the Details grid shows a "Parent" row with the parent's title as a link and status badge. Click the link — verify the browser navigates to `?writ=parentId` and the detail view opens for the parent.
- V9 [R16, R17, R18]: Open the detail view for a parent writ with children. Verify a "Children" section appears with status summary badges and a table with columns: Status, Title, Type, ID, Actions. Click a child row — verify the detail view updates to show that child's details.
- V10 [R19, R20]: Locate the `waiting` filter button in the status filter bar (between active and completed). Click it — verify the writs list filters to waiting-status writs. Verify the waiting badge renders with the `badge--warning` class (yellow).
- V11 [R21]: Navigate to the writs page with `?writ=someId` in the URL. Verify the page loads directly into the detail view for that writ.
- V12 [R22]: Load the page, click "Load more". Verify additional root writs are appended and their children are fetched and displayed beneath them.

## Test Cases

**Test file**: `packages/plugins/clerk/pages/writs/writs-hierarchy.test.js` — new file following the `writs-type-filter.test.js` pattern (node:test, FakeElement DOM shim).

### sortedFilteredWrits — hierarchy ordering

- **Happy path**: Given `writs = [rootA, rootB]` and `childrenMap = { rootA.id: [childA1, childA2], rootB.id: [childB1] }` with `showChildren = true`, verify output is `[{rootA, false}, {childA1, true}, {childA2, true}, {rootB, false}, {childB1, true}]`.
- **Children hidden**: Same data with `showChildren = false` — verify output is `[{rootA, false}, {rootB, false}]` only.
- **Sort changes root order only**: Set `sortCol = 'title'`, `sortDir = 'asc'`. If rootB.title < rootA.title, verify rootB comes first, but each root's children remain beneath it in createdAt order.
- **Search filters both roots and children**: With `searchText = 'alpha'` where only childA1.title contains 'alpha' and rootA.title contains 'alpha', verify rootA and childA1 appear but childA2 and rootB do not.
- **Search respects toggle**: With `showChildren = false` and `searchText` matching a child's title but not the root's title, verify neither root nor child appears (root filtered by search, child hidden by toggle).
- **Empty children**: Root with no entry in `childrenMap` — verify it appears alone with no child rows.

### statusBadge — waiting status

- Verify `statusBadge('waiting')` returns `<span class="badge badge--warning">waiting</span>`.

### Toggle button state

- Verify initial state: `showChildren === true`, button has `active-filter` class.
- After click: `showChildren === false`, button does not have `active-filter` class.
- After second click: `showChildren === true`, button has `active-filter` class again.

### Children table rendering in detail view

- Given a writ with `_fullChildren = [child1, child2, child3]`, verify the children table renders 3 rows with Status, Title, Type, ID, Actions columns (no Created column).
- Given a writ with no children (`children.items = []`), verify no "Children" section is rendered.
- Verify children in the detail table are ordered by `createdAt` ascending (child with earliest createdAt first).

### Parent link in detail view

- Given a writ with `parent: { id: 'w-parent', title: 'Parent Writ', status: 'active' }`, verify the Details grid contains a "Parent" dt/dd pair with an `<a>` linking to `?writ=w-parent`.
- Given a writ with `parent: null`, verify no "Parent" row appears in the Details grid.
