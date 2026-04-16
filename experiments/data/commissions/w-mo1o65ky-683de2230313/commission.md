# Ratchet Clicks Oculus Page

## Intent

Ship an Oculus page that renders the Ratchet click forest as an interactive tree view with a persistent detail pane, lifecycle and link management, status/subtree filtering, and deep-linking. The page lives in the Ratchet plugin, uses the shared Oculus chrome, and matches the Clerk writs-page conventions except where click semantics diverge.

## Rationale

Clicks are the substrate's inquiry log, but until now the only views have been CLI (`click-tree` ASCII) and structured tool output. A browser view makes the forest navigable, puts lifecycle actions and links under direct manipulation, and closes the loop the docs already flag as "Future: Oculus Click View". The page also introduces the pattern for any future Ratchet-contributed pages — package publishing wiring, kit registration, companion tests — so subsequent pages inherit the convention.

## Scope & Blast Radius

Changes are confined to `packages/plugins/ratchet/`. There is **no cross-package blast radius** — no Oculus core changes, no Clerk changes, no schema changes.

- **Ratchet plugin source**: register the new page in `supportKit.pages`, extend the existing `click-tree` tool to accept a new output format, and add a plugin-level test asserting the page registration.
- **Ratchet page assets**: a new `pages/clicks/` directory containing `index.html` and companion `*.test.js` files.
- **Ratchet package manifest**: extend the published `files` array so the new directory ships with the npm package (Oculus resolves page directories from `node_modules` at runtime — unpublished assets resolve to 404, which is a post-install failure mode the implementer must preempt).
- **Ratchet test runner**: if the existing test glob does not pick up the new `pages/**/*.test.js` files, extend whichever script runs the test suite so the companion tests execute in CI. Verify by running the suite and confirming the new tests are discovered.
- **`click-tree` tool surface**: this commission adds a new output format option to the tool. The CLI default output must remain unchanged — existing callers must observe no behavioral difference. Verify by running the existing `click-tree` test suite and confirming it still passes without modification to the assertions.

Cross-cutting concerns to audit rather than enumerate:

