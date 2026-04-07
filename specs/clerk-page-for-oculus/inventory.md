# Inventory: Clerk Page for Oculus

**Brief slug:** clerk-page-for-oculus  
**Date:** 2026-04-07

---

## What the Brief Asks For

1. Add `recommends: ['oculus']` to the Clerk apparatus.
2. Contribute a page to Oculus for managing writs:
   - Display writs + key metadata
   - Sort, filter, search (especially by status)
   - Legal state transitions (especially cancel)
   - Create/edit/delete links between writs
   - Repost failed writs (new writ with same body/title, annotated, with link to original)
   - Post new writs (large textarea, type dropdown, submit)

---

## Affected Files

### Files to create

| Path | Purpose |
|------|---------|
| `packages/plugins/clerk/pages/writs/index.html` | The page's entry point (static HTML + JS) |
| `packages/plugins/clerk/src/tools/writ-types.ts` | New tool: returns available writ types from guild config |

### Files to modify

| Path | Change |
|------|--------|
| `packages/plugins/clerk/src/clerk.ts` | Add `recommends: ['oculus']`; add `pages` contribution to `supportKit`; export new `writTypes` tool |
| `packages/plugins/clerk/src/tools/index.ts` | Export `writTypes` tool |
| `packages/plugins/clerk/package.json` | Add `"pages"` to the `files` array |

### Files confirmed unaffected

| Path | Reason |
|------|--------|
| `packages/plugins/oculus/src/oculus.ts` | No change needed — Oculus already scans apparatus `supportKit` for `pages` |
| `packages/plugins/oculus/src/types.ts` | No change needed — `PageContribution` interface is already adequate |
| `packages/plugins/clerk/src/types.ts` | No new types needed in the public API (writ-types tool returns plain objects) |
| `packages/plugins/clerk/src/index.ts` | Only needs update if `writ-types` exports a public type — likely a minor touch |

---

## Clerk Package — Current State

**Package:** `@shardworks/clerk-apparatus`  
**Path:** `packages/plugins/clerk/`  
**Plugin id:** `clerk`

### Apparatus declaration (current)

```typescript
apparatus: {
  requires: ['stacks'],
  // NO recommends currently

  supportKit: {
    books: {
      writs: { indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']] },
      links: { indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']] },
    },
    tools: [
      commissionPost,   // commission-post  → POST /api/commission/post
      writShow,         // writ-show        → GET  /api/writ/show
      writList,         // writ-list        → GET  /api/writ/list
      writAccept,       // writ-accept      → POST /api/writ/accept
      writComplete,     // writ-complete    → POST /api/writ/complete
      writFail,         // writ-fail        → POST /api/writ/fail
      writCancel,       // writ-cancel      → POST /api/writ/cancel
      writLink,         // writ-link        → POST /api/writ/link
      writUnlink,       // writ-unlink      → DELETE /api/writ/unlink
    ],
  },

  provides: api,
  start(_ctx) { ... }
}
```

### Key types (from `packages/plugins/clerk/src/types.ts`)

```typescript
export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;
  status: WritStatus;
  title: string;
  body: string;
  codex?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface WritLinkDoc {
  [key: string]: unknown;
  id: string;           // composite: "{sourceId}:{targetId}:{type}"
  sourceId: string;
  targetId: string;
  type: string;         // open string: "fixes", "retries", "supersedes", etc.
  createdAt: string;
}

export interface WritLinks {
  outbound: WritLinkDoc[];
  inbound: WritLinkDoc[];
}

export interface WritTypeEntry {
  name: string;
  description?: string;
}

export interface ClerkConfig {
  writTypes?: WritTypeEntry[];
  defaultType?: string;
}
```

### Status machine (from `clerk.ts`)

```
ALLOWED_FROM:
  active:    ['ready']
  completed: ['active']
  failed:    ['active']
  cancelled: ['ready', 'active']
  ready:     []           // no incoming transitions (only initial state)

TERMINAL_STATUSES: completed, failed, cancelled
```

### ClerkApi (provides)

```typescript
interface ClerkApi {
  post(request: PostCommissionRequest): Promise<WritDoc>;
  show(id: string): Promise<WritDoc>;
  list(filters?: WritFilters): Promise<WritDoc[]>;
  count(filters?: WritFilters): Promise<number>;
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
  link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;
  links(writId: string): Promise<WritLinks>;
  unlink(sourceId: string, targetId: string, type: string): Promise<void>;
}
```

### Helper: `resolveWritTypes()` (private, in `clerk.ts`)

```typescript
function resolveWritTypes(): Set<string> {
  const config = resolveClerkConfig();
  const declared = (config.writTypes ?? []).map((entry) => entry.name);
  return new Set([...BUILTIN_TYPES, ...declared]);
  // BUILTIN_TYPES = new Set(['mandate'])
}
```

