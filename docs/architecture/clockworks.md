# The Clockworks

The Clockworks is the guild's nervous system — the event-driven layer that connects things that happen to things that should happen in response. It turns the guild from an imperative system (things happen when someone calls something) into a reactive one (things happen because other things happened).

The Clockworks is Pillar 5 of the guild architecture. The first four pillars make the guild *capable*. The Clockworks makes it *alive* — able to act on itself without waiting for the patron to push.

---

## Core Concepts

### Events

An event is an immutable fact: *this happened*.

```typescript
{
  name: string;       // e.g. "commission.sealed", "tool.installed"
  payload: unknown;   // event-specific data
  emitter: string;    // who signaled it: anima name, engine name, or "framework"
  firedAt: DateTime;
}
```

Events are persisted to the Clockworks' own event queue immediately when signaled. They do not carry intent — they carry record. An event says "this occurred"; it does not say "therefore do this." That causal link lives in standing orders. The event and dispatch tables are internal Clockworks operational state — not part of the guild's Books (Register, Ledger, Daybook).

#### Framework events

Signaled automatically by `nexus-core` operations. Always available; no guild configuration needed.

| Event | Signaled when |
|---|---|
| `anima.instantiated` | A new anima is created |
| `anima.state.changed` | An anima transitions state (aspirant → active, active → retired) |
| `anima.manifested` | An anima is launched for a session |
| `anima.session.ended` | A session completes |
| `commission.posted` | A new commission is posted by the patron |
| `commission.state.changed` | A commission transitions state |
| `commission.sealed` | A commission completes successfully |
| `commission.failed` | A commission fails |
| `work.created` | A work is created in the decomposition hierarchy |
| `piece.ready` | A piece is ready for planning |
| `job.ready` | A job is ready for dispatch |
| `job.completed` | A job completes successfully |
| `job.failed` | A job fails |
| `stroke.recorded` | A stroke is planned or completed by an anima |
| `tool.installed` | A tool (implement, engine, curriculum, or temperament) is installed |
| `tool.removed` | A tool is removed |
| `migration.applied` | A database migration is applied |
| `guild.initialized` | The guild is first initialized |
| `standing-order.failed` | A standing order failed during execution (see Error Handling) |

Framework events are signaled from authoritative code paths in `nexus-core`. Animas cannot signal them.

#### Custom guild events

Guilds declare their own events in `guild.json` under the `clockworks` key:

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "Signaled when an anima completes a code review",
        "schema": { "pr": "number", "issues_found": "number" }
      },
      "deploy.approved": {
        "description": "Leadership has approved a deployment"
      }
    }
  }
}
```

Custom events use any name not in a reserved framework namespace (`anima.*`, `commission.*`, `work.*`, `piece.*`, `job.*`, `stroke.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`). Bundles may also declare events they introduce; these are merged into `guild.json` on installation.

Animas signal custom events using the `signal` tool. The tool validates the event name against declared events in `guild.json` before persisting.

---

### Standing Orders

A standing order is a registered response to an event. Standing orders are **guild policy** — they live in `guild.json` under the `clockworks` key, not in engine descriptors. The guild decides what fires when; an engine is a capability, not a policy.

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.sealed",  "run": "cleanup-worktree" },
      { "on": "commission.failed",  "summon": "advisor" },
      { "on": "tool.installed",     "brief": "guildmaster" },
      { "on": "code.reviewed",      "run": "notify-patron" }
    ]
  }
}
```

Two types:

#### Engine orders

```json
{ "on": "commission.sealed", "run": "cleanup-worktree" }
```

Invokes a clockwork engine. The engine receives the event as its input and runs deterministically. No AI involved; no judgment exercised. The Clockworks fires it and moves on.