- **Tool output contract**: `click-tree` currently returns a rendered ASCII string. Extending it with a JSON output path must not regress any current consumer. Audit by grep for uses of `click-tree` / `clickTree` across the monorepo and by running the full test suite.
- **Kit contribution shape**: the new `pages` entry in Ratchet's `supportKit` must match the `PageContribution` type consumed by Oculus. Confirm by reading the Oculus kit registration code and the Clerk precedent, and by running `pnpm -w typecheck`.
- **Published file footprint**: any new directory under `packages/plugins/ratchet/` that the page depends on at runtime must be listed in `package.json` `files` or an ancestor entry. Verify by inspecting the published tarball contents (`pnpm pack` and list the tarball) or at minimum by reading the `files` array.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | How does the page obtain the tree data? | Extend the `click-tree` tool with a JSON output format; the page consumes structured data from `/api/click/tree` rather than the rendered ASCII. | Patron override accepted the API expansion to keep CLI and web view consuming the same endpoint. |
| D2 | Where do the page assets live? | `packages/plugins/ratchet/pages/clicks/index.html` with companion `*.test.js` files in the same folder. | Mirrors the Clerk `pages/writs/` convention exactly. |
| D3 | How does Ratchet publish the page directory? | Extend `files` in `package.json` to include `"pages"` alongside `"dist"`. | Exactly mirrors Clerk; future-proofs additional Ratchet pages. |
| D4 | What is the detail-pane layout? | Persistent right-hand panel; the tree stays visible alongside the details. | Patron override preferring split layout over the writs-page full-page switch. |
| D5 | What does clicking a tree node do? | Click the node label → open detail in the right pane. Subtree scoping is a separate affordance (e.g. a focus button) on each node. | Matches the higher-information-first default; scoping remains accessible via the explicit focus control and via URL deep-link. |
| D6 | Status-filter semantic | Prune: non-matching nodes and their descendants are hidden entirely (matches CLI and API). | Matches `ratchet.tree()` and CLI conventions. |
| D7 | Default status-filter state | All four statuses selected by default. | Matches writs-page "All" default. |
| D8 | Default expand/collapse state | All nodes expanded by default. | Matches CLI output; scannable at realistic corpus size. |
| D9 | Tree-node status indicators | **CSS badges** (`.badge--active`, `.badge--warning`, `.badge--success`, `.badge--error`) — **not Unicode symbols**. | Patron override: use the shared Oculus badge vocabulary rather than the CLI's Unicode glyphs on tree nodes. (This intentionally diverges from S2's original Unicode framing.) |
| D10 | Terminal-click inline conclusion | Disclosure triangle (▸/▾) next to the goal; clicking expands the conclusion under the goal line. | Brief specifies "inline, collapsed by default, expandable". |
| D11 | Where do lifecycle actions live? | Detail pane only — user selects a node, then the pane exposes Park / Resume / Conclude / Drop. No row-level action menus. | Simpler; Conclude/Drop already need a text field that fits the pane. |
| D12 | Parent-click selector in the create form | Plain text input for parent ID (the server resolves short prefixes via `resolveId`). | Simplest; works for both root and child creation; pre-fill is additive. |
| D13 | Create-click form position | Toggleable inline card at the top of the tree view. | Mirrors the writs-page `#post-section`. |
| D14 | Link-type selector | `<select>` dropdown with the four fixed values (`related`, `commissioned`, `supersedes`, `depends-on`). | `linkType` is a closed enum — the dropdown makes invalid input impossible client-side. |
| D15 | Cross-substrate link navigation | Dispatch on target ID prefix: `c-…` opens the click detail in-page; `w-…` navigates to `/pages/writs/?writ=<id>`; anything else renders as plain text. | Pure-function dispatch based on the `w-`/`c-` convention. |
| D16 | Link-target display in detail pane | Show the target ID plus lazily-fetched metadata (click goal or writ title). | Patron override: more context than the writs-page id-only rendering. |
| D17 | Post-mutation refresh | Re-fetch the full tree and re-render after any mutation. | Simplest and always correct; matches "don't over-engineer for thousands". |
| D18 | Child ordering under a parent | `createdAt` ascending (oldest first). | Matches `ratchet.tree()` and CLI. |
| D19 | Deep-link by click ID | Support `?click=<id>` to auto-open the detail pane on page load. | Symmetric with writs page; cheap. |
| D20 | Status badge classes in the detail pane | `live → badge--active` (animated cyan), `parked → badge--warning` (yellow), `concluded → badge--success` (green), `dropped → badge--error` (red). | Reuses Oculus shared classes; semantics align. |
| D21 | Companion tests | Write `*.test.js` files alongside `index.html` covering tree-build, prune-by-status, subtree scoping, detail-pane rendering, and link prefix dispatch. Extend Ratchet's test script glob if the runner does not pick them up. | Matches the Clerk-page convention; keeps contribution bar uniform. |
| D22 | Children section in the detail pane | Status-count badge strip **plus** a table of first-generation children with clickable rows that navigate to child detail. | Mirrors the writs page. |
| D23 | Subtree-scope URL and breadcrumb | `?root=<id>` in the URL (via `pushState`); breadcrumb renders the path from forest root to the scoped root, each segment clickable to scope to that ancestor; a "Show all" entry returns to the full forest. | Deep-linkable, composable with `?click=<id>`, standard hierarchical affordance. |
| D24 | Detail-pane fields | Render every populated field: id, goal, status, parent link (if set), `createdAt`, `resolvedAt` (if set), `createdSessionId` (if set), `resolvedSessionId` (if set), conclusion (expandable, if terminal), links, children. | Brief says "all fields"; matches writs-page details grid. |
| D25 | Plugin-level registration test | Add a test in `ratchet.test.ts` asserting `supportKit.pages` contains `{ id: 'clicks', title: 'Clicks', dir: 'pages/clicks' }`. | Matches the Clerk precedent; locks the contract. |

## Acceptance Signal

