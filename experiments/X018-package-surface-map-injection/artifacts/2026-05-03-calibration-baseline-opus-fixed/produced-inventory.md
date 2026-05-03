
# Inventory — Cartograph: collapse companion docs into `writ.ext['cartograph']`

This commission collapses three Stacks companion books (`cartograph/visions`,
`cartograph/charges`, `cartograph/pieces`) into a single per-writ
`writ.ext['cartograph'] = { stage, codex }` sub-slot. The typed `CartographApi`
surface stays byte-stable; the projection types `VisionDoc` / `ChargeDoc` /
`PieceDoc` keep their shape. The work is internal to one package + three
sections of one architecture doc.

---

## 1. The cartograph package

`packages/plugins/cartograph/` — the only package that owns this code path.

### 1.1 `src/cartograph.ts` (~750 lines)

The apparatus factory and the entirety of the `CartographApi` implementation.
This is the heart of the change.

Key elements that move:

- **Three writ-type configs** (`VISION_CONFIG` / `CHARGE_CONFIG` / `PIECE_CONFIG`)
  — six-state mandate-clone, no `childrenBehavior`. **Unchanged** by this
  commission; they keep their declarations and stay registered with the Clerk.
- **`INITIAL_STAGE = 'draft'`** constant — used in the createX paths.
- **`VISION_INITIAL_STAGE_TO_PHASE`** mapping — `{ draft: 'new', active: 'open' }`
  for the `createVision({ stage })` shortcut.
- **`isTerminalPhase(writ, getConfig)`** helper — local replication of
  `clerk.isTerminal()` to avoid mid-tx round-trips. Stays.
- **`buildListQuery(filters)`** — Stacks `BookQuery` builder for the three
  list paths. Currently builds against companion-book fields (`stage`, `codex`,
  `createdAt`); post-cleanup must build against the writs book using
  `['type', '=', <type>]` + nested `['ext.cartograph.stage', '=', <stage>]`
  + `['codex', '=', <codex>]`. Stacks supports dot-notation nested fields
  (Stacks conformance test 3.11; SQLite backend translates to
  `json_extract(content, '$.ext.cartograph.stage')`).
- **`validateParent(txWritsBook, parentId, childId, options)`** — parent
  existence + not-terminal + parent-type guard. Stays.
- **`createVision` / `createCharge` / `createPiece`** — currently each opens
  one `stacks.transaction(...)`, validates parent (where applicable), writes
  the writ row at the requested phase via `txWritsBook.put(writ)`, then writes
  the companion doc via `txXBook.put(doc)`. Post-cleanup the companion-book
  write is replaced by an `ext` write inside the same transaction (D1).
- **`showVision` / `showCharge` / `showPiece`** — currently
  `<book>.get(id)` → throw if missing. Post-cleanup each must `clerk.show(id)`,
  reject when `writ.type !== <expected>`, then project to the matching Doc
  shape (D6).
- **`listVisions` / `listCharges` / `listPieces`** — currently
  `<book>.find(buildListQuery(filters))`. Post-cleanup each queries the
  writs book filtered by `type` + nested `ext.cartograph.stage` + `codex`,
  projects each result.
- **`patchVision` / `patchCharge` / `patchPiece`** — currently
  `<book>.patch(id, fields)`. Post-cleanup must route per field: `codex`
  to `writ.codex` (D4); `stage` to `writ.ext.cartograph.stage` via
  `clerk.setWritExt`; reject `createdAt`/`updatedAt`/`id`. Today only
  `vision-patch.ts` exposes `--codex` from the CLI, but the typed-API
  signature accepts `Partial<Omit<VisionDoc, 'id'>>` and `vision-apply.ts`
  calls `patchVision(boundId, { stage })` — both call sites must keep working.
