# Inventory — Spider Page for Oculus

Brief: The spider should have a 'recommends' dependency on Oculus, and contribute a page for managing its configuration and runtime state.

---

## Affected Files

### Files to be modified

| File | Reason |
|------|--------|
| `packages/plugins/spider/src/spider.ts` | Add `recommends: ['oculus']` to apparatus, add `pages` and `routes` contributions to `supportKit` |
| `packages/plugins/spider/package.json` | Add `@shardworks/oculus-apparatus` to dependencies (for types: `PageContribution`, `RouteContribution`) |
| `packages/plugins/spider/src/types.ts` | Possibly extend `SpiderApi` to add `listBlockTypes()` if we decide not to scan guild directly |

### Files to be created

| File | Reason |
|------|--------|
| `packages/plugins/spider/src/static/index.html` | Main entry point for the Spider Oculus page |
| `packages/plugins/spider/src/static/spider.js` | Frontend JS for the Spider page |
| `packages/plugins/spider/src/static/spider.css` | Optional page-specific styles (may just rely on shared oculus CSS) |
| `packages/plugins/spider/src/routes/` | Optional directory for custom API route handlers |
| `packages/plugins/spider/src/routes/spider-api.ts` | Custom API route file(s) contributing spider-specific endpoints |

> **Note on static assets**: Oculus serves plugin pages from a directory as static files (HTML/CSS/JS). The `dir` in PageContribution points to a directory within the package (relative to its root in node_modules). During development this is `src/static`; for dist builds it would be `dist/static`. Pages are pure client-side — dynamic data comes from custom API routes or existing tool REST endpoints.

---

## Types and Interfaces

### From `packages/plugins/oculus/src/types.ts`

```typescript
interface PageContribution {
  id: string;          // URL segment: /pages/{id}/
  title: string;       // shown in nav
  dir: string;         // path to static asset dir, relative to package root in node_modules
}

interface RouteContribution {
  method: string;                              // 'GET', 'POST', 'DELETE'
  path: string;                               // must start with /api/
  handler: (c: Context) => Response | Promise<Response>;
}

interface OculusKit {
  pages?: PageContribution[];
  routes?: RouteContribution[];
}
```

### From `packages/plugins/spider/src/types.ts`

```typescript
// Key types for runtime UI display
interface RigDoc {
  id: string;
  writId: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  engines: EngineInstance[];
  createdAt: string;
  resolutionEngineId?: string;
}

interface EngineInstance {
  id: string;
  designId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
  upstream: string[];
  givensSpec: Record<string, unknown>;
  yields?: unknown;
  error?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  block?: BlockRecord;
}

interface BlockRecord {
  type: string;
  condition: unknown;
  blockedAt: string;
  message?: string;
  lastCheckedAt?: string;
}

type RigStatus = 'running' | 'completed' | 'failed' | 'blocked';
type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';

interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
  show(id: string): Promise<RigDoc>;
  list(filters?: RigFilters): Promise<RigDoc[]>;
  forWrit(writId: string): Promise<RigDoc | null>;
  resume(rigId: string, engineId: string): Promise<void>;
  getBlockType(id: string): BlockType | undefined;  // NO list() method
}

interface RigFilters {
  status?: RigStatus;
  limit?: number;
  offset?: number;
}

interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  variables?: Record<string, unknown>;
}

interface RigTemplate {
  engines: RigTemplateEngine[];
  resolutionEngine?: string;
}

interface RigTemplateEngine {
  id: string;
  designId: string;
  upstream?: string[];
  givens?: Record<string, unknown>;
}

interface BlockType {
  id: string;
  check: (condition: unknown) => Promise<CheckResult>;
  conditionSchema: ZodSchema;
  pollIntervalMs?: number;
}
```

### From `packages/plugins/fabricator/src/fabricator.ts`

```typescript
interface EngineDesign {
  id: string;
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
  collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}

interface FabricatorApi {
  getEngineDesign(id: string): EngineDesign | undefined;  // NO list() method
}
```

### From `packages/plugins/clerk/src/types.ts`

```typescript
interface WritDoc {
  id: string;
  type: string;
  status: 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
  title: string;
  body: string;
  codex?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}
```

---

## Functions That Will Change

### `packages/plugins/spider/src/spider.ts` — `createSpider()` apparatus object

**Current signature (the apparatus return value)**:
```typescript
return {
  apparatus: {
    requires: ['stacks', 'clerk', 'fabricator'],
    consumes: ['blockTypes'],
    supportKit: {
      books: { rigs: {...}, 'input-requests': {...} },
      engines: { draft, implement, review, revise, seal },
      blockTypes: { 'writ-status', 'scheduled-time', 'book-updated', 'patron-input' },
      tools: [ ...12 tools... ],
    },
    provides: api,
    start(ctx): void { ... },
  },
};
```

**What changes**:
- Add `recommends: ['oculus']` to apparatus
- Add `pages: [...]` to supportKit
- Add `routes: [...]` to supportKit

---

