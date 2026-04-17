# Close the `transition()` Back-Door on the Writ Observation Slot

## Intent

In the preceding status-convention commission, `ClerkApi.transition()`'s managed-field strip list was updated to strip `phase` from the caller-supplied body but was left permitting `status` (the new per-plugin observation slot) to flow through body-merge. That decision was not surfaced to the patron before the plan executed and is inconsistent with the substrate's intended write model. Close the back-door: `transition()` must strip **both** `phase` and `status` from body-merge, so the observation slot is writable **only** through the Clerk helper that does atomic read-modify-write per sub-slot.

## Motivation

The observation slot is shaped as `Record<PluginId, unknown>` specifically to support multiple writer plugins owning their own sub-slots under a uniform field. Its correctness guarantee — "each plugin owns `status.<pluginId>`, sibling sub-slots are never clobbered" — requires every write to go through a path that performs a read-modify-write inside a transaction. The Clerk helper introduced in the preceding commission is that path; it exists precisely because Stacks `patch()` is shallow and a naive `patch(id, { status: { spider: {...} } })` silently wipes sibling sub-slots.

`transition()` today accepts an optional body that gets merged into the writ document. If that body is allowed to carry a `status` object, callers can replace the whole slot via the transition path — bypassing the helper, re-opening the clobber hazard, and giving the system two functionally different ways to write the slot. The invariant "all slot writes go through the helper" can be neither documented simply nor enforced while the back-door exists.

Closing it now, before any plugin starts writing sub-slots, keeps the contract one-path and unambiguous. This is maintenance of a substrate boundary, not a feature; the only reason it's its own commission is that the originating decision was auto-resolved by the planner without patron review.

## Non-negotiable decisions

### `transition()` strips both `phase` and `status` from its body

The managed-field strip list on `ClerkApi.transition()` — the set of fields removed from the caller-supplied body before it merges into the writ document — must include both of:

- `phase` — callers change the writ's lifecycle value through `transition()`'s dedicated parameter, not through body-merge. (Already true in the preceding commission.)
- `status` — the per-plugin observation slot. Callers write the slot via the Clerk helper only.

Any other fields passed in body continue to merge normally (e.g. `resolution`, per-writ metadata not reserved for slot mechanics).

### Behavior when a caller supplies `status` via transition body

When a caller passes a `status` key in the body, `transition()` silently drops it from the merged payload (the same behavior it already applies to `phase`). No error; the field is treated as reserved and the rest of the body merges normally. This matches the existing strip-list convention and avoids surprising callers who use a shared document shape between `put()`/`patch()`/`transition()`.

### Invariant documented in Clerk's convention section

The Clerk prose section added by the preceding commission — the one introducing the spec/status split — gains an explicit statement: the observation slot is writable **only** via the Clerk helper. `transition()` and the generic `put()`/`patch()` paths are not supported slot-write mechanisms. Put into prose, this is the one-path contract the substrate relies on.

## Out of scope

- **Enforcement of sub-slot ownership** (a plugin writing into another plugin's sub-slot). Still convention-only. This commission closes a caller-side write path, not a cross-plugin trust boundary.
- **Deprecation or rename of the generic `put()` / `patch()` paths.** The Stacks write API is unchanged; those are not slot-specific and their behavior is unchanged. A plugin that bypasses the Clerk helper and `put()`s a full writ document is still technically able to clobber — the helper is the recommended path, not a runtime wall. The one-path contract is documented, not enforced.
- **Changes to the Clerk helper's own contract or signature.** The helper's shape is as the preceding commission landed it.
- **Parallel cleanup on any analogous `transition`-like API for other runtime objects** (rigs, engines, sessions, input-requests). Those objects do not yet carry an observation slot; the back-door question is moot there and re-emerges naturally when they adopt the convention in a future commission.

## References

- **Preceding commission** (status convention on writs — introduces the slot and the Clerk helper): writ `w-mo38j057-bc074810ff6c`. This commission is a fast-follow correction of one auto-resolved decision in that commission's plan (the strip-list decision for the observation slot).
- **Design subtree** for the convention: click `c-mo33duvq-7f774446c6c9` and its concluded children — none of which authorize `transition()` as a slot-write path.