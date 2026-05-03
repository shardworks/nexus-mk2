# Inventory — Cartograph: collapse companion docs into `writ.ext['cartograph']`

## Scope and blast radius

The cleanup is **internal to `@shardworks/cartograph-apparatus`** plus an architecture-doc rewrite. There are **no external code consumers** of `VisionDoc` / `ChargeDoc` / `PieceDoc` / `CartographApi` / the three `cartograph/{visions,charges,pieces}` books anywhere in the repo. A repo-wide grep for `cartograph|VisionDoc|ChargeDoc|PieceDoc|CartographApi` finds matches in only:

- The cartograph package itself (`packages/plugins/cartograph/**`)
- `docs/architecture/surveying-cascade.md` (the load-bearing arch doc that the brief explicitly calls out for §3.4 / §3.6 / §3.7 updates)
- Two docs that mention the apparatus by name in flavor text: `docs/architecture/index.md`, `docs/guild-metaphor.md` (do **not** mention the books)

This is a recently-shipped apparatus; per the brief's §5, **no migration of historical companion-doc rows** — the books are simply removed from `supportKit.books`, the data shape moves to `writ.ext['cartograph']`, and any test fixture that pre-creates `cartograph/{visions,charges,pieces}` books drops those calls.

The substrate (the surveyor-apparatus, future Commission C in the surveying-cascade subtree) is **not yet built** — the doc updates pre-design it against the post-cleanup shape so the substrate's CDC observer subscribes to writs filtered by type rather than to per-book streams.

## Files

### Cartograph package — primary edit surface

- **`packages/plugins/cartograph/src/cartograph.ts`** (748 lines) — apparatus body. Six `createX` / `transitionX` paths (one per type × two operations) all open `stacks.transaction(async (tx) => …)` and write the writ row and the companion doc inside one boundary. Each path:
  - holds a per-type companion-book closure variable (`visionsBook`, `chargesBook`, `piecesBook` — module-scoped, populated in `start()`)
  - inside the tx: `tx.book<WritDoc>('clerk', 'writs')` for the writ + `tx.book<{Vision,Charge,Piece}Doc>('cartograph', '{visions,charges,pieces}')` for the companion
  - duplicates Clerk's `post()` parent-validation in `validateParent(...)` and Clerk's `transition()` lifecycle-validation byte-for-byte (declared comment on lines 304–307: "the cost of being a typed atomic surface")
  - The `start()` block (lines 716–732) calls `stacks.book(…)` three times to capture the companion-book handles. After cleanup these go away.
  - The `supportKit.books` declaration (lines 682–686) declares the three books with `indexes: ['stage', 'codex', 'createdAt']`. After cleanup the entire `books:` block disappears (or becomes `books: {}` — see decision D-supportkit).
  - Re-exports `VISION_CONFIG`, `CHARGE_CONFIG`, `PIECE_CONFIG` (lines 738–739) and the per-type stage type aliases (lines 742–747).

  Inline reference — current `createVision` body (lines 308–338):

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

  Post-cleanup the writ put has `ext: { cartograph: { stage } }` populated inline; the companion-book put disappears entirely. (See D1 / D2 for the codex-storage decision.)

  Inline reference — current `transitionVision` body (lines 360–417):

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

