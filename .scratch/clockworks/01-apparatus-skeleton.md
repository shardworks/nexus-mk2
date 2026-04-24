# Clockworks apparatus skeleton

## Intent

Create the Clockworks apparatus plugin — package, book schemas, plugin registration — as the empty shell that every subsequent Clockworks commission will build on. No runtime behavior, no runner, no relays, no emit API yet. This is the scaffolding: the plugin package exists, the two books (events, event_dispatches) are declared via Stacks, and a bare `ClockworksApi` type surface is published for downstream packages to import.

## Motivation

The Clockworks is described in `docs/architecture/clockworks.md` as Pillar 5 of the guild architecture, but is currently not implemented. `ClockworksConfig` types live in `nexus-core` and guilds can declare events and standing orders in `guild.json`, but nothing reads them. The gap is the apparatus itself.

Landing the skeleton as its own commission gives every downstream task (relay registry, emit API, dispatcher, CLI) a real package to import from and a real book ownerId to scope tests against, without entangling them with runtime behavior decisions.

## Non-negotiable decisions

### Package: `@shardworks/clockworks-apparatus`

New package under `packages/plugins/clockworks/` matching the apparatus-plugin layout used by `@shardworks/lattice-apparatus`, `@shardworks/clerk-apparatus`, and similar. Plugin id is `nexus-clockworks` (matches the architecture doc's examples and the `ClockworksKit` author note: *"A plugin contributing relays declares itself as satisfying `ClockworksKit` and names `nexus-clockworks` in its `recommends`"*).

Exports:

- A `createClockworks()` plugin factory (following the `createLattice()` pattern)
- `ClockworksApi` type (initially empty or minimal — filled in by task 3)
- `ClockworksKit` type (initially empty or minimal — filled in by task 2)
- Book types for the two owned books (events, event_dispatches)

### Two books owned by the apparatus

The apparatus declares two books via the standard Stacks plugin-books mechanism:

- `events` — the event queue. Columns match the architecture doc's schema: `id` (auto), `name`, `payload` (json), `emitter`, `firedAt` (datetime, default now), `processed` (boolean, default false).
- `event_dispatches` — the dispatch log. Columns: `id`, `eventId` (fk to events), `handlerType`, `handlerName`, `targetRole` (nullable), `noticeType` (nullable), `startedAt`, `endedAt`, `status`, `error` (nullable).

These books are internal operational state — not part of the guild's register/ledger/daybook framing. Column names adapt the doc's snake_case to whatever casing the Stacks adapter conventionally uses.

### Hard dependency on Stacks

The apparatus registers as depending on `@shardworks/stacks-apparatus`. All book access flows through the standard StacksApi. No direct sqlite access, no bespoke persistence.

### Lifecycle: start/stop hooks registered but no-op

The plugin's `start()` and `stop()` hooks are registered (so downstream commissions can hang logic off them) but do nothing substantive in this commission. Subsequent commissions add: CDC auto-wiring on start (task 8), daemon registration on start (task 10), runner initialization (task 4).

### `nsg clock` CLI namespace claimed (no subcommands yet)

Register `nsg clock` as a top-level CLI group with help text describing the forthcoming subcommands. Subcommands themselves land in tasks 6 (list/tick/run) and 10 (start/stop/status). This commission claims the namespace to prevent accidental collision and gives a visible placeholder.

## Out of scope

- **Any runtime behavior.** No event processing, no dispatch, no relay invocation. Wiring is the next commission's job.
- **The relay SDK.** The `relay()` factory in `nexus-core` and the `ClockworksKit.relays` contribution type are task 2. This commission only names the types; task 2 implements them.
- **The `signal` tool.** Task 3.
- **CDC auto-wiring.** Task 8.
- **Migration path for any existing guild.json.** The `ClockworksConfig` shape already exists in `nexus-core`; no migration is needed. Existing guilds with `clockworks.*` declarations will simply not have their orders processed until task 4 lands — acceptable, since no one is running on this yet.

## Behavioral cases the design depends on

- A test guild installs `@shardworks/clockworks-apparatus` and starts; both books are created via Stacks migrations and appear in the guild home.
- A downstream package imports `ClockworksApi` and `ClockworksKit` types without runtime errors.
- Stopping the guild cleanly shuts down the apparatus; no lingering handles.
- `nsg clock --help` lists the namespace and notes that subcommands are forthcoming (or shows a "not yet implemented" stub — implementer's call on the exact UX).

## References

- `docs/architecture/clockworks.md` — full Clockworks design
- `c-mo1mql8a` — Clockworks MVP timer apparatus (the design click this commission anchors to)
