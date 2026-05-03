# Cartograph: collapse companion docs into `writ.ext['cartograph']`

## Intent

Collapse the cartograph's three companion books (`cartograph/visions`, `cartograph/charges`, `cartograph/pieces`) into a single `writ.ext['cartograph'] = { stage, codex }` sub-slot, removing the books entirely. The `CartographApi` surface stays byte-for-byte stable; only the storage substrate and projection logic change. Update the surveying-cascade architecture doc so Commission C (the surveyor-apparatus substrate) is briefed against the post-cleanup shape.

## Rationale

The companion-doc pattern was a pre-`writ.ext` workaround for plugin-owned writ metadata. Now that `clerk.setWritExt` exists as the sanctioned slot-write path, three Stacks books carrying nothing but `{stage, codex, createdAt, updatedAt}` (where the timestamps duplicate the writ's own) are exactly what `ext` was added to replace. The downstream substrate work (Commission C) is best designed against the post-cleanup shape — its CDC observer becomes a writ-type-filtered subscription on `clerk/writs` rather than three per-companion-book subscriptions.

## Scope & Blast Radius

Two coherent slices, both internal to a tightly contained surface area.

**Slice 1 — Cartograph apparatus storage migration (the `cartograph-apparatus` package).**

- The apparatus core (`cartograph.ts`): all six `createX`/`transitionX` methods, the three `patchX`/`showX`/`listX` triples, the `validateParent` helper, the `INITIAL_STAGE` table, the `VISION_INITIAL_STAGE_TO_PHASE` map, the `isTerminalPhase` helper, the `supportKit.books` declaration, and the `start()` wiring.
- Public types (`types.ts`): the `VisionDoc` / `ChargeDoc` / `PieceDoc` projection types stay verbatim per D10. A new `CartographExt` slot type is introduced and exported.
- Tools (`tools/render.ts` plus the 15 thin tool wrappers under `tools/`): the projection helpers already accept `Doc`-shaped projections — under the new model the projection is built from `writ.ext` rather than a row read. The `vision-patch.ts` handler's redundant `updatedAt: new Date().toISOString()` patch payload is removed (D14). The `vision-apply.ts` author tool grows an outer `stacks.transaction` wrapping the cartograph create + the surveyor `setWritExt` (D13).
- Tests (`cartograph.test.ts`, `tools.test.ts`, `tools/vision-apply.test.ts`): three test files migrate. The fixtures stop pre-creating the three cartograph books. CDC watchers migrate from `stacks.watch<VisionDoc>('cartograph','visions',...)` to `stacks.watch<WritDoc>('clerk','writs',...)` filtered by `entry.type` (D12). The `apparatus shape` test that asserts on `supportKit.books` is rewritten to assert the books are absent. The body-only-edit assertion that today checks the visions book wasn't mutated is rephrased to check that the cartograph metadata in `ext['cartograph']` was not mutated.
- Concurrent doc updates: the cartograph package `README.md` (companion-book references in §header, §`Companion documents`, §`Books` table, §`Support Kit`); the `cartograph.ts` module docstring; the `VisionDoc` `[key: string]: unknown` docstring (which currently says "required to satisfy BookEntry" — no longer accurate per D10).

**Slice 2 — Surveying-cascade architecture doc (`docs/architecture/surveying-cascade.md`).** Per D15 (thorough sweep), update:

- §3.4 (`Companion SurveyDoc holds envelope metadata only`) — replace the `SurveyDoc`/`books.surveys` framing with `status['surveyor']` / `ext['surveyor']` slot conventions on the survey writ. Drop `targetNodeId` (already `writ.parentId`), `rigName` (already `writ.type`), and `completedAt` (redundant with `writ.resolvedAt`).
- §3.6 (`Substrate watches cartograph CDC`) — replace the three book-event subscriptions with a single subscription on `clerk/writs` filtered by `writ.type ∈ {vision, charge, piece}`. Reframe the single-event-per-apply guarantee from "wrap createVision + transition in one transaction" to "the cartograph's createX/transitionX primitives are already transactional" with the same outcome.
- §3.7 (`Substrate + extension + default plugin shape`) — drop `books.surveys` from the substrate-owned-things list; replace `Stamps SurveyDoc on completion` with `Stamps status['surveyor'] on completion`.
- Incidental references swept along with the named sections: the §1 vocabulary table row for `SurveyDoc`; the §2 mermaid-style flow diagram (`emits Stacks CDC: book.cartograph.visions.{created,updated}`); the §4.2 worked-example reference to the `single-event-per-apply guarantee` framing.

**Cross-cutting concerns to verify with grep, not enumerate:**

- After the books are removed, grep `packages/` for any residual `'cartograph'`-as-book-owner references (`stacks.watch('cartograph', ...)`, `book<VisionDoc>('cartograph', ...)`, `ensureBook('cartograph/visions', ...)`, etc.). Should return only the test fixtures being rewritten — verify nothing outside the cartograph package owned a reference to the three books.
- Grep `docs/` for `book.cartograph` and `cartograph/visions` / `cartograph/charges` / `cartograph/pieces`. The only legitimate hit post-cleanup is the surveying-cascade doc's *historical* references in already-rewritten sections; if you find a hit elsewhere, sweep it.
- Grep both `packages/` and `docs/` for `SurveyDoc` after the §3.4 rewrite — the term should appear nowhere except possibly in commit history references.

The single literal reference to a vision/charge/piece writ type elsewhere in `packages/` is in `packages/plugins/clockworks/src/writ-lifecycle-observer.test.ts` (lines 360, 425, 431) where `'piece'` is used as a representative non-mandate type. Those tests do not depend on the cartograph apparatus or its books. **Do not Read.**

No external consumer outside the cartograph package imports `VisionDoc` / `ChargeDoc` / `PieceDoc` or the typed API. Blast radius is genuinely contained to the cartograph package + the one architecture doc.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | How is atomicity achieved when writing the writ row + `ext['cartograph']` (createX) and `writ.phase` + `ext['cartograph'].stage` (transitionX)? | Each createX / transitionX opens a single outer `stacks.transaction(...)`. Inside, call `clerk.post` (or `clerk.transition`) followed by `clerk.setWritExt`. Both join the outer tx via flattening; one CDC update event coalesces from the pair. | Brief §3 prescribes this exact shape; flattening primitive already exists; brief explicitly carves out cartograph-side wrapping. |
| D2 | Should createX delegate to `clerk.post()` or write directly to the writs book? | Delegate to `clerk.post`. Inside the outer `stacks.transaction`, call `clerk.post(...)` then `clerk.setWritExt(...)`; both nested transactions flatten. | Stacks transaction nesting flattens, so `clerk.post`'s internal transaction joins cartograph's outer wrapper. Eliminates 100+ lines of duplicated parent-validation / codex-inheritance / id-generation logic. |
| D3 | How does showX / listX read the projection? | Use `clerk.show(id)` for showX; use `clerk.list({ type: 'vision' \| 'charge' \| 'piece', ... })` for listX, then project to `Doc` shape. | `clerk.list({ type })` correctly bypasses the mandate-implicit phase filter (only triggered when phase is supplied without type). `clerk.show` is the natural single-row primitive; cartograph already uses it in `tools/render.ts`. |
| D4 | How does listX implement the stage filter? | Post-filter in memory. Call `clerk.list({ type })`, then filter by `entry.ext?.cartograph?.stage === stage`. | Reckoner precedent: query by indexed top-level field, post-filter on `ext.<plugin>.*` in memory. Keeps the typed surface routing through `clerk.list` (matches D3). Filter selectivity is high; total row count is small at v0 scale. |
| D5 | Where does codex live as the source of truth? | Both `writ.codex` (clerk's native field) and `ext.cartograph.codex` are kept synced atomically. On createX, `clerk.post({ codex })` sets `writ.codex` and the same outer transaction stamps `ext.cartograph.codex` via `setWritExt`. On `patchX({ codex })`, both writes happen in one outer `stacks.transaction`. Projection reads from `ext` per brief. | Brief §1 explicitly defines `{ stage, codex }` in `CartographExt`. Allowing the cartograph view and the writ view to drift on post-create `patchVision({codex})` calls is a fail-silent failure mode. The dual-write is small and lives inside the cartograph's transaction boundary. |
| D6 | Does `patchX({stage})` (direct stage edits without phase change) remain supported? | Preserve semantics. `patchX({stage: 'X'})` updates `ext.cartograph.stage` via `setWritExt` without touching `writ.phase`. | Brief commits "argument shapes... stay." `patchX` accepts `Partial<Omit<TDoc, 'id'>>`, which includes `stage`. The known divergence path (vision-apply's stage-drifted-without-phase-drifted case) is rare but real. |
| D7 | Should the apparatus continue to declare books in `supportKit`? | Remove the entire `supportKit.books` property. Cartograph contributes only writ types and tools. | Brief explicitly says the three books are removed entirely. No external consumer reads them. Empty/deprecated alternatives just confuse a reader. |
| D8 | Should `CartographExt` be exported as a public type? | Export publicly from the package's index. | Reckoner precedent — public ext types make slot reads typed for downstream consumers (Commission C will need to read the slot). |
| D9 | Should the literal string `'cartograph'` be hoisted to a named constant? | Yes — define `CARTOGRAPH_PLUGIN_ID = 'cartograph'` and use it everywhere the slot key is referenced. | Reckoner precedent (`RECKONER_PLUGIN_ID`). A typo on a literal-string slot key fails silently (the read returns undefined); a named constant fails at compile time. |
| D10 | Should the `[key: string]: unknown` index signature on `VisionDoc` / `ChargeDoc` / `PieceDoc` be retained? | Retain verbatim. The docstring (which currently says "required to satisfy BookEntry") is updated to reflect "projection extension" rather than `BookEntry`. | Brief says definitions can be retained verbatim. Forward-compat for projection extension is a cheap win. |
| D11 | Should clerk's writs book gain an index on `ext.cartograph.stage` for stage-filtered listX queries? | No index. Accept full-table `json_extract` scan; rely on D4's post-filter. | Adding a cartograph-specific index to clerk's schema is an ownership inversion. Lifted as observation O1 for the broader cross-cutting question. |
| D12 | When CDC tests assert event counts, should they migrate to a writs-book watcher filtered by `entry.type`, or be dropped? | Migrate the watcher. Replace `stacks.watch<VisionDoc>('cartograph','visions',...)` with `stacks.watch<WritDoc>('clerk','writs', evt => { if (evt.entry?.type === 'vision') ... })`; translate counts. | The single-event-per-apply invariant is real. Dropping the assertions loses regression coverage at the place that matters most for the substrate. |
| D13 | Should `vision-apply.ts` wrap `cartograph.createVision` + the surveyor `setWritExt` in a single outer `stacks.transaction`? | Yes. Both writes flatten into the outer tx; coalescing yields one writs-book create event per first-apply. | The substrate's single-event-per-apply guarantee depends on the call site producing one event. The defensive dedup in surveying-cascade §3.6 is a backstop, not the primary guarantee. |
| D14 | Should `vision-patch.ts`'s manual `updatedAt: new Date().toISOString()` patch payload be removed? | Remove. `setWritExt` bumps `updatedAt` itself. | Manual `updatedAt` was needed when the doc was a separate row. Post-cleanup it's the same field. Dead code removal. |
| D15 | How thorough should the surveying-cascade arch doc rewrite be? | Thorough sweep. Update the three named sections (§3.4, §3.6, §3.7) plus all incidental references — §1 vocab table `SurveyDoc` row, §2 mermaid flow diagram CDC arrow, §4.2 worked-example reference. | Brief permits "minor incidental references elsewhere... touched up for consistency." The patron's stated motivation (Commission C briefed against post-cleanup shape) is undermined by leaving the mermaid diagram still saying `book.cartograph.visions.{created,updated}`. |

## Acceptance Signal

1. `pnpm -w typecheck` passes.
2. `pnpm -w test` passes — including all migrated CDC-watcher assertions in `cartograph.test.ts`, `tools.test.ts`, and `tools/vision-apply.test.ts`.
3. Grep confirms blast-radius cleanliness:
   - `grep -rn "cartograph/visions\|cartograph/charges\|cartograph/pieces" packages/ docs/` returns no hits except in commit-history-style references (none expected outside the rewritten surveying-cascade sections).
   - `grep -rn "stacks.watch.*['\"]cartograph['\"]" packages/` returns zero hits.
   - `grep -rn "ensureBook.*cartograph" packages/` returns zero hits.
   - `grep -rn "SurveyDoc\|books\.surveys" docs/architecture/surveying-cascade.md` returns zero hits.
4. The cartograph apparatus's `supportKit` declaration contains no `books` property (or the property is omitted entirely).
5. A first-apply through `nsg vision apply` (a typed-API path covered by `tools/vision-apply.test.ts`) produces exactly one CDC event on `clerk/writs` filtered by `entry.type === 'vision'`. (Asserted by the migrated CDC counter; one event because vision-apply wraps the cartograph create + surveyor stamp in a single outer transaction per D13.)
6. All 15 cartograph CLI tools execute end-to-end under `tools.test.ts` without the test fixture pre-creating any cartograph book.
7. The `CartographExt` type is exported from the cartograph package's public surface, with shape `{ stage; codex? }`.

## Reference Material

### `ClerkApi.setWritExt` — the single sanctioned slot-write path

Source: `packages/plugins/clerk/src/clerk.ts:1188-1213`. Role: API to call from cartograph's createX, transitionX, and patchX.

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

Three load-bearing properties the new cartograph code relies on:

1. Read-modify-write is transactional — sibling sub-slots (e.g. `surveyor`) survive the cartograph's writes.
2. `updatedAt` is bumped automatically — cartograph tools no longer need to manually pass `updatedAt`.
3. Throws on missing writ — error path matches today's `cartograph/visions` book `get()`-then-throw shape.

Public type signature (source: `packages/plugins/clerk/src/types.ts:669-695`):

```typescript
setWritExt(writId: string, pluginId: string, value: unknown): Promise<WritDoc>;
```

### `clerk.transition` strips `ext` silently

Source: `packages/plugins/clerk/src/clerk.ts:1146-1149`. Role: load-bearing reason that every operation touching both `phase` and `ext['cartograph']` MUST use two separate calls (`clerk.transition` + `clerk.setWritExt`) wrapped in one `stacks.transaction`.

```typescript
const { id: _id, phase: _phase, status: _status, ext: _ext,
        ...safeFields } = (fields ?? {}) as WritDoc;
```

### `StacksApi.transaction` nesting flattens

Source: `packages/plugins/stacks/src/stacks-core.ts:191-196`. Role: load-bearing primitive that makes D1 and D2 atomic with one outer wrapper.

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

Practical consequence: `clerk.post` and `clerk.setWritExt` each open their own internal `stacks.transaction`. When called inside an outer `stacks.transaction`, they flatten into the outer one. CDC events are coalesced — a `put` followed by a `patch` on the same writ row inside one tx surfaces as a single create event downstream.

### Reckoner — adjacent precedent for `ext` sub-slot ownership

Source: `packages/plugins/reckoner/src/reckoner.ts` and `tick.ts`. Role: pattern to mirror for the `CARTOGRAPH_PLUGIN_ID` constant (D9), the public `CartographExt` type export (D8), and the post-filter list pattern (D4).

The plugin id is held as a module constant `RECKONER_PLUGIN_ID = 'reckoner'`. Writes go via `clerk.setWritExt(writId, RECKONER_PLUGIN_ID, value)`. Reads project via `writ.ext?.[RECKONER_PLUGIN_ID] as ReckonerExt | undefined`.

The post-filter pattern (`packages/plugins/reckoner/src/tick.ts:247-272`):

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

The `ReckonerExt` slot type (`packages/plugins/reckoner/src/types.ts:117`) is documented and exported publicly; mirror this for `CartographExt`.

### Existing `VisionDoc` / `ChargeDoc` / `PieceDoc` projection types — retained verbatim per D10

Source: `packages/plugins/cartograph/src/types.ts:72-125`. Role: projection shapes that the typed-API methods continue to return. The `[key: string]: unknown` index signature stays; the docstring explaining it is updated (it currently says "required to satisfy BookEntry" which is no longer accurate post-cleanup — it's now forward-compat for projection extension).

```typescript
export interface VisionDoc {
  /** Index signature required to satisfy BookEntry. */    // ← docstring updated
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

`ChargeDoc` and `PieceDoc` are byte-shape identical except for `stage: ChargeStage` / `stage: PieceStage`.

### Stage enums — unchanged

Source: `packages/plugins/cartograph/src/types.ts:36-60`.

```typescript
export type VisionStage = 'draft' | 'active' | 'sunset' | 'cancelled';
export type ChargeStage = 'draft' | 'active' | 'validated' | 'dropped';
export type PieceStage  = 'draft' | 'active' | 'done'      | 'dropped';
```

### `WritDoc.ext` shape

Source: `packages/plugins/clerk/src/types.ts:122-157`.

```typescript
ext?: Record<string, unknown>;
```

Plugin-keyed map. The cartograph's sub-slot is `writ.ext['cartograph']` carrying `{ stage; codex? }`.

### `WritFilters.phase` mandate-scoping caveat

Source: `packages/plugins/clerk/src/types.ts:223-251`.

> "phase is mandate-scoped at the WHERE-clause level: when phase is supplied without type, the implementation implicitly adds `type = 'mandate'`..."

For cartograph's listX, this means the new code MUST always supply `type` when filtering — a bare `phase: 'open'` against the writs book returns mandate writs only.

### Stacks dot-notation in `where` clauses (informational)

Source: `packages/plugins/stacks/src/conformance/tier4-edge-cases.ts:234-247`. Role: documents that dot-notation `where` queries against `ext.cartograph.stage` would work without an index, in case a future commission decides to migrate listX off the post-filter pattern. Not used by this commission per D4 / D11.

### Vision-apply's surveyor stamp — relevant call-site for D13

Source: `packages/plugins/cartograph/src/tools/vision-apply.ts:38-47` (current shape).

```typescript
const SURVEYOR_PLUGIN_ID = 'surveyor';
// ...
await clerk.setWritExt(doc.id, SURVEYOR_PLUGIN_ID, surveyorPayload);
```

Today this runs *outside* `cartograph.createVision`. Per D13 the implementer wraps `cartograph.createVision(...)` and this `clerk.setWritExt(SURVEYOR_PLUGIN_ID, ...)` call in a single outer `stacks.transaction(async () => { ... })` so coalescing yields one writs-book create event per first-apply. The same applies wherever vision-apply pairs a cartograph mutation with a surveyor stamp on the same writ during one logical apply.

### Surveying-cascade §3.4 — current shape (to be rewritten per S2 / D15)

Source: `docs/architecture/surveying-cascade.md:175-191`.

```markdown
### 3.4 Companion `SurveyDoc` holds envelope metadata only

```typescript
interface SurveyDoc {
  id: string;             // primary key — the survey writ id
  targetNodeId: string;   // the cartograph node being surveyed
  rigName: string;        // 'survey-vision' | 'survey-charge' | 'survey-piece'
  rigVersion: string;     // for replay / diffing across rig versions
  surveyorId: string;     // which surveyor implementation ran
  completedAt: string;    // ISO timestamp
  // notes are NOT here — they live in writ.body
}
```

Owned by the surveyor-apparatus substrate; shared across all surveyor
implementations.
```

Replacement framing per the original mandate body: the survey-writ envelope metadata (`rigVersion`, `surveyorId`) lives in `status['surveyor']` / `ext['surveyor']` sub-slots on the survey writ. `targetNodeId` is already `writ.parentId`. `rigName` is already `writ.type`. `completedAt` is redundant with `writ.resolvedAt`. The substrate is the only writer.

### Surveying-cascade §3.6 — current shape

Source: `docs/architecture/surveying-cascade.md:210-238`.

The current text lists three book-event streams (`book.cartograph.visions.{created,updated}`, `book.cartograph.charges.{created,updated}`, `book.cartograph.pieces.{created,updated}`). Replacement: a single subscription on the writs book filtered by `writ.type ∈ {vision, charge, piece}`. Reframe the single-event-per-apply guarantee from "wrap createVision + transition in one transaction" to "the cartograph's createX/transitionX primitives are already transactional" with the same outcome (one CDC-significant phase transition per apply). The defensive dedup in the substrate observer stays.

### Surveying-cascade §3.7 — current shape

Source: `docs/architecture/surveying-cascade.md:241-266`.

```markdown
2. **`@shardworks/surveyor-apparatus`** *(substrate)*
   - Owns survey writ types and `books.surveys`
   - ...
   - Stamps SurveyDoc on completion (rig fills `writ.body`; substrate
     wraps the writ)
```

Replacement: drop the `books.surveys` ownership line. Replace `Stamps SurveyDoc on completion` with `Stamps status['surveyor'] on completion`.

### Surveying-cascade §1 vocabulary row, §2 mermaid arrow, §4.2 worked-example reference (D15 thorough sweep)

- §1 (`docs/architecture/surveying-cascade.md:44`) — the `SurveyDoc` row in the vocabulary table is dropped or re-described as `status['surveyor']` / `ext['surveyor']` slots on the survey writ.
- §2 (`docs/architecture/surveying-cascade.md:66`) — the mermaid-style flow diagram line `emits Stacks CDC: book.cartograph.visions.{created,updated}` is rewritten to refer to a single `clerk/writs` CDC event filtered by `writ.type`.
- §4.2 (`docs/architecture/surveying-cascade.md:462-466`) — the worked-example phrase `CDC fires once (per the single-event-per-apply guarantee)` stays semantically; rewrite the explanatory framing if it references the per-companion-book CDC by name.

## What NOT To Do

- **Do not migrate `SurveyDoc` itself.** Commission C (the surveyor-apparatus substrate) does not exist yet. This commission updates the architecture doc to reflect the post-cleanup shape so Commission C is briefed against it; it does not build the substrate.
- **Do not migrate other companion-doc patterns** (Astrolabe `PlanDoc` and similar). Out of scope.
- **Do not rework the `ext` API itself.** This commission consumes `clerk.setWritExt`; do not extend it. In particular do NOT add an `ext` parameter to `clerk.post` (rejected as decision D2 option C).
- **Do not extend `ClerkApi` with a transition-with-ext primitive.** The atomicity is achieved cartograph-side via `stacks.transaction` flattening (D1 option B was explicitly rejected).
- **Do not rename the `VisionDoc` / `ChargeDoc` / `PieceDoc` types.** They keep their names and shapes.
- **Do not migrate historical companion-doc rows.** The cartograph is recently-shipped; no production-style guild data depends on the books.
- **Do not add an index on `ext.cartograph.stage` to clerk's writs book.** D11: cross-package ownership inversion; deferred to observation O1 as a substrate-level question.
- **Do not drop CDC-counting test assertions.** D12: migrate the watcher (writs book + `entry.type` filter), don't bypass the regression coverage.
- **Do not rewrite the `tools/render.ts` projection helpers' arity or shape.** They already accept `Doc`-shaped projections; only their input source changes.
- **Do not write directly to the writs book** via `tx.book<WritDoc>('clerk','writs').put` from inside cartograph (D2 option A). All writs-book writes route through the clerk typed surface (`clerk.post` for create, `clerk.setWritExt` for ext, `clerk.transition` for phase, direct stacks `patch` only for the post-create `writ.codex` sync per D5).
- **Do not let the cartograph view of codex drift from `writ.codex`.** D5: both fields must be set in the same outer `stacks.transaction` on createX and `patchX({codex})`.

<task-manifest>
  <task id="t1">
    <name>Introduce CartographExt type, plugin-id constant, and projection-doc docstring updates</name>
    <files>packages/plugins/cartograph/src/types.ts, packages/plugins/cartograph/src/index.ts</files>
    <action>Define and publicly export `CartographExt` (shape: `{ stage: VisionStage | ChargeStage | PieceStage; codex?: string }`) and a `CARTOGRAPH_PLUGIN_ID = 'cartograph'` constant from the package's public surface (re-exported from `index.ts`), mirroring the Reckoner precedent referenced in Reference Material. Update the docstring on the `[key: string]: unknown` index signature in `VisionDoc`/`ChargeDoc`/`PieceDoc` to reflect "projection extension" rather than "required to satisfy BookEntry" per D10. Do not change the projection types' field shapes — they stay verbatim.</action>
    <verify>pnpm -w --filter @shardworks/cartograph-apparatus typecheck</verify>
    <done>The cartograph package exports `CartographExt` and `CARTOGRAPH_PLUGIN_ID` from its public surface; projection-doc docstrings are accurate; typecheck passes locally for the package.</done>
  </task>

  <task id="t2">
    <name>Rewrite cartograph apparatus core to back the typed API on writ.ext</name>
    <files>packages/plugins/cartograph/src/cartograph.ts</files>
    <action>Rewrite the apparatus core so the six createX/transitionX methods, the three patchX methods, and the three showX/listX triples back onto `writ.ext['cartograph']` instead of the companion books. Per D1 + D2: each createX opens a single outer `stacks.transaction(...)` and inside calls `clerk.post(...)` then `clerk.setWritExt(CARTOGRAPH_PLUGIN_ID, { stage, codex })`; if the requested initial stage isn't the writ-type's initial state, the same transaction transitions the writ to the matching phase via `clerk.transition`. Each transitionX wraps `clerk.transition` + `clerk.setWritExt` in one outer `stacks.transaction`. Per D5: createX and `patchX({codex})` keep `writ.codex` and `ext.cartograph.codex` synced atomically inside the outer transaction (post-create codex updates use a direct stacks `patch` on the writs book row inside the outer tx, since `clerk.edit` rejects post-`new` codex changes). Per D6: `patchX({stage})` updates `ext.cartograph.stage` via `setWritExt` without touching `writ.phase`. Per D3 + D4: showX uses `clerk.show(id)` and projects from `writ.ext['cartograph']`; listX uses `clerk.list({ type })` then post-filters in memory by `entry.ext?.cartograph?.stage` and projects. Per D7: remove the `supportKit.books` declaration entirely (the apparatus contributes only writ types and tools). Rewrite the module-level docstring to describe the writ-row + setWritExt boundary instead of the companion-doc dual-write pattern. Use the named constant from t1 everywhere the slot key is referenced.</action>
    <verify>pnpm -w --filter @shardworks/cartograph-apparatus typecheck && pnpm -w --filter @shardworks/cartograph-apparatus test -- cartograph.test.ts</verify>
    <done>cartograph.ts contains no `this.visionsBook`/`this.chargesBook`/`this.piecesBook` references, no `supportKit.books` property, no `tx.book<WritDoc>('clerk','writs').put` calls; all six create/transition methods use the wrap-clerk-calls-in-stacks-transaction pattern; the apparatus-level cartograph.test.ts cases relevant to API behavior pass (CDC tests are migrated in t4).</done>
  </task>

  <task id="t3">
    <name>Adjust cartograph CLI tool wrappers — vision-patch updatedAt cleanup, vision-apply atomicity wrap</name>
    <files>packages/plugins/cartograph/src/tools/vision-patch.ts, packages/plugins/cartograph/src/tools/vision-apply.ts, the analogous patch tools for charge/piece, packages/plugins/cartograph/src/tools/render.ts</files>
    <action>Per D14: remove the redundant `updatedAt: new Date().toISOString()` argument the patch tool currently passes to `cartograph.patchX` — `setWritExt` bumps `updatedAt` itself. Per D13: in `vision-apply.ts`, wrap the `cartograph.createVision(...)` call and the subsequent `clerk.setWritExt(SURVEYOR_PLUGIN_ID, ...)` call in a single outer `stacks.transaction(async () => { ... })` so coalescing yields one writs-book create event per first-apply. The same wrapping applies to any other vision-apply path that pairs a cartograph mutation with a surveyor stamp on the same writ during one logical apply. Light-touch updates to tool-file headers/instructions that reference companion-doc behavior — align language to "writ.ext['cartograph']" / "projection". `tools/render.ts` already accepts `Doc`-shaped projections — verify no signature change is needed.</action>
    <verify>pnpm -w --filter @shardworks/cartograph-apparatus typecheck</verify>
    <done>vision-patch.ts no longer passes a manual updatedAt; vision-apply.ts wraps the cartograph create + surveyor stamp in one outer stacks.transaction; tool-file docstrings are consistent with the post-cleanup storage model.</done>
  </task>

  <task id="t4">
    <name>Migrate cartograph test fixtures and CDC assertions to the writs book</name>
    <files>packages/plugins/cartograph/src/cartograph.test.ts, packages/plugins/cartograph/src/tools.test.ts, packages/plugins/cartograph/src/tools/vision-apply.test.ts</files>
    <action>Per D7: stop pre-creating `cartograph/visions`, `cartograph/charges`, `cartograph/pieces` books in the test fixtures (the `memBackend.ensureBook(...)` calls). Per D12: replace `stacks.watch<VisionDoc>('cartograph','visions',...)` / `('cartograph','charges',...)` / `('cartograph','pieces',...)` with `stacks.watch<WritDoc>('clerk','writs', evt => { if (evt.entry?.type === 'vision'|'charge'|'piece') ... })` and translate event counts (a coalesced create+setWritExt inside one tx surfaces as a single create event on the writs book). Rewrite the `apparatus shape` test in cartograph.test.ts that today asserts the three companion books are declared in `supportKit` with `['stage','codex','createdAt']` indexes — assert instead that `supportKit.books` is absent (or undefined). Rephrase the body-only-edit assertion in vision-apply.test.ts (currently `'body-only edit does not mutate the cartograph visions book'`) to assert the cartograph metadata in `entry.ext?.cartograph` did not change (since the writs row itself does mutate when the body is edited). Adjust the fixture-level CDC counter in vision-apply.test.ts to reflect that vision-apply now produces one create event per first-apply (D13 wrapping coalesces the pair) rather than the two-event count of the old model.</action>
    <verify>pnpm -w --filter @shardworks/cartograph-apparatus test</verify>
    <done>All three cartograph test files pass; no fixture pre-creates a cartograph book; CDC watchers are on `clerk/writs` filtered by `entry.type`; the apparatus-shape test asserts no `supportKit.books`; the vision-apply test asserts one writs-book create event per first-apply.</done>
  </task>

  <task id="t5">
    <name>Sweep the cartograph package README to reflect the post-cleanup storage model</name>
    <files>packages/plugins/cartograph/README.md</files>
    <action>Update the package README's references to the companion-book pattern: §header (the "Three companion books..." paragraph), §`Companion documents`, §`Books` table, §`Support Kit`, and §`Atomicity` (currently says "Each createX opens a single stacks.transaction(...) and writes the writ row and the companion doc inside one atomic boundary"). Replacement framing: storage lives in `writ.ext['cartograph'] = { stage, codex }`; atomicity is achieved by wrapping `clerk.post`/`clerk.transition` + `clerk.setWritExt` in a single outer `stacks.transaction` (which flattens the inner clerk transactions into one). The `supportKit.books` table row is removed. The `CartographExt` type is documented as the public slot contract.</action>
    <verify>grep -n "companion book\|cartograph/visions\|cartograph/charges\|cartograph/pieces\|supportKit.books" packages/plugins/cartograph/README.md</verify>
    <done>README.md contains no residual references to the companion-book pattern; the `CartographExt` slot is documented as the public contract; the grep returns no hits.</done>
  </task>

  <task id="t6">
    <name>Rewrite the surveying-cascade architecture document for the post-cleanup shape</name>
    <files>docs/architecture/surveying-cascade.md</files>
    <action>Per S2 + D15 (thorough sweep): rewrite the three named sections inline. §3.4 — replace the `SurveyDoc` interface block with text describing how the survey-writ envelope metadata lives in `status['surveyor']` / `ext['surveyor']` slots; drop `targetNodeId` (already `writ.parentId`), `rigName` (already `writ.type`), and `completedAt` (redundant with `writ.resolvedAt`). §3.6 — replace the three book-event subscription lines with a single `clerk/writs`-filtered-by-`writ.type` subscription; reframe the single-event-per-apply guarantee from "wrap createVision + transition in one transaction" to "the cartograph's createX/transitionX primitives are already transactional" with the same outcome; keep the defensive dedup paragraph. §3.7 — drop `Owns survey writ types and books.surveys` (rewrite to `Owns survey writ types`); replace `Stamps SurveyDoc on completion` with `Stamps status['surveyor'] on completion`. Sweep the incidental references: §1 vocabulary table `SurveyDoc` row (drop or rewrite to `status['surveyor']` / `ext['surveyor']`); §2 mermaid-style flow diagram line `emits Stacks CDC: book.cartograph.visions.{created,updated}` (rewrite to a single `clerk/writs` CDC event filtered by writ type); §4.2 worked-example wording around the single-event-per-apply guarantee. The doc must read coherently end-to-end after the sweep.</action>
    <verify>grep -n "SurveyDoc\|books\.surveys\|book\.cartograph\.visions\|book\.cartograph\.charges\|book\.cartograph\.pieces" docs/architecture/surveying-cascade.md</verify>
    <done>The doc grep returns zero hits; §3.4, §3.6, §3.7 read consistently with the post-cleanup storage model; the §1 vocabulary table, §2 mermaid diagram, and §4.2 worked example reflect the writ-type-filtered CDC subscription model.</done>
  </task>

  <task id="t7">
    <name>Final cross-package blast-radius sweep</name>
    <files>packages/, docs/</files>
    <action>Run the verification greps named in Acceptance Signal across the whole monorepo. If any hit lands outside the cartograph package's own commit-cleaned files or the rewritten surveying-cascade doc, sweep it. Specifically: `grep -rn "stacks.watch.*['\"]cartograph['\"]" packages/`, `grep -rn "ensureBook.*cartograph" packages/`, `grep -rn "cartograph/visions\|cartograph/charges\|cartograph/pieces" packages/ docs/`, `grep -rn "SurveyDoc\|books\.surveys" docs/architecture/surveying-cascade.md`. The clockworks test (`writ-lifecycle-observer.test.ts`) using `'piece'` as a representative non-mandate type is unrelated and should be left alone.</action>
    <verify>pnpm -w typecheck && pnpm -w test</verify>
    <done>Workspace typecheck and test both pass; the four blast-radius greps return only the (zero) hits described in the Acceptance Signal section.</done>
  </task>
</task-manifest>