## Existing Tool REST Endpoints (Already Exposed by Oculus)

These tools are already accessible as REST endpoints via the automatic tool→route mapping. The Spider page can call them from the frontend without additional routes:

| Tool | Route | Method |
|------|-------|--------|
| `rig-list` | `GET /api/rig/list` | `GET` (permission: read) |
| `rig-show` | `GET /api/rig/show` | `GET` (permission: read) |
| `rig-for-writ` | `GET /api/rig/for-writ` | `GET` (permission: read) |
| `rig-resume` | `POST /api/rig/resume` | `POST` (permission: spider:write) |
| `input-request-list` | `GET /api/input-request/list` | `GET` |
| `input-request-show` | `GET /api/input-request/show` | `GET` |

---

## API Gaps — Missing Methods for Config UI

### FabricatorApi — no `listEngineDesigns()`

`FabricatorApi.getEngineDesign(id)` can only look up a design by ID. The `EngineRegistry` is a `private Map<string, EngineDesign>` inside the Fabricator apparatus — not exposed. To enumerate all registered engine designs for the Config UI, we either:

**Option A**: Add `listEngineDesigns(): EngineDesign[]` to `FabricatorApi`. Requires modifying `packages/plugins/fabricator/src/fabricator.ts` and `packages/plugins/fabricator/src/index.ts`.

**Option B**: In a custom API route handler, call `guild().kits()` and `guild().apparatuses()` to scan `kit.engines` and `apparatus.supportKit?.engines` directly — replicating the Fabricator's scan logic at query time. Does not require modifying Fabricator.

Neither option provides "contributing plugin" metadata from the Fabricator's perspective. The Fabricator's `EngineRegistry` stores designs by ID only, with no provenance tracking. To show which plugin contributed each design, we need to scan guild kits/apparatuses directly anyway.

### SpiderApi — no `listBlockTypes()`

`SpiderApi.getBlockType(id)` only works for known IDs. The `BlockTypeRegistry` is a `private Map<string, BlockType>` inside the Spider apparatus — not exposed. Same two options as above.

Again, provenance (contributing plugin) is not tracked by the registry. Scanning guild directly is the only way to show it.

### Block type `conditionSchema`

`BlockType.conditionSchema` is a `ZodSchema`. It's not directly JSON-serializable for display. The page would need to serialize it descriptively (e.g., call `.safeParse({})` to get the shape, or just show the block type ID and poll interval).

---

## Page Mechanism — How Oculus Serves Plugin Pages

From `packages/plugins/oculus/src/oculus.ts`:

1. Plugin contributes `supportKit.pages = [{ id, title, dir }]`
2. `dir` is resolved to `path.join(g.home, 'node_modules', packageName, dir)` — absolute filesystem path
3. Page served at `/pages/{id}/*` as static files
4. `index.html` at page root gets chrome injected: shared stylesheet link + nav bar with all pages
5. Non-HTML assets served as-is with correct MIME types
6. Directory traversal prevented via `..` check

**Implication for Spider page**: The static assets must live in a `dir` that is relative to the package root. During development (workspace packages), this works the same way since `g.home/node_modules/@shardworks/spider-apparatus` resolves to the workspace package. For the page to have dynamic content, the JS on the page must fetch from `/api/` routes.

---

## Adjacent Patterns — No Existing Page Contributions

No other plugin currently contributes a page via `OculusKit.pages`. The only existing pages in the Oculus are:
1. The home page `/` — generated inline as HTML string in `oculus.ts`
2. Static assets `/static/*` — served from `packages/plugins/oculus/src/static/`

The Spider page will be the **first external page contribution**. There's no sibling implementation to follow — only the mechanism itself to infer conventions from.

---

## The Clerk Page Gap

The brief says "links back to the writ on the clerk's page." No Clerk Oculus page exists. There is no `pages` contribution in `packages/plugins/clerk/`. The URL `/pages/clerk/` would 404.

