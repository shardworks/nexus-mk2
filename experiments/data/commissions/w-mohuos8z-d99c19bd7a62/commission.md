# Clockworks event surface migration

## Intent
Migrate the Clockworks plugin's own event vocabulary onto the kit-contribution mechanism delivered in C1. Renames intrinsic events to plugin-id-prefixed form, generalizes the writ-lifecycle observer to fire on every status transition, deletes events that no longer earn their keep, and adds Clockworks' `supportKit.events` declaration via the function form.

## Motivation
Clockworks today emits a mix of intrinsic events (about its own dispatch and scheduler behavior), framework-bootstrap events (`guild.initialized`), and writ-lifecycle events (via the writ-lifecycle CDC observer on Clerk's writs book). The names follow ad-hoc conventions inherited from before plugins were a first-class concept, and the writ-lifecycle observer hardcodes a four-canonical-phase mapping that doesn't accommodate plugin-registered statuses. This commission cleans the intrinsic and lifecycle slices; observational events (the CDC bridge) move out to a separate plugin in C3.

## Non-negotiable decisions

### Add Clockworks `supportKit.events` (function form)
Clockworks contributes a function-form events kit returning the union of:
- **Intrinsic events** (static): `clockworks.standing-order.failed`, `clockworks.timer`.
- **Writ-lifecycle events** (enumerated from `ctx`): for every writ type returned by `clerk.listWritTypes()` × every status registered for that type, declare `writ.<type>.<status>`. Domain-named (`writ.`) because writ types come from multiple plugins.

### Rename intrinsic emit sites
- `standing-order.failed` → `clockworks.standing-order.failed` (both call sites: scheduler-sweep failure and dispatch-sweep failure).
- `schedule.fired` → `clockworks.timer` — including the scheduler's direct events-book write that bypasses `emit()`. Update the persisted event-row name to match the kit declaration.

### Generalize the writ-lifecycle observer
The writ-lifecycle observer emits `writ.<type>.<status>` for **every status transition**, including transitions into `new` (writ creation as a draft) and `cancelled`. Drop the current phase-to-suffix mapping function and its hardcoded four-canonical-phase list. Any registered writ-type status fires.

The transition to `new` fires on writ creation (the writ entering existence at its initial phase). The transition to `cancelled` fires on cancellation. All other registered statuses fire on entry.

The `commissionId` derivation (walking `parentId` to the root via the writs book) remains available for any payload that previously included it, but it no longer drives a separate event family — see deletion below.

### Delete decommissioned events
Remove emit sites and any associated tests / payload synthesis for:
- `guild.initialized`
- `migration.applied`
- `commission.posted`, `commission.state.changed`, `commission.sealed`, `commission.completed`, `commission.failed`

The commission-specific branch in the writ-lifecycle observer is removed entirely — root mandates fire `writ.mandate.<status>` like any other writ. The `isRootMandate` helper and the commission-payload synthesis are removed.

## Behavioral cases the design depends on
- A writ entering any registered status fires exactly one `writ.<type>.<status>` event.
- A draft writ creation fires `writ.<type>.new`.
- A writ transitioning `stuck` → `open` fires `writ.<type>.open` (re-entry into a previously-fired status counts).
- A writ transitioning to `cancelled` fires `writ.<type>.cancelled`.
- A root mandate transitioning to `completed` fires `writ.mandate.completed` and **no** `commission.sealed` / `commission.completed`.
- A scheduled standing order firing produces a `clockworks.timer` event row with `processed: true` (matching today's scheduler-direct-write semantics).
- A standing-order dispatch failure produces a `clockworks.standing-order.failed` event row.
- An anima signal tool emit attempt on `writ.mandate.stuck` (or any other writ-lifecycle name) fails (framework-owned).

## Documentation
Refresh `clockworks.md` and `event-catalog.md` to reflect the new vocabulary. The old `commission.*` and `<type>.<phase>` documentation entries are removed; the new `clockworks.*` and `writ.<type>.<status>` entries take their place.

## Out of scope
- The CDC auto-wiring code and `book.<owner>.<book>.<verb>` events — those move out to the new bridge plugin in C3.
- Animator's session and anima events — C4.
- Tools/CLI events — C5.
- The events-kit infrastructure itself — C1.
- Backfilling old event-rows in existing `clockworks/events` data — out of scope; old rows stay, new rows have new names.

## References
- Design root: click `c-mog0glxx`.
- Depends on C1 (events-kit infrastructure) being landed (declared via `spider.follows`).