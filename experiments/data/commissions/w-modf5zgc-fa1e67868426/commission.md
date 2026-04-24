# Event-triggered standing order dispatcher

## Intent

Build the Clockworks runner — the core event-processing loop. Read unprocessed events from the events book, resolve which standing orders from `guild.json` match the event name, invoke each matching relay in registration order via the relay registry, write a dispatch record per invocation, and mark the event processed when all handlers have run. This commission delivers the event-triggered dispatch path only; time-triggered scheduling (cron) composes on top of this in task 11.

## Motivation

Everything above this in the stack (emit, signal, relays, kit) writes into a queue with no consumer. Everything below (summon, manual CLI, error handling, daemon, cron) needs a working dispatcher to build on. Landing the dispatcher as a focused commission — no summon sugar, no error-event signaling, no daemon — keeps the review surface small and forces the core wiring to be correct before the edge cases pile on.

## Non-negotiable decisions

### A single-pass process-events function

The runner exposes a function (shape to be decided by implementer, e.g. `processEvents()` or `tick()`) that does one sweep:

1. Read all unprocessed events from the events book in `id` order.
2. For each event, resolve matching standing orders from `guild.json clockworks.standingOrders` where `on === event.name`.
3. For each matching order in registration order (the array order in `guild.json`), invoke the named relay.
4. Write a dispatch record per invocation with `startedAt`, `endedAt`, `status`, and (on failure) `error`.
5. Mark the event `processed = true` after all its standing orders have run.

This is the single core primitive; task 6 (manual CLI) and task 10 (daemon) both call it.

### Standing order resolution: exact name match, registration order

Event-name matching is exact string equality (no wildcards, no glob patterns). Matching standing orders fire in the order they appear in `guild.json clockworks.standingOrders[]`. This keeps semantics dead simple and predictable; pattern matching can be revisited later.

### Single canonical standing-order shape with a dedicated params namespace

Standing orders have exactly one form. Top-level keys are **Clockworks-reserved metadata**; relay params live in a dedicated `with:` field so the two namespaces never collide:

```typescript
export interface StandingOrder {
  on: string;           // event name trigger
  run: string;          // relay name
  with?: Record<string, unknown>;   // params passed to the relay (optional)
  // future Clockworks-reserved keys (schedule, id, description, enabled, etc.) go here
}
```

Example:

```json
{ "on": "deploy.requested", "run": "deploy", "with": { "environment": "staging", "dryRun": true } }
```

The `StandingOrder` union type in `nexus-core`'s `guild-config.ts` currently anticipates `summon:` and `brief:` sugar variants; this commission collapses the union to the single variant above. Any guild.json entry using the old `summon:` or `brief:` sugar is a validation error with a clear message pointing at the order's index.

**Rationale for the nested `with:`.** Spreading params onto top-level keys (as the earlier architecture doc sketched) creates a reserved-word problem: every Clockworks-level feature (`schedule`, future `id`, future `enabled`, eventual sugar reintroductions) would eat a keyword a relay could have used. Nesting relay params under `with:` gives Clockworks room to grow its metadata vocabulary without ever shadowing a user-authored param. Pattern is familiar from GitHub Actions' `with:`.

### Param extraction

The dispatcher extracts `params` as `order.with ?? {}` and passes it to the relay via `RelayContext.params`. That's the entire contract. Reserved metadata keys (`on`, `run`, future `schedule`, etc.) stay on the outer order record and do not leak into `params`.

### Relay resolution failure is a standing-order failure

If a standing order names a relay that isn't in the registry, the dispatcher writes a dispatch record with `status: "error"` and an error message naming the unresolved relay. The full `standing-order.failed` event emission is task 9 — this commission's failure path is record-only.

Same treatment for relay throws: catch, record the error, move on. The runner does not stop processing other events or other handlers because one relay failed.

### Events are processed sequentially, handlers within an event sequentially

No concurrency in this commission. One event at a time, one handler at a time. Concurrency is a tuning concern that can land later; correctness of the sequential path must come first.

### `processed` is the durable checkpoint

An event is marked `processed = true` only after all its standing orders have run (success or error). If the process crashes mid-event, restarting reprocesses the event from the top — some handlers may run twice. This is acceptable for MVP; idempotency is the handler's responsibility. A more sophisticated per-handler checkpoint can come later.

### `handlerType` field populated

The `handlerType` column on `event_dispatches` is set to `relay` for relay invocations. Anima dispatches via the summon relay (task 5) will use `anima` or `relay` depending on how summon is modeled internally — the decision is task 5's, not this commission's.

## Out of scope

- **`summon:` and `brief:` sugar forms.** Explicitly dropped. Standing orders use `{ on, run, with? }` only. Sugar can be reintroduced later if real usage shows demand; not speculatively.
- **`standing-order.failed` event emission.** Task 9.
- **Loop guard** (no re-firing `standing-order.failed` for errors handling errors). Task 9.
- **CLI commands.** Task 6.
- **Daemon.** Task 10.
- **Cron triggers.** Task 11.
- **Parallel handler execution.** Sequential only.
- **Dead-letter queue / stuck-event handling.** Failed dispatches are recorded and the event moves on; there is no retry machinery here.
- **CDC auto-wiring.** Task 8.

## Behavioral cases the design depends on

- Emitting an event with one matching standing order invokes the named relay once; a dispatch record is written with `status: success`; the event transitions to `processed: true`.
- Emitting an event with two matching standing orders invokes both relays in `guild.json` array order; two dispatch records are written; the event is marked processed after both complete.
- Emitting an event with zero matching standing orders marks the event processed with no dispatch records.
- A standing order naming an unresolved relay produces a dispatch record with `status: error` and a message naming the missing relay; the event still transitions to processed; other matching orders still fire.
- A relay handler throws; a dispatch record captures the error message; subsequent handlers for the same event still fire; the event is marked processed.
- Calling the process function with an empty queue is a no-op.
- Calling the process function with N pending events processes all N in `id` order.
- A standing order with a `with:` object passes that object to the relay as `params`; a standing order with no `with:` field results in `params: {}`.
- A standing order declared with top-level param keys (the old flat-spread shape) is rejected at guild.json load time with a message pointing at the order's index.

## References

- `docs/architecture/clockworks.md` — Standing Orders, The Clockworks Runner, Clockworks Schema sections
- `c-mo1mql8a` — Clockworks MVP timer apparatus