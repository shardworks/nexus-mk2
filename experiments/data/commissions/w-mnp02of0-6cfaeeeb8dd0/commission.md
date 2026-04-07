---
author: plan-writer
estimated_complexity: 8
---

# Clerk Page for Oculus

## Summary

Add a `recommends: ['oculus']` dependency to the Clerk apparatus and contribute a static HTML page at `/pages/writs/` for managing writs through the Oculus web dashboard. The page displays writs with filtering, sorting, and search, and supports all key writ operations: status transitions, link management, reposting failed/cancelled writs, and posting new writs. A new `writ-types` tool exposes available writ types for the post form's type dropdown.

## Current State

**Clerk apparatus** (`packages/plugins/clerk/src/clerk.ts`) manages writ lifecycle. Its apparatus declaration:

```typescript
apparatus: {
  requires: ['stacks'],
  consumes: ['writTypes'],
  supportKit: {
    books: { writs: { ... }, links: { ... } },
    tools: [
      commissionPost, writShow, writList, writAccept,
      writComplete, writFail, writCancel, writLink, writUnlink,
    ],
  },
  provides: api,
  start(ctx) { ... },
}
```

No `recommends` declaration exists. No `pages` contribution exists in `supportKit`.

Valid writ types are merged at startup from three sources — builtins (`mandate`), guild config (`clerk.writTypes`), and kit contributions (`writTypes` field) — into a private `mergedWritTypes: Set<string>` inside the `createClerk()` closure. The private helpers `resolveWritTypes()`, `resolveClerkConfig()`, and `resolveDefaultType()` access this closure state.

**Oculus** (`packages/plugins/oculus/src/oculus.ts`) scans apparatus `supportKit` for `pages` contributions:

```typescript
interface PageContribution {
  id: string;    // URL segment: /pages/{id}/
  title: string; // nav text
  dir: string;   // path relative to package root in node_modules
}
```

Pages are served as static files from `{guild.home}/node_modules/{packageName}/{dir}`. Chrome (nav bar + stylesheet link) is injected into `index.html` automatically. In pnpm workspace dev, `node_modules/@shardworks/clerk-apparatus` symlinks to `packages/plugins/clerk`.

**Existing tools and REST routes** (auto-mapped by Oculus):

| Tool | Route | Method |
|------|-------|--------|
| `commission-post` | `POST /api/commission/post` | POST |
| `writ-show` | `GET /api/writ/show` | GET |
| `writ-list` | `GET /api/writ/list` | GET |
| `writ-accept` | `POST /api/writ/accept` | POST |
| `writ-complete` | `POST /api/writ/complete` | POST |
| `writ-fail` | `POST /api/writ/fail` | POST |
| `writ-cancel` | `POST /api/writ/cancel` | POST |
| `writ-link` | `POST /api/writ/link` | POST |
| `writ-unlink` | `POST /api/writ/unlink` | POST |

**No pages** are currently contributed by any plugin. This will be the first.

**`package.json`** has `"files": ["dist"]` — does not include a `pages/` directory.

**Available CSS classes** from Oculus stylesheet (`/static/style.css`): `.card`, `.badge`, `.badge--success`, `.badge--error`, `.badge--warning`, `.badge--info`, `.badge--active`, `.btn`, `.btn--primary`, `.btn--success`, `.btn--danger`, `.toolbar`, `.data-table`, `.empty-state`. Tokyo Night palette via CSS custom properties.

## Requirements