- **`packages/plugins/cartograph/src/types.ts`** (351 lines) — public types. Defines:
  - `VisionStage` / `ChargeStage` / `PieceStage` enum unions (lines 36, 48, 60) — **stay verbatim**.
  - `VisionDoc` / `ChargeDoc` / `PieceDoc` interfaces (lines 72–125) — each has `[key: string]: unknown` index signature (the brief's "patch surface plus index signature lets consumers grow the field set non-breakingly later"), `id`, `stage`, optional `codex`, `createdAt`, `updatedAt`. The brief says "the existing `VisionDoc` / `ChargeDoc` / `PieceDoc` exported types stay as projection shapes (their definitions can be retained verbatim)". Decisions D-doc-shape and D-codex-location govern the actual post-cleanup field set.
  - `VisionFilters` / `ChargeFilters` / `PieceFilters` (lines 133–166) — `{ stage?, codex?, limit?, offset? }`. **Stay verbatim** — they describe the API filter surface, not the storage shape.
  - `CreateVisionRequest` / `CreateChargeRequest` / `CreatePieceRequest` (lines 187–236) — **stay verbatim**. The optional `phase` / `stage` on `CreateVisionRequest` (Commission A's atomic-bootstrap path) keeps its semantic per brief §3.
  - `TransitionVisionRequest` / `TransitionChargeRequest` / `TransitionPieceRequest` (lines 247–282) — **stay verbatim** (caller still supplies both target phase and target stage explicitly).
  - `CartographApi` (lines 311–350) — 15 method surface (5 ops × 3 types). **Method signatures stay verbatim** per brief §2.

- **`packages/plugins/cartograph/src/index.ts`** (49 lines) — public re-exports. No edits expected unless we add a `CARTOGRAPH_PLUGIN_ID` constant (see D-plugin-id-constant).

- **`packages/plugins/cartograph/src/tools/index.ts`** (31 lines) — barrel re-exporting the 16 patron CLI tools. No edits.

- **`packages/plugins/cartograph/src/tools/render.ts`** (361 lines) — shared text/JSON rendering helpers used by the show/list tools. The `composeShow(...)` helper (lines 140–174) calls `clerk.show(id)` / `clerk.links(id)` / `clerk.countDescendantsByPhase(id)` and projects via `projectWrit(...)` (lines 83–98). The doc fields land at the top level of the JSON shape (`{ ...doc, writ: { ... } }` per D8 in the original commission spec); the writ row sits nested under `writ`. Internal-only edit: the `composeListRows(...)` helper (lines 335–360) currently fetches the per-row title from `clerk.show(doc.id)` (N+1 lookup) — post-cleanup the doc → writ relationship is the *same* writ row, so the cost remains N+1 unless the listX path is restructured to read writs directly.

- **`packages/plugins/cartograph/src/tools/vision-create.ts`** (35 lines), **`charge-create.ts`**, **`piece-create.ts`** — thin wrappers that call the typed API. No edits.

- **`packages/plugins/cartograph/src/tools/vision-show.ts`** (40 lines) and `charge-show.ts`, `piece-show.ts` — call `cartograph.showX(id)` then `composeShow(...)`. No edits to the tool itself; the impl behind `showX` changes (D-read-strategy).

- **`packages/plugins/cartograph/src/tools/vision-list.ts`** (52 lines) and `charge-list.ts`, `piece-list.ts` — call `cartograph.listX(filters)` then render. No edits to the tool itself.

- **`packages/plugins/cartograph/src/tools/vision-patch.ts`** (40 lines) and `charge-patch.ts`, `piece-patch.ts` — currently calls `cartograph.patchX(resolvedId, { codex, updatedAt: now })`. The only mutable companion-doc field today is `codex`. Post-cleanup, `patchX` either:
  - delegates to `clerk.edit({ id, codex })` because `codex` lives on `writ.codex` (cleaner — see D-codex-location), or
  - patches `ext.cartograph.codex` via `clerk.setWritExt(...)` if codex moves into ext (brief literal reading).

- **`packages/plugins/cartograph/src/tools/vision-transition.ts`** (57 lines) and `charge-transition.ts`, `piece-transition.ts` — thin wrappers that call `cartograph.transitionX(resolvedId, { phase, stage, resolution })`. No edits.

- **`packages/plugins/cartograph/src/tools/vision-apply.ts`** (429 lines) — the on-disk vision-apply CLI. Two interaction points with the cleanup:
  - **First-apply path (lines 324–354):** calls `cartograph.createVision({ title, body, codex, phase, stage })` — argument shape stays. Then calls `clerk.setWritExt(doc.id, SURVEYOR_PLUGIN_ID, surveyorPayload)` (line 347). After cleanup the cartograph itself also writes `ext['cartograph']`, but the two slots are independent (cartograph writes its own slot inside its tx; vision-apply writes the surveyor slot in a separate call). Both writes are independent because they're on different sub-slots — no contention.
  - **Nth-apply codex sync (lines 388–394, 411):** calls `cartograph.patchVision(boundId, { codex })` to sync codex changes; calls `cartograph.patchVision(boundId, { stage })` for the rare phase-unchanged-stage-drifted case. Post-cleanup, this routes through whatever D-codex-location decides + a `clerk.setWritExt` for stage drift.
  - **Stage/phase sync (lines 401–411):** the no-op-when-unchanged guard around `transitionVision` stays.
  - The `STAGE_TO_PHASE` constant (lines 76–81), `TERMINAL_PHASES` set (line 87), `SurveyorPayload` interface (lines 94–99), and the sidecar parse / atomic-write-back machinery (lines 128–240) are all unaffected.

- **`packages/plugins/cartograph/README.md`** (326 lines) — the patron-facing reference. Contains companion-book mentions in three load-bearing sections that **must** be updated as part of this commission (concurrent doc updates needed):
  - Header "What ships here" bullet: "Three companion books (`visions`, `charges`, `pieces`) keyed by the writ id, each holding a typed companion document …" (lines 20–22)
  - "Companion documents" subsection (lines 138–153)
  - "Books" table under "Support Kit" (lines 165–169)
  - Plus narrative references to "the companion doc" / "the typed companion document" sprinkled in API descriptions (lines 41, 98–102, 131–137).

### Cartograph package — test surface (must update — internal storage shape changes)

- **`packages/plugins/cartograph/src/cartograph.test.ts`** (936 lines) — the apparatus-level integration tests. Wires real stacks + real clerk + cartograph. Touches the companion books in:
  - `buildFixture(...)` lines 133–141 — pre-creates `cartograph/{visions,charges,pieces}` books on the memory backend. **Drop these `ensureBook` calls** post-cleanup.
  - The CDC-event test "produces exactly one CDC event on the cartograph visions book per creation" (lines 342–364) currently watches `cartograph` `visions` for `create` / `update` events. After cleanup, the equivalent test must watch `clerk` `writs` filtered by `entry.type === 'vision'`. The single-event-per-apply assertion stays — the brief explicitly preserves that guarantee.
  - The "apparatus shape" test "declares the three companion books with the expected indexes" (lines 920–934) **deletes**.
  - The "companion-book separation" tests (lines 867–907) currently assert that `listVisions` / `showCharge` / `showPiece` don't pollute across books. The semantic survives — `listVisions` filters writs by type — so the tests should be rewritten to assert "list scoped to its own type" using the new internals.
  - The lifecycle-coupling tests (lines 671–803) assert `writ.phase` and `doc.stage` move in lockstep. Tests stay; the impl underneath changes.

- **`packages/plugins/cartograph/src/tools.test.ts`** (663 lines) — the 15-tool CLI integration tests. Touches companion books in `buildFixture(...)` lines 147–155 (the same `ensureBook` calls). **Drop those** post-cleanup. The remainder of the test surface — schema-boundary checks, happy paths, format parity — runs through the typed API and is unaffected by the storage shape.

- **`packages/plugins/cartograph/src/tools/vision-apply.test.ts`** (676 lines) — vision-apply integration tests. Same `ensureBook` cleanup in `buildFixture(...)` lines 139–147. The CDC-counter `stacks.watch<VisionDoc>('cartograph', 'visions', …)` (line 162) must move to a writs-book watch filtered by type. The first-apply / Nth-apply / error-path / surveyor-payload assertions otherwise survive.

### Clerk public surface — load-bearing primitives consumed by the cleanup

- **`packages/plugins/clerk/src/types.ts`** (lines 87–174) — the `WritDoc` interface. The `ext?: Record<string, unknown>` slot (lines 122–157) is the load-bearing primitive this commission consumes; its docstring describes the slot-write contract:
  - "There is exactly one sanctioned slot-write path: `ClerkApi.setWritExt(writId, pluginId, value)`, which performs a transactional read-modify-write on the sub-slot keyed by `pluginId` so sibling sub-slots are preserved under concurrent writers."
  - "`transition()` silently strips `ext` from its body, and the generic `put()` / `patch()` paths on the writs book are not supported slot-write mechanisms — every route other than `setWritExt()` would wholesale-replace the slot and clobber sibling sub-slots."

  Important caveat for D1: cartograph today writes to the writs book *directly* via `tx.book<WritDoc>('clerk', 'writs').put(writ)` — bypassing both `clerk.post()` and `clerk.transition()`. The brief's wording about "wrapping clerk.transition + clerk.setWritExt in a single stacks.transaction" is one valid path; another is the existing direct-tx-write pattern with `ext: { cartograph: {...} }` populated inline on the put/patch. Decision D1 governs which.

- **`packages/plugins/clerk/src/clerk.ts`** lines 1188–1213 — `setWritExt(writId, pluginId, value)` impl:

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

  Key behaviors: opens its own `stacks.transaction` (which **flattens** when called inside an outer transaction — see stacks-core.ts line 192 "If already in a transaction, just run (no nesting — flattened)"); preserves sibling sub-slots; bumps `updatedAt`; emits a CDC update event on the writs row. Wholesale-replaces the named sub-slot's value (no merge inside the sub-slot).

- **`packages/plugins/clerk/src/clerk.ts`** lines 1075–1159 — `transition(id, to, fields)` impl. The `fields` parameter strips `id`, `phase`, `status`, `ext`, `createdAt`, `updatedAt`, `resolvedAt`, `parentId` (lines 1146–1149). Throws on illegal phase edges. Stamps `resolvedAt` on terminal moves. Used at most one `clerk.transition` call per `transitionX` if D1 picks the clerk-call pattern.

- **`packages/plugins/clerk/src/clerk.ts`** lines 749–760 — `list(filters)` — supports `phase`, `type`, `classification`, `parentId`, `limit`, `offset`. **Does NOT support a generic `ext.X` filter.** If `listX` filters `stage` at the SQL layer, that route either reads the writs book directly via `stacks.readBook<WritDoc>('clerk', 'writs').find({ where: [['type', '=', 'vision'], ['ext.cartograph.stage', '=', request.stage]] })` or reads via `clerk.list({ type: 'vision' })` and post-filters in JS. See D-read-strategy.

- **`packages/plugins/clerk/src/clerk.ts`** lines 1240–1247 — the writs-book index declaration: `indexes: ['phase', 'type', 'createdAt', 'parentId', ['phase', 'type'], ['phase', 'createdAt'], ['parentId', 'phase']]`. **No `ext.X` index exists** — the writs book is owned by clerk and cartograph cannot contribute indexes to it. After cleanup, `listVisions({ stage: 'active' })` is a `type = 'vision'`-indexed prefix scan with a `json_extract(content, '$.ext.cartograph.stage') = ?` post-filter (works at SQL layer; not index-served). For the present data scale this is fine; for future scale see D-indexing.

- **`packages/plugins/clerk/src/children-behavior-engine.ts`** — fires only on `phase`-changes (`entry.phase !== prev.phase`). A `setWritExt` update (phase-unchanged) is a silent no-op for the cascade engine. Cartograph types declare no `childrenBehavior` block, so even phase-changes don't engage the cascade for vision/charge/piece types. **Do not Read.** — load-bearing only as a constraint analysis input.

### Stacks query layer — load-bearing primitive

- **`packages/plugins/stacks/src/query.ts`** lines 14–21 — `validateFieldName(field)`: `SAFE_FIELD_RE = /^[A-Za-z0-9_.-]+$/` permits dot-notation paths.

- **`packages/plugins/stacks/src/sqlite-backend.ts`** lines 47–53 — `toJsonPath` / `jsonExtract` translate `'ext.cartograph.stage'` to `json_extract(content, '$.ext.cartograph.stage')`. So a `where: [['ext.cartograph.stage', '=', 'draft']]` clause runs at the SQL layer (just unindexed).

- **`packages/plugins/stacks/src/field-utils.ts`** lines 14–22 — `getNestedField` walks dot-paths in JS (used by the memory backend).

- **`packages/plugins/stacks/src/cdc.ts`** lines 87–145 — `coalesceEvents`: in-transaction events on the same row coalesce. `create`-then-`update` becomes a single Phase 2 `create` event with the final state. So clerk.post + clerk.setWritExt under one tx emits one Phase 2 create event. Phase 1 still sees both (failOnError handlers run synchronously inside the tx). For cartograph types, no Phase 1 observer cares (children-behavior-engine no-ops without childrenBehavior; the cascade is the only Phase 1 writs-book observer in the framework).

- **`packages/plugins/stacks/src/stacks-core.ts`** line 192 — transactions **flatten** (no nesting). A `stacks.transaction(...)` call inside an active transaction reuses the existing backendTx. So `clerk.setWritExt` (which opens its own tx) inside an outer cartograph tx commits with the outer.

### Surveying-cascade arch doc — direct edits per brief §6

- **`docs/architecture/surveying-cascade.md`** (733 lines) — settled architectural reference. The brief enumerates three sections that **must** be rewritten:

  - **§3.4 — Companion `SurveyDoc` holds envelope metadata only** (lines 175–190). Current shape:

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

    Brief rewrites this so envelope metadata lives in `status['surveyor']` / `ext['surveyor']` sub-slots on the survey writ rather than in a `books.surveys` companion. Specifically:
      - `targetNodeId` is redundant with `writ.parentId` — drop.
      - `rigName` is redundant with `writ.type` — drop.
      - `completedAt` is redundant with `writ.resolvedAt` — drop.
      - `rigVersion` and `surveyorId` move to `status['surveyor']` (set by the substrate on completion).

  - **§3.6 — Substrate watches cartograph CDC** (lines 210–238). Current text lists three book-event streams (`book.cartograph.visions.{created,updated}`, `…charges.…`, `…pieces.…`). Rewrite to a single subscription on the writs book filtered by `writ.type ∈ {vision, charge, piece}`. The single-event-per-apply guarantee discussion stays — its phrasing shifts from "wrap createVision + transition in one transaction" to "the cartograph's createX/transitionX primitives are already transactional" with the same outcome (one CDC-significant phase transition per apply).

  - **§3.7 — Substrate plugin shape** (lines 240–266). Bullet list under `@shardworks/surveyor-apparatus`. Drop `books.surveys` from "Owns" list; substrate now owns the `status['surveyor']` and `ext['surveyor']` slots on survey writs. Replace "Stamps SurveyDoc on completion" with "Stamps `status['surveyor']` on completion."

  Plus: incidental references elsewhere in the doc may need consistency touch-ups (e.g. §2's flow diagram lines 65–67 mentions `book.cartograph.visions.{created,updated}`; §4.1 worked-example references). The brief notes these "may need to be touched up" without enumerating; the artificer should grep for `book\.cartograph` and reconcile.

### Other doc files (mentions only — no changes)

- **`docs/architecture/index.md`** line 69 — mentions the cartograph in flavor text ("the cartograph-decomposition substrate"). No companion-book mention. **Do not Read.** beyond verifying.

- **`docs/guild-metaphor.md`** lines 183–187 — flavor text on the Surveyor's role. No companion-book mention. **Do not Read.** beyond verifying.

## Existing patterns the implementer should mirror

### Plugin-id-keyed `ext` sub-slot — Reckoner precedent

The Reckoner already owns `writ.ext['reckoner']` per `packages/plugins/reckoner/src/types.ts`:

```typescript
export const RECKONER_PLUGIN_ID = 'reckoner' as const;
```

Reckoner exports `RECKONER_PLUGIN_ID` so callers / tests can address the slot without string-typo risk. The cartograph cleanup should do the same — define and export a `CARTOGRAPH_PLUGIN_ID = 'cartograph'` constant. (See D-plugin-id-constant.)

The Reckoner stamps its slot via `clerk.setWritExt(writId, RECKONER_PLUGIN_ID, ext)` from `packages/plugins/reckoner/src/reckoner.ts` line 1269 — its `petition()` flow is two-step (post then stamp) and **non-atomic by design** (per its own docstring: "Two-step and non-atomic by design (D7)"). The cartograph's create+stamp is **atomic by design**, so the Reckoner's two-step pattern doesn't transfer; the comparison is the slot ownership / constant convention.

### Plugin-id constant convention

```typescript
export const RECKONER_PLUGIN_ID = 'reckoner' as const;        // packages/plugins/reckoner/src/types.ts
export const CLERK_PLUGIN_ID = 'clerk';                       // packages/plugins/clerk/src/types.ts
export const SURVEYOR_PLUGIN_ID = 'surveyor';                 // packages/plugins/cartograph/src/tools/vision-apply.ts
```

Apply the same shape: `export const CARTOGRAPH_PLUGIN_ID = 'cartograph' as const;` in `types.ts` (re-exported from `index.ts`).

### Direct-tx-book write pattern (existing in cartograph)

Today's `createVision` already writes the writs book directly via `tx.book<WritDoc>('clerk', 'writs')`, bypassing `clerk.post()`. The cleanup retains this pattern by simply adding `ext: { cartograph: { stage } }` to the writ object before the put. Reference shape (illustrative):

```typescript
const writ: WritDoc = {
  id: childId, type: 'vision', phase: requestedPhase,
  title: request.title, body: request.body,
  ...(request.codex !== undefined ? { codex: request.codex } : {}),
  ext: { [CARTOGRAPH_PLUGIN_ID]: { stage: requestedStage } },
  createdAt: now, updatedAt: now,
};
await txWritsBook.put(writ);
```

This emits one Phase 1 create event on the writs book — strictly cleaner than `clerk.post + clerk.setWritExt` (two Phase 1 events that coalesce only at Phase 2). See D1.

### Direct-tx-book patch pattern with ext rmw (cleanup-time pattern)

For `transitionX`, the rmw on the ext sub-slot inside the same tx that patches phase looks like:

```typescript
return stacks.transaction(async (tx) => {
  const txWritsBook = tx.book<WritDoc>('clerk', 'writs');
  const writ = await txWritsBook.get(id);
  // … allowedTransitions / classification checks …
  const prevExt = (writ.ext ?? {}) as Record<string, unknown>;
  const nextExt = { ...prevExt, [CARTOGRAPH_PLUGIN_ID]: { stage: request.stage } };
  const writPatch: Partial<Omit<WritDoc, 'id'>> = {
    phase: request.phase,
    ext: nextExt,
    updatedAt: now,
    ...(isTerminal ? { resolvedAt: now } : {}),
    ...(request.resolution !== undefined ? { resolution: request.resolution } : {}),
  };
  await txWritsBook.patch(id, writPatch);
  // Project a doc-shape return value (id from writ, stage from ext, codex from writ.codex, timestamps from writ).
  return projectVisionDoc(writ, /* updated phase / stage / timestamps */);
});
```

This emits one Phase 1 update event with both phase and ext changed atomically — strictly cleaner than `clerk.transition + clerk.setWritExt` (two Phase 1 update events). See D1.

### Read-side projection helper (new — replaces companion-book reads)

Each `showX` / `listX` needs a small projection helper that turns a `WritDoc` into a `{Vision,Charge,Piece}Doc` shape. Sketch:

```typescript
function projectVisionDoc(writ: WritDoc): VisionDoc {
  const ext = (writ.ext?.[CARTOGRAPH_PLUGIN_ID] ?? {}) as { stage?: VisionStage };
  if (ext.stage === undefined) {
    throw new Error(`[cartograph] writ "${writ.id}" missing ext['cartograph'].stage — wrong type or never stamped.`);
  }
  return {
    id: writ.id,
    stage: ext.stage,
    ...(writ.codex !== undefined ? { codex: writ.codex } : {}),
    createdAt: writ.createdAt,
    updatedAt: writ.updatedAt,
  };
}
```

Codex location follows D-codex-location (writ.codex vs ext.cartograph.codex). The fail-loud-on-missing-stage check matches the framework's wider fail-loud convention (writ-presentation tolerates missing-types with `'unknown'`; cartograph's typed API can be stricter because it controls the writes).

### Stacks where-clause for ext-field filtering

```typescript
const writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
const docs = await writsBook.find({
  where: [
    ['type', '=', 'vision'],
    ...(filters?.stage !== undefined ? [['ext.cartograph.stage', '=', filters.stage]] : []),
    ...(filters?.codex !== undefined ? [['codex', '=', filters.codex]] : []),  // assuming D-codex-location picks writ.codex
  ],
  orderBy: ['createdAt', 'desc'],
  limit: filters?.limit ?? 20,
  ...(filters?.offset !== undefined ? { offset: filters.offset } : {}),
});
return docs.map(projectVisionDoc);
```

Field name `'ext.cartograph.stage'` passes `validateFieldName` (regex matches) and translates to `json_extract(content, '$.ext.cartograph.stage')` on SQLite. Memory backend uses `getNestedField`. Both backends already support this idiom — confirmed by the field-utils helper and the sqlite-backend's `toJsonPath`.

## Cross-cutting concerns

- **CDC observers on the writs book.** Phase 1: `clerk/children-behavior-engine` (only fires on phase-changes; cartograph types declare no `childrenBehavior` so the cascade is a no-op for them either way). Phase 2: `sentinel/reckoner` (cascade observer), `clockworks/writ-lifecycle-observer` (signal-emission observer). All are unaffected by the cleanup — no observer keys on `cartograph.{visions,charges,pieces}` book events anywhere in the repo.
- **The `nsg writ ext` raw display surface.** `nsg writ show <vision-id>` renders the writ's raw `ext` as part of its JSON shape (via the writ-show tool / writ-presentation projection); after cleanup the same call surfaces `{ ext: { cartograph: { stage: 'draft' } } }` as raw JSON. This is consistent with how `ext.reckoner` and `ext.surveyor` already render today. The `nsg vision show` / `nsg charge show` / `nsg piece show` tools render the lifecycle-aware `Stage:` row separately (per D18 in the original cartograph commission spec); that surface stays.
- **Substrate (future Commission C) CDC subscription shape.** Per the brief and the surveying-cascade doc updates, the substrate will subscribe to `clerk/writs` via `stacks.watch<WritDoc>('clerk', 'writs', handler, { failOnError: false })` and filter by `entry.type ∈ {vision, charge, piece}`. The handler reads `entry.ext?.['surveyor']` for priority hints; `entry.ext?.['cartograph']` for stage. This is a structurally trivial change from the current per-book subscription model.
- **`pnpm test` blast radius.** Three test files in the cartograph package change (cartograph.test.ts, tools.test.ts, vision-apply.test.ts). No other package's tests are affected — confirmed by the absence of cross-package consumers.

## Concurrent doc updates needed

Within the cartograph package, the implementing artificer should fix these inline (do **not** lift to observations):

- **`packages/plugins/cartograph/README.md`** — drop the three companion-book mentions (header bullet line 20–22, "Companion documents" subsection line 138–153, "Books" table line 165–169). Update the `CartographApi` block (lines 105–129) only if signatures change (per brief §2 they should not). Update the `VisionDoc` / `ChargeDoc` / `PieceDoc` shape block (lines 140–148) per D-doc-shape's resolution.
- **`packages/plugins/cartograph/src/cartograph.ts`** — module-level docstring (lines 1–34) explicitly describes the "three companion books under owner id `cartograph`" pattern and the createX / transitionX two-book write boundary. Rewrite to describe the post-cleanup shape (single writ row, ext['cartograph'] sub-slot).
- **`packages/plugins/cartograph/src/types.ts`** — module-level docstring (lines 1–17) and per-interface docstrings describe "companion document … keyed by the writ id one-for-one" and "vision text lives on `writ.body`; the companion docs carry typed metadata only." Rewrite to describe the projection-over-writ-row shape.
- **`packages/plugins/cartograph/src/tools/render.ts`** — module-level docstring decision references (lines 1–17) refer to "companion doc + writ row" composition. Update for clarity though the byte-shape stays the same.
- **`packages/plugins/cartograph/src/tools/vision-apply.ts`** — header docstring (lines 1–20) describes the apply tool snapshotting "into the cartograph as a vision writ + companion VisionDoc". Tweak the wording to drop "+ companion VisionDoc" since the doc is now a projection.
- **`docs/architecture/surveying-cascade.md`** — covered above as in-scope (not concurrent — it's a brief-named surface).

