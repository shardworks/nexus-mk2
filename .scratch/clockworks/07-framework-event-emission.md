# Framework event emission wiring

## Intent

Make the framework actually emit the events its documentation promises. Wire calls to `ClockworksApi.emit(...)` into the authoritative core code paths for commission lifecycle, writ lifecycle, session lifecycle, anima lifecycle, tool installation/removal, migrations, and guild initialization. After this commission, standing orders in `guild.json` start firing in response to real framework activity rather than only synthetic `nsg signal` emissions.

## Motivation

The architecture doc lists roughly two dozen framework events. The emission code paths do not exist yet — `clockworks.md` describes what *should* be emitted; `core` does not yet emit it. Until it does, standing orders that bind to framework events (like `{ on: "mandate.ready", run: "summon-relay", with: { role: "artificer" } }`) never fire.

This commission is the invasive one — it touches commission posting, writ state transitions, session lifecycle, the anima state machine, and the tool-installation path. Landing it after the dispatcher is working means emissions flow into a real consumer, and integration tests can assert observable standing-order behavior rather than just "did we write a row."

## Non-negotiable decisions

### Full framework-event coverage

Every row in the architecture doc's "Framework events" table is emitted from its authoritative code path. Specifically:

- **Commission events** — `commission.posted`, `commission.state.changed`, `commission.sealed`, `commission.failed`, `commission.session.ended`, `commission.completed`. Emitted from the commission-posting flow and the commission state machine.
- **Writ lifecycle events** — `{type}.ready`, `{type}.completed`, `{type}.stuck`, `{type}.failed`. Emitted from the writ state-transition code (Clerk-owned, wherever that lives in the core wiring).
- **Session events** — `session.started`, `session.ended`, `session.record-failed`. Emitted from the session funnel in `nexus-core`.
- **Anima events** — `anima.instantiated`, `anima.state.changed`, `anima.manifested`, `anima.session.ended`. Emitted from the anima state machine.
- **Tool events** — `tool.installed`, `tool.removed`. Emitted from the tool-install/remove paths.
- **Migration events** — `migration.applied`. Emitted from the migration runner.
- **Guild events** — `guild.initialized`. Emitted from `nsg init` or equivalent first-boot path.

Payload shape follows the event catalog (`docs/reference/event-catalog.md`). Where the catalog is silent or ambiguous, pick a payload shape that names the affected entity id plus any disambiguating context (e.g., commission id plus workshop, writ id plus parent id). Document any payload decisions in code comments.

### Emitter is always the string `framework`

Per the architecture doc: framework events are signaled by core modules. The `emitter` column on the events book row is the literal string `framework` for every emission in this commission.

### Emit inside the transaction (or immediately after, best-effort)

Emit happens in the same code path as the state change that prompted it. Ideal: same transaction, so the event row is durable if and only if the state change is durable. If the existing code structure makes same-transaction emission impractical, emit immediately after the state-change commit with a best-effort catch so a clockworks failure doesn't roll back a writ transition. Either way, a missing emission is a bug — not a silent degradation.

### Writ-lifecycle events use the writ's type as the namespace

Per the architecture doc: a writ of type `mandate` emits `mandate.ready`, `mandate.completed`, etc.; a guild-defined `task` type emits `task.ready`, `task.completed`, etc. The emitting code reads the writ's type and constructs the event name from it. No hardcoded list of writ types.

### `standing-order.failed` is *not* in scope here

Task 9 handles the `standing-order.failed` emission (which has its own loop-guard concerns). This commission covers every other framework event.

## Out of scope

- **`standing-order.failed`.** Task 9.
- **`book.*` CDC auto-wired events.** Task 8.
- **New framework events.** This commission emits what the architecture doc already documents; it does not invent new ones.
- **Retrofitting event emission onto historical code paths** that no longer exist or have been superseded. Work with the current code as it stands.
- **Anima-visible notification of framework events.** Animas can observe via standing orders, same as everything else.
- **Payload-schema enforcement.** Deferred per the architecture doc.
- **Backfill emissions for historical state.** Events are emitted going forward from the moment this commission lands; no catch-up.

## Behavioral cases the design depends on

- Posting a commission emits `commission.posted` with the commission id and workshop; emitter is `framework`.
- A writ transitioning from `pending` to `ready` emits `{type}.ready` using the writ's type name.
- A session starting emits `session.started`; a session ending emits `session.ended` with non-null `error` iff the provider threw.
- A tool install (plugin, curriculum, etc.) emits `tool.installed`; removal emits `tool.removed`.
- A migration applying emits `migration.applied`.
- `nsg init` emits `guild.initialized` exactly once on first boot.
- A standing order `{ on: "commission.sealed", "run": "cleanup-worktree" }` fires when a commission completes successfully — this is the end-to-end integration case.
- A standing order `{ on: "mandate.ready", run: "summon-relay", with: { role: "artificer" } }` fires when a mandate writ becomes ready; the summon relay (task 5) launches an artificer session.

## References

- `docs/architecture/clockworks.md` — Framework events section
- `docs/reference/event-catalog.md` — full payload details per event
- `c-mo1mql8a` — Clockworks MVP timer apparatus
