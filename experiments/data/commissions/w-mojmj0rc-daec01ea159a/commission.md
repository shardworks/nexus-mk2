# Cartograph: collapse companion docs into `writ.ext['cartograph']`

## Intent

The Cartograph apparatus today maintains three companion books — `cartograph/visions`, `cartograph/charges`, `cartograph/pieces` — each holding a `{id, stage, codex, createdAt, updatedAt}` document keyed one-for-one to a writ id. This pattern predates the writ-level `ext` slot. Now that `writ.ext` exists as a sanctioned plugin-keyed metadata slot with a transactional read-modify-write API, those companion books carry pure metadata that can live directly on the writ row.

This commission collapses the three companion books into a single `writ.ext['cartograph'] = { stage, codex }` sub-slot. The cartograph's typed-API surface stays — every existing callable continues to work with the same arguments and return shapes — but the internals shed three Stacks books, three companion-doc shapes, and the dual-write transactional ceremony around them. `createdAt` / `updatedAt` were always duplicates of the writ's own timestamps; they go away.

## Motivation

- **The companion-doc pattern is the pre-`ext` workaround for plugin-owned writ metadata.** Now that `ext` exists as the sanctioned slot, a pure-metadata companion book is exactly what `ext` was added to replace.
- **The substrate work that depends on the cartograph (the surveyor-apparatus, see Commission C in the surveying-cascade design subtree) is best designed against the post-cleanup shape.** Building the substrate's CDC observer, completion-stamping logic, and rig routing on top of the current companion-doc pattern, then reshaping it later, is strictly more work than landing the cleanup first. The substrate's CDC observer becomes a writ-type-filtered subscription (a primitive Stacks already supports cleanly) rather than a per-companion-book subscription.
- **No external behavioral change is intended.** Every consumer (CLI tools, tests, the apply CLI shipped in Commission A) reads the same shape from the same API. The cleanup is internal.

## Non-negotiable decisions

### 1. `ext['cartograph']` is the canonical home for stage and codex

```typescript
interface CartographExt {
  stage: VisionStage | ChargeStage | PieceStage;  // type depends on the writ type
  codex?: string;
}
```

The plugin id is `cartograph`. The slot is plugin-keyed under the established convention; the cartograph apparatus is the only writer.

### 2. The typed-API surface stays stable

`CartographApi` keeps every method it has today:

- `createVision` / `createCharge` / `createPiece`
- `showVision` / `showCharge` / `showPiece`
- `listVisions` / `listCharges` / `listPieces`
- `patchVision` / `patchCharge` / `patchPiece`
- `transitionVision` / `transitionCharge` / `transitionPiece`

Argument shapes (`CreateVisionRequest`, `TransitionChargeRequest`, etc.) and return shapes (`VisionDoc`, `ChargeDoc`, `PieceDoc`) stay. The doc shapes are projections over `writ.ext['cartograph']` rather than rows in a separate book — but from the caller's view, nothing changes.

`createdAt` and `updatedAt` on the projection map to the writ's own timestamps.

### 3. Atomicity for create + transition

`clerk.transition` silently strips `ext` from its body (per the existing Clerk contract). Any operation that touches both `writ.phase` and `writ.ext['cartograph']` MUST wrap the `clerk.transition` and `clerk.setWritExt` calls in a single `stacks.transaction` so the pair is atomic. This applies to `createX` (post + setWritExt) and `transitionX` (transition + setWritExt) alike.

The existing `createVision({ stage })` parameter — which Commission A relied on for the single-event-per-apply guarantee — keeps its semantic: the cartograph writes the writ at its initial phase, stamps `ext['cartograph']` with the supplied stage, and (if the stage isn't the writ-type's initial state) transitions to it, all inside one `stacks.transaction`.

### 4. Read-side projection

`showVision(id)` / `listVisions(filters)` continue to return `VisionDoc`-shaped values. Internally they:

- read the writ via `clerk.show(id)` (or `clerk.list({ type: 'vision' })`)
- project `writ.ext['cartograph'].stage` and `writ.ext['cartograph'].codex` onto the returned shape
- carry the writ's `createdAt` and `updatedAt` directly

The existing `VisionDoc` / `ChargeDoc` / `PieceDoc` exported types stay as projection shapes (their definitions can be retained verbatim — the only difference is where the data comes from). Filtering on `stage` becomes a JSON-field filter against `writ.ext['cartograph'].stage`; Stacks' query layer supports this.

### 5. Companion-book deletion

`cartograph/visions`, `cartograph/charges`, and `cartograph/pieces` Stacks books are removed entirely. There is no migration of historical companion-doc rows — the cartograph is recently-shipped and nothing in production-style guild data depends on those books. Any test fixtures or integration tests that opened the companion books directly should be updated to read via the typed API.

### 6. Surveying-cascade arch doc updates

The settled architecture for the surveying cascade (`docs/architecture/surveying-cascade.md`) names the companion-doc pattern explicitly in three sections. Update them to reflect the post-cleanup shape:

- **§3.4 — Companion `SurveyDoc` holds envelope metadata only.** SurveyDoc was modelled on the cartograph companion-doc pattern. Rewrite this section so the survey-writ envelope metadata (rigVersion, surveyorId, completedAt — minus targetNodeId, which is already `writ.parentId`, and minus rigName, which is already `writ.type`) lives in `status['surveyor']` / `ext['surveyor']` sub-slots on the survey writ rather than in a `books.surveys` companion book. Note that `completedAt` is redundant with `writ.resolvedAt`. The substrate is the only writer.

- **§3.6 — Substrate watches cartograph CDC.** The current text lists three book-event streams (`book.cartograph.visions.{created,updated}`, `book.cartograph.charges.{created,updated}`, `book.cartograph.pieces.{created,updated}`). Update to a single subscription on the writs book filtered by `writ.type ∈ {vision, charge, piece}`. The single-event-per-apply guarantee discussion stays — it shifts from "wrap createVision + transition in one transaction" to "the cartograph's createX/transitionX primitives are already transactional" with the same outcome (one CDC-significant phase transition per apply).

- **§3.7 — Substrate plugin shape.** The substrate-owned-things list includes "Owns survey writ types and `books.surveys`." Drop `books.surveys` from the list. The substrate now owns the `status['surveyor']` and `ext['surveyor']` slots on survey writs instead. Likewise drop "Stamps SurveyDoc on completion" and replace with "Stamps `status['surveyor']` on completion."

These three sections are the only load-bearing references; minor incidental references elsewhere in the doc may need to be touched up for consistency.

## Out of scope

- **Migrating SurveyDoc itself.** The surveyor-apparatus doesn't exist yet (Commission C in the surveying-cascade design subtree). This commission updates the arch doc to reflect the post-cleanup shape so Commission C is briefed against it, but does not build the substrate.
- **Migrating other companion-doc patterns elsewhere in the framework.** The Astrolabe `PlanDoc` and similar are out of scope; PlanDoc is mostly content (inventory, scope, decisions, spec) and isn't a metadata-only companion.
- **Reworking the `ext` API itself.** `clerk.setWritExt` and the slot-write contract are existing primitives; this commission consumes them, doesn't extend them.
- **Renaming `VisionDoc` / `ChargeDoc` / `PieceDoc` projection types.** They keep their names and shapes — only their backing storage moves.

## References

- Parent design subtree: `c-moji050w` — Cartograph + surveying cascade.
- Downstream consumer: `c-moji0ggh` — Commission C, the surveyor-apparatus substrate, which depends on this cleanup landing first.
- The `setWritExt` API contract is documented on `ClerkApi` in `clerk-apparatus`'s public types — that's the load-bearing primitive.