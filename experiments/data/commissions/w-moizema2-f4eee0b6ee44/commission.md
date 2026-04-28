# Reckoner: stamp-only `petition()` overload + internal refactor

## Intent

Add a stamp-only form of `ReckonerApi.petition()` that publishes an already-created writ by patching `ext.reckoner` onto it, and refactor the existing create+stamp form to use the new helper internally. Petitioners that need to wire parent/depends-on relationships before the writ becomes Reckoner-visible (the draft idiom from click c-moivk7pd) currently have to skip the `petition()` helper and hand-stamp via `clerk.setWritExt()` — an undiscoverable path with no source check, no priority validation, no default-fill. This commission closes that gap by promoting the stamp step to a first-class API entry point.

## Motivation

The Reckoner gates on `ext.reckoner` presence (D14), not phase alone, so the canonical draft idiom is: create a writ in its initial phase WITHOUT `ext.reckoner` (invisible to the Reckoner), set up parent/child + `depends-on` links, then stamp `ext.reckoner` to publish. The first downstream consumer is the vision-keeper (c-moa42rxh subtree), which atomically creates a charge writ, links it to its review-vision parent, and then needs to publish — all inside one Stacks transaction. Without this helper, the stamp step is an off-API code smell that bypasses every safeguard the create+stamp form provides.

## Non-negotiable decisions

### Overload `petition()` rather than introduce a new verb (c-moiwnb9i)

Both forms petition the Reckoner; the only difference is whether the writ already exists. TypeScript discriminates on the first argument: `string | PetitionRequest`. A second verb (`publish`, `submit`, `stamp`) would fragment the conceptual model — there is one act, with two entry points.

### Extract a `PetitionExtRequest` shape; `PetitionRequest` extends it (c-moiwnb9i)

The stamp-only form takes the same `source` / `priority?` / `complexity?` / `payload?` / `labels?` fields as the existing `PetitionRequest`, minus the writ-shape fields (`type`, `title`, `body`, `codex`, `parentId`). Pull those ext-only fields into a `PetitionExtRequest` interface; have `PetitionRequest extends PetitionExtRequest`. This keeps the partial-priority + default-fill (D15) and source-validation contract uniform across both forms — the helper is not a thin wrapper over `clerk.setWritExt()`; it carries the same value-add.

### Stamp-only form runs identical validation to the create+stamp form (c-moiwnb9i)

Source registry check (with `enforceRegistration` semantics, D6/D8), priority dimension validation, default-fill of partial priority. No divergence between forms.

### Fail-loud on existing `ext.reckoner` (c-moiwnb9i)

Petitioning is a one-time act. If the writ already carries `ext.reckoner`, throw — do not silently no-op, do not deep-compare, do not overwrite. Easier to reason about, matches the Reckoners fail-loud-by-default ethos, and can be relaxed later if a real use case appears. Makes patch-vs-replace semantics moot.

### Fail-loud on writs not in the writ-types initial phase (c-moiwnb9i)

Petitioning means "submit for consideration", which is only meaningful for a writ in its initial phase. If the writ has been transitioned past the initial phase, fail-loud rather than silently re-firing the CDC gate (D14) for a writ the Reckoner will skip.

**Initial phase is determined from the writ-type definition, not by string-comparing to `new`.** Mirror the pattern used by `resolveActiveTargetPhase` (concern 1 of c-moivk7pd): walk the writ types registered state machine, identify the initial state (the state with no inbound transitions, or however the state machine declares its entry point), and compare the writs current phase against that. Hardcoding `new` repeats the assumption the parent click already retired.

If the writ-types initial-phase resolution is ambiguous (zero or multiple initial states), fail-loud at the helper boundary the same way `resolveActiveTargetPhase` fails on its 0-or-2+ active candidates.

### Internal refactor: the create+stamp form delegates to the stamp-only form (c-moiwnb9i)

Restructure `petition(request)` to do `clerk.post()` followed by `this.petition(writId, extRequest)`. The stamp-only form becomes the canonical implementation; the create+stamp form is a convenience wrapper. Net: a single code path for source check, priority validation, ext writing.

## Behavioral cases the design depends on

- Stamp-only form on a writ already carrying `ext.reckoner` throws; no mutation occurs.
- Stamp-only form on a writ past its initial phase throws; no mutation occurs.
- Create+stamp form (post-refactor) produces the same on-disk shape it produced before — the change is internal-only from the petitioners perspective.
- A petitioner that creates a writ in its initial phase, adds a `depends-on` link to a sibling, and calls the stamp-only `petition()` inside a Stacks transaction sees the writ become Reckoner-visible only after the transaction commits.
- Source-registry, `enforceRegistration`, partial-priority default-fill, and priority validation behave identically across both forms.
- A writ-type with an initial-phase definition other than `new` (a future writ type with `new`-renamed-to-`drafted`, etc.) is handled correctly — the helper does not assume `new`.

## Out of scope

- **Re-prioritization on already-accepted writs.** The stamp-only form is for held petitions only. Mutating `ext.reckoner.priority` on an `open` writ is a different operation and is not addressed here.
- **Cross-apparatus authoring.** Cases where apparatus X creates the writ and apparatus Y stamps it remain parked (per the parent clicks conclusion).
- **Atomic `clerk.post() + setWritExt()` bundling.** The two-step non-atomic flow described in D7 stands; the create+stamp form continues to be two `clerk` calls under the hood.
- **`withdraw()` changes.** Out of scope.
- **CDC handler / consideration logic changes.** D14 (re-fire on `ext.reckoner` change) already supports the draft idiom. This commission only adds the helper.

## References

- c-moiwnb9i — this commissions source click (decisions ratified above).
- c-moivk7pd — parent design click; concern 2 (drafting before petitioning) and concern 1 (active-phase naming generalization, the pattern this commission mirrors for initial-phase resolution).
- c-moa42rxh — vision-keeper subtree; the first natural consumer of the stamp-only form.