- R1: The Clerk apparatus declaration must include `recommends: ['oculus']`.
- R2: The Clerk `supportKit` must include a `pages` contribution with `id: 'writs'`, `title: 'Writs'`, `dir: 'pages/writs'`.
- R3: A file `packages/plugins/clerk/pages/writs/index.html` must exist and serve as the page entry point.
- R4: The `files` array in `packages/plugins/clerk/package.json` must include `"pages"`.
- R5: A new `writ-types` tool must return an array of `{name, description, default}` objects representing all valid writ types (builtins + config + kit contributions), with the guild's default type flagged.
- R6: The page must display writs in a table with columns: id, type, status, title, createdAt.
- R7: Status values must be rendered as badges: `ready`→`.badge`, `active`→`.badge--active`, `completed`→`.badge--success`, `failed`→`.badge--error`, `cancelled`→`.badge--warning`.
- R8: The page must provide status filter toggle buttons (All, ready, active, completed, failed, cancelled). Status filtering uses the server-side `status` parameter on `writ-list`. The page loads with no status filter (all statuses shown).
- R9: The page must provide a text search input that filters the loaded results by title substring match (client-side, case-insensitive).
- R10: Table column headers must be clickable to sort the loaded results client-side (toggle ascending/descending).
- R11: The page must provide a "Load more" button that fetches additional results using offset/limit and appends them to the list.
- R12: Clicking a writ row must expand an inline detail view showing: body, codex (if present), all timestamps (createdAt, updatedAt, acceptedAt, resolvedAt), resolution (if present), and links.
- R13: The expanded detail must show transition action buttons appropriate to the writ's current status: `ready`→(Accept, Cancel), `active`→(Complete, Fail, Cancel), terminal statuses→no buttons.
- R14: Accept must execute on single click without confirmation. Complete, Fail, and Cancel must show an inline confirmation step with a text input for resolution (required for complete/fail, optional for cancel) before executing.
- R15: Button styles must be: Accept→`.btn--primary`, Complete→`.btn--success`, Fail→`.btn--danger`, Cancel→`.btn--danger`.
- R16: The expanded detail must display existing links (outbound and inbound) showing the linked writ id (as a clickable element that expands that writ in the list) and the link type.
- R17: The expanded detail must include an inline "add link" form: text input for target writ id, text input for link type with an HTML `<datalist>` offering suggestions (retries, supersedes, fixes, duplicates, blocks), and a "Link" button.
- R18: Each displayed link must have a delete button that removes the link immediately without confirmation.
- R19: Writs with status `failed` or `cancelled` must show a "Repost" button in the expanded detail.
- R20: Clicking "Repost" must open the post form pre-filled with title `[Repost] {original title}`, the original body, and the original type. The user may edit all fields before submitting.
- R21: When a repost is submitted, the page must first call `commission-post`, then call `writ-link` with `sourceId` = new writ id, `targetId` = original writ id, `type` = `retries`.
- R22: The page must include a collapsible "New Writ" form section, hidden by default, toggled by a "New Writ" button. The form has: title input, body textarea (6-8 rows, CSS `resize: vertical`), type dropdown (populated from `writ-types`), codex input (optional), and a submit button.
- R23: After a successful post, the form must clear, collapse, and the writ list must refresh so the new writ appears at the top.
- R24: API errors must be displayed as inline error messages near the triggering element. Buttons must be disabled during in-flight operations with text loading indicators.
- R25: The page must include a manual refresh button. No auto-refresh.
- R26: The page must be a single self-contained `index.html` file with all JS inline. No external dependencies, no build step. The page must include `<html>`, `<head>`, and `<body>` tags for Oculus chrome injection.

## Design

### `writ-types` Tool

The tool must be defined **inline** inside the `createClerk()` function in `clerk.ts`, not in a separate file. This gives it closure access to `mergedWritTypes`, `resolveClerkConfig()`, and `resolveDefaultType()` — the private state that tracks the merged set of valid writ types from builtins + config + kit contributions. No method is added to `ClerkApi`.

```typescript
import { tool } from '@shardworks/tools-apparatus';

// Inside createClerk(), after the api definition, before the return:

const writTypesTool = tool({
  name: 'writ-types',
  description: 'List available writ types for this guild',
  instructions:
    'Returns the available writ types including built-in types, types declared ' +
    'in guild config, and types contributed by kits. Each entry includes the ' +
    'type name, optional description, and whether it is the default type.',
  params: {},
  permission: 'clerk:read',
  handler: async () => {
    const config = resolveClerkConfig();
    const defaultType = resolveDefaultType();
    const configEntries = config.writTypes ?? [];

    return [...mergedWritTypes].map((name) => {
      const entry = configEntries.find((e) => e.name === name);
      return {
        name,
        description: entry?.description ?? null,
        default: name === defaultType,
      };
    });
  },
});
```

The tool is added to the `supportKit.tools` array alongside the existing tools:

```typescript
tools: [
  commissionPost, writShow, writList, writAccept,
  writComplete, writFail, writCancel, writLink, writUnlink,
  writTypesTool,
],
```

The tool becomes `GET /api/writ/types` via Oculus auto-mapping. Example response:

```json
[
  { "name": "mandate", "description": null, "default": true },
  { "name": "task", "description": "A concrete unit of work", "default": false }
]
```

### Apparatus Declaration Changes

In `clerk.ts`, the apparatus return object changes:

```typescript
return {
  apparatus: {
    requires: ['stacks'],
    recommends: ['oculus'],       // ← ADD
    consumes: ['writTypes'],

    supportKit: {
      books: { /* unchanged */ },
      tools: [
        commissionPost, writShow, writList, writAccept,
        writComplete, writFail, writCancel, writLink, writUnlink,
        writTypesTool,              // ← ADD
      ],
      pages: [                      // ← ADD
        { id: 'writs', title: 'Writs', dir: 'pages/writs' },
      ],
    },

    provides: api,
    start(ctx) { /* unchanged */ },
  },
};
```

### Package.json Change

```json
{
  "files": [
    "dist",
    "pages"
  ]
}
```

### Page File

Create `packages/plugins/clerk/pages/writs/index.html`. This is a single self-contained HTML file with all JS inline.

### Behavior

#### Page Load

1. When the page loads, JS fetches `GET /api/writ/types` and populates the type dropdown in the post form, pre-selecting the entry where `default: true`.
2. JS fetches `GET /api/writ/list` (no filters, default limit 20) and renders the writ table.
3. When the table is empty, the table body area shows an `.empty-state` message: "No writs found."

#### Status Filtering

1. The toolbar contains toggle buttons: "All", "ready", "active", "completed", "failed", "cancelled".
2. "All" is initially highlighted (active state).
3. When a status button is clicked, it becomes the active button, and JS fetches `GET /api/writ/list?status={status}` (or no status param for "All"). The results replace the current list entirely (offset resets to 0).
4. The "Load more" offset tracks which filter is active and resets when the filter changes.

#### Text Search

1. A text input in the toolbar with placeholder "Search title...".
2. On each keystroke (input event), JS filters the currently loaded writs array by case-insensitive substring match on `title`.
3. Writs that don't match are hidden via CSS (`display: none` on the `<tr>`). Search does not trigger API calls.

#### Column Sorting

1. Each `<th>` for id, type, status, title, createdAt is clickable.
2. Clicking a column header sorts the loaded writs array by that field. First click → ascending, second click → descending, third click → ascending, etc.
3. The active sort column header displays a sort direction indicator (e.g. `▲` or `▼`).
4. Default sort on page load: createdAt descending (matching the API default).

#### Load More

1. A "Load more" button appears below the table.
2. When clicked, JS fetches `GET /api/writ/list?offset={currentCount}&limit=20` (plus status filter if active).
3. Returned writs are appended to the loaded array and rendered as new table rows.
4. When the API returns fewer results than the limit, the "Load more" button is hidden (no more data).

#### Writ Detail Expansion

1. Clicking a writ table row toggles an expansion row directly below it.
2. When expanding, JS fetches `GET /api/writ/show?id={id}` which returns the full writ with links.
3. The expansion row spans all columns and shows:
   - **Body**: the full writ body text, rendered in a `<pre>` block.
   - **Codex**: if present, shown as a labeled field.
   - **Timestamps**: createdAt, updatedAt, acceptedAt (if present), resolvedAt (if present) — formatted as locale strings.
   - **Resolution**: if present, shown as a labeled field.
   - **Action buttons**: per R13/R14 rules (see below).
   - **Links section**: per R16/R17/R18 rules (see below).
   - **Repost button**: per R19 rules (see below).
4. Clicking the same row again collapses the expansion. Only one row may be expanded at a time (expanding another row collapses the previous).

#### Transition Actions (in expanded detail)

When status is `ready`:
- **Accept** button (`.btn--primary`): single click → calls `POST /api/writ/accept` with `{ id }`. On success, refreshes the writ detail and updates the table row's status badge.
- **Cancel** button (`.btn--danger`): click → reveals inline confirmation: a text input labeled "Resolution (optional)" and a "Confirm Cancel" button. Clicking confirm → calls `POST /api/writ/cancel` with `{ id, resolution }` (resolution omitted if empty). On success, refreshes.

When status is `active`:
- **Complete** button (`.btn--success`): click → reveals inline confirmation: a text input labeled "Resolution (required)" and a "Confirm Complete" button. The confirm button is disabled until the resolution input is non-empty. Clicking confirm → calls `POST /api/writ/complete` with `{ id, resolution }`.
- **Fail** button (`.btn--danger`): click → reveals inline confirmation: a text input labeled "Resolution (required)" and a "Confirm Fail" button. Disabled until non-empty. Clicking confirm → calls `POST /api/writ/fail` with `{ id, resolution }`.
- **Cancel** button (`.btn--danger`): same as for `ready`.

When status is terminal (`completed`, `failed`, `cancelled`): no transition buttons are shown.

After any successful transition, the expansion re-fetches `writ-show` and the table row's status badge updates to reflect the new status.

#### Link Display and Management (in expanded detail)

