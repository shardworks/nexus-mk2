# Inventory — Cartograph: collapse companion docs into `writ.ext['cartograph']`

## Click references in the brief

The brief cites two clicks from a referenced design subtree:
- `c-moji050w` — "Cartograph + surveying cascade" parent design
- `c-moji0ggh` — Commission C (the surveyor-apparatus substrate)

Neither click resolves in this codex's Ratchet store (`No click found matching prefix …`). Treated as informational pointers only — the brief itself prescribes the cleanup in full. Inventory below is sourced from code, the cartograph package, and `docs/architecture/surveying-cascade.md`.

## Scope of change

Touching:
- `packages/plugins/cartograph/src/cartograph.ts` — full rewrite of the `createCartograph()` factory: drop the three companion-book handles, drop `INITIAL_STAGE`/`isTerminalPhase` helpers (or keep + repurpose), redo every `createX` / `transitionX` / `showX` / `listX` / `patchX` to read/write `writ.ext['cartograph']` instead of a companion doc.
- `packages/plugins/cartograph/src/types.ts` — keep `VisionDoc` / `ChargeDoc` / `PieceDoc` projection shapes verbatim (per brief), but add a non-exported internal type for the ext slot payload (or export it for reuse — see decisions). Stage enums stay. Filters stay. Create/Transition request shapes stay.
- `packages/plugins/cartograph/src/index.ts` — re-export surface stays unchanged (every export already there is part of the brief-stable API). `Do not Read.`
- `packages/plugins/cartograph/src/tools/render.ts` — `composeShow`, `composeListRows`, `renderListTable`, `renderShowText`, `renderShowJson` — all keep their public signatures (they take a `doc` and a writ projection); the only change needed is the source of `doc` (typed-API method now derives it from `writ.ext['cartograph']`). Effectively zero change to render.ts itself.
- `packages/plugins/cartograph/src/tools/{vision,charge,piece}-{create,show,list,patch,transition}.ts` — fifteen tools keep their handlers identical at the boundary; they delegate to the typed API which is the layer that changes. `Do not Read.` past spot-checking that nothing reaches into the companion books directly.
- `packages/plugins/cartograph/src/tools/vision-apply.ts` — needs an outer `stacks.transaction` wrapping `cartograph.createVision` + `clerk.setWritExt(SURVEYOR_PLUGIN_ID, …)` to preserve the single-event-per-apply guarantee for the writ-type-filtered substrate observer (see decision D10). Same wrap on the Nth-apply path's `clerk.edit` + `cartograph.transitionVision` + `clerk.setWritExt(surveyor)`.
- `packages/plugins/cartograph/src/cartograph.test.ts` — fixture stops calling `memBackend.ensureBook({ ownerId: 'cartograph', book: 'visions' / 'charges' / 'pieces' }, ...)`. The CDC-event assertions migrate from watching `cartograph/visions` to watching `clerk/writs` filtered by `writ.type === 'vision'`. Apparatus-shape tests asserting `supportKit.books = { visions, charges, pieces }` flip to asserting `supportKit.books === undefined` (or whatever shape — see D7).
- `packages/plugins/cartograph/src/tools.test.ts` — same fixture changes as cartograph.test.ts; happy-path assertions don't touch the companion books directly so they ride through unchanged.
- `packages/plugins/cartograph/src/tools/vision-apply.test.ts` — fixture changes; the "Exactly one CDC event on the cartograph visions book" assertion moves to "Exactly one writs-book event of type=vision" (and stays at 1 only if D10 lands; otherwise 2).
- `packages/plugins/cartograph/README.md` — sections "Companion documents", "Books", and the architectural commentary in the preamble all assume the companion-book pattern. Tag `concurrent doc updates needed` — the implementing artificer rewrites these inline.
- `docs/architecture/surveying-cascade.md` — three load-bearing sections (§3.4 SurveyDoc shape, §3.6 substrate watches CDC, §3.7 substrate plugin shape) get the brief-prescribed rewrite. Plus minor incidental updates at lines 39, 44, 64, 66, 228, 245, 256, 730 (see *Surveying-cascade arch doc references* below) for terminology consistency.