- **`transitionVision` / `transitionCharge` / `transitionPiece`** —
  currently each opens a `stacks.transaction(...)`, validates phase
  edges by hand against the registered config, calls `txWritsBook.patch`
  with the new phase + (terminal) `resolvedAt` + optional `resolution`,
  then `txXBook.patch(id, { stage, updatedAt })`. Post-cleanup each must
  wrap `clerk.transition(id, phase, { resolution })` and
  `clerk.setWritExt(id, 'cartograph', { stage, codex })` in one
  `stacks.transaction` (per the brief's §3 atomicity rule). See D2 on
  whether the in-flight phase-edge validation stays inline or delegates
  to `clerk.transition`.
- **`return { apparatus: { ... } }`** — the `supportKit.books` block
  declares `visions`, `charges`, `pieces` with indexes
  `['stage', 'codex', 'createdAt']`. **Drop entirely** (S2). The `start()`
  method opens `stacks.book('cartograph', 'visions'/'charges'/'pieces')`
  closures — those handles vanish too.

The factory's `requires: ['stacks', 'clerk']` and `recommends: ['oculus']`
stay. `supportKit.tools` (16 tool entries) stays.

### 1.2 `src/types.ts`

Public types:

- **Stage enums** — `VisionStage = 'draft'|'active'|'sunset'|'cancelled'`;
  `ChargeStage = 'draft'|'active'|'validated'|'dropped'`;
  `PieceStage = 'draft'|'active'|'done'|'dropped'`. Stay verbatim.
- **`VisionDoc` / `ChargeDoc` / `PieceDoc`** — current shape:
  ```typescript
  interface VisionDoc {
    [key: string]: unknown;            // BookEntry index sig — see D9
    id: string;
    stage: VisionStage;
    codex?: string;
    createdAt: string;
    updatedAt: string;
  }
  ```
  Post-cleanup these become **projection shapes** rather than
  `BookEntry`-bearing rows. Per brief: "definitions can be retained
  verbatim — the only difference is where the data comes from." The
  `[key: string]: unknown` index signature was needed to satisfy
  `BookEntry`. Post-cleanup the projection no longer needs it; D9
  decides whether to keep the index signature for forward-compat.
- **`VisionFilters` / `ChargeFilters` / `PieceFilters`** —
  `{ stage?, codex?, limit?, offset? }`. Stay verbatim.
- **`CreateVisionRequest`** — has optional `phase` and `stage` fields
  that bootstrap a vision into `(phase=open, stage=active)` in one tx.
  This API stays. The brief reaffirms: "the cartograph writes the writ
  at its initial phase, stamps `ext['cartograph']` with the supplied
  stage, and (if the stage isn't the writ-type's initial state)
  transitions to it, all inside one `stacks.transaction`." (D15
  surfaces this — current code writes the writ directly at the requested
  phase rather than initial-phase + transition.)
- **`CreateChargeRequest` / `CreatePieceRequest`** — `parentId`, `title`,
  `body`, `codex?`. Stay verbatim.
- **`TransitionVisionRequest` / `TransitionChargeRequest` / `TransitionPieceRequest`** —
  `{ phase, stage, resolution? }`. Stay verbatim.
- **`CartographApi`** interface — every method keeps its signature.

**New type to add (per brief §3):**
```typescript
interface CartographExt {
  stage: VisionStage | ChargeStage | PieceStage;
  codex?: string;     // see D3 — possibly redundant with writ.codex
}
```
D5 covers whether to export this from the package, and D3 covers
whether `codex` belongs in the slot at all.

### 1.3 `src/index.ts`

Barrel export. Currently re-exports `VisionDoc` / `ChargeDoc` / `PieceDoc`,
the stage enums, filter types, request types, `CartographApi`, and
`createCartograph`. Post-cleanup: optionally add `CartographExt` (D5).
Comment in this file references "Companion documents" — adjust to
"Doc projections" to match the new shape.

### 1.4 `src/tools/` — 16 patron-facing CLI tools

Path: `packages/plugins/cartograph/src/tools/{vision,charge,piece}-{create,show,list,patch,transition}.ts`
plus `vision-apply.ts`, `index.ts`, and `render.ts`.

The thin tools all route through `CartographApi`. Because the API surface
stays stable, **no tool's handler logic changes shape**. A few specifics:

- **`vision-patch.ts`** lines 32-39 — currently:
  ```typescript
  return cartograph.patchVision(resolvedId, {
    codex: params.codex,
    updatedAt: new Date().toISOString(),
  });
  ```
  The `updatedAt` line is a leftover from the companion-book era; it
  will become an error post-cleanup if the patchX implementation rejects
  managed fields (D14). Same pattern in `charge-patch.ts` and
  `piece-patch.ts` — verify all three.