This is used internally but has no tool/API surface. The page needs to know the available types to populate the dropdown — this is the gap (see below).

### Existing tools (all in `packages/plugins/clerk/src/tools/`)

| File | Tool name | Permission | HTTP method | Description |
|------|-----------|------------|-------------|-------------|
| `commission-post.ts` | `commission-post` | `clerk:write` | POST | Create new writ |
| `writ-show.ts` | `writ-show` | `clerk:read` | GET | Show writ + links |
| `writ-list.ts` | `writ-list` | `clerk:read` | GET | List writs (filter by status, type) |
| `writ-accept.ts` | `writ-accept` | `clerk:write` | POST | Transition ready→active |
| `writ-complete.ts` | `writ-complete` | `clerk:write` | POST | Transition active→completed |
| `writ-fail.ts` | `writ-fail` | `clerk:write` | POST | Transition active→failed |
| `writ-cancel.ts` | `writ-cancel` | `clerk:write` | POST | Transition ready|active→cancelled |
| `writ-link.ts` | `writ-link` | `clerk:write` | POST | Create typed link between writs |
| `writ-unlink.ts` | `writ-unlink` | `clerk:write` | DELETE | Remove link between writs |

**Note:** `writ-show` returns `{ ...writ, links }` (full writ + WritLinks). `writ-list` returns `WritDoc[]` without links.

**Gap:** No tool to enumerate available writ types. The page needs this for the "new writ" form's type dropdown. Need to add `writ-types` tool.

### Package.json (current)

```json
{
  "name": "@shardworks/clerk-apparatus",
  "files": ["dist"],
  ...
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/stacks-apparatus": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  }
}
```

`files: ["dist"]` — the `pages/` directory is not currently included. Needs `"pages"` added.

---

## Oculus Package — Current State

**Package:** `@shardworks/oculus-apparatus`  
**Path:** `packages/plugins/oculus/`  
**Plugin id:** `oculus`

### Key types (from `packages/plugins/oculus/src/types.ts`)

```typescript
export interface PageContribution {
  id: string;       // URL segment: /pages/{id}/
  title: string;    // Human-readable title in nav
  dir: string;      // Path to static asset dir, relative to package root in node_modules
}

export interface RouteContribution {
  method: string;   // 'GET', 'POST', 'DELETE', etc.
  path: string;     // Must begin with /api/
  handler: (c: Context) => Response | Promise<Response>;
}

export interface OculusKit {
  pages?: PageContribution[];
  routes?: RouteContribution[];
}
```

### How pages are resolved

In `oculus.ts`:

```typescript
function resolveDirForPackage(packageName: string, dir: string): string {
  return path.join(g.home, 'node_modules', packageName, dir);
}

function scanApparatus(apparatus: LoadedApparatus): void {
  if (!apparatus.apparatus.supportKit) return;
  const oculusKit = apparatus.apparatus.supportKit as OculusKit;

  if (oculusKit.pages) {
    for (const page of oculusKit.pages) {
      const resolvedDir = resolveDirForPackage(apparatus.packageName, page.dir);
      registerPage(page, resolvedDir);
    }
  }
}
```

So for `apparatus.packageName = '@shardworks/clerk-apparatus'` and `page.dir = 'pages/writs'`, the resolved path is `{guild.home}/node_modules/@shardworks/clerk-apparatus/pages/writs`.

In **pnpm workspace dev**, `node_modules/@shardworks/clerk-apparatus` is a symlink to `packages/plugins/clerk`. So `pages/writs` maps to `packages/plugins/clerk/pages/writs`.

### How chrome injection works

For each page's `index.html`, Oculus injects:
1. `<link rel="stylesheet" href="/static/style.css">` before `</head>`
2. `<nav id="oculus-nav">` after `<body>`

The page HTML should have `<html>`, `<head>`, and `<body>` tags to receive injection. The injected nav links include `<a href="/">Guild</a>` plus links to all registered pages.

### CSS classes available (from `/static/style.css`)

Existing classes the page can use:
- `.card` — surface card (bg: `--surface`, border, border-radius: 8px)
- `.badge`, `.badge--success` (green), `.badge--error` (red), `.badge--warning` (yellow), `.badge--info`/`.badge--active` (cyan, pulsing for active)
- `.btn`, `.btn--primary` (blue), `.btn--success` (green), `.btn--danger` (red)
- `.toolbar` — flex row, gap 8px
- `.data-table` — table with striped rows
- `.empty-state` — centered, dimmed text

