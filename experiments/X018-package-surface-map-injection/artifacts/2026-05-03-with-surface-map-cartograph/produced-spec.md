# Cartograph: collapse companion docs into `writ.ext['cartograph']`

## Intent

Collapse the three Cartograph companion books (`cartograph/visions`, `cartograph/charges`, `cartograph/pieces`) into a single plugin-keyed `writ.ext['cartograph'] = { stage, codex }` sub-slot on the writ row. The Cartograph's typed-API surface — every method, request shape, filter shape, and projection shape — stays stable; only the backing storage moves.

## Rationale

The companion-doc pattern was the pre-`ext`-slot workaround for plugin-owned writ metadata. Now that the sanctioned `writ.ext` slot exists with a transactional read-modify-write API (`clerk.setWritExt`), three pure-metadata companion books are exactly what `ext` was added to replace. Landing this cleanup before Commission C (the surveyor-apparatus substrate) is strictly less work than building Commission C's CDC observer against the companion-book pattern and reshaping it later — Commission C's observer becomes a single writ-type-filtered subscription on the writs book instead of three per-book subscriptions.

## Scope & Blast Radius

**Cartograph apparatus internals** — full rewrite of `createCartograph()` so every typed-API method composes `clerk.post` / `clerk.transition` / `clerk.setWritExt` inside a single `stacks.transaction` and projects results from `writ.ext['cartograph']`. The three book handles, the `supportKit.books` block, and the manual timestamp/parent-validation duplication go away.

**Cartograph package documentation** — the README's "Companion documents" / "Books" / "Support Kit" sections, the file-level docstrings of `cartograph.ts` / `types.ts` / `render.ts`, and the per-type doc-comments on `VisionDoc` / `ChargeDoc` / `PieceDoc` all describe the companion-book pattern. The implementer rewrites them inline as part of the code change.

**vision-apply** — the existing two-call sequences (first apply: `cartograph.createVision` + `clerk.setWritExt(SURVEYOR_PLUGIN_ID, …)`; Nth apply: `clerk.edit` + `cartograph.transitionVision` + `clerk.setWritExt(surveyor)`) must be wrapped in an outer `stacks.transaction` so the post-cleanup substrate observer (subscribed to the writs book) sees one CDC event per apply, not two. This is the same correctness requirement that the original Commission A's "single-event-per-apply" guarantee codified — restated for the new subscription target.

**In-package tests** — the three test fixtures (`cartograph.test.ts`, `tools.test.ts`, `vision-apply.test.ts`) all pre-create the three companion books via `memBackend.ensureBook({ ownerId: 'cartograph', book: '…' }, …)`. Those calls reference books that no longer exist post-cleanup; remove them. The CDC-event-counting assertion in `cartograph.test.ts` (currently watching `cartograph/visions`) shifts to watching `clerk/writs` filtered by `entry.type === 'vision'`. Apparatus-shape assertions about `supportKit.books` flip to asserting the field is absent.

**Surveying-cascade architecture document** — `docs/architecture/surveying-cascade.md` names the companion-doc pattern in three load-bearing sections (§3.4 SurveyDoc shape, §3.6 substrate-watches-CDC, §3.7 substrate plugin shape) plus eight incidental references at lines 39, 44, 64, 66, 228, 245, 256, 730. The brief explicitly grants permission to do the consistency sweep; the implementer rewrites all eleven sites.

**Cross-cutting verification** — no external production package imports from `@shardworks/cartograph-apparatus` and no symbol in the cartograph package leaks into other packages today (only the lockfile, a one-line comment in `clockworks-stacks-signals.ts`, and two descriptive doc references in `docs/guild-metaphor.md` / `docs/architecture/index.md` mention the cartograph by name). The implementer should grep for `cartograph/visions`, `cartograph/charges`, `cartograph/pieces`, `ownerId: 'cartograph'`, and `book.cartograph.` across the monorepo to confirm no surprise consumer was missed; the expectation is zero hits outside this commission's footprint.

**Plugin id continuity** — the plugin id `cartograph` is the existing `ownerId` of the books being deleted, and carries forward as the `ext['cartograph']` key. Continuity is convention only — there is no runtime guard.

## Decisions

