# Clockworks Implementation Plan

Two phases. Phase 1 stands up the complete Clockworks machinery with custom events only — enough to define events, write clockwork engines, add standing orders, signal events via CLI or anima tool, and step through the queue with `nsg clock`. Phase 2 wires framework event signalling into the existing codebase so standard events (`commission.sealed`, `tool.installed`, etc.) flow automatically.

The split means the Clockworks can be built, tested, and trusted before touching any existing code paths.

---

## Phase 1 — Core Clockworks Infrastructure

### 1. Ledger schema migration

New migration adding two tables:

```sql
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  payload    TEXT,
  emitter    TEXT NOT NULL,
  fired_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE event_dispatches (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  handler_type TEXT NOT NULL,
  handler_name TEXT NOT NULL,
  target_role  TEXT,
  notice_type  TEXT,
  started_at   DATETIME,
  ended_at     DATETIME,
  status       TEXT,
  error        TEXT
);
```

### 2. `engine()` SDK factory in `nexus-core`

New export parallel to `tool()`:

```typescript
export interface EngineDefinition {
  handler: (event: GuildEvent | null, ctx: { home: string }) => Promise<void>;
}

export function engine(def: EngineDefinition): EngineDefinition {
  return def;
}

export interface GuildEvent {
  id: number;
  name: string;
  payload: unknown;
  emitter: string;
  firedAt: string;
}
```

Clockwork engines export a default `EngineDefinition`. The Clockworks runner detects this shape at load time.

### 3. Internal event emission in `nexus-core`

A `signalEvent(home, name, payload, emitter)` function used by the framework and by the `signal` tool:

```typescript
export function signalEvent(
  home: string,
  name: string,
  payload: unknown,
  emitter: string,
): number  // returns event id
```

Persists to the `events` table. Does not process — just records. The runner processes separately.

### 4. `signal` tool + `nsg signal` CLI command

Base tool available to all animas:
- Validates `name` against `guild.json clockworks.events`
- Rejects names in reserved framework namespaces
- Calls `signalEvent()` to persist
- Returns the event id

Also exposed as `nsg signal <name> [--payload <json>]` for operator use. Same handler, same validation.

### 5. Clockworks runner

Core logic in `nexus-core` (`runClockworks(home, options)`):

1. Read all pending events (`processed = 0`) from Ledger, ordered by `fired_at`
2. For each event, find matching standing orders from `guild.json clockworks.standingOrders`
3. For each matching standing order:
   - **`run:`** — load the named engine from disk, check it exports an `engine()` default (error if not), call `handler(event, { home })`, record in `event_dispatches`
   - **`summon:` / `brief:`** — resolve the named role to active animas, manifest each with the event as context + notice type, record in `event_dispatches`
   - On any handler failure: signal `standing-order.failed` with loop guard (do not process `standing-order.failed` events triggered by `standing-order.failed` events)
4. Mark event as `processed = 1`

### 6. `nsg clock` subcommand

Three actions:

| Command | Behavior |
|---|---|
| `nsg clock list` | Show all pending events (id, name, payload summary, fired_at) |
| `nsg clock tick [id]` | Process the next pending event, or the specific event by id |
| `nsg clock run` | Process all pending events until queue is empty |

### 7. `guild.json` validation

On `nsg status` and at install time: validate `clockworks.standingOrders` entries reference known event names and installed engines/roles.

---

## Phase 2 — Framework Event Signalling

Wire `signalEvent()` calls into existing `nexus-core` operations. Each call is a one-liner addition to existing functions.

| Event | Where to add |
|---|---|
| `guild.initialized` | `initGuild()` in `nexus-core` |
| `tool.installed` | `installTool()` in `nexus-core` |
| `tool.removed` | `removeTool()` in `nexus-core` |
| `anima.instantiated` | `instantiate()` in `nexus-core` |
| `anima.state.changed` | anima state transition functions in `nexus-core` |
| `anima.manifested` | manifest engine, after session launch |
| `anima.session.ended` | manifest engine, on session completion |
| `commission.posted` | dispatch tool handler |
| `commission.state.changed` | commission state transition functions |
| `commission.sealed` | commission seal handler |
| `commission.failed` | commission failure handler |
| `migration.applied` | `applyMigrations()` in `engine-ledger-migrate` |

Framework events use `emitter: 'framework'`. The `signalEvent()` function is already in `nexus-core` from Phase 1 — Phase 2 is purely adding call sites.

---

## Testing Strategy

**Phase 1 can be fully tested with custom events only:**

1. Declare a custom event in `guild.json clockworks.events`
2. Write a clockwork engine that logs receipt of the event
3. Add a standing order: `{ "on": "my.event", "run": "my-engine" }`
4. Run `nsg signal my.event --payload '{"test":true}'`
5. Run `nsg clock list` — see the pending event
6. Run `nsg clock tick` — watch the engine run
7. Verify `event_dispatches` record in Ledger

**Phase 2 testing:** each framework event can be verified individually by running the operation that triggers it and confirming the event appears in `nsg clock list`.