- The monorepo builds and type-checks cleanly: `pnpm -w typecheck` and `pnpm -w build` succeed.
- The full test suite passes: `pnpm -w test`. This includes the new companion page tests (tree-build, prune-by-status, subtree scoping, detail-pane rendering, link dispatch) and the new `ratchet.test.ts` assertion for `supportKit.pages`.
- Running Oculus locally and navigating to `/pages/clicks/` shows a Clicks nav entry, renders the click forest as a tree, and lets the patron create, park, resume, conclude, drop, link, and unlink clicks end-to-end. Each mutation is reflected in the tree after refresh. The persistent detail pane updates when a node is selected.
- Deep-links behave: visiting `/pages/clicks/?click=<id>` opens that click's detail; `/pages/clicks/?root=<id>` scopes the tree to that subtree with a breadcrumb; both may be combined.
- Status-filter buttons prune the tree (non-matching nodes **and** their descendants are hidden). Default state has all four statuses selected and all nodes expanded.
- A click whose `targetId` starts with `w-` navigates to `/pages/writs/?writ=<id>`; a target starting with `c-` opens that click's detail in-page; anything else renders as plain text.
- The published Ratchet tarball contains the `pages/clicks/` directory. Verify with `pnpm --filter @shardworks/nexus-plugin-ratchet pack` and list contents, or inspect the `files` array in `package.json`.
- The existing `click-tree` CLI default output is unchanged — previously-passing assertions continue to pass without modification.

## Existing Patterns

- **`packages/plugins/clerk/pages/writs/index.html`** — the architectural template. Copy the IIFE layout, `api()` helper, error-display helpers, `?writ=<id>` deep-link pattern, confirm-section idiom for terminal actions with a required text input, copy-to-clipboard affordance, and the chrome markup at top-of-file. Diverge only where click semantics require (persistent side pane instead of view switch, select dropdown for link type, prefix-dispatch for cross-substrate targets, subtree scoping).
- **`packages/plugins/clerk/pages/writs/writs-hierarchy.test.js`** and **`writs-type-filter.test.js`** — the companion-test template. Follow the `node:test` + `assert/strict` + `FakeElement` DOM-shim pattern, re-declaring the pure functions under test (they are scoped inside the IIFE, not exported).
- **`packages/plugins/clerk/src/clerk.ts`** (the `pages:` entry in `supportKit`) — the kit-contribution precedent. Ratchet's entry mirrors it one-for-one.
- **`packages/plugins/clerk/src/clerk.test.ts`** (the `supportKit includes pages contribution for writs` test) — the precedent for the Ratchet-side assertion added per D25.
- **`packages/plugins/ratchet/src/tools/click-extract.ts`** — the in-repo precedent for a `format: 'md' | 'json'` tool parameter. Use its shape when extending `click-tree` per D1.
- **`packages/plugins/oculus/src/static/style.css`** — the shared badge classes (`.badge--active`, `.badge--warning`, `.badge--success`, `.badge--error`) and button / toolbar / filter-button styles. Do not introduce new CSS for behaviors the shared sheet already covers.
- **`packages/plugins/oculus/src/oculus.ts`** — the chrome-injection contract. Auto-injection only touches the root `index.html`; nested assets serve untouched. The new `pages/clicks/index.html` is the root and gets chrome automatically.

## What NOT To Do

- **Do not** add drag-and-drop reparenting, a graph view, bulk operations, or any other stretch goal from the `docs/architecture/apparatus/ratchet.md` "Future" section. The `click-reparent` tool is out of scope for this commission.
- **Do not** change the default CLI output of `click-tree`. The new JSON format is opt-in via the added parameter; the previous rendering must remain the default.
- **Do not** introduce a build step, bundler, framework, or JSDOM-based test harness for the page. Match the writs-page no-build convention.
- **Do not** implement Unicode status glyphs on tree nodes — D9 overrides the original brief/scope wording and selects CSS badges.
- **Do not** add lifecycle actions to tree-row hover menus or row-level shortcuts — D11 restricts actions to the detail pane.
- **Do not** broaden the click-link validator, add server-side target-existence checks, or refactor `resolveId` coverage on `click-link`. These are pre-existing concerns flagged in observations; they are out of scope here.
- **Do not** refactor the writs page or attempt to extract shared helpers between the two pages. Duplication is acceptable for this commission; shared abstractions are a follow-up.
- **Do not** modify unrelated docs beyond the scope's direct obligations. Doc drift noted in observations (O6–O9) is logged for a future pass.