| #   | Decision                                                                                                                    | Default                       | Rationale                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | How should `createX` and `transitionX` achieve atomic writes of `writ.phase` + `writ.ext['cartograph']`?                    | compose                       | Brief-prescribed verbatim. Compose `clerk.post` + `clerk.transition` + `clerk.setWritExt` inside one outer `stacks.transaction`; Stacks' transaction-flattening collapses inner clerk methods into the outer tx and CDC events coalesce. |
| D2  | How should `listX` filter on `stage` once the companion books are gone?                                                     | json-path                     | Brief-prescribed. Build the filter as `['ext.cartograph.stage', '=', value]` against `stacks.book<WritDoc>('clerk', 'writs')`; in-memory filtering would break pagination, and extending `WritFilters` for one consumer is overreach.   |
| D3  | Should the writs book gain an index on `ext.cartograph.stage`?                                                              | no-index                      | Cross-package change with no observable behavior at current scale. The `[type]` index already narrows the candidate set; revisit if scale demands it.                                                                                |
| D4  | Should `ext['cartograph']` carry `codex` even though `writ.codex` already exists?                                           | duplicate                     | Brief-literal. The slot is the cartograph's owned, self-contained surface for downstream observers (Commission C) — they read all cartograph metadata from one slot without crossing into `writ.codex`. Drift is bounded by D5.       |
| D5  | Where does `patchX(id, { codex })` write the codex value?                                                                   | ext-only                      | Single source of truth for the cartograph's owned slot. `writ.codex` retains its creation-time value (used for codex inheritance and the writs page); post-patch divergence is intentional, not accidental.                          |
| D6  | What should `showX` / `listX` / projection do when a writ of cartograph type lacks an `ext['cartograph']` slot?             | fail-loud                     | Throw a descriptive error. The typed API is the only sanctioned creation path; an unstamped writ of cartograph type is a data-integrity issue that should surface, not silently get a synthesized stage.                             |
| D7  | Should the cartograph apparatus drop its `supportKit.books` declaration entirely, or retain an empty object?                | drop                          | Brief says "Three Stacks books are removed entirely." Empty-object preservation is inert noise.                                                                                                                                      |
| D8  | How do the test fixtures migrate off the companion books?                                                                   | remove                        | Delete the three `ensureBook({ ownerId: 'cartograph', … })` calls per fixture. The clerk-owned writs book is already pre-created.                                                                                                    |
| D9  | How should `cartograph.test.ts` migrate the "exactly one CDC event per createVision" assertion?                             | rewrite-watch                 | Rewrite `stacks.watch<VisionDoc>('cartograph', 'visions', …)` to watch `('clerk', 'writs', …)` and filter by `entry.type === 'vision'` inside the handler; assert one event per logical operation.                                  |
| D10 | Should `vision-apply` wrap its multi-call sequences in an outer `stacks.transaction`?                                       | wrap                          | Brief-prescribed semantically (§3.6 calls single-event-per-apply "a correctness requirement, not an optimization"). Wrapping is the smallest change that preserves it; defensive dedup is not a substitute for the upstream guarantee. |
| D11 | What rewrite shape for surveying-cascade.md §3.6's substrate-observer subscription description?                              | single-typed-subscription     | Brief-prescribed. Replace the three book-stream bullets with a single bullet on the writs book filtered by `writ.type ∈ {vision, charge, piece}`; restate the single-event-per-apply mechanism.                                       |
| D12 | How wide should the surveying-cascade.md cleanup sweep be?                                                                  | consistency-sweep             | Brief grants permission. Rewrite the three load-bearing sections plus the eight incidental references for terminology consistency. Mechanical pass.                                                                                  |
| D13 | Should `createX` delegate to `clerk.post` for parent validation / id generation / timestamp stamping?                       | delegate                      | Stacks' transaction-flattening means `clerk.post` composes cleanly inside an outer transaction; the existing inlined-validation comment's premise ("Clerk's post does not accept an external transaction context") is outdated.       |
| D14 | How should `createCharge` / `createPiece` read the parent's codex for inheritance, post-cleanup?                            | writ-codex                    | Read `parent.codex` (the writ row). Existing pattern; less coupling to ext-slot internals; cheaper read; works regardless of D4's outcome.                                                                                           |
| D15 | Should the cartograph stop manually generating timestamps, given clerk's APIs stamp `updatedAt` internally?                 | delegate-timestamps           | Drop the manual `now = new Date().toISOString()` calls. `clerk.post` / `clerk.transition` / `clerk.setWritExt` stamp `writ.updatedAt`; the projection sources from `writ.updatedAt`. Eliminates drift between cartograph- and writ-stamped values. |
| D16 | Should the projection types continue to expose `createdAt` / `updatedAt`?                                                   | keep-on-projection            | Brief explicitly preserves the projection shape; render.ts and tests already read these fields. Source from `writ.createdAt` / `writ.updatedAt`.                                                                                     |
| D17 | Should the brief's `interface CartographExt { stage; codex?; }` shape be exported from the cartograph package?              | export                        | Cartograph owns the slot; exporting its shape is the layered way to share the contract with downstream readers (Commission C, future surveyor implementations) and prevents downstream drift.                                        |

## Acceptance Signal