See [Engine Contract](#engine-contract) below for how event delivery works.

#### Anima orders

```json
{ "on": "commission.failed", "summon": "advisor" }
{ "on": "tool.installed",    "brief": "guildmaster" }
```

Manifests an anima and delivers the event as their context. The anima exercises judgment and may take action, dispatch further work, or do nothing.

The target is a **role**, not a named anima. The Clockworks runner resolves which active anima currently fills that role at the time the event fires. This makes standing orders durable — they don't break when a specific anima retires and is replaced; they target the institutional position, not the individual.

Two notice types, same underlying machinery:

- **`summon`** — the anima is expected to act. The framing conveys urgency and intent: *you are summoned to attend to this*.
- **`brief`** — the anima receives information and decides whether to act. The framing is informational: *you are being briefed on this*.

The distinction is in the framing delivered to the anima, not in the execution path. Role instructions should document how to interpret each notice type. The dispatch is recorded in the Clockworks' `event_dispatches` table.

**Role resolution:** If no active anima fills the named role, the standing order fails and signals `standing-order.failed`. If multiple animas fill the role (roles can have multiple seats), each is notified — one dispatch per anima.

---

### The Clockworks Runner

A framework engine that processes the event queue. It reads unprocessed events from the Clockworks event queue, resolves which standing orders apply, and executes them in registration order.

#### Phase 1 — manual operation via `nsg clock`

Events are written to the Clockworks event queue immediately when signaled. Processing is explicitly operator-driven — not automatic. This allows the system to be monitored and stepped through until it has earned enough trust to run unattended.

| Command | Behavior |
|---|---|
| `nsg clock list` | Show all pending (unprocessed) events |
| `nsg clock tick [id]` | Process the next pending event, or the specific event with the given id |
| `nsg clock run` | Continuously process all pending events until the queue is empty |

No daemon required. The operator decides when and how much the Clockworks runs.

#### Phase 2 — daemon

A long-running `nsg clock start` process watches the event queue continuously. Processes events as they arrive. Enables external event injection — webhooks, file watchers, scheduled jobs. The guild acts on itself without a human CLI invocation.

Phase 2 requires no architectural changes to events, standing orders, or the Clockworks schema — only a new runner invocation mode. The infrastructure is identical; the trigger changes.

---

## Error Handling

Standing order failures signal a `standing-order.failed` event:

```typescript
{
  name: "standing-order.failed",
  payload: {
    standingOrder: { on: "commission.failed", summon: "advisor" },
    triggeringEvent: { id: 42, name: "commission.failed", ... },
    error: "No active anima fills role 'advisor'"
  }
}
```

Guilds can respond to this event with their own standing orders — summon an anima, run a notification engine, whatever the guild needs. The error handling policy is itself configurable.

**Loop guard**: `standing-order.failed` events are tagged. The Clockworks runner will not fire standing orders in response to a `standing-order.failed` event that was itself triggered by a `standing-order.failed` event. Errors handling errors do not cascade.

---

## The `signal` Tool

A base tool available to all animas. Used to signal custom guild events.

```typescript
tool({
  description: "Signal a custom guild event",
  params: {
    name: z.string().describe("Event name (must be declared in guild.json clockworks.events)"),
    payload: z.record(z.unknown()).optional().describe("Event payload")
  },
  handler: async ({ name, payload }, { home }) => {
    // validate name against guild.json clockworks.events
    // reject framework-reserved namespaces
    // persist to Clockworks events table
  }
})
```

Also exposed as `nsg signal <name> [--payload <json>]` for operator use.

Animas cannot signal framework events (`anima.*`, `commission.*`, `work.*`, `piece.*`, `job.*`, `stroke.*`, `tool.*`, etc.). Only guild-declared custom events. This keeps the event record trustworthy — framework events come from authoritative code paths.

---

## guild.json Shape

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "Signaled when an anima completes a code review",
        "schema": { "pr": "number", "issues_found": "number" }
      }
    },
    "standingOrders": [
      { "on": "commission.sealed",     "run": "cleanup-worktree" },
      { "on": "commission.failed",     "run": "notify-patron" },
      { "on": "commission.failed",     "summon": "advisor" },
      { "on": "tool.installed",        "brief": "guildmaster" },
      { "on": "code.reviewed",         "run": "post-review-summary" },
      { "on": "standing-order.failed", "summon": "advisor" }
    ]
  }
}
```

---

## Clockworks Schema

```sql
-- Event log: immutable fact record
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  payload    TEXT,                    -- JSON
  emitter    TEXT NOT NULL,           -- anima name, engine name, or 'framework'
  fired_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed  INTEGER NOT NULL DEFAULT 0   -- 0=pending, 1=processed
);