- **`vision-apply.ts`** lines 391-415 — Nth-apply path calls
  `patchVision(boundId, { codex })` and
  `patchVision(boundId, { stage })` separately. Both must continue to
  work post-cleanup. The `codex` patch happens AFTER the writ has moved
  past `new`, which is the load-bearing test for D4.
- **`render.ts`** — `composeShow`/`composeListRows`/`renderShowText`/
  `renderListTable`/`renderShowJson`. The `ListRow` shape carries
  `stage`, `id`, `codex?`, `title`, `createdAt` — all five projection
  fields the doc carries today. Post-cleanup the input shape into
  `composeListRows` is the same projection (so this code is unchanged).
  `composeShow` calls `clerk.show(id)`, `clerk.links(id)`,
  `clerk.countDescendantsByPhase(id)` — all still valid post-cleanup.
- **`vision-apply.ts`** lines 38-39 — defines a **local** constant
  `SURVEYOR_PLUGIN_ID = 'surveyor'` for stamping the surveyor priority
  hints. This is the **other** ext slot on vision writs and is
  unrelated to the cartograph slot — both can coexist on the same writ.
  Mention it only because reviewers may confuse the two.

Indicative tool excerpt (`vision-create.ts` — `Do not Read.` further):
```typescript
const cartograph = guild().apparatus<CartographApi>('cartograph');
return cartograph.createVision({
  title: params.title,
  body: params.body,
  ...(params.codex !== undefined ? { codex: params.codex } : {}),
});
```

### 1.5 Tests in this package

Three test files; together ~2275 lines. All three pre-create the
cartograph books in the `MemoryBackend`:

```typescript
memBackend.ensureBook({ ownerId: 'cartograph', book: 'visions' }, {
  indexes: ['stage', 'codex', 'createdAt'],
});
memBackend.ensureBook({ ownerId: 'cartograph', book: 'charges' }, ...);
memBackend.ensureBook({ ownerId: 'cartograph', book: 'pieces' }, ...);
```

These `ensureBook` calls are **dead** post-cleanup and must be removed
(D13). Test specifics:

- **`src/cartograph.test.ts`** (936 lines) — full coverage matrix:
  writ-type registration, parent validation, companion-book CRUD
  round-trip, lifecycle coupling, codex inheritance, companion-book
  separation, apparatus shape. The "**apparatus shape**" block at
  lines 911-934 asserts:
  ```typescript
  assert.deepEqual(Object.keys(books).sort(), ['charges', 'pieces', 'visions']);
  for (const name of ['visions', 'charges', 'pieces']) {
    assert.deepEqual(books[name].indexes, ['stage', 'codex', 'createdAt']);
  }
  ```
  Both assertions must be **deleted** (the books no longer exist in
  `supportKit`). The CDC-event test at lines 342-364 watches
  `('cartograph', 'visions')` for create/update — post-cleanup the
  watch target shifts to the writs book filtered by writ id (or
  `('clerk', 'writs')` with type filter); D11 settles the form.
- **`src/tools.test.ts`** (663 lines) — exercises the 15-tool matrix
  (vision/charge/piece × create/show/list/patch/transition) through
  `tool.handler({...})` directly. No book-direct assertions; should
  pass unchanged once the apparatus rewires.
- **`src/tools/vision-apply.test.ts`** (676 lines) — full filesystem
  round-trip coverage. Watches `('cartograph', 'visions')` for CDC
  events (lines 162-167) — same shift as above. Asserts on
  `writ.ext?.[SURVEYOR_PLUGIN_ID]` payload shape — that slot is
  unrelated to the new `cartograph` slot but they cohabit on the same
  writ; the assertion still holds.

### 1.6 `README.md`

Lines 19-22 describe the three companion books explicitly. Lines
138-153 inline the three doc shapes. Lines 161-169 ("Books" table)
declares the three books as concurrent doc updates. Lines 308-311
describe `ext['surveyor']` — the surveyor slot, separate from the
cartograph slot. **Tag as `concurrent doc updates needed`** —
implementer rewrites these inline as part of the work.

### 1.7 `vision-keeper.md`

Placeholder stub for a future commission. Untouched by this work.
**`Do not Read.`**

### 1.8 `package.json` / `tsconfig.json`

Standard plugin scaffold. Untouched by this work.
**`Do not Read.`**

---

## 2. Cross-package surfaces this commission consumes