- `pnpm -w typecheck` passes with no new errors after the refactor — including in any package that imports the cartograph's public surface.
- `pnpm -w test` passes; the cartograph package's three test files run green against the new storage path (no `ensureBook({ ownerId: 'cartograph' }, …)` calls remain).
- `cartograph.test.ts`'s CDC-event-counting test asserts exactly one writs-book event per logical operation, watched on `('clerk', 'writs')` filtered by `entry.type === 'vision'`.
- A grep across the monorepo for `cartograph/visions`, `cartograph/charges`, `cartograph/pieces`, `ownerId: 'cartograph'`, and `book.cartograph.` returns zero hits.
- The cartograph package's `supportKit` no longer carries a `books` field (verify by reading the apparatus's plugin definition; the test assertion in the in-package suite covers this in CI).
- The cartograph README's "Companion documents" and "Books" sections are gone or rewritten to describe the `ext['cartograph']` slot; the file-level docstrings on `cartograph.ts`, `types.ts`, and `render.ts` no longer mention companion books.
- `docs/architecture/surveying-cascade.md` §3.4, §3.6, and §3.7 reflect the post-cleanup shape; the eight incidental references at lines 39, 44, 64, 66, 228, 245, 256, 730 use the post-cleanup terminology.
- A vision created via `cartograph.createVision({ phase: 'open', stage: 'active' })` produces exactly one CDC-significant writs-book event, observable via a fresh `stacks.watch` on `('clerk', 'writs', …)`.
- `nsg vision apply` (or its programmatic equivalent invoked from `vision-apply.ts`) on a fresh vision produces exactly one CDC-significant writs-book event; on an Nth apply that bumps the body and stamps surveyor hints, also exactly one event.

## Reference Material

### `WritDoc.ext` and `WritDoc.codex` — sanctioned slot semantics

Source: `packages/plugins/clerk/src/types.ts`. Role: contract for the slot the cartograph now writes into.

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

The slot's contract:

- Plugin-keyed map (`Record<PluginId, unknown>`); ownership is convention only.
- The single sanctioned write path is `ClerkApi.setWritExt(writId, pluginId, value)`, which does a transactional read-modify-write so sibling sub-slots are preserved under concurrent writers.
- `transition()` silently strips `ext` from its `fields` argument — so a `transitionX` cannot smuggle ext through that path; it must use `setWritExt` (or replicate its read-modify-write inline inside the same transaction).
- Generic `put()` / `patch()` on the writs book wholesale-replace the slot and clobber sibling sub-slots; they are not sanctioned slot-write paths.
- The slot survives terminal phase transitions.

### `ClerkApi.setWritExt` — implementation reference

Source: `packages/plugins/clerk/src/clerk.ts:1188–1213`. Role: the API the cartograph now calls; also the canonical example of "transactional read-modify-write of a writ.ext sub-slot."

```typescript
setWritExt(writId: string, pluginId: string, value: unknown): Promise<WritDoc>;
```

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

Each call bumps `updatedAt`. `value` is opaque to Clerk. Composition with an outer `stacks.transaction` works — the inner transaction reuses the active tx (see *Stacks transaction flattening* below).

### `ClerkApi.transition` — ext-stripping semantics

Source: `packages/plugins/clerk/src/clerk.ts:1065–1159`. Role: the API the cartograph's `transitionX` now calls.

```typescript
transition(id: string, to: WritPhase, fields?: Partial<WritDoc>): Promise<WritDoc>;
```

Behavior the implementer must rely on:

- Validates target phase against the writ's current state's `allowedTransitions`.
- Silently strips managed fields from `fields`: `id`, `phase`, `status`, **`ext`**, `createdAt`, `updatedAt`, `resolvedAt`, `parentId`. `ext` is stripped because `patch` would clobber sibling sub-slots; `setWritExt` is the only sanctioned path.
- Throws if `fields.phase` is a non-empty string ("caller bug — state machine owns phase").
- Stamps `resolvedAt` on terminal transitions; carries `resolution` if supplied in fields.

### `ClerkApi.post` — composition behavior

Source: `packages/plugins/clerk/src/clerk.ts:650–724`. Role: the API the cartograph's `createX` now delegates to (per D13).

```typescript
post(request: PostCommissionRequest): Promise<WritDoc>;
```

Validates type, resolves initial phase from the registered `WritTypeConfig`, generates id, generates timestamps, validates parent (when `parentId` is supplied), inherits codex from parent. For posts WITHOUT `parentId`, runs as a single `writs.put` (no transaction); for posts WITH `parentId`, opens its own `stacks.transaction`. Both paths flatten cleanly into an outer transaction.

### `CartographApi` — public surface (UNCHANGED by this commission)

