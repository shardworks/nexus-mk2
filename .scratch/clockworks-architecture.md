# Clockworks Architecture

The Clockworks is the guild's nervous system — the event-driven layer that connects things that happen to things that should happen in response. It turns the guild from an imperative system (things happen when someone calls something) into a reactive one (things happen because other things happened).

This is the infrastructure that enables **The Pulse** (Pillar 5 of the guild architecture). The Pulse is the behavior — the guild acting on itself autonomously. The Clockworks is the mechanism it runs on.

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

Events are persisted to the Ledger immediately when signaled. They do not carry intent — they carry record. An event says "this occurred"; it does not say "therefore do this." That causal link lives in standing orders.

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
| `task.created` | A task is created (by Clockworks, by a sage, or by an anima) |
| `task.assigned` | A task is assigned to an anima |
| `task.sealed` | A task is completed |
| `tool.installed` | A tool (implement, engine, curriculum, or temperament) is installed |
| `tool.removed` | A tool is removed |
| `migration.applied` | A Ledger migration is applied |
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
        "description": "Signaled when an artificer completes a code review",
        "schema": { "pr": "number", "issues_found": "number" }
      },
      "deploy.approved": {
        "description": "Leadership has approved a deployment"
      }
    }
  }
}
```

Custom events use any name not in a reserved framework namespace (`anima.*`, `commission.*`, `task.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`). Bundles may also declare events they introduce; these are merged into `guild.json` on installation.

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

Invokes a mechanical engine. The engine receives the event as its input and runs deterministically. No AI involved; no judgment exercised. The Clockworks fires it and moves on.

See [Engine Contract](#engine-contract) below for how event delivery works.

#### Anima orders

```json
{ "on": "commission.failed", "summon": "advisor" }
{ "on": "tool.installed",    "brief": "guildmaster" }
```

Manifests an anima and delivers the event as their context. The anima exercises judgment and may take action, dispatch further work, or do nothing.

Two notice types, same underlying machinery:

- **`summon`** — the anima is expected to act. The task framing conveys urgency and intent: *you are summoned to attend to this*.
- **`brief`** — the anima receives information and decides whether to act. The task framing is informational: *you are being briefed on this*.

The distinction is in the framing delivered to the anima, not in the execution path. Role instructions for anima-holding roles should document how to interpret each notice type. Both create a task in the Ledger (see Tasks below).

The named anima must exist in the register. If the anima does not exist, the standing order fails and signals `standing-order.failed`.

---

### Tasks

A **task** is a granular, internal work item. Tasks are distinct from commissions:

| | Commission | Task |
|---|---|---|
| Origin | External — from the patron | Internal — from a sage, an engine, or the Clockworks |
| Scope | Broad, potentially sweeping | Specific, bounded |
| Lifecycle | Full — planning, sage consultation, dispatch, delivery | Lighter — created, assigned, worked, sealed |
| Parent | None (top-level) | May belong to a commission, or be freestanding |

Commissions are strictly patron territory. The Clockworks never creates commissions — it creates tasks.

Tasks may be **assigned** or **unassigned**. Unassigned tasks live on the **board** — the guild's backlog of open work. Assignment is a property on the task, not a type distinction; the same word covers both states.

A task record in the Ledger:

```
id
notice_type:       "summon" | "brief" | null    ← null for non-Clockworks tasks
triggered_by:      event id, if Clockworks-generated
assigned_to:       anima name, if assigned
parent_commission: commission id, if decomposed from a commission
status:            open | in-progress | sealed | failed
created_at
```

---

### The Clockworks Runner

A framework engine that processes the event queue. It reads unprocessed events from the Ledger, resolves which standing orders apply, and executes them in registration order.

#### Phase 1 — deferred processing (current design)

Events are written to the Ledger immediately when signaled. The Clockworks runner executes at the end of each `nsg` CLI invocation, processing any new events before the process exits. No daemon required; no persistent process.

This covers the core use case: "when a commission seals, do X." Events from a CLI invocation are processed within that same invocation.

#### Phase 2 — daemon (future, enables The Pulse)

A long-running `nsg clockworks start` process watches the event queue continuously. Processes events as they arrive. Enables external event injection — webhooks, file watchers, scheduled jobs. This is when the Clockworks fully becomes The Pulse: the guild acting on itself without a human CLI invocation.

Phase 2 requires no architectural changes to events, standing orders, or tasks — only a new runner invocation mode. The infrastructure is identical; the trigger changes.

---

## Error Handling

Standing order failures signal a `standing-order.failed` event:

```typescript
{
  name: "standing-order.failed",
  payload: {
    standingOrder: { on: "commission.failed", summon: "advisor" },
    triggeringEvent: { id: 42, name: "commission.failed", ... },
    error: "Anima 'advisor' not found in register"
  }
}
```

Guilds can respond to this event with their own standing orders — summon an anima, run a notification engine, whatever the guild needs. The error handling policy is itself configurable.

**Loop guard**: `standing-order.failed` events are tagged. The Clockworks runner will not fire standing orders in response to a `standing-order.failed` event that was itself triggered by a `standing-order.failed` event. Errors handling errors do not cascade.

---

## The `signal` Tool

A new base tool. Animas use it to signal custom events.

```typescript
tool({
  description: "Signal a custom guild event",
  params: {
    name: z.string().describe("Event name (must be declared in guild.json)"),
    payload: z.record(z.unknown()).optional().describe("Event payload")
  },
  handler: async ({ name, payload }, { home }) => {
    // validate name against guild.json clockworks.events
    // reject framework-reserved namespaces
    // persist to Ledger event log
  }
})
```

Animas cannot signal framework events (`anima.*`, `commission.*`, `tool.*`, etc.). Only guild-declared custom events. This keeps the event record trustworthy — framework events come from authoritative code paths.

---

## guild.json Shape

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "Signaled when an artificer completes a code review",
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

## Ledger Schema Additions

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
  handler_name TEXT NOT NULL,          -- engine name or anima name
  notice_type  TEXT,                   -- 'summon' | 'brief' | null (anima orders only)
  started_at   DATETIME,
  ended_at     DATETIME,
  status       TEXT,                   -- 'success' | 'error'
  error        TEXT
);

-- Tasks: internal work items
CREATE TABLE tasks (
  id                 INTEGER PRIMARY KEY,
  notice_type        TEXT,             -- 'summon' | 'brief' | null
  triggered_by       INTEGER REFERENCES events(id),
  assigned_to        TEXT,             -- anima name, nullable
  parent_commission  INTEGER,          -- commission id, nullable
  status             TEXT NOT NULL DEFAULT 'open',
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Engine Contract

Today, engines are plain TypeScript modules with bespoke exported functions — no SDK wrapper, no standard invocation contract. Each framework engine has its own specific signature (`manifest(home, animaName)`, `applyMigrations(home, provenance?)`, etc.) and is called directly by the CLI or other framework code that knows the API. The `nexus-engine.json` descriptor is used only at install time; nothing reads it at runtime.

This works for infrastructure engines but is incompatible with Clockworks — a generic runner cannot call an engine if every engine has a different signature.

### Two kinds of engines

The Clockworks introduces a meaningful distinction that wasn't needed before:

**Infrastructure engines** — bespoke APIs, called by specific framework code. The manifest engine, mcp-server, and ledger-migrate fall here. They have no standard invocation contract and are not directly triggerable by standing orders. Nothing about them changes.

**Event-handler engines** — purpose-built to respond to Clockworks events. These export a default using a new `engine()` SDK factory, giving the Clockworks runner a standard contract to call.

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

Engines that export a default `engine()` definition can be named in `run:` standing orders. Engines that don't (infrastructure engines) cannot — attempting to do so is a configuration error caught at validation time.

### `nexus-engine.json` is unchanged

No new fields needed. The descriptor's `entry` field already points to the module. Whether that module exports an `engine()` default is discovered at load time, not in the descriptor. The distinction between infrastructure and event-handler engines is in the module shape, not the configuration.

---

## Relationship to Existing Concepts

**Engines** — gain a new activation path (event-driven, via standing orders) alongside existing explicit invocation. Split into two kinds: infrastructure engines (unchanged, bespoke APIs) and event-handler engines (use the new `engine()` factory). No changes to `nexus-engine.json`.

**Tools** — `signal` is a new base tool. All other tools unchanged.

**The Ledger** — three new tables: `events`, `event_dispatches`, `tasks`.

**The Manifest Engine** — invoked by anima standing orders (summon/brief). Receives task context rather than a patron-posted commission brief. Minor extension to handle event-triggered manifestation.

**Bundles** — may ship default standing orders and custom event declarations, merged into `guild.json` on installation. Same delivery mechanism as other bundle-provided config.

---

## Deferred

- **Natural language trigger syntax** — `'when a commission is posted'` instead of `'commission.posted'`. Worth pursuing once real guilds have standing orders in production and vocabulary needs are understood. Requires validation tooling to be safe.
- **Pre-event hooks** — cancellable `before.*` events. Powerful but complex. Start with observation-only (post-facto) events.
- **Payload schema enforcement** — schema field in custom event declarations is documented but not validated. Enforcement deferred.
- **Phase 2 daemon** — continuous event processing. Deferred until Phase 1 is proven.
- **Scheduled standing orders** — time-triggered rather than event-triggered. Part of The Pulse proper; deferred.
