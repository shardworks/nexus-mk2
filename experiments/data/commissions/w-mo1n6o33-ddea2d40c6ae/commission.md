# Oculus click tree view

## Summary

Add an Oculus page for the Ratchet apparatus — a tree-based visualization of clicks. The page is contributed by the Ratchet plugin via Oculus's kit page system (`supportKit.pages`), served as a static HTML page with embedded JS (same pattern as the Clerk writs page). It consumes the existing Ratchet tool REST endpoints that Oculus auto-exposes.

## Motivation

Clicks are tree-structured by design — parent-child decomposition is the primary organizational mechanism. The CLI (`nsg click-tree`) provides a text rendering, but a visual tree in the browser is the natural way to explore and manage the inquiry graph. This is Package 3 from the click model work packages.

## What it delivers

A single Oculus page at `/pages/clicks/` contributed by the Ratchet plugin:

### Tree view (primary)
- Expandable/collapsible tree with full nesting depth, rooted at the forest of top-level clicks
- Each node shows: status indicator, goal text, click ID (copyable)
- Status indicators use distinct visual treatment: `●` live, `◇` parked, `○` concluded, `✕` dropped — matching the CLI `click-tree` output's convention
- Concluded/dropped nodes show conclusion text inline (collapsed by default, expandable)
- Cross-substrate links visible on each node (click → writ references, rendered as navigable links to the writs page via `?writ=<id>`)

### Filtering
- Filter by status (buttons like the writs page: All, live, parked, concluded, dropped)
- Filter by subtree root (click a node to scope the tree to that subtree; breadcrumb to navigate back up)

### Actions
- Create a new click (goal + optional parent)
- Park / Resume / Conclude / Drop from the node's action menu (conclude and drop require a conclusion input)
- Copy click ID to clipboard

### Detail pane
- Clicking a node opens a detail pane (side panel or inline expansion) showing: all fields, links (with types), children summary, timestamps
- Link management: add/remove links (same UX pattern as the writs page link section)

## Architecture pattern

Follow the Clerk writs page exactly:

1. **Static HTML page** at `packages/plugins/ratchet/pages/clicks/index.html` — self-contained HTML + embedded `<script>` + `<style>` (no build step, no bundler, no framework)
2. **Kit contribution** — Ratchet's `supportKit.pages` array registers `{ id: 'clicks', title: 'Clicks', dir: 'pages/clicks' }`
3. **API access** — the page calls the REST endpoints that Oculus auto-generates from Ratchet's tools: `GET /api/click/list`, `GET /api/click/show`, `GET /api/click/tree`, `POST /api/click/create`, `POST /api/click/park`, etc. No custom Oculus routes needed.
4. **Chrome injection** — Oculus automatically injects the nav bar and stylesheet into the page's `index.html`

## What does NOT change

- Ratchet plugin API (no changes to the apparatus itself)
- Ratchet tools (no new tools — the page uses existing ones)
- Oculus core (no changes to the dashboard framework)
- Clerk writs page (no changes)

## Constraints

- No build tooling — the page is vanilla HTML/JS/CSS, same as the writs page
- No external dependencies (no React, no D3, no npm packages for the page)
- The tree must render performantly for ~100 clicks (current scale; don't over-engineer for thousands)
- Must work with Oculus's chrome injection (nav bar, stylesheet)

## Acceptance criteria

- [ ] `/pages/clicks/` renders a tree of all clicks with correct parent-child nesting
- [ ] Status indicators visually distinguish live/parked/concluded/dropped
- [ ] Expanding a concluded/dropped node shows the conclusion text
- [ ] Status filter buttons show/hide nodes by status
- [ ] Clicking a node scopes the tree to that subtree; a breadcrumb or back button restores the full view
- [ ] Create click form works (goal + optional parent)
- [ ] Park/Resume/Conclude/Drop actions work from node context menu
- [ ] Cross-substrate links to writs are navigable (link to writs page with `?writ=<id>`)
- [ ] Click IDs are copyable
- [ ] `package.json` `files` array includes `pages`
- [ ] Ratchet `supportKit.pages` registers the page contribution

## References

- Clerk writs page (pattern reference): `packages/plugins/clerk/pages/writs/index.html`
- Ratchet architecture spec: `docs/architecture/apparatus/ratchet.md`
- Ratchet plugin source: `packages/plugins/ratchet/src/`