Source: `packages/plugins/cartograph/src/types.ts`. Role: the contract that callers depend on; preserved verbatim.

```typescript
interface CartographApi {
  // Vision
  createVision(request: CreateVisionRequest): Promise<VisionDoc>;
  showVision(id: string): Promise<VisionDoc>;
  listVisions(filters?: VisionFilters): Promise<VisionDoc[]>;
  patchVision(id: string, fields: Partial<Omit<VisionDoc, 'id'>>): Promise<VisionDoc>;
  transitionVision(id: string, request: TransitionVisionRequest): Promise<VisionDoc>;
  // …mirror methods for charge and piece (12 more)
}

interface VisionDoc { id: string; stage: VisionStage; codex?: string; createdAt: string; updatedAt: string; [key: string]: unknown; }
interface ChargeDoc { id: string; stage: ChargeStage; codex?: string; createdAt: string; updatedAt: string; [key: string]: unknown; }
interface PieceDoc  { id: string; stage: PieceStage;  codex?: string; createdAt: string; updatedAt: string; [key: string]: unknown; }

type VisionStage = 'draft' | 'active' | 'sunset' | 'cancelled';
type ChargeStage = 'draft' | 'active' | 'validated' | 'dropped';
type PieceStage  = 'draft' | 'active' | 'done' | 'dropped';
```

All `CreateXRequest`, `TransitionXRequest`, and `XFilters` shapes also stay verbatim. The `phase`/`stage` initial-state mapping on `CreateVisionRequest` (`phase: 'new'` ↔ `stage: 'draft'`; `phase: 'open'` ↔ `stage: 'active'`; terminal stages rejected) is part of the preserved contract.

### `CartographExt` — new public type

Source: defined by this commission. Role: the shape of the new sub-slot; exported per D17.

```typescript
export interface CartographExt {
  stage: VisionStage | ChargeStage | PieceStage;  // type narrows by writ.type
  codex?: string;
}
```

Stamped via `clerk.setWritExt(writId, 'cartograph', value)`. Read via `writ.ext?.['cartograph']` and decoded by the cartograph's internal projection helpers.

### Stacks transaction flattening — composition primitive

Source: `packages/plugins/stacks/src/stacks-core.ts:191–242`. Role: the load-bearing primitive that makes `compose clerk.post + clerk.transition + clerk.setWritExt inside one outer txn` safe.

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

An outer `stacks.transaction(async () => { await clerk.post(...); await clerk.transition(...); await clerk.setWritExt(...); })` collapses all inner clerk methods into one backend transaction. Multiple writs-book patches → coalesced into one CDC event after commit.

### CDC event coalescing — the "single event per logical operation" mechanism

Source: `packages/plugins/stacks/src/cdc.ts:87–149` (`coalesceEvents`). Role: explains why the wrap in D10 collapses multiple writes to one observable event.

- `update(s) → update` collapses to one update with the first event's `prev` and the last event's `entry`.
- `create → update(s)` collapses to one create with the final state.

In a `transitionX` flow that does `clerk.transition` (writes phase) then `clerk.setWritExt` (writes ext.cartograph) under one outer txn, the writs book emits one final-state update per phase transition, not two. Same logic applies to `createVision` → `setWritExt(surveyor)` in vision-apply: wrapped in one txn, the writs book emits one CDC event per apply.

### Stacks JSON-path query support — `ext.cartograph.stage` filter

Source: `packages/plugins/stacks/src/sqlite-backend.ts:47–54` and `query.ts:14–21`. Role: confirms that `listX` can filter on the new sub-slot directly.

```typescript
function toJsonPath(field: string): string {
  return '$.' + validateFieldName(field);
}
function jsonExtract(field: string): string {
  return `json_extract(content, '${toJsonPath(field)}')`;
}

const SAFE_FIELD_RE = /^[A-Za-z0-9_.-]+$/;
```

A query like `stacks.book<WritDoc>('clerk', 'writs').find({ where: [['type', '=', 'vision'], ['ext.cartograph.stage', '=', stage]] })` is supported. SQLite renders `json_extract(content, '$.ext.cartograph.stage') = ?`; the memory backend uses `getNestedField` for the same dot-notation. The existing `[type]` index narrows the candidate set; no new index per D3.

### Existing companion-book wiring to delete

Source: `packages/plugins/cartograph/src/cartograph.ts`. Role: marks what gets removed.