Touching for read-only context (no code changes expected):
- `packages/plugins/clerk/src/clerk.ts` — the `setWritExt` implementation and the `transition` field-stripping behavior. `Do not Read.` past reading the relevant excerpts inlined below.
- `packages/plugins/clerk/src/types.ts` — `WritDoc.ext` / `WritDoc.codex` field semantics; `setWritExt` API contract. Excerpts inlined.
- `packages/plugins/stacks/src/stacks-core.ts` — `runTransaction` flatten-on-nest behavior. Excerpt inlined.
- `packages/plugins/stacks/src/cdc.ts` — `coalesceEvents` collapses multiple updates within one transaction into one event per doc. Excerpt inlined.
- `packages/plugins/stacks/src/sqlite-backend.ts` — `json_extract` query support for nested-field WHERE clauses (e.g. `ext.cartograph.stage`). Excerpt inlined.
- `docs/guild-metaphor.md` lines 183-187 — descriptive references to cartograph/surveyor; not implementation-level. `Do not Read.`
- `docs/architecture/index.md` line 286 — descriptive reference to "the cartograph-decomposition substrate"; not implementation-level. `Do not Read.`

Not touching:
- `@shardworks/astrolabe-apparatus` — astrolabe's `PlanDoc` companion-book pattern is brief-explicitly out of scope. PlanDoc is mostly content (inventory, scope, decisions, spec), not metadata-only.
- The `clerk.setWritExt` API itself — the brief explicitly out-of-scopes any rework.
- The plugin id `cartograph` — fixed by the brief and already used as the `ownerId` of the companion books today; carries forward as the `ext['cartograph']` key.

Cross-cutting blast radius — exhaustive grep:
- `cartograph` / `VisionDoc` / `ChargeDoc` / `PieceDoc` / `VisionStage` / `ChargeStage` / `PieceStage` / `CartographApi` outside the cartograph package itself appear only in:
  - `pnpm-lock.yaml` (lockfile — auto-managed)
  - `packages/plugins/clockworks-stacks-signals/src/clockworks-stacks-signals.ts` line 191 — a comment ("mirrors cartograph's pattern"); no semantic dependency
  - `docs/guild-metaphor.md` lines 183-187 — descriptive role text
  - `docs/architecture/surveying-cascade.md` — the load-bearing arch doc the brief targets
  - `docs/architecture/index.md` line 286 — descriptive
- No production package imports from `@shardworks/cartograph-apparatus`. The cartograph is a leaf in the dep graph for now (Commission C, the surveyor substrate, is the planned downstream consumer).
- The `ownerId === 'cartograph'` substring appears in `cartograph.ts` (book handles), `cartograph.test.ts` (memBackend.ensureBook calls), and `tools.test.ts` / `vision-apply.test.ts` (same). All three fixtures need the same teardown.

## Key types and signatures

### `WritDoc.ext` and `WritDoc.codex` (clerk types.ts)

```typescript
export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;            // 'vision' | 'charge' | 'piece' | 'mandate' | …
  phase: string;           // state machine name from the registered WritTypeConfig
  status?: Record<string, unknown>;  // plugin-keyed observation slot
  ext?: Record<string, unknown>;     // plugin-keyed metadata slot — `ext['cartograph']` is the new home
  title: string;
  body: string;
  codex?: string;          // writ-level codex; pre-existing field
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolution?: string;
}
```

The `ext` slot's contract (clerk types.ts docstring):
- Plugin-keyed map (`Record<PluginId, unknown>`); ownership convention-only.
- Single sanctioned write path is `ClerkApi.setWritExt(writId, pluginId, value)` — does a transactional read-modify-write so sibling sub-slots are preserved under concurrent writers.
- `transition()` silently strips `ext` from its body. The cartograph cleanup leans on this: a `transitionX` that wants to write both `writ.phase` and `writ.ext['cartograph']` cannot smuggle ext through `transition`'s fields argument.
- Generic `put()` / `patch()` on the writs book WOULD wholesale-replace the slot and clobber sibling sub-slots — so they are not supported slot-write paths. The cartograph must use `setWritExt` (or replicate its read-modify-write inline inside the same transaction, which is what `setWritExt` does).
- The slot survives terminal phase transitions.

### `ClerkApi.setWritExt` (clerk types.ts docstring + clerk.ts implementation)

```typescript
setWritExt(writId: string, pluginId: string, value: unknown): Promise<WritDoc>;
```

Implementation (clerk.ts:1188–1213):
```typescript
async setWritExt(writId, pluginId, value) {
  if (!writId) throw new Error('setWritExt: writId is required.');
  if (!pluginId) throw new Error('setWritExt: pluginId is required.');
  return stacks.transaction(async (tx) => {
    const txWrits = tx.book<WritDoc>('clerk', 'writs');
    const existing = await txWrits.get(writId);
    if (!existing) throw new Error(`Writ "${writId}" not found.`);
    const prevExt = (existing.ext ?? {}) as Record<string, unknown>;
    const nextExt = { ...prevExt, [pluginId]: value };
    return txWrits.patch(writId, { ext: nextExt, updatedAt: new Date().toISOString() });
  });
}
```

