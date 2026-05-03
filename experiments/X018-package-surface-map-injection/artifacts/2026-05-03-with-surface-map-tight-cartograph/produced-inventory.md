## Brief summary

Collapse the cartograph's three companion books (`cartograph/visions`, `cartograph/charges`, `cartograph/pieces`) into a single `writ.ext['cartograph'] = { stage, codex }` sub-slot. The `CartographApi` surface stays byte-for-byte stable; what changes is the storage substrate and the projection logic. Three `book.cartograph.*` Stacks book-event streams collapse to writ-type-filtered CDC on `clerk/writs`. Three sections of the surveying-cascade architecture doc must be updated to reflect the post-cleanup shape.

This is an internal-only refactor for the cartograph apparatus. Every external consumer (the patron-facing CLI, vision-apply, downstream substrates planned in Commission C) sees the same typed-API behavior; only the persistence layout and the CDC subscription point change.

---

## Scope and blast radius

### In scope (touched files)

- `packages/plugins/cartograph/src/cartograph.ts` — the apparatus core. Contains all six `createX`/`transitionX` methods, the `validateParent` helper, the `INITIAL_STAGE` constant, `VISION_INITIAL_STAGE_TO_PHASE`, the `isTerminalPhase` helper, the `supportKit.books` declaration, and the `start()` wiring.
- `packages/plugins/cartograph/src/types.ts` — `VisionDoc` / `ChargeDoc` / `PieceDoc` projection types, stage enums, filters, request types, `CartographApi` interface. Doc shape stays verbatim per brief §6 ("definitions can be retained verbatim — the only difference is where the data comes from").
- `packages/plugins/cartograph/src/index.ts` — barrel re-exports. Should not change.
- `packages/plugins/cartograph/src/tools/render.ts` — `composeShow` / `composeListRows` helpers feed the tools' projection logic. Both already accept the `Doc`-shaped projection; under the new model the projection is built from `writ.ext` rather than a row read.
- `packages/plugins/cartograph/src/tools/vision-create.ts`, `vision-show.ts`, `vision-list.ts`, `vision-patch.ts`, `vision-transition.ts` and the analogous five for charge and piece (15 thin tool wrappers). All route through the typed API; no contract change should require tool changes (modulo `vision-patch`'s explicit `updatedAt: new Date().toISOString()` patch payload, which becomes a no-op once `setWritExt` itself bumps `updatedAt`).
- `packages/plugins/cartograph/src/tools/vision-apply.ts` — the on-disk authoring tool. Calls `cartograph.createVision({ phase, stage })` (must keep the same call sig), `cartograph.transitionVision`, `cartograph.patchVision` (used for `{ stage }` and `{ codex }` patches), and `clerk.setWritExt(SURVEYOR_PLUGIN_ID, ...)` for surveyor hints. The surveyor stamp is a separate `ext` sub-slot keyed by `surveyor`, not `cartograph` — unaffected by this commission's storage migration.
- `packages/plugins/cartograph/src/cartograph.test.ts` — fixture stands up real stacks + clerk + cartograph. Pre-creates `cartograph/visions`, `cartograph/charges`, `cartograph/pieces` books via `memBackend.ensureBook(...)` (lines 133-141). Asserts CDC events on `cartograph/visions` book (line 342-364). Tests writ-type registration, parent invariants, lifecycle coupling, codex inheritance. The `apparatus shape` test (lines 911-935) explicitly asserts the three companion books are declared in `supportKit` with `['stage', 'codex', 'createdAt']` indexes — needs updating.
- `packages/plugins/cartograph/src/tools.test.ts` — exercises all 15 CLI tools through their handlers. Pre-creates the three cartograph books in the fixture (lines 147-155). No CDC assertions, but creates rely on book existence.
- `packages/plugins/cartograph/src/tools/vision-apply.test.ts` — full filesystem round-trip. Pre-creates the three cartograph books (lines 139-147). Asserts CDC event counts on `cartograph/visions` book in many tests (e.g. lines 241-242, 267-268, 280-281, 357, 368, 381, 396, 408, 420, 432, 444, 456, 492-493, 517-518, 527-528, 537-538). All of these need to migrate to count writs-book events filtered by `entry.type === 'vision'`.
- `packages/plugins/cartograph/README.md` — package docs. Lines 19-21 ("Three companion books..."), §`Companion documents` (lines 138-153), §`Books` table (lines 165-169), §`Support Kit` (lines 162-181) all reference the companion-book pattern. Concurrent doc updates needed.
- `docs/architecture/surveying-cascade.md` — explicitly named in brief §6:
  - **§3.4 Companion `SurveyDoc` holds envelope metadata only** (lines 175-191) — replace `books.surveys` description with `status['surveyor']` / `ext['surveyor']` slot conventions; drop `targetNodeId`, `rigName`, `completedAt` (already represented elsewhere).
  - **§3.6 Substrate watches cartograph CDC — single-event-per-apply guarantee** (lines 210-238) — replace the three book-event subscriptions with a single writ-type-filtered subscription on `clerk/writs`. Brief §6 specifies the exact replacement framing.
  - **§3.7 Substrate + extension + default plugin shape** (lines 241-266) — drop `books.surveys` from the substrate's owned-things list; replace `Stamps SurveyDoc on completion` with `Stamps status['surveyor'] on completion`.
- Incidental references in surveying-cascade.md outside the three named sections: line 66 (mermaid-style diagram), line 118 (vision authoring on disk), line 466 (worked example mentions `book.cartograph.visions.{created,updated}` indirectly via "CDC fires once"). Brief permits "minor incidental references elsewhere... touched up for consistency."

### Out of scope (explicitly per brief)

- The substrate (Commission C, `c-moji0ggh`) — design only; not built.
- Migrating any other companion-doc pattern (e.g. astrolabe `PlanDoc`).
- Reworking the `ext` API itself; consumes `setWritExt` as-is.
- Renaming the `VisionDoc` / `ChargeDoc` / `PieceDoc` projection types.
- Migrating historical companion-doc rows — brief: "The cartograph is recently-shipped and nothing in production-style guild data depends on those books."

### External consumers (none)

A grep across `packages/` and `docs/` for `cartograph-apparatus` finds zero references outside the cartograph package and the surveying-cascade doc. No other plugin imports `VisionDoc` / `ChargeDoc` / `PieceDoc` or the typed API. Blast radius is genuinely contained to the cartograph package + the one architecture doc.

The single literal reference to a vision/charge/piece writ type elsewhere in `packages/` is in `packages/plugins/clockworks/src/writ-lifecycle-observer.test.ts` (lines 360, 425, 431). Those tests use `'piece'` as a representative non-mandate type to verify the universal lifecycle contract — they do not depend on the cartograph apparatus or its books, just on the type name as a string. **Do not Read.**

---

## Load-bearing primitives the new code consumes

### `ClerkApi.setWritExt` — `packages/plugins/clerk/src/clerk.ts:1188-1213`

This is the single sanctioned slot-write path. Internal logic:

```typescript
async setWritExt(writId: string, pluginId: string, value: unknown): Promise<WritDoc> {
  if (!writId) throw new Error('setWritExt: writId is required.');
  if (!pluginId) throw new Error('setWritExt: pluginId is required.');

  return stacks.transaction(async (tx) => {
    const txWrits = tx.book<WritDoc>('clerk', 'writs');
    const existing = await txWrits.get(writId);
    if (!existing) throw new Error(`Writ "${writId}" not found.`);

    const prevExt = (existing.ext ?? {}) as Record<string, unknown>;
    const nextExt: Record<string, unknown> = { ...prevExt, [pluginId]: value };

    return txWrits.patch(writId, {
      ext: nextExt,
      updatedAt: new Date().toISOString(),
    });
  });
}
```

Three properties the new cartograph code relies on:

1. **Read-modify-write is transactional** — sibling sub-slots (e.g. `surveyor`) survive the cartograph's writes.
2. **`updatedAt` is bumped automatically** — cartograph tools no longer need to manually pass `updatedAt: new Date().toISOString()` (today's `vision-patch.ts` does this redundantly at line 37).
3. **Throws on missing writ** — error path matches today's `cartograph/visions` book `get()`-then-throw shape.

The `ClerkApi` type signature lives at `packages/plugins/clerk/src/types.ts:669-695`:

```typescript
setWritExt(writId: string, pluginId: string, value: unknown): Promise<WritDoc>;
```

### `StacksApi.transaction` nesting — `packages/plugins/stacks/src/stacks-core.ts:191-196`

```typescript
async runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
  // If already in a transaction, just run (no nesting — flattened)
  if (this.activeTx) {
    const txCtx = this.createTransactionContext();
    return fn(txCtx);
  }
  // ... open a new tx
}
```

**Critical**: nested `stacks.transaction(...)` calls flatten — they reuse the outer transaction. So the brief's atomicity requirement (wrap `clerk.transition` + `clerk.setWritExt` in one `stacks.transaction`) works trivially: `setWritExt` opens its own transaction internally, but if it's already inside one, it joins that one. Coalescing collapses the two writs-book writes into a single CDC update event.

Today's cartograph already exploits this: `createVision` opens a `stacks.transaction(...)` and then calls `txWritsBook.put(writ)` + `txVisionsBook.put(doc)` inside one boundary. The new code keeps the same outer wrapper but writes via `clerk.post` (which itself opens a tx) + `clerk.setWritExt` (also opens a tx) — both flatten into the outer.

### `clerk.transition` strips `ext` (silent) — `packages/plugins/clerk/src/clerk.ts:1146-1149`

```typescript
const { id: _id, phase: _phase, status: _status, ext: _ext,
        ...safeFields } = (fields ?? {}) as WritDoc;
```

`transition` cannot be used to write `ext` — the field is destructured out. This is the load-bearing reason why every operation that touches both `phase` and `ext['cartograph']` MUST use two separate calls (`clerk.transition` + `clerk.setWritExt`) wrapped in one `stacks.transaction`. Brief §3 codifies this.

### Stacks dot-notation in `where` clauses — `packages/plugins/stacks/src/conformance/tier4-edge-cases.ts:234-247`

```typescript
it('4.9e Compound index with dot-notation fields', async () => {
  t.backend.ensureBook(REF, { indexes: [['status', 'parent.id']] });
  // ...
  const results = await book.find({
    where: [['status', '=', 'active'], ['parent.id', '=', 'p1']],
  });
});
```

Dot-notation is supported in `where` clauses both for indexed and unindexed fields. SQLite backend uses `json_extract(content, '$.field')` (see `packages/plugins/stacks/src/sqlite-backend.ts:51-53`); memory backend uses `getNestedField` (see `packages/plugins/stacks/src/field-utils.ts:14`). Both work without an index — slower without (full scan), but functional.

This means `cartograph.listVisions({ stage: 'draft' })` can translate to:

```typescript
writsBook.find({
  where: [
    ['type', '=', 'vision'],
    ['ext.cartograph.stage', '=', 'draft'],
  ],
  orderBy: ['createdAt', 'desc'],
});
```

without requiring a new index. (Index discussion in decisions.)

### Reckoner precedent for `ext`-keyed reads — `packages/plugins/reckoner/src/tick.ts:247-272`

```typescript
const heldRaw: WritDoc[] = await writsBook.find({
  where: [['phase', '=', 'new']],
  orderBy: ['createdAt', 'asc'],
});

// Cheap pre-filter: drop writs that lack the Reckoner ext slot...
const heldPetitions: Array<{ writ: WritDoc; ext: ReckonerExt }> = [];
for (const w of heldRaw) {
  const ext = w.ext?.[RECKONER_PLUGIN_ID] as ReckonerExt | undefined;
  if (!ext) continue;
  // ...
  heldPetitions.push({ writ: w, ext });
}
```

Reckoner's pattern: query by indexed field (phase), then post-filter in memory by `ext.<plugin>` presence. Cartograph could mirror this (query by `type`, post-filter by `ext.cartograph.stage`) or use the dot-notation where-clause directly. Both are valid; the dot-notation approach is more declarative.

---

## Key types — current shapes (to be retained verbatim per brief)

### `VisionDoc` / `ChargeDoc` / `PieceDoc` — `packages/plugins/cartograph/src/types.ts:72-125`

```typescript
export interface VisionDoc {
  /** Index signature required to satisfy BookEntry. */
  [key: string]: unknown;
  /** The vision writ's id — primary key, matches the writ id. */
  id: string;
  /** Lifecycle stage. Coupled to `writ.phase` by the typed-API transition helpers. */
  stage: VisionStage;
  /** Codex this vision targets. Inherited from the writ at creation time. */
  codex?: string;
  /** ISO timestamp when the doc was created. */
  createdAt: string;
  /** ISO timestamp of the last mutation. */
  updatedAt: string;
}
```

`ChargeDoc` and `PieceDoc` are byte-shape identical except `stage: ChargeStage` / `stage: PieceStage`. Brief §6: "The existing `VisionDoc` / `ChargeDoc` / `PieceDoc` exported types stay as projection shapes (their definitions can be retained verbatim — the only difference is where the data comes from)." So the `[key: string]: unknown` index signature stays; it's no longer load-bearing for `BookEntry` constraint satisfaction (the doc is no longer stored in a book) but provides forward-compat for the projection type. The brief docstring on the type ("Index signature required to satisfy BookEntry") will be slightly inaccurate post-cleanup — concurrent doc updates needed.

### Stage enums — `packages/plugins/cartograph/src/types.ts:36-60`

```typescript
export type VisionStage = 'draft' | 'active' | 'sunset' | 'cancelled';
export type ChargeStage = 'draft' | 'active' | 'validated' | 'dropped';
export type PieceStage  = 'draft' | 'active' | 'done'      | 'dropped';
```

Three per-type enums; unchanged.

### `WritDoc.ext` shape — `packages/plugins/clerk/src/types.ts:122-157`

```typescript
ext?: Record<string, unknown>;
```

Plugin-keyed map. The cartograph's sub-slot will be `writ.ext['cartograph']` carrying `{ stage: VisionStage | ChargeStage | PieceStage; codex?: string }`.

### `CartographExt` (new type, per brief §1)

```typescript
interface CartographExt {
  stage: VisionStage | ChargeStage | PieceStage;
  codex?: string;
}
```

The brief says the slot's payload shape is `{ stage, codex }`. Whether to export this as a public type or keep it module-internal is a small decision (see decisions). The plugin id is `'cartograph'`.

### `WritFilters.phase` mandate-scoping caveat — `packages/plugins/clerk/src/types.ts:223-251`

```typescript
phase?: WritPhase | WritPhase[];
```

> "phase is mandate-scoped at the WHERE-clause level: when phase is supplied without type, the implementation implicitly adds `type = 'mandate'`..."

For cartograph's listX, this is irrelevant (we always pass `type: 'vision'` etc.). But it means the new code MUST always supply `type` when filtering — a bare `phase: 'open'` against the writs book returns mandate writs only, not vision writs.

---

## Adjacent patterns — apparatus that already use `writ.ext`

### Reckoner — `packages/plugins/reckoner/src/reckoner.ts`

Reckoner is the established precedent for a plugin that owns a `writ.ext.<plugin>` sub-slot. Apply this shape to cartograph:

- The plugin id (literal string `'reckoner'`) is held as a module constant `RECKONER_PLUGIN_ID = 'reckoner'`. Cartograph should mirror with `CARTOGRAPH_PLUGIN_ID = 'cartograph'`.
- Writes via `clerk.setWritExt(writId, RECKONER_PLUGIN_ID, value)`.
- Reads via `writ.ext?.[RECKONER_PLUGIN_ID] as ReckonerExt | undefined`.
- Refuses to overwrite if a slot is already present (for petition contracts; not applicable to cartograph).

`packages/plugins/reckoner/src/types.ts:117` documents the slot contract:

```typescript
/**
 * Shape of `writ.ext['reckoner']` — the contract slot a petitioner
 * stamps onto a writ to enter the petition queue.
 */
```

The cartograph's slot is simpler than reckoner's (just `{ stage, codex }`) and doesn't enforce a "stamp once" contract — cartograph rewrites freely on every transition/patch.

### Surveyor (future) — `packages/plugins/cartograph/src/tools/vision-apply.ts:38-47`

```typescript
const SURVEYOR_PLUGIN_ID = 'surveyor';
// ...
await clerk.setWritExt(doc.id, SURVEYOR_PLUGIN_ID, surveyorPayload);
```

Today vision-apply already writes a sibling `ext['surveyor']` sub-slot. Post-cleanup, vision-apply's slot writes increase: `cartograph.createVision` (which now writes `ext['cartograph']` internally) + `clerk.setWritExt(SURVEYOR_PLUGIN_ID, ...)`. These remain two separate operations on two separate slots; the brief says nothing about wrapping them — they're independently meaningful, and the surveyor slot's owner doesn't yet exist.

---

## Tests that count CDC events on the cartograph books

These tests will all break post-cleanup unless updated. The relevant idiom appears in three tests:

### `cartograph.test.ts:342-364` — `produces exactly one CDC event on the cartograph visions book per creation`

```typescript
fix.stacks.watch<VisionDoc>('cartograph', 'visions', (event) => {
  if (event.type === 'create') createCount += 1;
  if (event.type === 'update') updateCount += 1;
});
```

Migrate to: `fix.stacks.watch<WritDoc>('clerk', 'writs', (event) => { if (event.entry.type === 'vision') ... })`. Adjust counts: under the new flow, `createVision` produces a single writs-book CDC event (coalesced from put + setWritExt within one tx); `transitionVision` produces a single update event (coalesced from clerk.transition + setWritExt).

### `vision-apply.test.ts:159-166` — fixture-level CDC counter

```typescript
const cdc = { create: 0, update: 0, delete: 0 };
stacks.watch<VisionDoc>('cartograph', 'visions', (event) => {
  if (event.type === 'create') cdc.create += 1;
  // ...
});
```

Same migration pattern. Note that `vision-apply` writes `ext['surveyor']` *separately* after `createVision` returns — this is a second writs-book write outside the cartograph's transaction boundary. So `vision-apply`'s first-apply now produces 1 create event + 1 update event on the writs book (filtered to type === 'vision'). The current test asserts `(create: 1, update: 0)` — this will now be `(create: 1, update: 1)` unless vision-apply learns to wrap the cartograph create + surveyor stamp in a single outer `stacks.transaction`.

### `vision-apply.test.ts:537` — body-only edit asserts no visions-book mutation

```typescript
assert.equal(fix.cdc.update, 0, 'body-only edit does not mutate the cartograph visions book');
```

Today this works because the body lives on the writs book and the visions book holds only stage/codex. Post-cleanup, *both* live on the writs book — a body-only edit (via `clerk.edit`) does mutate the writs book. The assertion semantics shift: filter the watcher to only count events whose `prev.ext?.cartograph` differs from `entry.ext?.cartograph`, or rephrase the test (the cartograph metadata didn't change, even though the writ row did). This is a test rewrite, not a behavioral regression.

---

## Existing context

### Doc/code discrepancies (concurrent doc updates needed)

These are all on files this commission will already be touching, so the implementing artificer fixes inline:

- `packages/plugins/cartograph/src/types.ts:73-74` — `VisionDoc`'s `[key: string]: unknown` docstring says "Index signature required to satisfy BookEntry" — no longer accurate post-cleanup; it's now forward-compat for projection extension.
- `packages/plugins/cartograph/src/cartograph.ts:18-22` — module-level docstring describes "Three companion books (`visions`, `charges`, `pieces`) under owner id `cartograph` shadow each writ with a typed companion document" — must be rewritten.
- `packages/plugins/cartograph/src/cartograph.ts:27-33` — same module-docstring describes the `createX`/`transitionX` two-row write pattern; must be rewritten to describe the writ-row + setWritExt pair.
- `packages/plugins/cartograph/README.md:18-21, 138-153, 162-181` — the README lists the three companion books in multiple places; needs alignment.
- `packages/plugins/cartograph/README.md:97-103` — describes "Each createX opens a single stacks.transaction(...) and writes the writ row and the companion doc inside one atomic boundary" — refactor to the writ-row + setWritExt boundary phrasing.
- The 15 tool-file headers and instructions reference companion-doc behavior; light-touch edits to align ("companion doc" → projection or omit).

### No prior commission log entries for cartograph cleanup

Grepping the repo for prior commissions touching cartograph internals beyond the original ship: none found. This is the first follow-up commission against the original cartograph commission.

### No TODO/FIXME markers in cartograph

`grep TODO|FIXME|XXX packages/plugins/cartograph/src` finds nothing. The original code shipped clean.

---

## Doc/code discrepancies on files NOT being touched

None observed. The surveying-cascade doc references companion-book CDC and `books.surveys` — those are exactly the references the brief schedules for update.

---

## Configuration / startup

- Cartograph apparatus declares `requires: ['stacks', 'clerk']` and `recommends: ['oculus']`. None of these change.
- Cartograph registers `vision`, `charge`, `piece` writ types via `clerk.registerWritType` from `start()`. None of these change.
- `supportKit.books` — declares `visions`, `charges`, `pieces`. **All three book declarations get removed.** The `supportKit.tools` array (16 tools) stays unchanged.
- No guild config schema changes; the brief is silent on guild config and there's no `cartograph` config slot.

---

## Inventory completeness check

- Source files in cartograph package: 17 (.ts). All accounted for above.
- Tests: 3 test files in cartograph package (cartograph.test.ts, tools.test.ts, tools/vision-apply.test.ts). All accounted for.
- Architecture doc updates: surveying-cascade.md (3 named sections + minor incidental references). README.md (concurrent updates).
- External consumers of cartograph types: zero.
- Load-bearing primitives consumed: `clerk.setWritExt`, `clerk.transition`, `stacks.transaction` nesting flattening, dot-notation `where` queries.

