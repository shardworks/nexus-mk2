# Writ-types documentation — architecture, schema reference, and "add a writ type" guide

## Intent

Document the writ-types system post-refactor. Three artifacts: an architecture doc describing what the system is and how it fits into the Clerk apparatus, a schema reference covering the config shape field-by-field, and a walkthrough of registering a new writ type with a worked example. Update the guild metaphor doc if any vocabulary shifted.

## Motivation

Without a canonical doc, the refactor's contracts remain tribal — future plugin authors (vision-keeper, click-folding-in work, any consumer adding a type) have no legible spec to reference. The refactor is a genuine extension of the framework's extensibility story and deserves first-class documentation.

## Non-negotiable decisions

- **Architecture doc placement.** Lives under `docs/architecture/apparatus/clerk.md` (extending the existing Clerk apparatus doc) or a dedicated `docs/architecture/apparatus/writ-types.md` — author's judgment which placement reads cleanest. Not both; the architecture story should be navigable from one place.
- **Schema reference coverage.** Every field in the writ-type config is documented with: semantics, validation rules, examples of valid and invalid values. Covers the classification layer, attrs layer, `allowedTransitions`, `childrenBehavior` (triggers, actions, short-circuit behavior, idempotency rules).
- **"Add a writ type" guide.** A worked example walks through registering a fictional new type — same shape as the test type from T6 is a reasonable source, but the guide is written for plugin authors, not test readers. Includes: registration call, config construction, verification that writs of the type are accepted, common pitfalls.
- **Guild metaphor update.** If any vocabulary shifted as part of this refactor (e.g., the meaning of "writ" broadening beyond "obligation," the introduction of classification / attrs as first-class terms), the guild metaphor doc is updated to reflect. If no shift, this point is a no-op.

## Scope fences

- **Clerk README rewrite beyond the writ-types section** — out of scope.
- **Docs for the vision-keeper, product, capability, or outcome types** — those types aren't introduced by this refactor; their docs belong with the vision-keeper work.
- **Migration guide for existing mandate code** — no migration needed.

## References

- Parent design click: `c-mo1mqp0q`.
- Informs: all downstream plugin-author work including the parked vision-keeper subtree (`c-moa42rxh`).
- Can draft before T2/T3 ship; final version requires T2/T3 locked.