**Color palette (Tokyo Night):**
- `--bg: #1a1b26`, `--surface: #24283b`, `--surface2: #2f3549`, `--border: #3b4261`
- `--text: #c0caf5`, `--text-dim: #565f89`, `--text-bright: #e0e6ff`
- `--green: #9ece6a`, `--red: #f7768e`, `--yellow: #e0af68`, `--cyan: #7dcfff`, `--blue: #7aa2f7`
- `--font-mono: "SF Mono", "Fira Code", "JetBrains Mono", monospace`

### Tool-to-REST route mapping (from `oculus.ts`)

```typescript
export function toolNameToRoute(name: string): string {
  const idx = name.indexOf('-');
  if (idx === -1) return `/api/${name}`;
  return `/api/${name.slice(0, idx)}/${name.slice(idx + 1)}`;
}
// 'writ-list'       → '/api/writ/list'
// 'commission-post' → '/api/commission/post'
// 'writ-cancel'     → '/api/writ/cancel'
```

All clerk tools become REST endpoints automatically because Oculus scans patronTools from the Instrumentarium on startup.

**Permission → HTTP method mapping:**
- `clerk:read` → GET
- `clerk:write` → POST
- `clerk:delete` → DELETE (writ-unlink uses this via `delete` perm)

Wait — checking `writ-unlink` permission: it's `clerk:write`, not `delete`. So `DELETE /api/writ/unlink` would only apply if permission is `delete`. Let me re-check...

`writ-unlink.ts`: `permission: 'clerk:write'` → `permissionToMethod('clerk:write')` → `'POST'`. So it's actually `POST /api/writ/unlink`, not DELETE.

Updated route table:
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

---

## The `recommends` Pattern

From `plugin.ts` (Apparatus type):
```typescript
// `recommends`: advisory apparatus names — generates startup warnings when
//   expected apparatuses are absent. Not enforced — the apparatus starts
//   regardless. Use for soft dependencies needed by optional API methods.
recommends?: string[]
```

From `guild-lifecycle.ts`, `collectStartupWarnings()`:
```typescript
// Check apparatus recommends
for (const app of apparatuses) {
  for (const rec of app.apparatus.recommends ?? []) {
    if (!installedIds.has(rec)) {
      warnings.push(
        `[arbor] warn: "${app.id}" recommends "${rec}" but it is not installed.`,
      );
    }
  }
}
```

**Precedent:** The Animator uses `recommends: ['loom']` — loom is needed only for `summon()`, not `animate()`. The Clerk would similarly recommend oculus because the page contribution is optional functionality.

---

## Gap: Missing `writ-types` Tool

The page's "Post new writ" form needs a dropdown populated with available writ types. Available types come from:
1. Built-in: `mandate`
2. Guild config: `guild().guildConfig().clerk.writTypes`

No existing tool exposes this. The internal `resolveWritTypes()` function in `clerk.ts` does this but isn't exported.

**Options:**
- **New `writ-types` tool** — reads guild config and returns `WritTypeEntry[]` (name + optional description). Consistent with the tool-first pattern. Would become `GET /api/writ/types`.
- **Custom route** — clerks adds a `RouteContribution` to `supportKit.routes` that handles `GET /api/clerk/config` or similar. Heavier, non-standard.

The tool approach is consistent with all other clerk operations and fits naturally into the REST API the page already uses.

---

## Gap: No "Repost" Operation

The brief requires: "repost failed writs (creates a new writ with the same body/title--with possible annotation of it being a repost--, along with an appropriate link to the original writ)".

There is no `writ-repost` tool. This is a compound operation:
1. Create new writ via `commission-post` (same title, same body, possibly annotated title like "[Repost] {title}")
2. Link new writ → original via `writ-link` with some type (e.g. `"retries"`)

**Options:**
- **Page-level composition** — the page's JS calls `commission-post` then `writ-link` in sequence. No new tool. The repost is a UI operation, not an API primitive.
- **New `writ-repost` tool** — atomic server-side operation that creates + links in one call. More robust (no partial state if second call fails).

The tool approach is safer (atomic) and reusable, but adds surface area. The page approach is simpler. Given the brief's UI focus and the existing tools being sufficient, this is a decision point.

---

## Page File Structure

No existing HTML pages exist anywhere in the codebase. Clerk would be the first plugin to contribute a page. The page directory convention needs to be established.

**Proposed structure** (consistent with test fixture pattern `pages/my-page`):
```
packages/plugins/clerk/
  pages/
    writs/
      index.html        ← primary entry point
      (optional: app.js, styles.css)
```

`PageContribution.dir` would be `'pages/writs'`.

The `pages/` directory is at the **package root** (not inside `src/`), consistent with the test fixture pattern where `dir: 'pages/my-page'` resolves directly from the package root.

---

## Adjacent Patterns

