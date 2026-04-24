# Standing order error handling and loop guard

## Intent

Make standing-order failures observable and controllable. When a standing order's relay throws (or fails to resolve), signal a `standing-order.failed` event with structured context so guilds can wire their own error-handling standing orders. Tag these events to prevent a failing error-handler from cascading into an infinite loop of `standing-order.failed` → error → `standing-order.failed` → error → ...

## Motivation

Task 4's dispatcher records dispatch errors to the `event_dispatches` table but does not surface them as events. That means a guild has no way to respond to failures — no way to summon a steward when a commission fails to seal, no way to notify the patron when a relay is broken. The architecture doc specifies this shape explicitly, including the loop-guard mechanism that makes it safe.

## Non-negotiable decisions

### Signal `standing-order.failed` on every dispatch error

When a relay invocation throws or a relay name fails to resolve, the dispatcher (extended by this commission) calls `ClockworksApi.emit('standing-order.failed', payload, 'framework')` after writing the `event_dispatches` row.

Payload shape per the architecture doc:

```typescript
{
  standingOrder: { on: "commission.failed", run: "notify-patron", ... },  // the order that failed
  triggeringEvent: { id: 42, name: "commission.failed", ... },              // the event that fired it
  error: "Error message from the relay throw"
}
```

The `standingOrder` field is the full standing-order object from `guild.json`, including any sugar (so a `summon:` order is preserved as-written, not as its desugared `run:` form). The `triggeringEvent` includes the event id and name at minimum.

### Loop guard: error-on-error does not cascade

The architecture doc is explicit: *"The Clockworks runner will not fire standing orders in response to a `standing-order.failed` event that was itself triggered by a `standing-order.failed` event."*

Implementation: when a `standing-order.failed` event is emitted, tag it (either via a reserved field on the events row, a bit on the payload, or a lineage chain — implementer's call) with its originating context. The dispatcher, when processing an event named `standing-order.failed`, inspects the tag; if the triggering chain already includes a prior `standing-order.failed`, the dispatcher records the dispatch attempt (for observability) but does **not** invoke the relay.

Net effect: one layer of error handling is always available; errors inside that error-handler are logged but do not recurse.

### The tag must survive event-store reads

Whatever mechanism carries the loop-guard tag must be durable — if the runner restarts mid-processing, the tag survives the restart. A payload field is the simplest route; a reserved `lineage` column is heavier but more structured. Either is acceptable.

### Standing-order-level errors are the only errors that emit

`standing-order.failed` is for standing-order execution failures. Other error surfaces (engine failures, session failures, writ failures) emit their own events (`{type}.failed`, `session.ended` with an `error` field) from their own code paths. This commission does not introduce a generic "something failed" event.

### No retry at this level

Failed standing orders do not auto-retry. If a guild wants retry behavior, it writes a standing order `{ on: "standing-order.failed", run: "retry-logic" }`. The Clockworks itself has no retry machinery.

## Out of scope

- **Retry machinery.** Guild policy, not framework machinery.
- **Dead-letter queue for failed events.** The existing `event_dispatches` log captures failures; a proper DLQ is overkill.
- **Alerting / notification.** If a guild wants patron notifications, it writes a standing order pointing at a Lattice relay.
- **Automatic disabling of a chronically-failing standing order.** Guild can write an order that watches failure rates and disables siblings if it wants this; framework does not impose it.
- **Error-severity levels.** All standing-order failures emit the same event name; the payload's error field carries the message.

## Behavioral cases the design depends on

- A relay throws during dispatch; a `standing-order.failed` event is emitted; its payload includes the standing order, the triggering event (id + name), and the error message.
- A standing order names an unresolved relay; `standing-order.failed` is emitted with an error message naming the missing relay.
- A guild declares `{ on: "standing-order.failed", "summon": "steward" }`; a relay throws; the steward is summoned.
- A steward-summon relay itself throws while handling a `standing-order.failed` event; a second `standing-order.failed` event is emitted *for record*, but the steward-summon is not re-invoked on the second event (loop guard prevents cascade).
- A normal event (not a `standing-order.failed`) whose handler throws emits one `standing-order.failed`; that event fires its own handlers normally (the loop-guard only triggers on cascading failures).

## References

- `docs/architecture/clockworks.md` — Error Handling section, loop-guard note
- `c-mo1mql8a` — Clockworks MVP timer apparatus