**Display**: Below timestamps/resolution, a "Links" heading. Outbound links shown as: `→ {targetId} ({type})` with a `×` delete button. Inbound links shown as: `← {sourceId} ({type})` with a `×` delete button. The writ id in each link is a clickable `<a>` element. When clicked, if that writ is in the loaded table, its row is scrolled to and expanded. If not in the table, the link is a no-op (the id is still displayed for reference).

**Delete**: Clicking `×` calls `POST /api/writ/unlink` with `{ sourceId, targetId, type }`. On success, the link is removed from the display. No confirmation required.

**Add**: Below the link list, an inline form: `<input placeholder="Target writ id">`, `<input list="link-types" placeholder="Link type">` with a `<datalist id="link-types">` containing `<option>` values: retries, supersedes, fixes, duplicates, blocks. A "Link" button calls `POST /api/writ/link` with `{ sourceId: currentWritId, targetId, type }`. On success, the new link appears in the outbound list. On error (e.g. target writ not found), an inline error message is shown below the form.

#### Post New Writ Form

**Toggle**: A "New Writ" button in the toolbar. Clicking it toggles the visibility of the post form section (a `<div>` between the toolbar and the table).

**Form fields**:
- Title: `<input type="text" placeholder="Writ title" required>`
- Body: `<textarea rows="8" placeholder="Detail text..." required>` with `style="resize: vertical"`
- Type: `<select>` populated from `GET /api/writ/types`. The entry with `default: true` is pre-selected. Each `<option>` has `value=name` and text `name` (with description as title attribute if present).
- Codex: `<input type="text" placeholder="Codex (optional)">`
- Submit: `<button class="btn btn--primary">Post Writ</button>`

**Submit**: Calls `POST /api/commission/post` with `{ title, body, type, codex }` (codex omitted if empty). On success: form clears, section collapses, writ list refreshes. On error: inline error below the submit button.

**Repost mode**: When the "Repost" button on a failed/cancelled writ is clicked:
1. The post form section opens (if not already open).
2. The page scrolls to the form.
3. Title is pre-filled with `[Repost] {original title}`.
4. Body is pre-filled with the original body.
5. Type dropdown is set to the original writ's type.
6. A hidden `repostSourceId` variable is set to the original writ's id.
7. When the form is submitted in repost mode, after the `commission-post` call succeeds, JS automatically calls `POST /api/writ/link` with `{ sourceId: newWritId, targetId: repostSourceId, type: 'retries' }`.
8. If the link call fails, the writ was still created successfully — show an inline warning: "Writ posted but link to original failed: {error}. You can add the link manually."
9. After completion (success or partial), `repostSourceId` is cleared.

#### Error and Loading States

- All API calls: disable the triggering button and show a text indicator (e.g., the button text changes to "Posting...", "Cancelling...", etc.).
- On success: re-enable the button, update the UI.
- On error: re-enable the button, display the error message from the API response (`response.error` field) as inline red text below the triggering element. Error messages have class with color `var(--red)`.
- Error messages are cleared when the user retries the action or interacts with the input again.

#### Refresh

- A "Refresh" button in the toolbar. Clicking it re-fetches `GET /api/writ/list` with the current status filter and replaces the table contents. Offset resets to 0.
- After any mutation (transition, post, link, unlink), the affected writ's detail is refreshed automatically. List-level refresh happens after post (R23) and transitions that change status.

### Non-obvious Touchpoints

- **`packages/plugins/clerk/src/clerk.ts`** — the `writTypesTool` must be defined inside the `createClerk()` closure (after the `api` const, before the `return`) so it can access `mergedWritTypes`, `resolveClerkConfig()`, and `resolveDefaultType()`. It cannot be in a separate file because these are private closure variables. This is different from all other clerk tools which are in separate files under `tools/`.
- **`packages/plugins/clerk/src/tools/index.ts`** — does NOT need to be modified. The `writTypesTool` is defined inline in `clerk.ts` and added directly to the `supportKit.tools` array.
- **Oculus chrome injection** — the page's `<head>` and `<body>` tags are required for Oculus to inject the shared stylesheet link and navigation bar. The page must NOT include its own `<link>` to `/static/style.css` — Oculus injects it automatically.

## Validation Checklist

