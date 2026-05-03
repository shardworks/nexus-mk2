# Cartograph: collapse companion docs into `writ.ext['cartograph']`

## Intent

Collapse the cartograph's three companion books (`cartograph/visions`, `cartograph/charges`, `cartograph/pieces`) into a single per-writ `writ.ext['cartograph'] = { stage }` sub-slot, and update the surveying-cascade architecture document so it leads with the post-cleanup shape. The `CartographApi` typed surface stays byte-stable — every existing method keeps the same arguments and return shapes — but the internals shed three Stacks books, three companion-doc rows, and the dual-write transactional ceremony that paired them.

## Rationale

The companion-doc pattern was the pre-`ext` workaround for plugin-owned writ metadata. Now that `clerk.setWritExt` and the `writ.ext` slot exist as the sanctioned plugin-keyed metadata path, the three cartograph books carry pure metadata that belongs on the writ row itself. Landing this cleanup before the surveyor-apparatus is built (Commission C in the surveying-cascade design subtree) lets the substrate be briefed and built against the post-cleanup shape rather than reshaping after the fact — its CDC observer becomes a single writ-type-filtered subscription rather than per-companion-book wiring.

## Scope & Blast Radius

**Single-package code scope** — `packages/plugins/cartograph/` is the only package whose source changes. The `CartographApi` typed surface stays byte-stable, so consumers (CLI tools shipped by other packages, vision-apply, integration tests outside the package) need no source edits.

**Cross-cutting concerns:**

1. **Three companion books and their fixtures must be removed.** The `cartograph/visions`, `cartograph/charges`, `cartograph/pieces` Stacks books vanish from `supportKit`, and every `MemoryBackend.ensureBook({ ownerId: 'cartograph', ... })` call in the package's three test files goes with them. Verify with grep across the cartograph package and the docs tree for the three book names and for `ownerId: 'cartograph'`.

2. **Architecture-doc rewrite.** `docs/architecture/surveying-cascade.md` has three load-bearing sections (§3.4, §3.6, §3.7) plus several incidental references that describe the companion-doc shape. They must shift to the projection / writs-book-CDC shape. Verify by grepping the doc for `SurveyDoc`, `books.surveys`, `book.cartograph.`, and `companion`; only references that survive the rewrite (or describe what was replaced) should remain.

3. **Atomicity invariant.** `clerk.transition` silently strips `ext` from its body. Every operation that mutates both `writ.phase` and `writ.ext['cartograph']` must wrap its primitives in a single `stacks.transaction` so the pair commits atomically. This applies to `createX` (when bootstrapping into a non-initial stage) and `transitionX`.

4. **Single-event-per-apply CDC guarantee.** Stacks coalesces same-writ writes within one transaction into one CDC event per writ id. This commission must preserve that property — today the test asserts it against `('cartograph', 'visions')`; post-cleanup the assertion shifts to `('clerk', 'writs')` filtered by `writ.type`.

5. **Typed-API-is-the-validator invariant.** A writ created via raw `clerk.post({ type: 'vision' })` (bypassing the cartograph) has no `ext.cartograph` slot. `showX` must throw on the missing slot; `listX` must skip such orphans at the storage layer.

6. **README and JSDoc prose.** The cartograph README and the file-level / inline doc comments inside `cartograph.ts`, `types.ts`, and the 16 tool files all reference "companion documents" and the three books. Verify with grep across the package for `companion doc`, `companion book`, `cartograph/visions`, `cartograph/charges`, `cartograph/pieces`.

## Decisions

