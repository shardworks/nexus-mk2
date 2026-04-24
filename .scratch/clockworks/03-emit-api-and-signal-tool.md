# Event emission API and `signal` tool

## Intent

Give everything that needs to record an event a way to do so. Add `ClockworksApi.emit(name, payload, emitter)` as the canonical write path into the events book. Ship the `signal` base tool so animas can emit custom guild events during sessions, and add an `nsg signal` CLI alias so operators can emit them from the command line. With emit in place, the events book accumulates real records even before a dispatcher exists to consume them.

## Motivation

The events book is inert without a writer. `signal` is the authoritative emission surface for anima and operator use; the `emit()` API underneath it is what core modules will use for framework events (task 7). Landing emit + signal before the dispatcher means every downstream commission has a way to produce real test data, and the events book accumulates a shadow log of what would have dispatched — useful for debugging even at this intermediate stage.

## Non-negotiable decisions

### `ClockworksApi.emit(name, payload?, emitter)`

Single public write path into the events book. Signature:

- `name: string` — the event name; reserved framework namespaces (`anima.*`, `commission.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`, `session.*`) are accepted here without validation because framework code paths are the authoritative emitters and validation of *those* happens elsewhere.
- `payload?: unknown` — JSON-serializable, stored as `payload` column.
- `emitter: string` — who signaled it: an anima name, an engine name, a plugin id, or the string `framework`.

Writes synchronously to the events book, returns the inserted event's id.

Validation against `guild.json clockworks.events` is the `signal` tool's responsibility, not `emit`'s — `emit` is trusted-caller surface. This split mirrors the architecture doc's framing: animas go through `signal` (validated); framework code goes through `emit` (authoritative).

### The `signal` base tool

Declared in the Clockworks apparatus kit (`tools`) so it becomes available to every anima automatically. Matches the architecture doc's shape:

```typescript
tool({
  description: "Signal a custom guild event",
  params: {
    name: z.string(),
    payload: z.record(z.unknown()).optional()
  },
  handler: async ({ name, payload }, { home }) => { ... }
})
```

Handler rules:

- Read `guild.json clockworks.events` to determine valid custom event names.
- Reject framework-reserved namespaces with a clear error (animas cannot spoof framework events).
- Reject writ lifecycle event patterns (`{type}.ready`, `{type}.completed`, `{type}.stuck`, `{type}.failed`) — those are framework-emitted from writ state transitions, and an anima faking them would corrupt the record.
- Reject names not declared in `clockworks.events`.
- On success, call `ClockworksApi.emit(name, payload, <anima-name-or-id>)`.

### `nsg signal <name> [--payload <json>]` CLI alias

Operator-facing thin wrapper over the same `signal` validation path. Emitter is `operator` (or a more specific value if the CLI has access to one). Useful for local debugging and ad-hoc event injection during testing.

### Writ lifecycle events reject at the signal-tool layer

Per the architecture doc: an anima calling `signal('task.ready')` must be rejected. The validator recognizes the `{type}.*` pattern (where `type` is a known writ type and `.ready/completed/stuck/failed` is the suffix) and refuses. Framework code emits these via `emit()` directly, bypassing validation.

### Events are persisted immediately; no batching

Every `emit()` call writes exactly one row synchronously. No buffering, no coalescing, no async flush. This keeps the event log durable — if the caller returns, the event is on disk.

## Out of scope

- **The dispatcher.** Task 4.
- **Framework-event emission itself** (commission/writ/session/anima/tool/migration/guild). Task 7 wires these into their authoritative code paths; this commission provides the API they will use.
- **Payload schema enforcement.** The architecture doc flags this as deferred; `clockworks.events` declarations include an optional `schema` field but it is not validated here.
- **Book CDC auto-wiring** (`book.*` events). Task 8.
- **Event retention / pruning policy.** Events accumulate; pruning is a later concern.

## Behavioral cases the design depends on

- An anima calling `signal('code.reviewed', { pr: 42 })` with `code.reviewed` declared in `guild.json` writes one row to the events book; `emitter` is the anima's name.
- An anima calling `signal('anima.instantiated', ...)` is rejected with an error naming the reserved namespace.
- An anima calling `signal('mandate.ready', ...)` is rejected as a writ-lifecycle event even if `mandate` is a writ type in the guild.
- An anima calling `signal('undeclared.event', ...)` is rejected.
- `nsg signal deploy.approved --payload '{"env":"staging"}'` from the command line writes one row with emitter `operator` (or equivalent).
- Framework code calling `ClockworksApi.emit('commission.posted', ..., 'framework')` succeeds without validation — the reserved namespace is accepted at the emit layer.

## References

- `docs/architecture/clockworks.md` — Events, The signal Tool, guild.json Shape sections
- `c-mo1mql8a` — Clockworks MVP timer apparatus