```typescript
// cartograph.ts:183-185 — book handle declarations
let visionsBook: Book<VisionDoc>;
let chargesBook: Book<ChargeDoc>;
let piecesBook: Book<PieceDoc>;

// cartograph.ts:721-723 — start() handle assignments
visionsBook = stacks.book<VisionDoc>('cartograph', 'visions');
chargesBook = stacks.book<ChargeDoc>('cartograph', 'charges');
piecesBook  = stacks.book<PieceDoc>('cartograph', 'pieces');

// cartograph.ts:682-686 — supportKit.books block (drop entirely per D7)
books: {
  visions: { indexes: ['stage', 'codex', 'createdAt'] },
  charges: { indexes: ['stage', 'codex', 'createdAt'] },
  pieces:  { indexes: ['stage', 'codex', 'createdAt'] },
},
```

### Existing `types.ts` doc-comments to rewrite inline

Source: `packages/plugins/cartograph/src/types.ts`. Role: file-level docstring (lines 1–17) and per-type docstrings on `VisionDoc` / `ChargeDoc` / `PieceDoc` (lines 62–125) all describe the companion-book pattern. The implementer rewrites them inline as part of the same edit that swaps the storage. Stage enums and request/filter types stay verbatim.

### Surveying-cascade.md §3.4 — current text to rewrite

Source: `docs/architecture/surveying-cascade.md:175–190`. Role: rewrite per D11/D12.

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

The rewrite drops the `SurveyDoc` companion-book pattern and lifts envelope metadata onto the survey writ row: `targetNodeId` is redundant with `writ.parentId`, `rigName` is redundant with `writ.type`, `completedAt` is redundant with `writ.resolvedAt`. The remaining fields (`rigVersion`, `surveyorId`) and any future envelope additions live in `status['surveyor']` / `ext['surveyor']` sub-slots on the survey writ — `status['surveyor']` for substrate-set observation data (set on completion), `ext['surveyor']` for substrate-set metadata. The substrate is the only writer.

### Surveying-cascade.md §3.6 — current text to rewrite

Source: `docs/architecture/surveying-cascade.md:210–238`. Role: rewrite per D11.

```markdown
### 3.6 Substrate watches cartograph CDC — single-event-per-apply guarantee

The substrate's observer subscribes to:

- `book.cartograph.visions.created` / `.updated`
- `book.cartograph.charges.created` / `.updated`
- `book.cartograph.pieces.created`  / `.updated`

On any event, it reads `ext['surveyor']` hints from the affected
node, creates the appropriate survey writ with `parentId` pointing
to the node, derives `ext['reckoner']` priority dimensions from the
hints + substrate defaults, and stamps to enter the petition queue.

**Single-event-per-apply guarantee.** Apply CLI and surveyor rigs
MUST produce a single CDC event per logical operation, not separate
create+transition events. Concretely:

- `cartograph.createVision` (and `createCharge`, `createPiece`) must
  accept the initial stage as a parameter and write writ + companion
  doc + final stage in one Stacks transaction, OR the apply CLI must
  wrap create + transition in one transaction at its layer.
- The substrate observer dedupes by writ id within a short window
  (defensive — should never matter if upstream is transactional, but
  catches integration bugs cheaply).

Without this, a single `nsg vision apply` produces two CDC fires
(create + transition-to-active) and the substrate creates two
identical survey writs — wasted Reckoner cycles and duplicate rig
dispatches. This is a correctness requirement, not an optimization.
```

The rewrite collapses the three book-stream bullets to a single subscription on `book.clerk.writs.{created,updated}` filtered in the handler by `writ.type ∈ {vision, charge, piece}`. The single-event-per-apply mechanism shifts to: "cartograph's createX/transitionX primitives are already transactional (writ row + ext.cartograph stamped in one stacks.transaction); vision-apply wraps the cartograph call + the ext.surveyor stamp in one outer transaction; Stacks coalescing collapses the writes to one CDC-significant event per apply." The defensive dedup paragraph stays.

### Surveying-cascade.md §3.7 — current text to rewrite

Source: `docs/architecture/surveying-cascade.md:240–266`. Role: rewrite per D12.

```markdown
2. **`@shardworks/surveyor-apparatus`** *(substrate)*
   - Owns survey writ types and `books.surveys`
   - Owns the surveyor registry (kit-contribution surface)
   - Owns the CDC observer
   - Owns the `ext['surveyor']` slot
   - Owns the rig-name convention (`survey-vision/charge/piece`)
   - Routes accepted survey petitions to the registered surveyor's
     rig templates
   - Stamps SurveyDoc on completion (rig fills `writ.body`; substrate
     wraps the writ)
   - Provides the surveyor anima tool surface (see §3.9)
   - Does NOT ship a concrete surveyor.
```

The rewrite drops `books.surveys` from the substrate-owned list and replaces "Stamps SurveyDoc on completion" with "Stamps `status['surveyor']` on completion (rig fills `writ.body`; substrate stamps the envelope sub-slot)." Also update the cartograph row (item 1) to drop "+ companion docs" — see incidental references at line 245.