| #   | Decision                                                                       | Default                                                                                       | Rationale                                                                                                                                            |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `createX` writ-row + ext-slot atomicity strategy                               | Hand-rolled `txWrits.put({...writ, ext: {...}})` inside a cartograph-opened tx                | Existing cartograph already replicates `clerk.post`'s validation by hand; direct put with ext baked in avoids a duplicate parent-read round-trip.    |
| D2  | `transitionX` phase + ext-slot atomicity strategy                              | Wrap `clerk.transition` + `clerk.setWritExt` in one `stacks.transaction`                      | Removes duplicated phase-edge validation in favor of clerk's single-source primitive; brief literal.                                                 |
| D3  | `CartographExt` slot shape                                                     | `{ stage }` only — no `codex` field                                                           | `writ.codex` already exists; carrying it in the ext slot would recreate the very duplicate-field drift surface this cleanup eliminates.              |
| D4  | `patchX({ codex })` write path                                                 | Direct `txWrits.patch({ codex })` (bypassing `clerk.edit`'s `new`-only restriction)           | `clerk.edit`'s restriction would break vision-apply's Nth-apply codex-sync; the typed cartograph API is the validator at this surface.               |
| D5  | `CartographExt` export visibility                                              | Define and export from `types.ts`; re-export from `index.ts`                                  | Mirrors Reckoner's `ReckonerExt` precedent; cheap to expose for downstream readers (e.g. surveyor-apparatus reading the slot type-safely).           |
| D6  | `showX(id)` read path                                                          | `clerk.show(id)` then project                                                                 | Apparatus-boundary principle — reads cross the typed clerk boundary so future cross-cutting concerns added there are honored.                        |
| D7  | Index for `ext.cartograph.stage` on the writs book                             | Accept full-scan; no edit to clerk's writs-book index list                                    | Apparatus-boundary forbids cartograph adding indexes to clerk's book; brief explicitly accepts the full scan; substrate-level fix lives in obs-1.    |
| D8  | `VisionDoc.createdAt` / `updatedAt` semantics                                  | Project from `writ.createdAt` / `writ.updatedAt`                                              | Brief literal; the projection types' shapes are preserved.                                                                                           |
| D9  | `[key: string]: unknown` index signature on the doc shapes                     | Keep verbatim                                                                                 | Brief prescribes type-shape preservation; forward-compat with future fields.                                                                         |
| D10 | CDC test watcher post-cleanup                                                  | Watch `('clerk', 'writs')`, filter by `writ.type === <expected>`                              | Aligns the test with the post-cleanup observer shape prescribed by §3.6 of the arch doc rewrite.                                                     |
| D11 | Single-event-per-apply guarantee                                               | Preserved by Stacks tx coalescing; tests assert it explicitly                                 | Correctness invariant, not optimization. Brief: "This is a correctness requirement, not an optimization."                                            |
| D12 | `showX` behavior when `ext.cartograph` slot is missing                         | Throw                                                                                         | Fail-loud over silent fallback; typed-API-is-the-validator means a missing slot is a bypass bug worth surfacing.                                     |
| D13 | Test-fixture `ensureBook` calls for the three companion books                  | Delete entirely                                                                               | Dead fixture code; remove rather than deprecate.                                                                                                     |
| D14 | `patchX` handling of caller-supplied managed fields (`id`, `createdAt`, `updatedAt`) | Reject loudly                                                                            | Fail-loud over silent strip; caller-supplied managed fields are caller bugs.                                                                         |
| D15 | `createVision({ stage })` non-initial-stage bootstrap path                     | Write at initial phase + setWritExt + `clerk.transition` to requested phase, all in one tx   | Brief literal; reuses `clerk.transition`'s phase-edge validation. Stacks coalesces, so still one CDC event per writ id.                              |
| D16 | `listX` behavior on writs missing `ext.cartograph` slot                        | Filter at storage layer with `['ext.cartograph.stage', 'IS NOT NULL']`                        | Separation of concerns — `showX` (D12) stays fail-loud for targeted reads; bulk reads stay forgiving.                                                |
| D17 | `createX` return-value source                                                  | Re-read via `clerk.show(id)` after the tx commits, then project                               | Always reflects actual stored state; safer for any future writ-side mutation added in `createX`.                                                     |
| D18 | `vision-patch.ts` / `charge-patch.ts` / `piece-patch.ts` leftover `updatedAt` argument | Remove the argument                                                                   | Drop the dead argument; matches D14's loud-reject choice.                                                                                            |
| D19 | `supportKit.books` post-cleanup shape                                          | Drop the `books` key from `supportKit` entirely                                               | Empty `books: {}` is dead bookkeeping; removal makes the apparatus declaration accurately reflect post-cleanup reality.                              |
| D20 | Whether `transitionX` must merge prior `ext.cartograph` contents               | No — `setWritExt(id, 'cartograph', { stage })` writes the whole slot                          | D3's stage-only slot has no sibling field to preserve.                                                                                               |
| D21 | README's `What is *not* in this commission` section                            | Retain unchanged                                                                              | Section is historical context for the original cartograph delivery commission; the listed exclusions still hold post-cleanup.                        |
| D22 | README's `Books` table row                                                     | Replace with a `writ.ext['cartograph']` slot description                                      | Integrators reading the README want to know where the data lives; ext-slot description is more useful than dropping the section entirely.            |

## Acceptance Signal

1. `pnpm -w typecheck` passes.
2. `pnpm -w test --filter cartograph` passes — the three test files (`cartograph.test.ts`, `tools.test.ts`, `vision-apply.test.ts`) run green with their CDC-watch targets shifted to `('clerk', 'writs')` filtered by `writ.type` and the `MemoryBackend.ensureBook` calls for the three companion books removed.
3. `grep -rn "cartograph/visions\|cartograph/charges\|cartograph/pieces\|ownerId: 'cartograph'\|book\.cartograph\." packages/ docs/` returns no matches that describe live state — only references explaining the *removal* (e.g. a regression assertion that the books no longer exist) are permitted.
4. The cartograph apparatus tests assert the single-event-per-apply CDC guarantee explicitly: a CDC watcher on `('clerk', 'writs')` filtered by `writ.type === 'vision'` observes exactly one event per `createVision({ stage: 'active' })` call (D11).
5. `cartograph.showVision(id)` on a writ created via raw `clerk.post({ type: 'vision' })` throws (D12); `cartograph.listVisions()` does not surface that orphan in its results (D16).
6. `cartograph.patchVision(id, { updatedAt: '...' })` (and parallels for `id` / `createdAt`) throws with a clear caller-error message (D14); the three patch tools no longer pass `updatedAt` in their requests (D18).
7. The cartograph apparatus declaration's `supportKit` no longer carries a `books` key (D19); a test asserts this directly.
8. `docs/architecture/surveying-cascade.md` §3.4/§3.6/§3.7 read against the post-cleanup shape; no surviving reference to `books.surveys`, the `SurveyDoc` companion-book shape, or per-companion-book CDC subscriptions remains except where the doc explicitly notes "previously…".
9. `packages/plugins/cartograph/README.md`'s `Books` subsection has been replaced with a `writ.ext['cartograph']` slot description (D22); the `What is *not* in this commission` section is unchanged (D21).

## Reference Material

### Existing API surfaces the new code calls into

**`ClerkApi.setWritExt`** — `packages/plugins/clerk/src/types.ts` lines 669–695. Role: the load-bearing primitive for slot writes. Performs read-modify-write of `writ.ext`, preserving sibling plugin slots; opens its own `stacks.transaction` (nested-flattened when wrapped by an outer tx). `value` is opaque — Clerk does not validate sub-slot contents. Throws on empty `writId`, empty `pluginId`, or missing writ. Emits exactly one update CDC event on the writs book.

```typescript
setWritExt(writId: string, pluginId: string, value: unknown): Promise<WritDoc>;
```

**`WritDoc.ext`** — `packages/plugins/clerk/src/types.ts` lines 124–157. Role: the slot itself.

```typescript
ext?: Record<string, unknown>;
```

**`ClerkApi.transition`** — `packages/plugins/clerk/src/clerk.ts` lines 1065–1159. Role: phase-edge validation and writ-row patch. Strips managed fields (`id`, `phase`, `status`, `ext`, timestamps, `resolvedAt`, `parentId`) from its body — hence the §3 atomicity rule. Does **not** open its own transaction; joins the ambient one via Stacks AsyncLocalStorage when wrapped.

**`ClerkApi.show`** — Clerk's typed read path. Role: the apparatus-boundary read used by `showX` (D6) and the post-tx re-read in `createX` / `transitionX` (D17).

**Stacks dot-notation field queries** — `packages/plugins/stacks/src/query.ts`. Role: powers `listX` filters. `validateFieldName` allows `[A-Za-z0-9_.-]+`; the SQLite backend translates to `json_extract(content, '$.ext.cartograph.stage')`. Conformance test 3.11 confirms behavior. **Unindexed** on the writs book — full-scan-acceptable per D7.

**Stacks `IS NOT NULL` operator** — `docs/architecture/apparatus/stacks.md` line 179 documents the supported operator forms; `[string, 'IS NULL' | 'IS NOT NULL']` is among them. Role: the storage-layer filter that keeps orphaned (slot-less) writs out of `listX` results per D16.

**Stacks nested-tx flattening** — Stacks conformance test 2.28: "Nested explicit transactions are flattened into the outer transaction." Role: lets the cartograph wrap `clerk.transition` + `clerk.setWritExt` (each of which opens its own internal tx) inside one outer `stacks.transaction(...)` and have all writes commit atomically with one CDC event per writ id.

### Pattern to mirror — Reckoner's `setWritExt` write idiom

`packages/plugins/reckoner/src/reckoner.ts` line 1269. Role: the production-shape `setWritExt` call. Reckoner is a one-shot stamp (slot is immutable thereafter); cartograph is a phase-coupled writer (slot evolves with `writ.phase`). The call shape is identical — the difference is the surrounding tx wrapping, which Reckoner does not need.

```typescript
await clerk.setWritExt(writId, RECKONER_PLUGIN_ID, ext);
```

### Stage enums & projection types — kept verbatim

From `packages/plugins/cartograph/src/types.ts`. Role: the projection types whose shapes the brief preserves verbatim. The `[key: string]: unknown` index signature stays (D9); `createdAt` / `updatedAt` are projected from the writ (D8); the projections become projections-over-writ rather than `BookEntry`-bearing rows.

```typescript
type VisionStage = 'draft' | 'active' | 'sunset' | 'cancelled';
type ChargeStage = 'draft' | 'active' | 'validated' | 'dropped';
type PieceStage  = 'draft' | 'active' | 'done' | 'dropped';

interface VisionDoc {
  [key: string]: unknown;
  id: string;
  stage: VisionStage;
  codex?: string;
  createdAt: string;
  updatedAt: string;
}
// ChargeDoc and PieceDoc parallel; only the `stage` field's type changes.
```

The new exported type (per D5):

```typescript
interface CartographExt {
  stage: VisionStage | ChargeStage | PieceStage;
}
```

### Writs-book schema — context for D7's full-scan choice

From `packages/plugins/clerk/src/clerk.ts` lines 1240–1247. Role: explains why `ext.cartograph.stage` filters cannot be indexed without a cross-package change. `Do not Read.` further; this commission does not edit this file.

```typescript
books: {
  writs: { indexes: ['phase', 'type', 'createdAt', 'parentId',
    ['phase', 'type'], ['phase', 'createdAt'], ['parentId', 'phase']] },
  links: { indexes: ['sourceId', 'targetId', 'label',
    ['sourceId', 'label'], ['targetId', 'label']] },
},
```

### Sites tagged `concurrent doc updates needed`

The implementer rewrites these inline as part of this commission — they are not separate follow-ups.

- **`packages/plugins/cartograph/README.md`** — drop the `Books` table row and replace with an `ext['cartograph']` slot description (D22); rewrite the `Companion documents` subsection (lines 138–153 today) to describe the projection over the slot; retain the `What is *not* in this commission` section unchanged (D21).
- **`docs/architecture/surveying-cascade.md`** — three load-bearing rewrites and incidental polish; see the section sketches below.
- **File-level docstrings in `packages/plugins/cartograph/src/cartograph.ts` (lines 1–34) and `packages/plugins/cartograph/src/types.ts` (lines 1–17)** — both currently reference "three companion books" and the companion-doc convention; rewrite to projection / ext-slot language.
- **The 16 tool files in `packages/plugins/cartograph/src/tools/`** — JSDoc comments referencing "companion doc" need projection language. Most are 1–2 lines per file.
- **`cartograph.ts`'s in-line comment at lines 304–307** — currently explains why `clerk.post` cannot be used because Clerk's `post` does not accept an external transaction context. That justification is stale post-cleanup; replace with a comment explaining the ext-slot writeback strategy (D1's hand-rolled put baking the ext field in directly).

### `surveying-cascade.md` §3.4 / §3.6 / §3.7 — what each section currently says and what it must become

**§3.4 — "Companion `SurveyDoc` holds envelope metadata only"** (lines 175–190 today). Currently inlines a `SurveyDoc` interface and notes it is "Owned by the surveyor-apparatus substrate." Rewrite: surveyor-writ envelope metadata moves to `status['surveyor']` / `ext['surveyor']` sub-slots on the survey writ; `targetNodeId` is `writ.parentId`; `rigName` is `writ.type`; `completedAt` is redundant with `writ.resolvedAt`.

**§3.6 — "Substrate watches cartograph CDC — single-event-per-apply guarantee"** (lines 210–238 today). Currently subscribes to `book.cartograph.visions.{created,updated}` / `book.cartograph.charges.{created,updated}` / `book.cartograph.pieces.{created,updated}`. Rewrite to a single subscription on the writs book filtered by `writ.type ∈ {vision, charge, piece}`. The single-event-per-apply discussion stays — phrasing shifts from "wrap createVision + transition in one transaction" to "the cartograph's createX/transitionX primitives are already transactional," same outcome.

**§3.7 — "Substrate + extension + default plugin shape"** (lines 240–266 today). The "**`@shardworks/surveyor-apparatus`** *(substrate)*" block at lines 248–259 lists "Owns survey writ types and `books.surveys`." Drop `books.surveys`; replace with "Owns the `status['surveyor']` and `ext['surveyor']` slots on survey writs." Likewise replace the "Stamps SurveyDoc on completion" bullet with "Stamps `status['surveyor']` on completion."

**Incidental references to verify and lightly polish:**

- Line 39 (vocabulary table): "snapshotted into a writ + VisionDoc by the cartograph" — VisionDoc projection name stays; reword as "snapshotted into a writ by the cartograph" if cleaner reads.
- Line 44 (vocabulary table SurveyDoc row): drop entirely, or replace with an `ext['surveyor']` / `status['surveyor']` row if vocabulary still needs that surface.
- Lines 64–66 (flow diagram): "creates or updates the vision writ + VisionDoc (one transaction)" — `+ VisionDoc` becomes implicit since the doc is a projection.
- Line 137: "CDC fires on the cartograph book" → "CDC fires on the writs book."
- Line 446 (example call `cartograph.createVision({ ..., stage: 'active' })`): fine as-is; the API surface is preserved.

### Files cited only for context (not edited)

- `packages/plugins/cartograph/src/tools/vision-apply.ts` — load-bearing for D4. The Nth-apply path calls `patchVision(boundId, { codex })` AFTER the writ has typically moved past `new`. The patchX implementation must continue to honor that call.
- `packages/plugins/cartograph/vision-keeper.md` — placeholder stub for a future commission. `Do not Read.`
- `docs/architecture/index.md`, `docs/guild-metaphor.md`, `docs/architecture/apparatus/clerk.md` — referenced for orientation only; this commission does not edit them. `Do not Read.`

## What NOT To Do

- **Do not rename or restructure `VisionDoc` / `ChargeDoc` / `PieceDoc`.** Their names and shapes (including the `[key: string]: unknown` index signature, per D9) stay verbatim.
- **Do not migrate any historical companion-doc rows.** No migration is shipped; the brief explicitly waives it because the cartograph is recently shipped and no production-style guild data depends on the books.
- **Do not extend `clerk.setWritExt` or any other Clerk primitive.** This commission consumes the API; it does not modify it.
- **Do not edit `packages/plugins/clerk/src/clerk.ts`'s writs-book index list (lines 1240–1247) to add `ext.cartograph.stage` indexes.** The full-scan is intentional (D7); the substrate-level fix lives in obs-1 for a downstream commission.
- **Do not rework SurveyDoc itself.** Surveyor-apparatus is Commission C and does not exist yet; this commission only updates the arch doc to lead with the post-cleanup shape.
- **Do not migrate Astrolabe `PlanDoc` or any other companion-doc pattern in the framework.** Out of scope per the brief; tracked as obs-2.
- **Do not add `codex` to the `CartographExt` slot.** D3 selects stage-only; the `codex` field continues to live on `writ.codex`. The brief literal would have included it; the patron confirmed stage-only.
- **Do not silently strip caller-supplied managed fields in `patchX`.** D14 requires loud rejection; D18 removes the now-rejected `updatedAt` argument from the three patch tools to match.
- **Do not coerce a default stage on missing `ext.cartograph` slot in `showX`.** D12 requires throw.
- **Do not delegate `createX` to `clerk.post`.** D1 selects hand-rolled `txWrits.put({...writ, ext: {...}})` to keep the createX path to a single tx-write and avoid the duplicate parent-read.
- **Do not delegate `patchX({ codex })` to `clerk.edit`.** D4 selects direct `txWrits.patch` to preserve vision-apply's Nth-apply codex-sync contract.
- **Do not leave `books: {}` as an empty bookkeeping shell on `supportKit`.** D19 drops the key entirely.
- **Do not fold the vision-keeper agent runtime, the per-type tree command, link kinds, or `childrenBehavior` cascade into this commission.** They were excluded from the original cartograph delivery and remain excluded; D21 retains the README's historical context.

<task-manifest>
  <task id="t1">
    <name>Add `CartographExt` and shift the projection types' role</name>
    <files>packages/plugins/cartograph/src/types.ts; packages/plugins/cartograph/src/index.ts</files>
    <action>Add the `CartographExt` interface as defined in the brief's Reference Material (per D3, stage-only) and export it from the package barrel (per D5). Leave `VisionDoc` / `ChargeDoc` / `PieceDoc` shapes verbatim including the `[key: string]: unknown` index signature (per D8 / D9). Update the file-level docstrings in `types.ts` and the comment in `index.ts` to describe the doc shapes as projections over `writ.ext['cartograph']` rather than companion-book rows. No runtime behavior changes in this task.</action>
    <verify>pnpm -w typecheck</verify>
    <done>`CartographExt` is exported from `@shardworks/cartograph`; the doc-projection types still type-check; comments in `types.ts` and `index.ts` no longer describe companion books.</done>
  </task>

  <task id="t2">
    <name>Rewrite the cartograph apparatus internals against `writ.ext['cartograph']`</name>
    <files>packages/plugins/cartograph/src/cartograph.ts</files>
    <action>Rewrite every method on `CartographApi` to read and write `writ.ext['cartograph']` instead of the companion books, preserving the typed-API surface byte-for-byte. Apply each locked decision: `createX` opens a `stacks.transaction`, validates parent-type rules inline against the writs book, hand-rolls `txWrits.put({...writ, ext: { cartograph: { stage } } })` (per D1), and — when the requested stage is non-initial — calls `clerk.transition` to the requested phase inside the same tx (per D15); after the tx commits, re-reads via `clerk.show(id)` and projects the return value (per D17). `transitionX` wraps `clerk.transition(id, phase, { resolution })` and `clerk.setWritExt(id, 'cartograph', { stage })` in one `stacks.transaction` (per D2 / D20), drops the inline phase-edge validation now that clerk owns it, then re-reads and projects. `showX` calls `clerk.show(id)`, rejects when `writ.type !== <expected>`, throws when `writ.ext?.cartograph?.stage` is absent, and projects (per D6 / D12). `listX` queries `('clerk', 'writs')` with `where: [['type', '=', <type>], ['ext.cartograph.stage', 'IS NOT NULL'], ...optional stage and codex predicates]` (per D7 / D16). `patchX` rejects caller-supplied `id` / `createdAt` / `updatedAt` loudly (per D14), routes `codex` to a direct `txWrits.patch({ codex, updatedAt: now })` inside its own tx (per D4), and routes `stage` through `clerk.setWritExt(id, 'cartograph', { stage })`. Drop the `books` key from `supportKit` entirely (per D19); the `start()` block no longer opens any cartograph-owned book handles. Replace the stale comment at lines 304–307 (companion-book justification) with a comment describing the ext-slot writeback strategy. Keep the writ-type configs (`VISION_CONFIG` / `CHARGE_CONFIG` / `PIECE_CONFIG`), `INITIAL_STAGE`, the stage→phase mapping, and `validateParent` unchanged.</action>
    <verify>pnpm -w typecheck</verify>
    <done>The cartograph apparatus compiles with no `cartograph/visions` / `cartograph/charges` / `cartograph/pieces` book references in the source; `supportKit` exposes no `books` key; every CartographApi method reads/writes the ext slot through the strategies prescribed by D1–D7, D12, D14–D17, D19–D20.</done>
  </task>

  <task id="t3">
    <name>Update the three `*-patch` tools and refresh tool-file JSDoc</name>
    <files>packages/plugins/cartograph/src/tools/vision-patch.ts; packages/plugins/cartograph/src/tools/charge-patch.ts; packages/plugins/cartograph/src/tools/piece-patch.ts; the remaining 13 files under packages/plugins/cartograph/src/tools/</files>
    <action>In each of the three patch tools, remove the `updatedAt: new Date().toISOString()` argument that is currently passed to the typed-API patch call (per D18). Across all 16 tool files (vision/charge/piece × create/show/list/patch/transition plus `vision-apply.ts`, `index.ts`, `render.ts`), perform a JSDoc / inline-comment pass to replace any "companion doc" / "companion book" prose with projection / ext-slot language. Do not change handler logic in any tool other than removing the leftover `updatedAt` arguments — the typed API contract is preserved.</action>
    <verify>pnpm -w typecheck</verify>
    <done>None of the three patch tools passes `updatedAt`; no tool file's prose describes companion documents; tool handler logic outside the `updatedAt` removals is unchanged.</done>
  </task>

  <task id="t4">
    <name>Rewire the package's three test files to the post-cleanup shape</name>
    <files>packages/plugins/cartograph/src/cartograph.test.ts; packages/plugins/cartograph/src/tools.test.ts; packages/plugins/cartograph/src/tools/vision-apply.test.ts</files>
    <action>In each fixture, delete the three `memBackend.ensureBook({ ownerId: 'cartograph', book: 'visions'/'charges'/'pieces' }, ...)` calls (per D13). In `cartograph.test.ts`, delete the apparatus-shape assertions at lines 911–934 that test for the three book entries and their indexes; replace with an assertion that `supportKit` carries no `books` key (per D19). Shift the CDC watcher tests at `cartograph.test.ts:342–364` and `vision-apply.test.ts:162–167` from `('cartograph', 'visions')` to `('clerk', 'writs')` filtered by `event.value?.type === 'vision'` (per D10), preserving the single-event-per-apply assertion (per D11). Add new test coverage for: `showX` throwing on a writ posted via raw `clerk.post({ type: 'vision' })` with no ext slot (per D12); `listX` returning no rows for the same orphan (per D16); `patchX` throwing when called with `id` / `createdAt` / `updatedAt` (per D14). The 15-tool matrix in `tools.test.ts` should pass unchanged once the apparatus rewires; verify by running it.</action>
    <verify>pnpm -w test --filter cartograph</verify>
    <done>All three test files run green; no `ensureBook` for the three companion books remains; CDC tests assert against `('clerk', 'writs')`; new fail-loud assertions for D12/D14/D16 pass.</done>
  </task>

  <task id="t5">
    <name>Refresh the cartograph package README</name>
    <files>packages/plugins/cartograph/README.md</files>
    <action>Drop the `Books` table row (lines 161–169 today) and replace with a paragraph describing the `writ.ext['cartograph'] = { stage }` slot — its shape, that the cartograph apparatus is the sole writer, and that consumers read via `CartographApi`'s typed projections (per D22). Rewrite the `Companion documents` subsection (lines 138–153 today) so it describes the doc shapes as projections over the slot, not as companion-book rows. Update lines 19–22 (top-of-readme overview language about three companion books) and lines 308–311 (surveyor-slot reference, which is unrelated to cartograph's slot but worth a clarifying word) to match. Leave the `What is *not* in this commission` section unchanged (per D21).</action>
    <verify>grep -n "companion doc\|companion book\|cartograph/visions\|cartograph/charges\|cartograph/pieces" packages/plugins/cartograph/README.md || true</verify>
    <done>README's Books row describes the ext slot; "Companion documents" prose now reads as projection prose; the `What is *not* in this commission` section is unchanged; grep shows no live references to the three deleted books.</done>
  </task>

  <task id="t6">
    <name>Rewrite §3.4 / §3.6 / §3.7 of the surveying-cascade arch doc</name>
    <files>docs/architecture/surveying-cascade.md</files>
    <action>Rewrite each of the three load-bearing sections to the post-cleanup shape sketched in the brief's Reference Material — §3.4 moves SurveyDoc envelope metadata to `status['surveyor']` / `ext['surveyor']`; §3.6 collapses the three book-event subscriptions into one writs-book subscription filtered by `writ.type ∈ {vision, charge, piece}`; §3.7 drops `books.surveys` from the substrate-owned-things list and replaces "Stamps SurveyDoc on completion" with "Stamps `status['surveyor']` on completion." Polish the incidental references (vocabulary-table SurveyDoc row, flow-diagram "+ VisionDoc" clauses, line-137 "CDC fires on the cartograph book" wording, etc.) so the doc reads consistently. Do not touch §3 sections that are not §3.4/§3.6/§3.7 unless the incidental polish list calls them out. The README link at line 729 stays.</action>
    <verify>grep -n "books\.surveys\|book\.cartograph\.\|SurveyDoc" docs/architecture/surveying-cascade.md || true</verify>
    <done>§3.4 / §3.6 / §3.7 lead with the post-cleanup shape; surviving references to `books.surveys`, `book.cartograph.*`, or `SurveyDoc` either describe what was replaced or are intentional historical mentions; the rest of the doc reads consistently.</done>
  </task>
</task-manifest>