### How the Animator uses `recommends`

```typescript
// packages/plugins/animator/src/animator.ts
apparatus: {
  requires: ['stacks'],
  recommends: ['loom'],
  // ...
}
```

The Loom is needed only for `summon()`, not for `animate()`. Clerk recommending `oculus` follows the same pattern — the page contribution is optional/enhanced functionality.

### How Oculus registers pages from its own `supportKit`

Oculus has no pages in its own `supportKit` — only a `tools` array with the `oculus` tool. There is no current example of a page contributed by any plugin. This commission would establish the first real example.

### Oculus test pattern for kit-contributed pages

From `oculus.test.ts`:
```typescript
const nmPageDir = path.join(guildHome, 'node_modules', '@test', 'my-kit', 'pages', 'my-page');
fs.mkdirSync(nmPageDir, { recursive: true });
fs.writeFileSync(path.join(nmPageDir, 'index.html'), '<html>...</html>');

const pages: PageContribution[] = [
  { id: 'my-page', title: 'My Page', dir: 'pages/my-page' },
];
const kits: LoadedKit[] = [mockKit('my-kit', [], pages)];
```

The test simulates pnpm workspace resolution: `node_modules/{packageName}/{dir}`.

### Clerk test pattern

```typescript
// packages/plugins/clerk/src/clerk.test.ts
// Uses in-memory MemoryBackend (from @shardworks/stacks-apparatus/testing)
// Directly instantiates apparatus, bypasses tool layer for most tests
// Tool-level tests test via tool handlers directly
```

Test pattern: `describe`/`it` with node:test, `assert` from node:assert/strict.

---

## Existing Clerk Tests

**File:** `packages/plugins/clerk/src/clerk.test.ts`

Tests cover:
- `post()` — creates writ, validates type, sets timestamps
- `show()` — finds writ by id, throws if not found
- `list()` — filters by status, type, limit, offset
- `count()` — counts with/without filters
- `transition()` — all valid transitions, all invalid transitions
- `link()` — creates link, idempotent, validates both writs exist
- `links()` — returns outbound + inbound
- `unlink()` — removes link, idempotent
- Tool-level tests: `writ-show`, `writ-link`, `writ-unlink` via handlers directly

**No tests for the new items:** `writ-types` tool (if added), and the page itself (static HTML — no unit tests needed, but any new tool needs tests).

---

## Doc/Code Discrepancies

1. **`clerk.md` support kit** — the doc shows the `supportKit.books.writs` entry but does NOT include a `links` book. The code (`clerk.ts`) includes both `writs` and `links` books with full index declarations. The doc is stale/incomplete.

2. **`clerk.md` tools list** — the doc lists 7 tools (`commission-post`, `writ-show`, `writ-list`, `writ-accept`, `writ-complete`, `writ-fail`, `writ-cancel`). The code registers 9 tools (adds `writ-link`, `writ-unlink`). Links were added after the doc was written.

3. **`clerk.md` `ClerkApi` interface** — does not include `link()`, `links()`, or `unlink()` methods. Code has all three. Doc is stale.

---

## Scratch Notes / Related Context

- `docs/feature-specs/clerk-patron-assessment.md` — planned `Assessment` entity for patrons to record evaluations against writs. Noted as depending on prior commissions. Not yet implemented. Not directly related to this brief but the page might eventually display assessments alongside writs.

- `docs/architecture/apparatus/clerk.md` — documents future Clockworks integration, hierarchy decomposition, and `signal()` method. None of this exists yet. The page only needs to work with what's currently implemented.

- The Animator's `recommends: ['loom']` in `animator.ts` is the only other example of `recommends` on an apparatus in the codebase.

---

## Constraints and Conventions

- **No build step for pages** — the page is static HTML with vanilla JS. No bundler. The page can reference external CDN resources or be fully self-contained. The `dist/` directory contains compiled TypeScript — pages live separately in `pages/`.
- **Vanilla JS in pages** — there is no build toolchain for browser JS in this repo (no webpack, vite, etc.). The page must use browser-native APIs or inline all JS.
- **pnpm workspace** — all packages use `pnpm@10.32.1`. The `files` field in package.json controls what gets published. Currently `["dist"]` for clerk; needs `"pages"` added.
- **Node 24 only** — `package.json` engines: `"node": "24.x"`. Not directly relevant to a client-side page.
- **`consumes` field in Oculus** — Oculus declares `consumes: ['pages', 'routes']`. The clerk's page contribution is typed as OculusKit in spirit but the framework doesn't enforce this — Oculus casts `supportKit as OculusKit` and checks the `pages` key.
- **Page URL** — the page will be served at `/pages/writs/`. The `id` field must be unique across all registered pages. Using `'writs'` as the id.