### Surveying-cascade.md — incidental reference touch-ups

Source: `docs/architecture/surveying-cascade.md`. Role: terminology consistency per D12.

| Line | Current text                                                                                              | Replace with                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 39   | `snapshotted into a writ + VisionDoc by the cartograph`                                                   | `snapshotted into a vision writ by the cartograph`                                                                                            |
| 44   | The whole **SurveyDoc** vocabulary row                                                                    | Rewrite to reflect §3.4's new shape: envelope metadata lives in `status['surveyor']` / `ext['surveyor']` on the survey writ; no separate book. |
| 64   | `creates or updates the vision writ + VisionDoc (one transaction)`                                        | `creates or updates the vision writ (one transaction; both writ row and `ext['cartograph']` slot)`                                            |
| 66   | `emits Stacks CDC: book.cartograph.visions.{created,updated}`                                             | `emits Stacks CDC: book.clerk.writs.{created,updated} (substrate filters by writ.type)`                                                       |
| 228  | `write writ + companion doc + final stage in one Stacks transaction`                                      | `write writ + `ext['cartograph']` + final stage in one Stacks transaction (or use `cartograph.createX`'s built-in atomicity)`                 |
| 245  | `Vision/charge/piece writ types + companion docs + ladder-invariant API`                                  | `Vision/charge/piece writ types + `ext['cartograph']` slot + ladder-invariant API`                                                            |
| 256  | `Stamps SurveyDoc on completion (rig fills writ.body; substrate wraps the writ)`                         | Aligned with the §3.7 rewrite above.                                                                                                          |
| 730  | `vision/charge/piece writ types, companion docs, the CartographApi`                                       | `vision/charge/piece writ types, the `ext['cartograph']` slot, the CartographApi`                                                             |

## What NOT To Do

- **Do not migrate historical companion-doc rows.** The cartograph is recently-shipped; nothing in production-style guild data depends on those books. Drop them, don't translate.
- **Do not migrate `SurveyDoc` itself.** The surveyor-apparatus substrate doesn't exist yet (Commission C). This commission only updates the surveying-cascade arch doc to reflect the post-cleanup shape so Commission C is briefed against it.
- **Do not migrate other companion-doc patterns elsewhere in the framework.** Astrolabe's `PlanDoc` is mostly content (inventory, scope, decisions, spec) — explicitly out of scope.
- **Do not rework the `ext` API itself.** `clerk.setWritExt` and the slot-write contract are existing primitives; this commission consumes them, doesn't extend them.
- **Do not rename the projection types.** `VisionDoc` / `ChargeDoc` / `PieceDoc` keep their names and shapes (per D16) — only their backing storage moves.
- **Do not rename the plugin id.** `cartograph` is the established `ownerId`; carries forward as the `ext['cartograph']` key.
- **Do not extend `WritFilters` to accept `ext.*` filters.** Cartograph privileged-accesses the writs book directly for its list queries (per D2).
- **Do not extend `cartograph.createVision` to accept an `extraExt` argument** to bundle the surveyor stamp into its transaction. The wrap-in-outer-txn approach (D10) is the chosen path; extending the API for one caller is overreach.
- **Do not add an index on `ext.cartograph.stage` to the writs book** (per D3). Cross-package index addition with no observable behavior change is out of scope.
- **Do not synthesize a default stage** when `writ.ext['cartograph']` is missing on a cartograph-typed writ. Throw the descriptive error per D6.
- **Do not preserve `INITIAL_STAGE` / `isTerminalPhase` helpers** for their own sake. Keep them only if the rewritten code body actually still uses them; otherwise drop them with the rest of the dead infrastructure.
- **Do not keep manual timestamp generation** inside the cartograph (per D15). `clerk.post` / `clerk.transition` / `clerk.setWritExt` stamp `writ.updatedAt`; the projection sources from `writ.updatedAt`.

<task-manifest>
  <task id="t1">
    <name>Define and export CartographExt; refactor cartograph typed-API to use writ.ext['cartograph']</name>
    <files>packages/plugins/cartograph/src/types.ts; packages/plugins/cartograph/src/index.ts; packages/plugins/cartograph/src/cartograph.ts; packages/plugins/cartograph/src/tools/render.ts (only if its data-source assumptions break)</files>
    <action>
Add `export interface CartographExt { stage: VisionStage | ChargeStage | PieceStage; codex?: string }` to `types.ts` and re-export from `index.ts` (per D17). Add internal projection helpers (one per writ type, or a generic factory) that decode `writ.ext['cartograph']` into the corresponding `VisionDoc` / `ChargeDoc` / `PieceDoc` shape; on a missing or malformed slot for a cartograph-typed writ, throw a descriptive error of the form `Writ "<id>" has no cartograph metadata (ext.cartograph missing). Cartograph writs must be created via the typed API.` (per D6).

