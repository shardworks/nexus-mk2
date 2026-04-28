# Kit-contributed standing orders for Clockworks

## Intent

Extend the Clockworks kit-contribution surface with a `standingOrders` slot
alongside the existing `relays` and `events` kit slots. After this change,
apparatus packages can ship their own default standing orders — event
subscriptions or schedule entries — as part of their kit, rather than
requiring an operator to hand-copy the entries into `guild.json`. This is
the substrate change that unblocks the Reckoner's periodic-tick contribution
and any future apparatus that wants to ship default standing-order behavior.

## Motivation

The only path to a standing order today is `guild.json clockworks.standingOrders`
— operator-defined. An apparatus that wants to ship default behavior bound
to one of its events or to a periodic schedule has nowhere to put that
contribution; it has to ask the operator to copy a snippet into `guild.json`,
or register the order imperatively at runtime (which Clockworks doesn't
support).

The first concrete consumer is the Reckoner, which needs a periodic tick
to drive its scheduler. Rather than carve out an apparatus-specific knob,
the kit-contribution slot is the natural extension of the existing pattern
(`relays`, `events`).

## Non-negotiable decisions

### Kit slot shape — array only

`ClockworksKit` gains `standingOrders?: StandingOrder[]`. No function form
(record-style factory). The `events` kit grew a function form because
writ-lifecycle event declarations are dynamic against Clerk's writ-type
registry; standing orders have no analogous "compute at start" need today.
Defer the function form until a concrete consumer surfaces.

Source: c-moiw5sw2.

### Purely additive merge — no override, no disable, no id

The effective standing-order list at any use site is the concatenation:

    [ ...kit contributions (unspecified plugin order),
      ...guild.json entries (in declared order) ]

- No `id` field is added to `StandingOrder`.
- No collision detection between kits, or between kit and operator.
- No mechanism for operators to override or disable a kit-contributed order.
- Two contributions producing equivalent triggers simply produce two
  dispatches per matching event — same as an operator writing the same
  entry twice today.

Source: c-moiw5sw2.

### Validator extension — source labeling

`validateStandingOrders` gains an optional `source` parameter so per-entry
error bullets attribute failures correctly. Operator failures continue to
read `standing order #N: ...`; kit failures read
`standing order #N [kit "<pluginId>"]: ...`. The apparatus's `start()`
calls the validator once per contributing kit, passing the contributing
pluginId as `source`.

A malformed kit-contributed standing order is a kit-author bug and fails
apparatus boot loud, naming the kit. Symmetric with the existing fail-loud
guards on the `events` kit.

Source: c-moiw5sw2.

### Lifecycle — kit layer start-scoped, operator layer unchanged

Kit-contributed standing orders are walked once during `start()`,
validated, and snapshot into an in-memory kit layer. The operator layer
continues to be re-read on every `processEvents` call so guild.json
hot-edits to event-driven entries continue to land without restart. Kit
contributions don't hot-reload — they live with the apparatus.

For the schedule table specifically (built once at `start()` today,
restart required for any change), kit-contributed schedule entries are
seeded into the same table at the same point as operator schedule
entries. The "schedule edits require restart" semantic carries forward
unchanged.

Source: c-moiw5sw2.

## Out of scope

- **Override or disable mechanisms.** No use case yet; the additive model
  is sufficient for the Reckoner's needs. Override/disable design follows
  a real consumer.
- **Function-form (factory) kit contributions for standing orders.** Defer
  until a concrete dynamic-contribution need shows up.
- **The Reckoner's tick contribution itself.** Separate commission building
  on this substrate.
- **Schedule hot-reload.** Orthogonal concern; out of scope here as it is
  today.

## References

- **c-moiw5lvp** — umbrella click (Reckoner periodic tick registration via
  Option B from c-moisx6fx).
- **c-moiw5sw2** — design click for this commission.
- **c-mod99ris** — parent Reckoner design click.
- **c-moisx6fx** — sibling design (scheduler kit-contribution shape) that
  established the Option B path.