Each call bumps `updatedAt`. Validation throws on missing writ. `value` is opaque — Clerk does not validate sub-slot contents. **Composition with an outer `stacks.transaction` works** (see *Stacks transaction flattening* below) — the inner `stacks.transaction` reuses the active tx.

### `ClerkApi.transition` (clerk types.ts + clerk.ts:1065–1159)

```typescript
transition(id: string, to: WritPhase, fields?: Partial<WritDoc>): Promise<WritDoc>;
```

Behaviorally relevant facts:
- Validates target phase against the writ's current state's `allowedTransitions` (per the registered `WritTypeConfig`).
- Strips managed fields from the `fields` argument: `id`, `phase`, `status`, **`ext`**, `createdAt`, `updatedAt`, `resolvedAt`, `parentId`. `ext` is silently stripped because `patch` would wholesale-replace the slot and clobber sibling sub-slots — `setWritExt` is the only sanctioned write path.
- Throws if `fields.phase` is a non-empty string ("caller bug — state machine owns phase").
- Stamps `resolvedAt` on terminal transitions; carries `resolution` if supplied in fields.
- Used by cartograph today only inside the test ("rolls back both writes when the transition fails") — the production `transitionX` does NOT call `clerk.transition`; it inlines the validation. The brief asks us to switch to using `clerk.transition` + `clerk.setWritExt`.

### `ClerkApi.post` (clerk.ts:650–724)

```typescript
post(request: PostCommissionRequest): Promise<WritDoc>;
```

Validates type, resolves initial phase from registry, generates id, generates timestamps, validates parent (when `parentId` is supplied), inherits codex from parent. **For posts WITHOUT `parentId`, runs as a single `writs.put` (no transaction); for posts WITH `parentId`, opens its own `stacks.transaction`.** Both paths flatten cleanly into an outer transaction. The current cartograph inlines clerk.post's validation byte-for-byte (per the comment in cartograph.ts:303-307); the cleanup can swap that for delegation.

### `CartographApi` projection types (cartograph types.ts) — UNCHANGED by this commission

```typescript
interface VisionDoc { id: string; stage: VisionStage; codex?: string; createdAt: string; updatedAt: string; [key: string]: unknown; }
interface ChargeDoc { id: string; stage: ChargeStage; codex?: string; createdAt: string; updatedAt: string; [key: string]: unknown; }
interface PieceDoc  { id: string; stage: PieceStage;  codex?: string; createdAt: string; updatedAt: string; [key: string]: unknown; }

type VisionStage = 'draft' | 'active' | 'sunset' | 'cancelled';
type ChargeStage = 'draft' | 'active' | 'validated' | 'dropped';
type PieceStage  = 'draft' | 'active' | 'done' | 'dropped';

interface CartographApi {
  createVision(req: CreateVisionRequest): Promise<VisionDoc>;
  showVision(id: string): Promise<VisionDoc>;
  listVisions(filters?: VisionFilters): Promise<VisionDoc[]>;
  patchVision(id: string, fields: Partial<Omit<VisionDoc, 'id'>>): Promise<VisionDoc>;
  transitionVision(id: string, request: TransitionVisionRequest): Promise<VisionDoc>;
  // …mirror methods for charge and piece
}
```

The brief's CartographExt sub-slot shape:
```typescript
interface CartographExt {
  stage: VisionStage | ChargeStage | PieceStage;  // type depends on the writ type
  codex?: string;
}
```

`createdAt` / `updatedAt` on the projection now source from the writ's own timestamps (per brief). Stage and codex on the projection source from `writ.ext['cartograph']`.

### Existing companion-book handles (cartograph.ts:183-185, 721-723) — TO BE DELETED

```typescript
let visionsBook: Book<VisionDoc>;
let chargesBook: Book<ChargeDoc>;
let piecesBook: Book<PieceDoc>;

// In start():
visionsBook = stacks.book<VisionDoc>('cartograph', 'visions');
chargesBook = stacks.book<ChargeDoc>('cartograph', 'charges');
piecesBook = stacks.book<PieceDoc>('cartograph', 'pieces');
```