### 2.1 `packages/plugins/clerk/src/types.ts` — the `setWritExt` contract

The load-bearing primitive. The relevant signatures:

```typescript
// On WritDoc (lines 124-157):
ext?: Record<string, unknown>;

// On ClerkApi (lines 669-695):
setWritExt(writId: string, pluginId: string, value: unknown): Promise<WritDoc>;
```

`ext` is a plugin-keyed map where plugin `X` writes only `ext[X]`. The
sanctioned write path is `ClerkApi.setWritExt(...)`, which performs a
transactional read-modify-write so sibling sub-slots are preserved.
**`clerk.transition(...)` silently strips `ext` from its `fields` body**
(by destructuring it out alongside `id`, `phase`, `status`, `createdAt`,
etc.); the brief's §3 atomicity rule is built specifically to address
that strip.

`setWritExt` validation: throws on empty `writId`, empty `pluginId`, or
missing writ. `value` is opaque (the Clerk does not validate sub-slot
contents).

CDC behavior: `setWritExt` emits exactly one update event on the writs
book (Clerk test at clerk.test.ts:1672-1685).

### 2.2 `packages/plugins/clerk/src/clerk.ts` — concrete API methods

- **`api.post`** (lines 650-724) — opens a `stacks.transaction` only
  when `parentId` is set. Validates parent existence + not-terminal +
  not-self via `api.isTerminal`. Inherits codex from parent. Does NOT
  enforce parent-type rules — that's cartograph's job.
- **`api.transition`** (lines 1065-1159) — validates phase edges
  against the registered config, strips managed fields (`id`, `phase`,
  `status`, `ext`, timestamps, `resolvedAt`, `parentId`), patches the
  writ row via `writs.patch(id, patch)`. **Does NOT open its own
  transaction** — relies on whatever ambient context exists. So nesting
  it inside `stacks.transaction(async (tx) => { await
  clerk.transition(...); })` works via Stacks' AsyncLocalStorage.
- **`api.setWritExt`** (lines 1188-1213) — opens a `stacks.transaction`
  internally; reads the writ, computes
  `nextExt = { ...prevExt, [pluginId]: value }`, patches with
  `{ ext: nextExt, updatedAt: new Date().toISOString() }`.
- **`api.setWritStatus`** (lines 1161-1186) — sibling shape; same
  semantics on the `status` slot. Not load-bearing for this work but
  worth knowing the symmetry exists.

### 2.3 `packages/plugins/stacks/src/stacks.ts` — transaction nesting

