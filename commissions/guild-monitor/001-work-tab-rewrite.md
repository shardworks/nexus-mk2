# Commission: Rewrite the Work tab

## Title

Rewrite Work tab — writ-based, with post form and expandable hierarchy

## Description

The existing Work tab (`src/work.ts`) was built in the commission era. It uses `CommissionSummary`, `/api/commissions` endpoints, and the old work/piece/job/stroke hierarchy — none of which exist any more. Delete it entirely and build a replacement around writs.

### Post Writ Form

A form at the top of the page for posting new writs. Fields:

- **Workshop** — dropdown populated from guild config. Include a "no workspace" option for knowledge/planning writs.
- **Type** — dropdown populated from guild config `writTypes` plus the builtin `writ` type. Default to `writ`.
- **Content** — textarea for the writ spec. First line becomes the title; full content becomes the description.
- **Submit** — posts to a new `/api/writs` endpoint (POST), which creates the writ with `sourceType: 'patron'` and signals `writ.posted`.

### Writ Table

A table of writs below the form. Default view: top-level writs only (no `parentId`). Columns:

- ID (mono)
- Type
- Status (badge)
- Workshop
- Title (truncated)
- Children (count badge — hidden if zero)
- Created

**Status filter** — a simple row of filter buttons above the table: All | Ready | Active | Pending | Completed | Failed | Cancelled. Filters the table client-side (or via query param for URL-shareability).

### Hierarchy — Hybrid Expand + Drill-Down

Writs can nest arbitrarily deep. Use a hybrid approach:

**Inline expand (up to 2 levels):** Clicking a row with children expands an inline panel showing direct children as a nested table. Those children can also be expanded one more level inline. This covers the common case — a top-level writ with a handful of child writs.

**Drill-down link:** Each writ row has a "→" or "open" link (separate from the expand click) that navigates to `/work?writ=<id>`. This view shows the selected writ's details at the top (title, description, status, metadata) and its children in the table below — replacing the top-level list. A breadcrumb shows the path from root to the current writ. This handles deep hierarchies cleanly.

**Progress rollup on parent rows:** When a writ has children, show a compact progress indicator in the Children column: `3 / 5 done` or a small progress bar. Uses the `completedCount` / `childCount` values already returned by `getWritChildren`.

### API changes needed in `src/api.ts`

- `POST /api/writs` — create writ with `sourceType: 'patron'`, signal `writ.posted`
- `GET /api/writs` — list writs (support `?parentId=`, `?status=`, `?page=`)
- `GET /api/writs/:id` — show single writ with children
- `GET /api/writs/:id/children` — direct children (for lazy inline expand)

The existing `/api/commissions*` endpoints can be removed.

### What to delete

- All of `src/work.ts` — full rewrite, do not patch
- `/api/commissions`, `/api/commissions/:id`, `/api/commissions/:id/children` routes in `src/api.ts`
- Any `CommissionSummary` imports or usages across the codebase

### Keep

- The existing page shell (header, nav, footer, CSS design system) — match the visual style of the other tabs
- Auto-refresh polling pattern used in other tabs
- The `/work` route in `src/server.ts` — just update what it renders

## Acceptance Criteria

- [ ] Old commission-based `work.ts` deleted; new `work.ts` written from scratch
- [ ] Post writ form renders with workshop dropdown (from guild config), type dropdown (guild `writTypes` + builtin `writ`), textarea, and submit button
- [ ] Submitting the form posts to `POST /api/writs`, creates the writ with `sourceType: 'patron'`, signals `writ.posted`, and refreshes the table
- [ ] Writ table shows top-level writs by default, with status filter buttons
- [ ] Rows with children show a child count / progress indicator
- [ ] Clicking a row with children expands an inline child panel (lazy-loaded)
- [ ] Inline expand works up to 2 levels deep
- [ ] Each row has a drill-down link navigating to `/work?writ=<id>`
- [ ] `/work?writ=<id>` shows writ detail header + children table + breadcrumb path to root
- [ ] Breadcrumb links navigate back up the tree
- [ ] Auto-refresh polling updates writ statuses without flickering (same pattern as other tabs)
- [ ] No commission references remain anywhere in the file
- [ ] Visual style consistent with other tabs (same CSS design system)

## Workshop

guild-monitor