And the `supportKit.books` block (cartograph.ts:682-686) — TO BE DELETED:
```typescript
books: {
  visions: { indexes: ['stage', 'codex', 'createdAt'] },
  charges: { indexes: ['stage', 'codex', 'createdAt'] },
  pieces:  { indexes: ['stage', 'codex', 'createdAt'] },
},
```

## Adjacent patterns

### Stacks transaction flattening — composition of clerk methods inside an outer txn

`stacks-core.ts:191-242`:
```typescript
async runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
  // If already in a transaction, just run (no nesting — flattened)
  if (this.activeTx) {
    const txCtx = this.createTransactionContext();
    return fn(txCtx);
  }
  // …open new backend tx, buffer events, fire Phase 1 in tx, fire Phase 2 after commit
}
```

Implication: an outer cartograph `stacks.transaction(async () => { await clerk.post(...); await clerk.setWritExt(...); })` collapses both inner clerk methods (each of which would normally open its own transaction) into one backend transaction. Two writs-book patches, two phase-1 events buffered → coalesced to one CDC event after commit (see next section). This is the load-bearing primitive that lets the brief's "wrap clerk.transition + clerk.setWritExt in one stacks.transaction" pattern work.

### CDC event coalescing — multiple patches in one txn collapse to one event

`cdc.ts:87-149` `coalesceEvents`:
- `update(s) → update` collapses to one update with the first event's `prev` and the last event's `entry`.
- `create → update(s)` collapses to one create with the final state.

Implication: in a `transitionX` flow that does `clerk.transition` (writes phase) then `clerk.setWritExt` (writes ext.cartograph) under one outer txn, the writs book sees one final-state update per phase transition, not two. This is what the substrate observer would see after the cleanup — and is what preserves the "one CDC event per logical operation" guarantee in the surveying-cascade arch doc.

### Stacks JSON-path query support — filtering on `writ.ext['cartograph'].stage`

`sqlite-backend.ts:47-54`:
```typescript
function toJsonPath(field: string): string {
  return '$.' + validateFieldName(field);
}
function jsonExtract(field: string): string {
  return `json_extract(content, '${toJsonPath(field)}')`;
}
```

`query.ts:14-21`:
```typescript
const SAFE_FIELD_RE = /^[A-Za-z0-9_.-]+$/;
export function validateFieldName(field: string): string { … }
```

`field-utils.ts:14-22` (memory backend uses the same nested access):
```typescript
export function getNestedField(obj, field) {
  const parts = field.split('.');
  // walks nested objects via dot-notation
}
```

Implication: `stacks.book<WritDoc>('clerk', 'writs').find({ where: [['type', '=', 'vision'], ['ext.cartograph.stage', '=', 'active']] })` is a supported query. SQLite renders `json_extract(content, '$.ext.cartograph.stage') = ?`. No new index is needed for correctness; without one, the query is a full table scan with json_extract per row (the `[type]` index on writs narrows the candidate set). Existing writs-book indexes: `phase`, `type`, `createdAt`, `parentId`, `[phase, type]`, `[phase, createdAt]`, `[parentId, phase]`. No `codex` index, no `ext.*` index.

### Astrolabe PlanDoc — explicitly OUT of scope, but the precedent worth knowing

Astrolabe's PlanDoc lives in its own book (`astrolabe/plans`) and carries content (inventory, scope, decisions, spec, observations) — not metadata. The brief carves it out: PlanDoc is not a metadata-only companion; the cleanup pattern doesn't apply.

### Existing `tx.book<WritDoc>('clerk', 'writs')` usage in cartograph

The current cartograph already reaches into the writs book directly inside its transactions (cartograph.ts:309, 369, 422, 493, 547, 619). Privileged cross-plugin access is the established pattern — the typed-API atomicity contract requires it. The cleanup continues this pattern (or moves to `clerk.post` / `clerk.transition` / `clerk.setWritExt` composition — see decisions).

## Atomicity walkthrough — what the new createX / transitionX bodies look like

Reference shape (illustrative; not prescriptive):

`createVision`:
```typescript
async createVision(request) {
  // …validate request.stage / request.phase pair as today
  return stacks.transaction(async () => {
    const writ = await clerk.post({
      type: 'vision', title, body,
      ...(codex !== undefined ? { codex } : {}),
    });
    // If the requested initial phase isn't the type's `initial`, transition to it.
    if (writ.phase !== requestedPhase) {
      await clerk.transition(writ.id, requestedPhase);
    }
    const updated = await clerk.setWritExt(writ.id, 'cartograph', {
      stage: requestedStage,
      ...(codex !== undefined ? { codex } : {}),
    });
    return projectVision(updated);  // derive VisionDoc from updated writ
  });
}
```

