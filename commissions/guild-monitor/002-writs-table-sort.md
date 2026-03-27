# Sortable columns for the writs table

## Description

The writs table on the Work tab should support column sorting. Clicking a header sorts by that column; clicking the same header again inverts the direction. A sort indicator (↑ / ↓) on the active header shows current direction.

### Sortable columns

All columns except Children (progress indicator — not meaningfully sortable).

### Status sort order

Status uses a custom priority ranking rather than alphabetical. Ordered highest to lowest priority:

```
active > failed > ready > pending > completed > cancelled
```

- **Highest priority first** (active at top) is the default and the "descending" direction for this column.
- **Lowest priority first** (cancelled at top) is the "ascending" direction.

### Default sort

Status, highest-priority-first (active → failed → ready → pending → completed → cancelled).

### Secondary sort

When sorting by any column other than Created, apply Created descending as a tiebreaker. When sorting by Created, no secondary sort needed.

### Sort state in URL

Persist sort state in query params (`?sort=status&dir=desc`) so the current view is bookmarkable and survives a page refresh. The polling auto-refresh should preserve the current sort params when re-fetching.

### Implementation notes

Sorting can be applied client-side if the full dataset is already loaded, or via query params passed to `GET /api/writs`. Client-side is acceptable given expected table sizes. Either way, the URL should reflect the active sort.

## Acceptance Criteria

- [ ] All columns except Children have a clickable header that sorts the table
- [ ] Clicking an active header inverts the sort direction
- [ ] A sort indicator (↑ / ↓) appears on the active sort column header
- [ ] Status column uses the priority ranking: active > failed > ready > pending > completed > cancelled
- [ ] Default sort is Status, highest-priority-first
- [ ] Secondary sort by Created descending applied when primary sort column is not Created
- [ ] Sort state persisted in URL query params (`?sort=<col>&dir=<asc|desc>`)
- [ ] Auto-refresh polling preserves current sort
- [ ] Drill-down view (`/work?writ=<id>`) children table also sortable (same rules)

## Workshop

guild-monitor
