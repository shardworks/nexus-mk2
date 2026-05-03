
# Cartograph: collapse companion docs into `writ.ext['cartograph']`

## Intent

Eliminate the three Stacks companion books (`cartograph/{visions,charges,pieces}`) that the cartograph apparatus currently maintains alongside each writ row, and move the typed-metadata payload (`stage`) into the sanctioned `writ.ext['cartograph']` sub-slot on the writ itself. The cartograph's typed API surface — 15 methods across `vision/charge/piece` × `create/transition/show/list/patch` — stays byte-for-byte stable; only the storage shape underneath changes. The surveying-cascade architecture doc is rewritten in lockstep so the future surveyor substrate (Commission C) is briefed against the post-cleanup shape from day one.

## Rationale

The current two-write boundary (writ row + companion doc, written together inside one `stacks.transaction`) was a recently-shipped "atomic typed surface" experiment. With `WritDoc.ext[pluginId]` available as the sanctioned per-plugin slot and `setWritExt` providing transactional sub-slot rmw, the companion books are now a duplication: every consumer reads the writ row anyway, the books carry only `stage` plus a duplicated `codex` field, no external code consumes them, and the surveying-cascade substrate planned for Commission C wants a single CDC subscription on the writs book filtered by type rather than three per-book subscriptions. Collapsing the storage simplifies the apparatus, removes one layer of duplicated lifecycle/parent validation in `transitionX`, and pre-aligns the substrate's CDC observer shape.

## Scope & Blast Radius

The work is **internal to `@shardworks/cartograph-apparatus`** plus a focused rewrite of `docs/architecture/surveying-cascade.md`. There are no external code consumers — a repo-wide search for `VisionDoc`, `ChargeDoc`, `PieceDoc`, `CartographApi`, or the three `cartograph/{visions,charges,pieces}` book names finds matches only inside the cartograph package itself (source + tests + README) and in the surveying-cascade arch doc.

Concerns the implementer must verify, not just trust the brief on:

- **Companion-book references everywhere they appear.** The three book names (`cartograph/visions`, `cartograph/charges`, `cartograph/pieces`) appear in: the apparatus `start()` block, `supportKit.books`, every `createX`/`transitionX` body, the apparatus integration test fixture, the tools-CLI integration test fixture, the vision-apply integration test fixture (including a CDC `stacks.watch` call), the cartograph README's "Companion documents" subsection / "Books" table / header bullet, the cartograph and types module-level docstrings, the render-tool docstring, and the vision-apply tool docstring. Verify with `grep -rn "cartograph.*\(visions\|charges\|pieces\)" packages/plugins/cartograph/ docs/` after the changes — no live references should remain (the surveying-cascade doc may keep historical context lines but its load-bearing prose must use the new shape).
- **CDC-event tests on the writs book.** Three test files watch the cartograph companion books today (`stacks.watch('cartograph', 'visions', …)` etc.). After cleanup these must watch `clerk` `writs` filtered by `entry.type` in the handler. The single-event-per-apply guarantee is preserved by the apparatus's transaction discipline — the tests must continue to assert it.
- **The surveying-cascade arch doc.** §3.4, §3.6, and §3.7 are explicitly named for rewrite. Additionally, the implementer must grep the doc for `book\.cartograph` references in §2's flow diagram and §4.1's worked example and reconcile them for consistency.

There are **no migrations**. Per the locked decision (D14), historical companion-book rows in any persisted SQLite database are simply orphaned — the books vanish from `supportKit`, are never read or written again, and any leftover tables sit harmlessly. There is no boot-time cleanup, no migration script, no startup check.

The cartograph package's runtime dependencies stay verbatim at `requires: ['stacks', 'clerk']` — `stacks.transaction` and `stacks.readBook` are still consumed directly.

## Decisions