`transitionVision`:
```typescript
async transitionVision(id, req) {
  return stacks.transaction(async () => {
    const writ = await clerk.show(id);
    if (writ.type !== 'vision') throw new Error(`Writ "${id}" is not a vision (type="${writ.type}").`);
    await clerk.transition(id, req.phase, { ...(req.resolution !== undefined ? { resolution: req.resolution } : {}) });
    const prevExt = (writ.ext?.['cartograph'] as { stage?: string; codex?: string }) ?? {};
    const updated = await clerk.setWritExt(id, 'cartograph', {
      stage: req.stage,
      ...(prevExt.codex !== undefined ? { codex: prevExt.codex } : {}),
    });
    return projectVision(updated);
  });
}
```

`showVision`:
```typescript
async showVision(id) {
  const writ = await clerk.show(id);
  if (writ.type !== 'vision') throw new Error(`Writ "${id}" is not a vision (type="${writ.type}").`);
  return projectVision(writ);  // throws if writ.ext.cartograph is missing — see decision D6
}
```

`listVisions`:
```typescript
async listVisions(filters) {
  const writsBook = stacks.book<WritDoc>('clerk', 'writs');
  const where: WhereClause = [['type', '=', 'vision']];
  if (filters?.stage !== undefined) where.push(['ext.cartograph.stage', '=', filters.stage]);
  if (filters?.codex !== undefined) where.push(['codex', '=', filters.codex]);  // or 'ext.cartograph.codex' — see D5
  const writs = await writsBook.find({ where, orderBy: ['createdAt', 'desc'], limit: filters?.limit ?? 20, ...(filters?.offset !== undefined ? { offset: filters.offset } : {}) });
  return writs.map(projectVision);
}
```

`projectVision` helper (illustrative):
```typescript
function projectVision(writ: WritDoc): VisionDoc {
  const ext = writ.ext?.['cartograph'] as { stage?: VisionStage; codex?: string } | undefined;
  if (!ext || ext.stage === undefined) {
    throw new Error(`Writ "${writ.id}" has no cartograph metadata (ext.cartograph missing). Cartograph writs must be created via the typed API.`);
  }
  return {
    id: writ.id,
    stage: ext.stage,
    ...(ext.codex !== undefined ? { codex: ext.codex } : {}),
    createdAt: writ.createdAt,
    updatedAt: writ.updatedAt,
  };
}
```

## vision-apply — single-event-per-apply ramification

Today (pre-cleanup):
1. `cartograph.createVision(...)` opens its own txn → 1 event on `cartograph/visions` book + 1 event on `clerk/writs` book.
2. `clerk.setWritExt(SURVEYOR_PLUGIN_ID, ...)` opens its own txn → 1 more event on `clerk/writs` book.

The original "single-event-per-apply" contract was about the `cartograph/visions` book: 1 event there per apply.