-- Execution log: what ran in response to each event
CREATE TABLE event_dispatches (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  handler_type TEXT NOT NULL,          -- 'engine' or 'anima'
  handler_name TEXT NOT NULL,          -- engine name or resolved anima name
  target_role  TEXT,                   -- role name (anima orders only; handler_name is the resolved anima)
  notice_type  TEXT,                   -- 'summon' | 'brief' | null (anima orders only)
  started_at   DATETIME,
  ended_at     DATETIME,
  status       TEXT,                   -- 'success' | 'error'
  error        TEXT
);
```

---

## Engine Contract

Today, engines are plain TypeScript modules with bespoke exported functions — no SDK wrapper, no standard invocation contract. Each static engine has its own specific signature (`manifest(home, animaName)`, `applyMigrations(home, provenance?)`, etc.) and is called directly by the CLI or other framework code that knows the API. The `nexus-engine.json` descriptor is used only at install time; nothing reads it at runtime.

This works for static engines but is incompatible with the Clockworks — a generic runner cannot call an engine if every engine has a different signature.

### Two kinds of engines

The Clockworks introduces a meaningful distinction that wasn't needed before:

**Static engines** — bespoke APIs, called by specific framework code. The manifest engine, mcp-server, and ledger-migrate fall here. They have no standard invocation contract and are not directly triggerable by standing orders. Nothing about them changes.

**Clockwork engines** — purpose-built to respond to Clockworks events. These export a default using a new `engine()` SDK factory, giving the Clockworks runner a standard contract to call.

### The `engine()` factory

A new SDK export from `nexus-core`, parallel to `tool()`:

```typescript
import { engine } from '@shardworks/nexus-core';

export default engine({
  handler: async (event: GuildEvent | null, { home }) => {
    // event is the triggering GuildEvent when invoked by a standing order
    // event is null when invoked directly (CLI, import)
  }
});
```

The Clockworks runner calls `module.default.handler(event, { home })`. This is the only contract the runner needs to know.

Clockwork engines can be named in `run:` standing orders. Static engines cannot — attempting to do so is a configuration error caught at validation time.

### `nexus-engine.json` is unchanged

No new fields needed. The descriptor's `entry` field already points to the module. Whether that module exports an `engine()` default is discovered at load time, not in the descriptor. The distinction between static and clockwork engines is in the module shape, not the configuration.

---

## Relationship to Existing Concepts

**Engines** — gain a new activation path (event-driven, via standing orders) alongside existing explicit invocation. Split into two kinds: static engines (unchanged, bespoke APIs) and clockwork engines (use the new `engine()` factory). No changes to `nexus-engine.json`.

**Tools** — `signal` is a new base tool. All other tools unchanged.

**The Books** — the Clockworks owns its event/dispatch tables as internal operational state, separate from the guild's Books (Register, Ledger, Daybook). Work decomposition tables (works, pieces, jobs, strokes) live in the Ledger — see the architecture overview.

**The Manifest Engine** — invoked by anima standing orders (summon/brief). Receives event context rather than a patron-posted commission brief. Minor extension to handle event-triggered manifestation.

**Bundles** — may ship default standing orders and custom event declarations, merged into `guild.json` on installation. Same delivery mechanism as other bundle-provided config.

---

## Deferred

- **Natural language trigger syntax** — `'when a commission is posted'` instead of `'commission.posted'`. Worth pursuing once real guilds have standing orders in production and vocabulary needs are understood. Requires validation tooling to be safe.
- **Pre-event hooks** — cancellable `before.*` events. Powerful but complex. Start with observation-only (post-facto) events.
- **Payload schema enforcement** — schema field in custom event declarations is documented but not validated. Enforcement deferred.
- **Phase 2 daemon** — continuous event processing. Deferred until Phase 1 is proven.
- **Scheduled standing orders** — time-triggered rather than event-triggered. Deferred.