- V1 [R1]: Verify `packages/plugins/clerk/src/clerk.ts` apparatus object contains `recommends: ['oculus']`.
- V2 [R2]: Verify `supportKit` in `clerk.ts` contains `pages: [{ id: 'writs', title: 'Writs', dir: 'pages/writs' }]`.
- V3 [R3]: Verify `packages/plugins/clerk/pages/writs/index.html` exists and contains `<html>`, `<head>`, and `<body>` tags.
- V4 [R4]: Verify `packages/plugins/clerk/package.json` `files` array contains both `"dist"` and `"pages"`.
- V5 [R5]: Run `curl http://localhost:{port}/api/writ/types` and verify it returns a JSON array of objects with `name`, `description`, and `default` fields. Verify "mandate" is included and one entry has `default: true`.
- V6 [R6, R7]: Load the page and verify the writ table renders with columns id, type, status, title, createdAt, and that each status uses the correct badge class.
- V7 [R8]: Click each status filter button and verify the table updates to show only writs of that status. Click "All" and verify all writs are shown.
- V8 [R9]: Type text in the search input and verify the table rows filter to show only writs whose title contains the search text (case-insensitive).
- V9 [R10]: Click a column header and verify rows sort by that column. Click again and verify sort direction reverses.
- V10 [R11]: With more than 20 writs, verify "Load more" appends additional rows. With fewer results than limit, verify the button is hidden.
- V11 [R12]: Click a writ row and verify the expansion shows body, timestamps, resolution (if any), and links.
- V12 [R13, R14, R15, R16]: In the expanded detail of a `ready` writ, verify Accept and Cancel buttons appear with correct styles. Click Accept and verify the writ transitions to `active`. Verify Cancel shows inline confirmation with resolution input.
- V13 [R13, R14]: In the expanded detail of an `active` writ, verify Complete, Fail, and Cancel buttons appear. Verify Complete and Fail show confirmation with required resolution. Verify the confirm button is disabled when resolution is empty.
- V14 [R16, R17, R18]: In the expanded detail, verify outbound/inbound links display with writ id and type. Verify clicking a linked writ id expands that writ. Verify the "add link" form creates a link. Verify the `×` button removes a link.
- V15 [R19, R20, R21]: On a `failed` or `cancelled` writ, verify "Repost" button appears. Click it and verify the post form opens pre-filled with `[Repost] {title}`, original body, and original type. Submit and verify a new writ is created with a `retries` link back to the original.
- V16 [R22, R23]: Verify the "New Writ" button toggles the post form. Fill in the form and submit. Verify the form clears, collapses, and the new writ appears at the top of the list.
- V17 [R24]: Trigger an API error (e.g., try to accept an already-active writ) and verify an inline error message appears. Verify buttons are disabled during in-flight operations.
- V18 [R25]: Verify a "Refresh" button exists and re-fetches the writ list when clicked. Verify no auto-refresh occurs.
- V19 [R26]: View page source and verify it is a single `index.html` with inline JS, no external script tags, and includes `<html>`, `<head>`, `<body>` tags.
- V20 [R5]: Run `pnpm --filter @shardworks/clerk-apparatus test` and verify the `writ-types` tool tests pass.

## Test Cases

**`writ-types` tool** (add to `packages/plugins/clerk/src/clerk.test.ts`):

1. **Returns builtin type** — with default config, `writ-types` handler returns an array containing `{ name: 'mandate', description: null, default: true }`.
2. **Returns config-declared types** — with `clerkConfig: { writTypes: [{ name: 'task', description: 'A task' }] }`, the result includes `{ name: 'task', description: 'A task', default: false }` alongside mandate.
3. **Marks configured default** — with `clerkConfig: { writTypes: [{ name: 'task' }], defaultType: 'task' }`, the `task` entry has `default: true` and `mandate` has `default: false`.
4. **Includes kit-contributed types** — with a kit contributing `writTypes: [{ name: 'quality-audit' }]`, the result includes `{ name: 'quality-audit', description: null, default: false }`.
5. **Tool is registered in supportKit** — `createClerk()` returns a plugin whose `apparatus.supportKit.tools` array includes a tool with `name: 'writ-types'`.
6. **Tool has clerk:read permission** — the `writ-types` tool definition has `permission: 'clerk:read'`.
7. **Tool has no callableBy restriction** — the `writ-types` tool definition does not set `callableBy`.

**Apparatus wiring** (add to `packages/plugins/clerk/src/clerk.test.ts`):

8. **Apparatus declares recommends oculus** — `createClerk()` returns a plugin whose `apparatus.recommends` includes `'oculus'`.
9. **SupportKit includes pages contribution** — `createClerk()` returns a plugin whose `apparatus.supportKit.pages` is an array containing `{ id: 'writs', title: 'Writs', dir: 'pages/writs' }`.

**Page file structure**:

10. **index.html exists** — `packages/plugins/clerk/pages/writs/index.html` exists and contains `<html`, `<head`, and `<body` tags.