| #   | Decision | Default | Rationale |
| --- | --- | --- | --- |
| D1  | How `createX` / `transitionX` achieve atomic writ + ext writes | **hybrid**: `createX` keeps the existing direct `tx.book<WritDoc>('clerk','writs').put` pattern with `ext: { cartograph: { stage } }` populated inline on the put (one Phase 1 CDC create event); `transitionX` switches to `clerk.transition` + `clerk.setWritExt` under one shared `stacks.transaction` (removes the heaviest duplicated lifecycle validation). | One CDC event per logical create; lifecycle-validation duplication eliminated for transitions. Phase-1 update-then-update on transition is a non-issue because cartograph types declare no `childrenBehavior` cascade engagement, and the only Phase 1 writs-book observer skips phase-unchanged updates. |
| D2  | Where codex lives on a cartograph writ | **`writ.codex` only** (top-level WritDoc field). `ext['cartograph']` holds only `{ stage }`. | Codex is structurally a top-level WritDoc concern (writs page, clerk's `--codex` filter, codex-inheritance from parent). Putting it in ext would re-create the very duplication this cleanup eliminates. The brief's `{ stage, codex }` listing is loose shorthand for the projection shape, not a storage prescription. |
| D3  | How `listX` filters at the SQL layer | **direct readbook**: `listX` calls `stacks.readBook<WritDoc>('clerk','writs').find({ where: [['type','=','vision'], …] })` directly and projects the rows. Stage filter uses the dot-notation field path `'ext.cartograph.stage'` (json_extract on SQLite, `getNestedField` on memory). | Single SQL round-trip; pagination is correct (limit/offset apply after both predicates); no extension to `clerk.list` needed; the natural composition of type-indexed prefix scan + json-extracted equality. |
| D4  | What happens to `supportKit.books` | **drop the field entirely**. Remove the `books:` block from `supportKit`. | Cleanest expression of intent — cartograph contributes no books. If indexing-for-stage ever becomes a real bottleneck, add a `[type, ext.cartograph.stage]` composite index on the clerk-owned writs book in a follow-on commission. |
| D5  | Plugin-id constant for the ext sub-slot key | **export `CARTOGRAPH_PLUGIN_ID = 'cartograph' as const`** from `types.ts` and re-export from `index.ts`. Use it at every read/write of the ext sub-slot, including in tests. | Mirrors the precedent in Reckoner (`RECKONER_PLUGIN_ID`) and Clerk (`CLERK_PLUGIN_ID`); typo-resistant entry point that tests can also import. |
| D6  | `VisionDoc` / `ChargeDoc` / `PieceDoc` index signature | **keep `[key: string]: unknown`**. Public type definitions stay verbatim. | Brief intent is that the projection types stay byte-for-byte stable. The patchX surface restriction (no stage) is enforced at the patch tool's Zod schema, not by the type's index signature. |
| D7  | How `patchX` updates `writ.codex` | **direct tx-book write**: `patchX` writes the writs book directly via `tx.book<WritDoc>('clerk','writs').patch(id, { codex, updatedAt: now })`, bypassing `clerk.edit`'s "codex only editable in `new` status" rule. | Preserves today's patron-facing behavior (codex changes allowed at any phase). Routing through `clerk.edit` would be a silent functionality regression for any patron relying on switching codex on an active vision. |
| D8  | Behavior when `showX` / `listX` encounter a typed writ whose `ext['cartograph'].stage` is missing or not a valid stage enum | **fail loud**. Throw with a clear error naming the writ id and the missing/malformed field. | The cartograph's typed API owns all writes to `ext['cartograph']`. Missing or malformed sub-slot indicates either a cartograph bug or a bypass — both are fail-loud-worthy. The presentation-tolerance precedent is for cross-cutting consumers that don't own the data. |
| D9  | The Nth-apply "phase unchanged but stage drifted" branch in vision-apply | **keep via patchVision**. `vision-apply` continues to call `cartograph.patchVision(boundId, { stage: sidecar.stage })`. The patch CLI tool's Zod schema continues to refuse `--stage`; the typed API still accepts it for internal callers like vision-apply. | Layer separation — the right layer for stage-drift recovery is `patchX`. Switching to a direct `clerk.setWritExt` call from vision-apply would couple it to the slot-key convention and bypass the typed API for a single rare case. |
| D10 | Apparatus `requires:` declaration | **keep both**: `requires: ['stacks', 'clerk']`. | Cartograph still consumes `stacks.transaction` and `stacks.readBook` directly. The dep declaration drives startup ordering; transitive ordering through clerk isn't a contract. |
| D11 | Parent validation reads inside the transaction | **keep direct `tx.book.get`**. `validateParent` continues to use `tx.book<WritDoc>('clerk','writs').get(parentId)`. | Cosmetic alternative; same code paths and round-trip count. The existing pattern is the natural handle inside an active tx. |
| D12 | Surveying-cascade §3.4 SurveyDoc rewrite scope | **land prescribed shape verbatim**. Drop `targetNodeId` (redundant with `writ.parentId`), `rigName` (redundant with `writ.type`), `completedAt` (redundant with `writ.resolvedAt`). Move `rigVersion` and `surveyorId` to `status['surveyor']`. The substrate is the only writer. | Brief is explicit about the field-set rewrite; pre-empting now means Commission C inherits a settled architectural artifact rather than re-litigating it. |
| D13 | Surveying-cascade §3.6 doc rewrite shape | **split the difference**: conceptual prose describing the shift from three per-book streams to one filtered subscription on the writs book, plus a small code block illustrating the call shape (`stacks.watch<WritDoc>('clerk','writs', handler, { failOnError: false })` with handler-side `entry.type` filter). | Matches the doc's existing convention (interface excerpts in §3.4 / §3.9). Concrete enough that Commission C doesn't have to derive the call shape; conceptual enough that substrate-implementation choices stay open. |
| D14 | Historical `cartograph/{visions,charges,pieces}` rows in persisted Stacks data | **no migration — orphan**. The books vanish from supportKit; existing tables in any SQLite database sit harmlessly unreferenced. | Brief pre-empts: no migration of historical companion-doc rows. The cartograph is recently-shipped; orphan tables are inert. Boot-time cleanup or a migration script would be over-engineered. |
| D15 | `createX` defensive handling of structurally-typed callers smuggling `ext` through the request | **reject loud**. Mirror the existing `parentId` guard: if `(request as { ext?: unknown }).ext` is present, throw with a clear error naming the field. | Mirrors the existing `parentId` guard pattern in `createVision`. The cost is one defensive check on a code path that should never fire in practice; the value is that any structural-type bypass is caught at the boundary. |

## Acceptance Signal

1. **`pnpm -w test` passes** with the cartograph package's three integration test files (`cartograph.test.ts`, `tools.test.ts`, `tools/vision-apply.test.ts`) updated to: (a) drop the `cartograph/{visions,charges,pieces}` `ensureBook` calls in their fixtures; (b) move CDC-event watches from the cartograph companion books to `clerk` `writs` filtered by `entry.type`; (c) preserve the single-event-per-apply assertion under the new shape.
2. **`pnpm -w typecheck` passes.** No callers of `cartograph.{create,transition,show,list,patch}{Vision,Charge,Piece}` need source changes — the API surface is byte-for-byte stable.
3. **No live references to the cartograph companion books remain.** A grep for `cartograph.*\(visions\|charges\|pieces\)` across `packages/plugins/cartograph/src/` and `docs/` returns no matches in active code paths or in the load-bearing prose of `surveying-cascade.md` (historical/contextual mentions in narrative are acceptable; `supportKit.books`, `tx.book(...)`, and `stacks.watch(...)` calls referencing those books must be gone).
4. **`nsg vision create … && nsg vision show <id>` round-trip works**, with the show output's projected `VisionDoc` shape (and the analogous shapes for charge/piece) matching today's byte-for-byte JSON output. The same verification holds for `nsg vision list`, `nsg vision transition`, `nsg vision patch`, and `nsg vision apply`. The lifecycle-aware `Stage:` row in show/list rendering is unchanged.
5. **`nsg writ show <vision-id>` surfaces `ext: { cartograph: { stage: '<stage>' } }`** in the raw JSON projection, consistent with how `ext.reckoner` and `ext.surveyor` already render today.
6. **`docs/architecture/surveying-cascade.md` §3.4, §3.6, and §3.7 are rewritten** to the post-cleanup shape per D12 / D13: §3.4 declares `status['surveyor'] = { rigVersion, surveyorId }` with `writ.parentId` / `writ.type` / `writ.resolvedAt` carrying the dropped envelope fields; §3.6 describes the single filtered writs-book subscription with a small `stacks.watch` code block; §3.7's substrate plugin shape drops `books.surveys` from the "Owns" list and replaces "Stamps SurveyDoc on completion" with "Stamps `status['surveyor']` on completion." Incidental `book.cartograph` references in §2 / §4.1 are reconciled.
7. **`CARTOGRAPH_PLUGIN_ID` is exported** from `packages/plugins/cartograph/src/types.ts`, re-exported from `index.ts`, and used at every read/write site for the ext sub-slot inside the cartograph package and its tests.
8. **`createX` defensive `ext`-smuggling guard fires.** A direct call constructed as `cartograph.createVision({ ...validRequest, ext: {} } as any)` throws with a clear error naming the offending field, mirroring the existing `parentId` guard.

## Reference Material

### `WritDoc.ext` slot contract

Source: `packages/plugins/clerk/src/types.ts` (lines 87–174 — the `WritDoc` interface, with the `ext?: Record<string, unknown>` field and its slot-write contract docstring). Role: defines the sanctioned per-plugin slot the cartograph is moving its payload into.

The contract:

> There is exactly one sanctioned slot-write path: `ClerkApi.setWritExt(writId, pluginId, value)`, which performs a transactional read-modify-write on the sub-slot keyed by `pluginId` so sibling sub-slots are preserved under concurrent writers.
>
> `transition()` silently strips `ext` from its body, and the generic `put()` / `patch()` paths on the writs book are not supported slot-write mechanisms — every route other than `setWritExt()` would wholesale-replace the slot and clobber sibling sub-slots.

This contract governs `transitionX` (which routes through `clerk.transition` + `clerk.setWritExt` per D1 to honor the sanctioned path). It does *not* govern `createX` — `createX` writes the writ row for the first time via direct `tx.book<WritDoc>('clerk','writs').put`, where the ext slot is being initialized (not modified), and `setWritExt` is only mandatory for read-modify-write of an existing ext slot. Inlining `ext: { [CARTOGRAPH_PLUGIN_ID]: { stage } }` on the initial put is the correct shape.

### `setWritExt` impl behavior

Source: `packages/plugins/clerk/src/clerk.ts` (lines 1188–1213). Role: the API the `transitionX` rewrite calls into.

```typescript
async setWritExt(writId, pluginId, value): Promise<WritDoc> {
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
},
```

Key behaviors the implementer must lean on: it opens its own `stacks.transaction` which **flattens** when invoked inside an outer transaction (see `packages/plugins/stacks/src/stacks-core.ts` line 192 — "If already in a transaction, just run (no nesting — flattened)"); preserves sibling sub-slots; bumps `updatedAt`; emits a CDC update event on the writs row. So in `transitionX`, wrapping `clerk.transition(id, to, fields)` followed by `clerk.setWritExt(id, CARTOGRAPH_PLUGIN_ID, { stage })` inside one `stacks.transaction(...)` produces a flattened single transaction, two Phase 1 update events that coalesce to one Phase 2 event.

### Stacks where-clause for ext-field filtering

Sources: `packages/plugins/stacks/src/query.ts` lines 14–21 (`SAFE_FIELD_RE = /^[A-Za-z0-9_.-]+$/` — permits dot-notation paths), `packages/plugins/stacks/src/sqlite-backend.ts` lines 47–53 (`toJsonPath` / `jsonExtract` translate `'ext.cartograph.stage'` → `json_extract(content, '$.ext.cartograph.stage')`), and `packages/plugins/stacks/src/field-utils.ts` lines 14–22 (`getNestedField` walks dot-paths in JS for the memory backend). Role: confirms that the field path the `listX` rewrite uses is supported on both backends without indexing changes.

Both backends accept `where: [['ext.cartograph.stage', '=', value]]`. SQLite executes it as `json_extract(...)`; memory uses `getNestedField`. No clerk-side index contribution is required.

### Plugin-id constant convention

Source: `packages/plugins/reckoner/src/types.ts` and `packages/plugins/clerk/src/types.ts`. Role: existing precedent for the `CARTOGRAPH_PLUGIN_ID` export (D5).

```typescript
export const RECKONER_PLUGIN_ID = 'reckoner' as const;   // packages/plugins/reckoner/src/types.ts
export const CLERK_PLUGIN_ID = 'clerk';                  // packages/plugins/clerk/src/types.ts
```

Apply the same shape: `export const CARTOGRAPH_PLUGIN_ID = 'cartograph' as const;` in `packages/plugins/cartograph/src/types.ts`, re-exported from `packages/plugins/cartograph/src/index.ts`.

### CDC coalescing inside a transaction

Source: `packages/plugins/stacks/src/cdc.ts` lines 87–145 (`coalesceEvents`). Role: explains why the D1 hybrid is correct — Phase 2 sees one coalesced event regardless of the in-tx event count.

> In-transaction events on the same row coalesce. `create`-then-`update` becomes a single Phase 2 `create` event with the final state. So `clerk.post` + `clerk.setWritExt` under one tx emits one Phase 2 create event. Phase 1 still sees both (failOnError handlers run synchronously inside the tx).

For cartograph types specifically: no Phase 1 observer cares (children-behavior-engine is the only Phase 1 writs-book observer; it skips phase-unchanged updates and cartograph types declare no `childrenBehavior` block). Phase 2 observers (sentinel, clockworks lifecycle observer) see one coalesced event per logical operation regardless of the D1 sub-pattern.

### Surveying-cascade arch doc — current §3.4 SurveyDoc shape

Source: `docs/architecture/surveying-cascade.md` lines 175–190. Role: identifies the exact section §3.4 the rewrite replaces (per D12).

```typescript
interface SurveyDoc {
  id: string;             // primary key — the survey writ id
  targetNodeId: string;   // the cartograph node being surveyed
  rigName: string;
  rigVersion: string;
  surveyorId: string;
  completedAt: string;
}
```

The replacement (per D12): drop `targetNodeId` (redundant with `writ.parentId`), `rigName` (redundant with `writ.type`), `completedAt` (redundant with `writ.resolvedAt`). Move `rigVersion` and `surveyorId` to `status['surveyor']`. The substrate is the only writer.

### Surveying-cascade arch doc — current §3.6 / §3.7 shape

Source: `docs/architecture/surveying-cascade.md` lines 210–238 (§3.6) and 240–266 (§3.7). Role: identifies the exact sections the rewrite replaces (per D12 / D13).

§3.6 currently enumerates three book-event streams: `book.cartograph.visions.{created,updated}`, `book.cartograph.charges.{created,updated}`, `book.cartograph.pieces.{created,updated}`. The rewrite (per D13, "split the difference") replaces this with prose describing the single filtered subscription on the writs book, plus a small code block illustrating the call shape:

```typescript
stacks.watch<WritDoc>('clerk', 'writs', (entry) => {
  if (entry.type !== 'vision' && entry.type !== 'charge' && entry.type !== 'piece') return;
  // … substrate handler logic …
}, { failOnError: false });
```

The single-event-per-apply guarantee discussion stays — its phrasing shifts from "wrap createVision + transition in one transaction" to "the cartograph's createX/transitionX primitives are already transactional" with the same outcome (one CDC-significant phase transition per apply).

§3.7's substrate plugin shape bullet list under `@shardworks/surveyor-apparatus`: drop `books.surveys` from the "Owns" list; substrate now owns the `status['surveyor']` and `ext['surveyor']` slots on survey writs. Replace "Stamps SurveyDoc on completion" with "Stamps `status['surveyor']` on completion."

### Cartograph apparatus — module-level docstring

Source: `packages/plugins/cartograph/src/cartograph.ts` lines 1–34. Role: identifies a docstring that explicitly describes the "three companion books under owner id `cartograph`" pattern and must be rewritten to describe the post-cleanup shape (single writ row, `ext['cartograph']` sub-slot).

### Cartograph types module — public type definitions and module docstring

Source: `packages/plugins/cartograph/src/types.ts`. Role: the module docstring (lines 1–17) and per-interface docstrings reference "companion document … keyed by the writ id one-for-one" and "vision text lives on `writ.body`; the companion docs carry typed metadata only." These need rewriting to describe the projection-over-writ-row shape. The `VisionStage` / `ChargeStage` / `PieceStage` enums (lines 36, 48, 60), the `VisionFilters` / `ChargeFilters` / `PieceFilters` shapes (lines 133–166), the `Create*Request` / `Transition*Request` shapes (lines 187–282), and the `CartographApi` interface (lines 311–350) all stay verbatim per the brief.

### Today's `createVision` body

Source: `packages/plugins/cartograph/src/cartograph.ts` lines 308–338. Role: the existing pattern the D1-`createX`-direct-tx-write rewrite mirrors.

```typescript
return stacks.transaction(async (tx) => {
  const txWritsBook = tx.book<WritDoc>('clerk', 'writs');
  const txVisionsBook = tx.book<VisionDoc>('cartograph', 'visions');
  const childId = generateId('w', 6);
  const now = new Date().toISOString();
  const writ: WritDoc = {
    id: childId, type: 'vision', phase: requestedPhase,
    title: request.title, body: request.body,
    ...(request.codex !== undefined ? { codex: request.codex } : {}),
    createdAt: now, updatedAt: now,
  };
  await txWritsBook.put(writ);
  const doc: VisionDoc = {
    id: childId, stage: requestedStage,
    ...(request.codex !== undefined ? { codex: request.codex } : {}),
    createdAt: now, updatedAt: now,
  };
  await txVisionsBook.put(doc);
  return doc;
});
```

Post-cleanup: the writ put carries `ext: { [CARTOGRAPH_PLUGIN_ID]: { stage: requestedStage } }`; the companion-book put disappears entirely; the return value is a projection over the persisted writ row.

### Today's `transitionVision` body

Source: `packages/plugins/cartograph/src/cartograph.ts` lines 360–417. Role: the existing pattern the D1-`transitionX`-clerk-call rewrite replaces.

```typescript
return stacks.transaction(async (tx) => {
  const txWritsBook = tx.book<WritDoc>('clerk', 'writs');
  const txVisionsBook = tx.book<VisionDoc>('cartograph', 'visions');
  const writ = await txWritsBook.get(id);
  // … duplicates clerk.transition's allowedTransitions / classification checks …
  const writPatch: Partial<Omit<WritDoc, 'id'>> = {
    phase: request.phase, updatedAt: now,
    ...(isTerminal ? { resolvedAt: now } : {}),
    ...(request.resolution !== undefined ? { resolution: request.resolution } : {}),
  };
  await txWritsBook.patch(id, writPatch);
  return txVisionsBook.patch(id, { stage: request.stage, updatedAt: now });
});
```

Post-cleanup: the body becomes `stacks.transaction(async () => { await clerk.transition(id, request.phase, request.resolution !== undefined ? { resolution: request.resolution } : undefined); await clerk.setWritExt(id, CARTOGRAPH_PLUGIN_ID, { stage: request.stage }); return projectVisionDoc(await stacks.readBook<WritDoc>('clerk','writs').get(id)); })` — call shape is illustrative only; the implementer chooses how to thread the projection through. The duplicated lifecycle/classification validation block (today's lines 304–307 comment "the cost of being a typed atomic surface") goes away.

### Reckoner ext-slot precedent

Source: `packages/plugins/reckoner/src/reckoner.ts` line 1269 (the `clerk.setWritExt(writId, RECKONER_PLUGIN_ID, ext)` call site). Role: precedent for the slot-key convention. **Do not Read** for the *atomicity* shape — Reckoner's `petition()` is two-step and non-atomic by design ("D7" in its own docs); the cartograph's create+stamp is atomic by design (D1 hybrid). The relevant comparison is the slot ownership / constant convention only.

### CDC observer landscape (constraint-only)

Source: `packages/plugins/clerk/src/children-behavior-engine.ts`. Role: load-bearing constraint analysis only. **Do not Read.** — the relevant facts are: the engine fires only on phase-changes (`entry.phase !== prev.phase`); a `setWritExt` update with phase unchanged is a silent no-op for the cascade; cartograph types declare no `childrenBehavior` block, so even phase-changes don't engage the cascade for vision/charge/piece. This is why the D1 hybrid's two-Phase-1-events-on-transition is a non-issue.

### Cartograph package files cited as pointers (no content excerpts here)

These files are part of the cleanup's blast radius but the implementer does not need additional reference material from them beyond the inventory's location data:

- `packages/plugins/cartograph/src/cartograph.test.ts` — apparatus integration tests (drop `ensureBook` calls in `buildFixture`; rewire CDC-event test from cartograph-visions watch to writs-book watch with type filter; delete the "declares the three companion books with the expected indexes" test; rewrite the companion-book-separation tests against the new internals; preserve the lifecycle-coupling tests).
- `packages/plugins/cartograph/src/tools.test.ts` — tools-CLI integration tests (drop `ensureBook` calls in `buildFixture`; remainder unaffected).
- `packages/plugins/cartograph/src/tools/vision-apply.test.ts` — vision-apply integration tests (drop `ensureBook` calls in `buildFixture`; move the CDC-counter watch from `cartograph/visions` to `clerk/writs` filtered by type; preserve first-apply / Nth-apply / error-path / surveyor-payload assertions).
- `packages/plugins/cartograph/src/tools/render.ts` — `composeShow` / `projectWrit` rendering helpers; no public-shape changes (the JSON shape per the original commission's D8 stays).
- `packages/plugins/cartograph/src/tools/vision-apply.ts` — vision-apply CLI; first-apply and Nth-apply paths unchanged in argument shape; the Nth-apply stage-drift branch continues to call `cartograph.patchVision(boundId, { stage })` per D9.
- `packages/plugins/cartograph/README.md` — drop the three companion-book mentions (header bullet, "Companion documents" subsection, "Books" table); update narrative references to "the companion doc" / "the typed companion document"; the `CartographApi` block stays since signatures don't change; the `VisionDoc` / `ChargeDoc` / `PieceDoc` shape block updates per D6 (keep the index signature) and D2 (codex on writ.codex).

## What NOT To Do

- **Do not change the public `CartographApi` method signatures.** All 15 methods (`createVision`/`createCharge`/`createPiece`, `transitionVision`/`transitionCharge`/`transitionPiece`, `showVision`/`showCharge`/`showPiece`, `listVision`/`listCharge`/`listPiece`, `patchVision`/`patchCharge`/`patchPiece`) keep their current argument and return shapes verbatim.
- **Do not migrate historical companion-book rows.** Per D14, leftover tables in any persisted SQLite database are simply orphaned — no boot-time drop, no migration script, no startup check.
- **Do not extend `clerk.list` to accept a generic `ext` filter.** Per D3 the cartograph reads the writs book directly via `stacks.readBook<WritDoc>('clerk','writs').find({ where: [...] })`. No surface extension to clerk.
- **Do not move codex into `ext['cartograph']`.** Per D2 codex stays on `writ.codex`. The brief's `{ stage, codex }` shorthand was about the projection shape, not the storage location.
- **Do not lobby for a writs-book composite index** (`[type, ext.cartograph.stage]` or similar) as part of this commission. Per D4 the cartograph drops `supportKit.books` entirely; if list-by-stage performance becomes a bottleneck later, that's a separate follow-on commission.
- **Do not "improve" the `VisionDoc` / `ChargeDoc` / `PieceDoc` types** by removing the `[key: string]: unknown` index signature. Per D6 the public type definitions stay verbatim.
- **Do not switch `patchX` to route through `clerk.edit`.** Per D7 the direct-tx-write pattern is preserved so codex remains mutable at any phase.
- **Do not silently project a `'unknown'` stage sentinel** when `ext['cartograph'].stage` is missing on a typed writ. Per D8 the projection fails loud.
- **Do not bypass `cartograph.patchVision` from `vision-apply`** for the stage-drift recovery branch by calling `clerk.setWritExt` directly. Per D9 the typed API is the right layer.
- **Do not drop `stacks` from the apparatus's `requires:` declaration.** Per D10 `requires: ['stacks', 'clerk']` stays — `stacks.transaction` and `stacks.readBook` are still consumed.
- **Do not silently strip or forward** a smuggled `ext` field on `createX` requests. Per D15 mirror the existing `parentId` defensive guard and reject loud.
- **Do not update flavor-text mentions** of the cartograph in `docs/architecture/index.md` or `docs/guild-metaphor.md` — they don't reference the companion books and are out of scope.
- **Do not inline the `'cartograph'` literal string** at any ext sub-slot read/write site; per D5 use the exported `CARTOGRAPH_PLUGIN_ID` constant.

<task-manifest>
  <task id="t1">
    <name>Export CARTOGRAPH_PLUGIN_ID and rewrite type-module docstrings</name>
    <files>packages/plugins/cartograph/src/types.ts, packages/plugins/cartograph/src/index.ts</files>
    <action>Add `export const CARTOGRAPH_PLUGIN_ID = 'cartograph' as const;` to types.ts mirroring the precedent in Reckoner's types.ts. Re-export it from index.ts. Rewrite the module-level docstring at the top of types.ts and the per-interface docstrings on VisionDoc/ChargeDoc/PieceDoc to describe the post-cleanup shape (projections over the writ row, with `stage` carried in `writ.ext['cartograph']` and `codex` on top-level `writ.codex` per D2). Keep the `[key: string]: unknown` index signature on each doc type per D6. Keep the VisionStage/ChargeStage/PieceStage enums, the *Filters shapes, the Create*Request / Transition*Request shapes, and the CartographApi interface byte-for-byte stable.</action>
    <verify>pnpm -w typecheck</verify>
    <done>The constant is exported from both types.ts and index.ts; module and per-interface docstrings no longer reference companion books; all public type signatures unchanged.</done>
  </task>

  <task id="t2">
    <name>Rewrite createX paths to write writ.ext['cartograph'] inline (D1-create / D15)</name>
    <files>packages/plugins/cartograph/src/cartograph.ts</files>
    <action>Rewrite createVision / createCharge / createPiece to follow the direct-tx-write half of the D1 hybrid: inside the existing `stacks.transaction(...)`, write the writ row via `tx.book<WritDoc>('clerk','writs').put(...)` with `ext: { [CARTOGRAPH_PLUGIN_ID]: { stage: requestedStage } }` populated inline. Drop the second `tx.book<{Type}Doc>('cartograph', '{books}')` put. Return value is a projection over the just-persisted writ row. Codex stays on `writ.codex` per D2. Add the D15 defensive guard mirroring the existing parentId guard pattern: if a structurally-typed caller smuggles `ext` through the request, throw with a clear error naming the field. Keep the validateParent helper using `tx.book<WritDoc>('clerk','writs').get` per D11.</action>
    <verify>pnpm -F @shardworks/cartograph-apparatus typecheck</verify>
    <done>All three createX paths persist a writ with `ext['cartograph'].stage` populated inline on the put; no companion-book put calls remain in the create paths; the parentId-style ext smuggling guard is in place.</done>
  </task>

  <task id="t3">
    <name>Rewrite transitionX to clerk.transition + clerk.setWritExt under shared tx (D1-transition)</name>
    <files>packages/plugins/cartograph/src/cartograph.ts</files>
    <action>Rewrite transitionVision / transitionCharge / transitionPiece per the clerk-call half of D1: wrap `clerk.transition(id, request.phase, request.resolution !== undefined ? { resolution: request.resolution } : undefined)` and `clerk.setWritExt(id, CARTOGRAPH_PLUGIN_ID, { stage: request.stage })` in a single shared `stacks.transaction(...)`. Remove the duplicated lifecycle / classification validation block that the existing transitionX bodies carry (the cost-of-typed-atomic-surface comment block goes away — clerk.transition does this validation now). Return value is a projection over the post-transition writ row. Preserve the resolution forwarding and the resolvedAt-on-terminal stamping (clerk.transition handles the latter).</action>
    <verify>pnpm -F @shardworks/cartograph-apparatus typecheck</verify>
    <done>All three transitionX paths invoke clerk.transition then clerk.setWritExt inside one transaction; the duplicated lifecycle-validation block is gone; no companion-book patch calls remain in the transition paths.</done>
  </task>

  <task id="t4">
    <name>Rewrite showX / listX / patchX to read and project the writ row (D3 / D7 / D8)</name>
    <files>packages/plugins/cartograph/src/cartograph.ts</files>
    <action>Add a fail-loud projection helper (per D8) that turns a WritDoc of the right type into a {Vision,Charge,Piece}Doc shape, throwing with a clear error naming the writ id and the missing/malformed field if `ext['cartograph'].stage` is undefined or not in the per-type stage enum. Rewrite showX to read the writ via the writs book (`stacks.readBook<WritDoc>('clerk','writs').get(id)`) and project. Rewrite listX per D3 to call `stacks.readBook<WritDoc>('clerk','writs').find({ where: [['type','=','vision'|'charge'|'piece'], ...stage filter, ...codex filter], orderBy: ['createdAt','desc'], limit, offset })` — using the dot-notation field path `'ext.cartograph.stage'` for the stage filter and the top-level `'codex'` field for the codex filter (codex stays on writ.codex per D2) — then map through the projection helper. Rewrite patchX per D7 to write the writs book directly via `tx.book<WritDoc>('clerk','writs').patch(id, { codex, updatedAt: now })` inside a stacks.transaction; for internal stage-drift recovery (vision-apply path per D9), patchX must also accept `{ stage }` and route it through `clerk.setWritExt`. Drop the per-type companion-book closure variables (visionsBook / chargesBook / piecesBook) and the three `stacks.book(...)` calls in `start()`.</action>
    <verify>pnpm -F @shardworks/cartograph-apparatus typecheck</verify>
    <done>showX/listX/patchX all read and write the writs book directly; the projection helper throws fail-loud on missing or malformed stage; no `stacks.book('cartograph', ...)` calls remain in start() or anywhere in cartograph.ts.</done>
  </task>

  <task id="t5">
    <name>Drop supportKit.books entirely; preserve apparatus dep declarations (D4 / D10)</name>
    <files>packages/plugins/cartograph/src/cartograph.ts</files>
    <action>Remove the `books:` block from the apparatus's `supportKit` declaration entirely per D4 (no `books: {}` placeholder — drop the field). Keep `requires: ['stacks', 'clerk']` verbatim per D10. Rewrite the cartograph.ts module-level docstring (the block at the top of the file describing the "three companion books under owner id `cartograph`" pattern and the createX / transitionX two-book write boundary) to describe the post-cleanup shape (single writ row, ext['cartograph'] sub-slot, atomic per-operation transactions).</action>
    <verify>pnpm -F @shardworks/cartograph-apparatus typecheck</verify>
    <done>supportKit no longer carries a books field; apparatus requires both stacks and clerk; module docstring describes the post-cleanup shape.</done>
  </task>

  <task id="t6">
    <name>Update render-tool docstring and vision-apply docstring; verify tool wrappers unchanged</name>
    <files>packages/plugins/cartograph/src/tools/render.ts, packages/plugins/cartograph/src/tools/vision-apply.ts, packages/plugins/cartograph/src/tools/vision-create.ts, packages/plugins/cartograph/src/tools/charge-create.ts, packages/plugins/cartograph/src/tools/piece-create.ts, packages/plugins/cartograph/src/tools/vision-show.ts, packages/plugins/cartograph/src/tools/charge-show.ts, packages/plugins/cartograph/src/tools/piece-show.ts, packages/plugins/cartograph/src/tools/vision-list.ts, packages/plugins/cartograph/src/tools/charge-list.ts, packages/plugins/cartograph/src/tools/piece-list.ts, packages/plugins/cartograph/src/tools/vision-patch.ts, packages/plugins/cartograph/src/tools/charge-patch.ts, packages/plugins/cartograph/src/tools/piece-patch.ts, packages/plugins/cartograph/src/tools/vision-transition.ts, packages/plugins/cartograph/src/tools/charge-transition.ts, packages/plugins/cartograph/src/tools/piece-transition.ts</files>
    <action>Update the render.ts module docstring to drop the "companion doc + writ row" framing while preserving the JSON output shape (per the original commission's D8 — that shape is unchanged). Update the vision-apply.ts header docstring to drop "+ companion VisionDoc" wording from the snapshot description. Audit the 15 tool wrappers (vision/charge/piece × create/show/list/patch/transition); they should not need source changes since the typed-API signatures are stable, but verify each one still compiles and routes through the typed API exactly as before. The Nth-apply stage-drift branch in vision-apply.ts (around line 408-411) continues to call `cartograph.patchVision(boundId, { stage: sidecar.stage })` per D9.</action>
    <verify>pnpm -F @shardworks/cartograph-apparatus typecheck</verify>
    <done>Tool docstrings updated to the post-cleanup framing; tool wrappers compile unchanged; the stage-drift recovery branch in vision-apply.ts still routes through patchVision.</done>
  </task>

  <task id="t7">
    <name>Update cartograph integration tests for new storage shape</name>
    <files>packages/plugins/cartograph/src/cartograph.test.ts, packages/plugins/cartograph/src/tools.test.ts, packages/plugins/cartograph/src/tools/vision-apply.test.ts</files>
    <action>In each test file's `buildFixture`, drop the `ensureBook` calls for `cartograph/{visions,charges,pieces}`. In cartograph.test.ts, rewrite the CDC-event test ("produces exactly one CDC event on the cartograph visions book per creation") to watch `clerk` `writs` filtered by `entry.type === 'vision'` in the handler — preserve the single-event-per-apply assertion. Delete the "declares the three companion books with the expected indexes" apparatus-shape test. Rewrite the companion-book-separation tests (today asserting cross-book non-pollution) to assert "list scoped to its own type" using the new internals. Keep the lifecycle-coupling tests (writ.phase and projected stage move in lockstep) — only the impl underneath changes. In tools.test.ts, only the fixture cleanup is needed. In vision-apply.test.ts, also move the `stacks.watch<VisionDoc>('cartograph','visions',…)` CDC-counter call to a `stacks.watch<WritDoc>('clerk','writs',…)` call with handler-side `entry.type === 'vision'` filter; preserve all other assertions (first-apply / Nth-apply / error-path / surveyor-payload). Use `CARTOGRAPH_PLUGIN_ID` (imported from the cartograph package) wherever the test addresses the ext sub-slot.</action>
    <verify>pnpm -F @shardworks/cartograph-apparatus test</verify>
    <done>All three test files pass with the new storage shape; no `ensureBook` calls for cartograph companion books remain; CDC-event tests watch the writs book filtered by type; lifecycle-coupling and surveyor-payload assertions preserved.</done>
  </task>

  <task id="t8">
    <name>Update cartograph README and surveying-cascade arch doc</name>
    <files>packages/plugins/cartograph/README.md, docs/architecture/surveying-cascade.md</files>
    <action>In the cartograph README: drop the "three companion books" mention from the header "What ships here" bullet; remove the "Companion documents" subsection; remove the "Books" table row under "Support Kit"; update narrative references to "the companion doc" / "the typed companion document" sprinkled in API descriptions to describe the post-cleanup projection-over-writ-row shape; update the VisionDoc/ChargeDoc/PieceDoc shape block to match D2 (codex on writ.codex) and D6 (keep the index signature); the CartographApi block stays since signatures don't change. In docs/architecture/surveying-cascade.md: rewrite §3.4 per D12 (drop targetNodeId/rigName/completedAt as redundant with writ fields; move rigVersion and surveyorId to status['surveyor']; substrate is the only writer); rewrite §3.6 per D13 ("split the difference" — conceptual prose describing the shift from three per-book streams to one filtered subscription on the writs book, plus a small `stacks.watch<WritDoc>('clerk','writs', handler, { failOnError: false })` code block illustrating the call shape with a handler-side type filter; preserve the single-event-per-apply discussion); rewrite §3.7 (drop `books.surveys` from the substrate's "Owns" list; replace "Stamps SurveyDoc on completion" with "Stamps `status['surveyor']` on completion"); reconcile incidental `book.cartograph` references in §2's flow diagram (lines ~65-67) and §4.1's worked example for consistency.</action>
    <verify>grep -rn "cartograph.*\(visions\|charges\|pieces\)" packages/plugins/cartograph/README.md docs/architecture/surveying-cascade.md</verify>
    <done>README no longer references companion books in any load-bearing section; surveying-cascade.md §3.4 / §3.6 / §3.7 describe the post-cleanup shape per D12 / D13; no live `book.cartograph.{visions,charges,pieces}` references remain in the doc's load-bearing prose.</done>
  </task>
</task-manifest>