**Options**:
- Link to a not-yet-built clerk page URL as a forward reference (the href would 404 if clerk page isn't present)
- Link to writ REST data (`/api/writ/show?id=...`) as a data fallback
- Omit the link entirely and just show the writ ID as text
- Treat this as a dependency: clerk page must be built first

---

## Spider Apparatus Plugin Identity

```
Package name: @shardworks/spider-apparatus
Plugin id:    spider
Path:         packages/plugins/spider/
Version:      0.0.0
```

Spider's `apparatus.requires: ['stacks', 'clerk', 'fabricator']` — all hard requirements.  
Spider's `apparatus.consumes: ['blockTypes']` — soft consumption.  
Spider has **no** `recommends` field currently.

---

## Oculus Page URL Structure (How It Works)

```
/pages/{id}/          → serves index.html with chrome injected
/pages/{id}/foo.js    → serves foo.js as-is
/pages/{id}/bar.css   → serves bar.css as-is
```

The Spider page would live at `/pages/spider/`.

Chrome injection adds:
- `<link rel="stylesheet" href="/static/style.css">` before `</head>`
- `<nav id="oculus-nav">` with links to `/` and all page IDs after `<body>`

The shared CSS (Tokyo Night theme, classes: `.card`, `.badge`, `.data-table`, `.badge--success/error/warning/info/active`, `.toolbar`, `.empty-state`) is at `/static/style.css`.

---

## Spider SpiderApi — Available For the Runtime UI

These methods are already on `SpiderApi` and can be called from custom route handlers:

```typescript
spider.show(id: string): Promise<RigDoc>          // full rig with all engine detail
spider.list(filters?: RigFilters): Promise<RigDoc[]>  // paginated, filterable by status
spider.forWrit(writId: string): Promise<RigDoc | null>  // find rig for a given writ
```

`list()` supports `status` filter and `limit`/`offset` pagination. No `writId` filter on list — must use `forWrit()` for per-writ lookups.

---

## Block Type Implementations (Spider Built-ins)

Four built-in block types, all in `packages/plugins/spider/src/block-types/`:

| ID | File | Poll interval | Condition schema |
|----|------|---------------|-----------------|
| `writ-status` | `writ-status.ts` | 10,000ms | `{ writId: string, targetStatus: string }` |
| `scheduled-time` | `scheduled-time.ts` | — (check file) | — |
| `book-updated` | `book-updated.ts` | — (check file) | — |
| `patron-input` | `patron-input.ts` | 10,000ms | `{ requestId: string }` |

---

## Engine Implementations (Spider Built-ins)

Five built-in engines, all in `packages/plugins/spider/src/engines/`:

| ID | File | Type | Description |
|----|------|------|-------------|
| `draft` | `draft.ts` | clockwork | Opens a draft binding via Scriptorium |
| `implement` | `implement.ts` | quick | Summons anima to implement the commission |
| `review` | `review.ts` | quick | Runs mechanical checks + reviewer anima |
| `revise` | `revise.ts` | quick | Summons anima to address review findings |
| `seal` | `seal.ts` | clockwork | Seals the draft via Scriptorium |

---

## Existing Tests

### `packages/plugins/oculus/src/oculus.test.ts`

Tests: server lifecycle, page serving, chrome injection, tool route mapping, custom routes, API tool index. Uses Node test runner (`node:test`). Builds mock `Guild` singleton with `setGuild`/`clearGuild`. Creates temp dirs for static assets. Tests `toolNameToRoute`, `permissionToMethod`, `coerceParams`, `injectChrome` as exported unit test targets.

### `packages/plugins/spider/src/spider.test.ts`

Tests: rig lifecycle, walk priority ordering, engine execution (clockwork and quick), failure propagation, CDC-driven writ transitions, template validation, block types, resume. Full integration fixture with in-memory Stacks, mock Clerk, mock Fabricator, mock Animator.

### `packages/plugins/spider/src/tools/tools.test.ts`

Tests: `crawl-one` and `crawl-continual` tool behaviors (indefinite mode, auto-stop, error handling, poll interval configuration). Mocks SpiderApi via guild singleton.

### `packages/plugins/spider/src/input-request.test.ts` and `input-request-validation.test.ts`

Tests for input request lifecycle.

---

## Key Configuration Shape for Config UI

The `SpiderConfig` (from `guild.json["spider"]`):

```typescript
interface SpiderConfig {
  pollIntervalMs?: number;       // default: 5000
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  variables?: Record<string, unknown>;
}
```

Available at runtime via `guild().guildConfig().spider` or via `GET /api/_status` (which returns the full `config` including the spider section).

---

## Doc/Code Discrepancies

1. **Spider doc (docs/architecture/apparatus/spider.md) describes a 5-engine static pipeline** but the actual code is now template-driven. The doc still says "`spawnStaticRig()` function" which no longer exists — it's been replaced by `lookupTemplate()` + `buildFromTemplate()`. The doc's `SpiderApi` is also missing `resume()`, `getBlockType()`, and the `RigFilters` type.

2. **Spider doc lists `requires: ['fabricator', 'clerk', 'stacks']`** — code has the same but also `consumes: ['blockTypes']` which the doc doesn't mention.

3. **Spider doc describes `CrawlResult` variants** — the actual type has additional variants (`engine-blocked`, `engine-unblocked`, `rig-blocked`) not in the doc.

---

## Notes on Implementation Technology

The Oculus page contribution system is deliberately technology-agnostic: any static directory with an `index.html` works. The frontend can use vanilla HTML/CSS/JS, or pre-compiled frameworks (React, Svelte, etc.) whose output is committed as built assets. Looking at the Oculus home page, it uses server-generated HTML strings with heavy escaping.

For the Spider page:
- **Custom API routes** are the right approach for dynamic data (rig list, rig detail, config inspection)
- The routes must be defined in TypeScript and contributed via `supportKit.routes` — they run in the same Hono server as everything else
- Frontend JS fetches from these routes and from existing tool REST endpoints (`/api/rig/list`, `/api/rig/show`)
- Sorting/filtering in the UI can happen either client-side (JS) or server-side (query params to custom routes)