Stacks supports nested transactions via AsyncLocalStorage flattening
(Stacks conformance test 2.28: "Nested explicit transactions are
flattened into the outer transaction"). That means
```typescript
await stacks.transaction(async (tx) => {
  await clerk.transition(id, phase);   // re-uses the outer tx
  await clerk.setWritExt(id, ...);     // setWritExt opens a nested tx, flattened
});
```
commits as one atomic unit. Both writes share the same CDC fence
(deduped per writ id within the tx — single CDC event per logical
operation).

### 2.4 `packages/plugins/stacks/src/query.ts` — nested-field queries

`validateFieldName` allows `[A-Za-z0-9_.-]+`, so `'ext.cartograph.stage'`
is accepted. SQLite backend translates to
`json_extract(content, '$.ext.cartograph.stage')`. Memory backend uses
dot-notation path traversal. Conformance test 3.11 confirms the
behavior. The cost: **no index** unless the writs book schema declares
one on the path (see Observation obs-1).

### 2.5 The writs-book schema (clerk's supportKit)

`packages/plugins/clerk/src/clerk.ts` lines 1240-1247:
```typescript
books: {
  writs: { indexes: ['phase', 'type', 'createdAt', 'parentId',
    ['phase', 'type'], ['phase', 'createdAt'], ['parentId', 'phase']] },
  links: { indexes: ['sourceId', 'targetId', 'label',
    ['sourceId', 'label'], ['targetId', 'label']] },
},
```

No `ext.cartograph.stage` index. Stacks does not provide a kit-channel
for one plugin to add indexes to a book owned by another plugin
(`stacks.ts` lines 68-76 — `reconcileSchemas` always passes
`ownerId: entry.pluginId`). Listing visions/charges/pieces filtered by
stage is a **full scan** post-cleanup. See obs-1.

### 2.6 Existing same-shape precedent: Reckoner

`packages/plugins/reckoner/src/reckoner.ts` writes `ext['reckoner']`
via `clerk.setWritExt(writId, RECKONER_PLUGIN_ID, ext)` (line 1269),
gated by a one-time-only check that throws if the slot already exists
(line 1262). Reckoner reads writs by id only — it doesn't query/filter
on nested ext fields. So **no precedent exists for nested-ext
filtering** in the codebase yet; cartograph is first.

---

## 3. Architecture documentation

### 3.1 `docs/architecture/surveying-cascade.md`

The settled architecture for the surveyor cascade. **Three load-bearing
sections** (per the brief) plus minor incidental references:

- **§3.4 — "Companion `SurveyDoc` holds envelope metadata only"**
  (lines 175-190). Currently inlines the SurveyDoc interface and notes
  it is "Owned by the surveyor-apparatus substrate". Rewrite per the
  brief: surveyor-writ envelope metadata moves to
  `status['surveyor']` / `ext['surveyor']` sub-slots on the survey
  writ; `targetNodeId` is `writ.parentId`; `rigName` is `writ.type`;
  `completedAt` is redundant with `writ.resolvedAt`.
- **§3.6 — "Substrate watches cartograph CDC — single-event-per-apply
  guarantee"** (lines 210-238). Currently subscribes to
  `book.cartograph.visions.{created,updated}` /
  `book.cartograph.charges.{created,updated}` /
  `book.cartograph.pieces.{created,updated}`. Rewrite to a single
  subscription on the writs book filtered by
  `writ.type ∈ {vision, charge, piece}`. Single-event-per-apply
  discussion shifts: "wrap createVision + transition in one tx" →
  "the cartograph's createX/transitionX primitives are already
  transactional" (same outcome).
- **§3.7 — "Substrate + extension + default plugin shape"** (lines
  240-266). The "**`@shardworks/surveyor-apparatus`** *(substrate)*"
  block at lines 248-259 lists "Owns survey writ types and
  `books.surveys`" — drop `books.surveys`, replace with "Owns the
  `status['surveyor']` and `ext['surveyor']` slots on survey writs."
  Also the bullet "Stamps SurveyDoc on completion (rig fills
  `writ.body`; substrate wraps the writ)" — rewrite to "Stamps
  `status['surveyor']` on completion."

Incidental references that may need touch-ups for consistency:

- Line 21: "snapshotted into the cartograph" — fine.
- Line 39 (vocabulary table): "snapshotted into a writ + VisionDoc by
  the cartograph" — the brief says VisionDoc projection-name stays;
  fine to leave as-is or reword to "writ" only.
- Line 44 (vocabulary table): "**SurveyDoc** | Companion doc for a
  survey writ ..." — drop the SurveyDoc row entirely; replace with a
  row pointing at `ext['surveyor']` / `status['surveyor']` if the
  vocabulary is still needed at that surface.
- Line 64-66 (flow diagram): "creates or updates the vision writ +
  VisionDoc (one transaction)" — minor language polish; `+ VisionDoc`
  becomes implicit since the doc is a projection.
- Line 137: "CDC fires on the cartograph book" — rewrite to "CDC fires
  on the writs book".
- Line 308: surveyor-tool internals — fine; no SurveyDoc reference.
- Line 446: example call `cartograph.createVision({ ..., stage:
  'active' })` returning `vis-1` — fine; the API surface is preserved.
- Line 729: "[Cartograph plugin README](.../cartograph/README.md)" —
  the README itself needs a polish pass (concurrent doc updates).

**Tag this file as `concurrent doc updates needed`** — the
implementing artificer fixes all the §3.4/§3.6/§3.7 sections and
incidental references in the same commission per brief §6.

### 3.2 `docs/architecture/index.md` and `docs/guild-metaphor.md`

Both reference "the cartograph" abstractly. No companion-doc references.
**`Do not Read.`**

### 3.3 `docs/architecture/apparatus/clerk.md`

Documents `setWritExt` / `setWritStatus` / `transition` contracts.
Pre-existing and load-bearing for this commission; no rewrite needed.
**`Do not Read.`**

---

## 4. Concrete reference patterns the implementer will mirror

### 4.1 The `setWritExt` write idiom