Rewrite every `createX` / `showX` / `listX` / `patchX` / `transitionX` method in `cartograph.ts` to:
- Open one outer `stacks.transaction` for any operation that mutates state (per D1).
- Delegate writ creation to `clerk.post({ type, title, body, codex, parentId? })` (per D13). Keep the cartograph's typed parent-type validation (vision-only / charge-or-piece-only) before the `clerk.post` call. Read parent `codex` from the writ row for inheritance (per D14).
- For `createX` with a non-default initial phase/stage: call `clerk.transition` to drive the writ to the requested phase, then `clerk.setWritExt(writId, 'cartograph', { stage, codex? })` to stamp the slot. The brief's existing `phase`/`stage` initial-state mapping on `CreateVisionRequest` is preserved.
- For `transitionX`: validate the writ's existing type matches; call `clerk.transition(id, req.phase, { resolution? })`; call `clerk.setWritExt(id, 'cartograph', { stage: req.stage, codex? })` preserving any existing codex sub-value from the slot.
- For `showX`: read via `clerk.show(id)`, validate `writ.type`, project via the helper.
- For `listX`: query `stacks.book<WritDoc>('clerk', 'writs').find({ where, orderBy, limit, offset })` with `where` filters built per D2 — `['type', '=', 'vision']` always, plus `['ext.cartograph.stage', '=', stage]` and `['codex', '=', codex]` when supplied. Project each row via the helper.
- For `patchX`: when patching `codex`, write to `ext['cartograph'].codex` only via `setWritExt` (per D5); `writ.codex` is unchanged. Other patchable fields (if any survive — review the existing `patchX` surface against the new model) follow the same single-source-of-truth rule.
- Drop manual `now = new Date().toISOString()` generation; rely on the clerk APIs' internal stamping (per D15). Project `createdAt` / `updatedAt` from `writ.createdAt` / `writ.updatedAt` (per D16).

Remove: the three book handles at `cartograph.ts:183-185` and `cartograph.ts:721-723`; the `supportKit.books` block at `cartograph.ts:682-686` (drop the field entirely per D7); any helper symbols (`INITIAL_STAGE`, `isTerminalPhase`, etc.) that the rewritten body no longer references; the file-level docstring at `cartograph.ts:18-33` and the `types.ts` file-level / per-type docstrings that reference the companion-book pattern (rewrite inline to describe the `ext['cartograph']` slot).

Verify `tools/render.ts` and the fifteen `tools/{vision,charge,piece}-{create,show,list,patch,transition}.ts` handlers compile against the new typed-API method bodies — their callsites should be unchanged since the public method signatures stay verbatim.
    </action>
    <verify>pnpm --filter @shardworks/cartograph-apparatus typecheck; pnpm --filter @shardworks/cartograph-apparatus build</verify>
    <done>The cartograph package compiles; `CartographExt` is exported from `index.ts`; the three book handles, the `supportKit.books` block, and any companion-book references in source docstrings are gone; method bodies route through `clerk.post` / `clerk.transition` / `clerk.setWritExt` inside one `stacks.transaction`; `listX` filters via `ext.cartograph.stage` against the writs book.</done>
  </task>

  <task id="t2">
    <name>Wrap vision-apply call sequences in an outer stacks.transaction</name>
    <files>packages/plugins/cartograph/src/tools/vision-apply.ts</files>
    <action>
Wrap the first-apply branch (`cartograph.createVision({...})` + `clerk.setWritExt(SURVEYOR_PLUGIN_ID, …)`) in a single `stacks.transaction(async () => { … })` so the two writs-book mutations coalesce into one CDC event. Apply the same wrap to the Nth-apply branch (`clerk.edit(...)` + `cartograph.transitionVision(...)` + `clerk.setWritExt(SURVEYOR_PLUGIN_ID, …)`). Inner clerk and cartograph methods flatten into the outer tx via Stacks' transaction-flattening (see Reference Material).

Do not change the call signatures, the values being written, or the order of operations within each branch. The wrap is purely an atomicity envelope. The defensive dedup mentioned in surveying-cascade.md §3.6 stays at the substrate layer; this task is the upstream guarantee.
    </action>
    <verify>pnpm --filter @shardworks/cartograph-apparatus test -- --run vision-apply</verify>
    <done>Both branches of `vision-apply.ts` open one outer `stacks.transaction` covering all of the cartograph and clerk calls in that branch; existing vision-apply tests still pass.</done>
  </task>

  <task id="t3">
    <name>Migrate test fixtures and CDC-event assertions off the companion books</name>
    <files>packages/plugins/cartograph/src/cartograph.test.ts; packages/plugins/cartograph/src/tools.test.ts; packages/plugins/cartograph/src/tools/vision-apply.test.ts</files>
    <action>
