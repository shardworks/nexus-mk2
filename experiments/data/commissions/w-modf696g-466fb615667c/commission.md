# Scheduled standing orders (cron) — MVP-1

## Intent

Extend the standing-order shape to accept time-pattern triggers — cron expressions or fixed intervals — as an alternative to the existing event-name `on:` key. The Clockworks daemon (task 10) gains a scheduler loop alongside its event-processing loop: on each tick, it evaluates which scheduled orders are due and dispatches them through the same relay-invocation path used by event-triggered orders. This is the MVP-1 feature the Reckoner needs for its polling tick, and the feature the architecture doc flagged as deferred from the initial Clockworks design.

## Motivation

The Reckoner's scheduling-trigger design click (`c-mod9a54n`) concluded that the Reckoner runs on a fixed-interval polling tick, not on event-driven triggers. That conclusion explicitly depends on Clockworks providing a cron-style tick primitive (see `c-mo1mql8a`). No such primitive exists today — the Clockworks dispatches only in response to events, and the architecture doc lists scheduled standing orders as deferred at the bottom of the document.

Without this feature, the Reckoner can't ship. With it, any guild apparatus that wants periodic work — tech-debt scans, health probes, cache eviction, Laboratory sweeps — gets it for free through the same standing-order mechanism it already uses for event responses.

## Non-negotiable decisions

### Extend the standing-order shape with a `schedule:` key

The canonical form established in task 4 is `{ on, run, with? }`. This commission introduces `schedule:` as a top-level Clockworks-reserved key that serves as an alternative trigger to `on:`:

```json
{ "schedule": "*/5 * * * *", "run": "reckoner-tick" }

{ "schedule": "@every 1h", "run": "tech-debt-scan", "with": { "depth": "full" } }
```

- `schedule` is either a **cron expression** (standard 5-field unix cron syntax: minute, hour, day-of-month, month, day-of-week) **or** a **fixed-interval form** using a leading `@` prefix: `"@every 30s"`, `"@every 5m"`, `"@every 1h"`. Support `s`/`m`/`h` units.
- `run` names the relay to invoke (same registry as event-triggered orders).
- `with` carries relay params (same contract as event-triggered orders — optional, defaults to `{}`).

`schedule:` joins `on:` and `run:` as a Clockworks-reserved top-level metadata key; like those, it does not leak into relay params. User-authored params stay under `with:`.

An order with both `on:` and `schedule:` keys is a configuration error — one trigger source per order.

### Scheduler loop inside the daemon

The daemon (task 10) already polls the events book on an interval. This commission adds a parallel scheduler pass, executed once per daemon tick:

1. On daemon startup, read `guild.json clockworks.standingOrders`, filter to entries with `schedule:`, and build an in-memory schedule table keyed by `(order-index, nextFireTime)`.
2. On each daemon tick, check the schedule table for orders whose `nextFireTime <= now`. For each, invoke the dispatcher (same path event-triggered orders use) with a synthesized "scheduled" event and the order's params. Advance `nextFireTime` per the schedule expression.
3. The scheduler pass runs *before* the event-processing pass in each tick cycle, so scheduled-order fires that emit events get picked up in the same tick.

### The synthesized event: `schedule.fired`

When a scheduled order fires, the dispatcher receives a synthetic event of name `schedule.fired` with a payload including the order itself (or its index), the fire time, and whatever context helps debugging. Relays invoked by a scheduled order see `event.name === 'schedule.fired'` — they can ignore it or use it.

Alternative considered and rejected: making the triggering event null for scheduled orders. Rejected because every other dispatch path passes a real event; keeping the shape uniform simplifies relay authoring.

`schedule.fired` is reserved in the framework namespace — animas cannot signal it via the `signal` tool.

### Missed fires during daemon downtime: fire once on restart, do not backfill

If the daemon is down across a scheduled fire window (e.g., `@every 5m` but the daemon was stopped for 20 minutes), the scheduler fires the order *once* on restart (if `nextFireTime` is in the past) and advances `nextFireTime` from the current time forward. It does not backfill four missed fires.

This is the simplest behavior and matches what operators typically expect from cron-like systems. If a guild wants catch-up semantics, the relay itself can track last-run and decide what to do.

### Validation of cron expressions at guild.json load time

When `guild.json` loads, every `schedule:` value is parsed and validated. Invalid expressions cause a clear error with the order's index and the invalid value. No silent fallback.

### Intervals are compared against wall-clock time, not monotonic

`@every 5m` means "fire on wall-clock 5-minute cadence, roughly." Clock adjustments (NTP correction, DST, manual time changes) can cause one fire to happen slightly early or late; this is acceptable at MVP. Monotonic-clock-based scheduling is a later tuning concern.

## Out of scope

- **Missed-fire backfill with catch-up execution.** One fire on restart, no backfill.
- **Time zones in cron expressions.** All schedules evaluate in the daemon's local time zone. A future enhancement could add per-order timezone; not in scope.
- **Sub-minute cron precision beyond what `@every` provides.** Standard cron bottoms out at 1-minute resolution; `@every` supports seconds.
- **A separate scheduled-orders table in the Clockworks books.** The schedule lives in `guild.json` alongside event-triggered orders; runtime state (next fire time, last fire time) is in-memory only. Persistent schedule state is a later concern.
- **Fire history / observability of scheduled runs.** Each fire writes an `event_dispatches` row through the normal dispatcher path — that is the history. A dedicated scheduled-fire log is not needed.
- **Jitter / load-spreading for multiple schedules at the same wall-clock moment.** If ten orders all schedule `"0 * * * *"`, they fire together every hour; the dispatcher processes them sequentially.
- **Cron expressions outside the standard 5-field form** (6-field with seconds, 7-field with year, non-standard vendor extensions).

## Behavioral cases the design depends on

- A standing order `{ "schedule": "*/5 * * * *", "run": "reckoner-tick" }` causes the `reckoner-tick` relay to fire every 5 minutes on the 5-minute marks.
- A standing order `{ "schedule": "@every 30s", "run": "health-probe" }` fires every 30 seconds from the daemon's start.
- A standing order `{ "schedule": "@every 1m", "run": "summon-relay", "with": { "role": "overseer" } }` fires every minute and launches the overseer anima.
- A standing order with both `on:` and `schedule:` keys is rejected at guild.json load with a clear error.
- An invalid cron expression (`"99 * * * *"`) is rejected at guild.json load with the order's index and the invalid value.
- The daemon stops for 15 minutes with a `@every 5m` order active; on restart, the order fires once, and the next fire is ~5 minutes after restart — not three missed fires.
- An anima calling `signal('schedule.fired', ...)` is rejected as a reserved namespace.
- A scheduled order's relay emits a new event during its handler; that event is processed in the same daemon tick's event-processing pass.
- Multiple scheduled orders due at the same moment fire in `guild.json` array order, sequentially.

## References

- `docs/architecture/clockworks.md` — Deferred section (this commission delivers the scheduled-standing-orders item); Standing Orders, The Clockworks Runner, Phase 2 daemon sections
- `c-mo1mql8a` — Clockworks MVP timer apparatus (the design click this commission anchors to)
- `c-mod9a54n` — Reckoner scheduling trigger (the petition scheduler's decision to poll, which depends on this feature)
- `c-mod99ris` — Reckoner design parent