From `reckoner.ts` line 1269, the production-shape:
```typescript
await clerk.setWritExt(writId, 'cartograph', { stage, codex });
```

For this commission's `transitionX`, wrap with `stacks.transaction`:
```typescript
return stacks.transaction(async (_tx) => {
  // clerk.transition writes phase via writs.patch (no own tx — joins ours)
  await clerk.transition(id, request.phase, {
    ...(request.resolution !== undefined ? { resolution: request.resolution } : {}),
  });
  // setWritExt opens a nested tx — flattened into ours
  await clerk.setWritExt(id, 'cartograph', { stage: request.stage, codex });
  // Re-read for the return projection
  const writ = await clerk.show(id);
  return projectVisionDoc(writ);
});
```
(D2 settles whether to use `clerk.transition` or hand-rolled
`txWrits.patch` per the current pattern; the snippet uses the
brief-prescribed shape.)

### 4.2 The createX shape

For `createVision` with the bootstrap-into-active path, the brief
prescribes "write at initial phase, stamp ext, transition" — i.e.
three steps inside one tx. This contrasts with current code that
writes the writ directly at the requested phase. See D15.

### 4.3 The list-projection shape

From the current cartograph `listVisions`:
```typescript
return visionsBook.find({
  where: [['stage', '=', stage], ['codex', '=', codex]],
  orderBy: ['createdAt', 'desc'],
  limit, offset,
});
```

Post-cleanup on the writs book:
```typescript
const writs = stacks.book<WritDoc>('clerk', 'writs');
const rows = await writs.find({
  where: [
    ['type', '=', 'vision'],
    ...(stage !== undefined ? [['ext.cartograph.stage', '=', stage]] : []),
    ...(codex !== undefined ? [['codex', '=', codex]] : []),
  ],
  orderBy: ['createdAt', 'desc'],
  limit, offset,
});
return rows.map(projectVisionDoc);
```

The projection helper:
```typescript
function projectVisionDoc(writ: WritDoc): VisionDoc {
  const slot = (writ.ext?.cartograph ?? {}) as { stage?: VisionStage; codex?: string };
  if (!slot.stage) throw new Error(`writ ${writ.id} missing ext.cartograph.stage`);
  return {
    id: writ.id,
    stage: slot.stage,
    ...(writ.codex !== undefined ? { codex: writ.codex } : {}),
    createdAt: writ.createdAt,
    updatedAt: writ.updatedAt,
  };
}
```
(D16 covers the missing-slot case behavior.)

---

## 5. Concurrent doc updates needed

Files the implementer will touch as part of this commission:

- `packages/plugins/cartograph/README.md` — drop "Books" table row,
  rewrite "Companion documents" subsection (lines 138-153) to describe
  the projection / ext slot, polish "What is *not* in this commission"
  if needed.
- `docs/architecture/surveying-cascade.md` — three load-bearing
  rewrites (§3.4, §3.6, §3.7) plus incidental polish.
- File-level docstrings inside `cartograph.ts` (lines 1-34) and
  `types.ts` (lines 1-17) — both reference "three companion books"
  and the companion-doc convention; rewrite to the projection shape.
- `cartograph.ts`'s in-line comment at lines 304-307 (createVision):
  "The createX methods cannot delegate to clerk.post because Clerk's
  `post` does not accept an external transaction context, and the
  writ row + companion doc must commit under one boundary." — replace
  with a comment explaining the new ext-slot writeback strategy.
- `vision-create.ts` / `charge-create.ts` / `piece-create.ts` /
  `vision-show.ts` / `vision-list.ts` / `vision-patch.ts` /
  `vision-transition.ts` (and parallels for charge/piece) — JSDoc
  comments referencing the "companion doc" need the projection
  language. Most are 1–2 lines per file.

---

## 6. Out of scope (per brief)

- SurveyDoc itself — surveyor-apparatus doesn't exist yet; this
  commission only updates the arch doc to reflect the post-cleanup
  shape.
- Astrolabe `PlanDoc` and other companion-doc patterns elsewhere.
- The `setWritExt` API itself — consumed, not extended.
- Renaming `VisionDoc` / `ChargeDoc` / `PieceDoc` projection types —
  shapes and names stay.
- Vision-keeper agent runtime — placeholder stub remains.