Remove every `memBackend.ensureBook({ ownerId: 'cartograph', book: 'visions' | 'charges' | 'pieces' }, …)` call across the three test files (per D8). The clerk-owned writs book remains pre-created as today.

In `cartograph.test.ts`, rewrite the CDC-event-counting assertion (currently at `cartograph.test.ts:343`, watching `'cartograph', 'visions'`) to watch `'clerk', 'writs'` and filter inside the handler by `entry.type === 'vision'` (per D9). Assert exactly one event per `createVision` call.

In `vision-apply.test.ts`, the `Exactly one CDC event on the cartograph visions book` assertion migrates to `Exactly one writs-book event of type=vision` — and stays at one event per apply because t2 lands the wrap. If any per-fixture apparatus-shape assertion checks `supportKit.books === { visions, charges, pieces }`, flip it to assert the field is absent (per D7).
    </action>
    <verify>pnpm --filter @shardworks/cartograph-apparatus test</verify>
    <done>All three test files run green; no `ensureBook({ ownerId: 'cartograph' }, …)` calls remain; the rewritten watch in `cartograph.test.ts` observes `clerk/writs` filtered by writ.type and asserts one event per logical operation; the vision-apply event-count assertion stays at one per apply.</done>
  </task>

  <task id="t4">
    <name>Update cartograph package documentation</name>
    <files>packages/plugins/cartograph/README.md</files>
    <action>
Rewrite the README sections that describe the companion-book pattern: the preamble (around lines 19–21, "Three companion books (`visions`, `charges`, `pieces`)…"), the entire "Companion documents" section (around lines 138–148), and the "Books" subsection of "Support Kit" (around lines 162–169). Replace with a concise description of the `ext['cartograph']` storage model: a plugin-keyed sub-slot on the writ row carrying `{ stage, codex? }`, written transactionally via `clerk.setWritExt`, projected back into `VisionDoc` / `ChargeDoc` / `PieceDoc` by the typed API.

Confirm any "What is *not* in this commission" or future-work language in the README still reads correctly post-cleanup — minor copy edits acceptable.

Do not introduce new sections or new APIs. The change is descriptive only.
    </action>
    <verify>grep -n 'cartograph/visions\|cartograph/charges\|cartograph/pieces\|companion doc\|companion book\|books.visions\|books.charges\|books.pieces' packages/plugins/cartograph/README.md</verify>
    <done>The README no longer mentions `cartograph/visions` / `cartograph/charges` / `cartograph/pieces` or the "companion doc" / "companion book" pattern; the storage model is described as `ext['cartograph']`; the grep returns no hits.</done>
  </task>

  <task id="t5">
    <name>Update surveying-cascade architecture doc</name>
    <files>docs/architecture/surveying-cascade.md</files>
    <action>
Rewrite §3.4 (SurveyDoc → envelope metadata in `status['surveyor']` / `ext['surveyor']` on the survey writ; no separate book; substrate is the only writer; note `targetNodeId` / `rigName` / `completedAt` redundancies). Rewrite §3.6 to a single substrate subscription on `book.clerk.writs.{created,updated}` filtered in the handler by `writ.type ∈ {vision, charge, piece}`; restate the single-event-per-apply mechanism as "cartograph's createX/transitionX are already transactional; vision-apply wraps cartograph call + ext.surveyor stamp in one outer transaction; Stacks coalescing collapses to one CDC-significant event per apply"; preserve the defensive-dedup paragraph. Rewrite §3.7's substrate-owned list (item 2): drop `books.surveys`; replace "Stamps SurveyDoc on completion" with "Stamps `status['surveyor']` on completion (rig fills `writ.body`; substrate stamps the envelope sub-slot)"; update item 1's cartograph row to drop "companion docs."

Touch the eight incidental references at lines 39, 44, 64, 66, 228, 245, 256, 730 per the table in the brief's Reference Material section. No deeper rewrites — terminology consistency only.
    </action>
    <verify>grep -n 'cartograph/visions\|cartograph/charges\|cartograph/pieces\|book.cartograph.\|books.surveys\|VisionDoc\|SurveyDoc' docs/architecture/surveying-cascade.md</verify>
    <done>§3.4, §3.6, and §3.7 reflect the post-cleanup shape; the eight incidental references at lines 39, 44, 64, 66, 228, 245, 256, 730 use post-cleanup terminology; the grep returns no remaining occurrences of the listed legacy terms (or only those inside intentional historical-context callouts, if any).</done>
  </task>
</task-manifest>