After cleanup:
- The `cartograph/visions` book is gone.
- The substrate observer subscribes to `clerk/writs` filtered by `writ.type ∈ {vision, charge, piece}` (per the brief's §3.6 update).
- If `cartograph.createVision` and `clerk.setWritExt(surveyor)` each open their own txn, the substrate observer sees TWO events per apply.
- Wrapping both in an outer `stacks.transaction` (and relying on Stacks' coalescing) collapses to ONE event.

Decision D10 selects the wrap-in-outer-txn path so the single-event-per-apply guarantee carries forward. Affects vision-apply's first-apply path AND the Nth-apply path (where the wrap also covers `clerk.edit` + `cartograph.transitionVision` + `clerk.setWritExt(surveyor)`).

## Surveying-cascade arch doc references

Load-bearing sections per the brief (`docs/architecture/surveying-cascade.md`):
- §3.4 (line 175) — SurveyDoc shape; rewrite per brief: drop SurveyDoc as a separate book, lift envelope metadata to `status['surveyor']` / `ext['surveyor']` on the survey writ. Note that `targetNodeId` is `writ.parentId` (drop), `rigName` is `writ.type` (drop), `completedAt` is redundant with `writ.resolvedAt` (drop).
- §3.6 (lines 210-238) — substrate watches CDC; the three book-event streams collapse to one writ-type-filtered subscription on the writs book. The single-event-per-apply discussion's mechanism shifts from "wrap createVision + transition" to "createX/transitionX are already transactional."
- §3.7 (lines 240-266) — substrate plugin shape; drop `books.surveys` from the substrate-owned list, drop "Stamps SurveyDoc on completion" → replace with "Stamps `status['surveyor']` on completion."

Incidental references that need touching for consistency (per brief permission to do so):
- Line 39 (Vocabulary table — Vision row): "snapshotted into a writ + VisionDoc" → "snapshotted into a vision writ" (VisionDoc still exists as a projection but referencing it here muddies the post-cleanup picture).
- Line 44 (Vocabulary table — SurveyDoc row): rewrite to reflect §3.4's new shape (no separate book; envelope metadata lives in `status['surveyor']` / `ext['surveyor']`).
- Line 64 (end-to-end flow): "creates or updates the vision writ + VisionDoc (one transaction)" → "creates or updates the vision writ (one transaction; both writ row and `ext['cartograph']` slot)."
- Line 66 (end-to-end flow): "emits Stacks CDC: book.cartograph.visions.{created,updated}" → "emits Stacks CDC: book.clerk.writs.{created,updated} (substrate filters by writ.type)."
- Line 228 (single-event-per-apply paragraph): "write writ + companion doc + final stage in one Stacks transaction" → "write writ + `ext['cartograph']` + final stage in one Stacks transaction (or use `cartograph.createX`'s built-in atomicity)."
- Line 245 (substrate-shape list — cartograph row): "Vision/charge/piece writ types + companion docs + ladder-invariant API" → "Vision/charge/piece writ types + `ext['cartograph']` slot + ladder-invariant API."
- Line 256 (substrate-shape list — SurveyDoc bullet): aligned with §3.7 rewrite.
- Line 730 (Related documents — cartograph README link): "vision/charge/piece writ types, companion docs, the CartographApi" → "vision/charge/piece writ types, the `ext['cartograph']` slot, the CartographApi."

## Concurrent doc updates needed

The cartograph package documentation describes the companion-book pattern extensively and will need to be updated alongside the code:
- `packages/plugins/cartograph/README.md` — the "Companion documents", "Books", "Support Kit" sections all assume the companion-book storage. Specifically: the preamble (lines 19-21 — "Three companion books (`visions`, `charges`, `pieces`)…"), the section-headers and tables in the "Companion documents" section (lines 138-148), the entire "Books" subsection of "Support Kit" (lines 162-169). These rewrite inline as the artificer's first action; not a separate observation.
- `packages/plugins/cartograph/src/cartograph.ts` file-level docstring (lines 18-33) describes the companion-book pattern; rewrite inline.
- `packages/plugins/cartograph/src/types.ts` file-level docstring (lines 1-16) and the per-type `VisionDoc`/`ChargeDoc`/`PieceDoc` doc-comments referencing "companion doc" / "companion book"; rewrite inline.
- `packages/plugins/cartograph/src/tools/render.ts` file-level docstring's mention of the companion-doc pattern (lines 4-9); rewrite inline.

## Pre-existing context

- The cartograph apparatus is recently-shipped (per the brief). No long-lived production data using it; the brief explicitly disclaims migration of historical companion-doc rows.
- The plugin id `cartograph` is the established `ownerId` of the three companion books being deleted; carries forward as the `ext['cartograph']` key. Continuity is convention-only — no runtime guard.
- The `vision-keeper.md` placeholder file at the cartograph package root is a stub for a future agent runtime (per cartograph README §"What is *not* in this commission"); unrelated to this cleanup.
- Stacks index reconciliation is per-plugin: each plugin only contributes indexes for books it owns. Cartograph cannot add indexes to the Clerk-owned `writs` book directly via `supportKit.books`. (Bears on D3.)
- The cartograph already uses `stacks.book<WritDoc>('clerk', 'writs')` via `tx.book(...)` inside its create/transition transactions to validate parents and write the writ row. Cross-plugin direct-book access is precedented.
- `MemoryBackend.ensureBook` is a test-only helper; tests pre-create books with their declared indexes since the production `Stacks` reconciliation flow doesn't run inside the unit-test fixture. The fixture pattern is duplicated across `cartograph.test.ts`, `tools.test.ts`, `vision-apply.test.ts`.

## Doc/code discrepancies

None in the load-bearing path. The surveying-cascade arch doc is the one that will be wrong post-cleanup — the brief includes its update as part of the commission, which fixes it inline. No latent bugs surfaced during the read.

