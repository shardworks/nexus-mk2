## Commission Spec

---
author: plan-writer
author_version: 2026-04-04
estimated_complexity: 2
---

# Update core-api.md to Reflect Stacks-based Clockworks

## Summary

Update `docs/reference/core-api.md` to remove pre-Stacks persistence patterns from the Events and Clockworks sections, relocate internal Clockworks runner operations out of the public API, and replace stale pre-writ types in the Ledger section. This is a documentation-only change to a single file.

## Current State

The Events section of core-api.md documents seven functions and three types. Three of these — `listDispatches`, `recordDispatch`, and their backing types — describe internal Clockworks dispatch tracking that references the `event_dispatches` SQL table directly. Two more — `readPendingEvents` and `markEventProcessed` — are Clockworks runner internals that expose implementation details (`processed = 1`). The `signalEvent` description references "the Clockworks events table" and `listEvents` mentions "SQL `LIKE`" by name.

The Clockworks section describes the runner API without noting that persistence is Stacks-based.

The Ledger Shared Types table lists 16 types from the old Work/Piece/Job/Stroke hierarchy, which was replaced by writs. The writ functions are already documented in the Ledger section but their types are missing from the table.

## Requirements

- R1: Remove `listDispatches`, `recordDispatch`, `DispatchRecord`, and `ListDispatchesOptions` from the Events section. These are internal Clockworks apparatus state.
- R2: Remove `readPendingEvents` and `markEventProcessed` from the Events section. These are Clockworks runner internals.
- R3: Remove raw SQL references: "events table" → "event queue"; remove "SQL `LIKE`" framing; remove "dispatch recording" from section header.
- R4: Add a dispatch tracking callout in the Events section noting that dispatch records are managed by the Clockworks apparatus via Stacks books.
- R5: Add Stacks context to the Clockworks section header, noting the apparatus owns event/dispatch state via Stacks and internal operations are not public API.
- R6: Replace the 16 stale Work/Piece/Job/Stroke types in the Ledger Shared Types table with the 4 current writ types: `WritRecord`, `CreateWritOptions`, `ListWritsOptions`, `WritProgress`.

## Scope Decisions

### S1: Dispatch functions removed, not relocated
**Decision:** Remove `listDispatches` and `recordDispatch` entirely. Do not move them to the Clockworks section.
**Rationale:** The Clockworks runner returns dispatch results through `TickResult.dispatches: DispatchSummary[]`. There is no need for a separate `listDispatches` query — callers get dispatch info from `clockTick`/`clockRun` results. `recordDispatch` is a pure internal write used by the runner; exposing it would break the Stacks write-path guarantee.

### S2: readPendingEvents and markEventProcessed removed, not kept as convenience
**Decision:** Remove both functions from the public API surface.
**Rationale:** `readPendingEvents` is the Clockworks runner's queue-drain query. Callers wanting to inspect pending events can use `listEvents(home, { pending: true })`. `markEventProcessed` mutates internal state that should only be touched by the runner. Neither function exists in the current codebase; removing them from the doc costs nothing.

### S3: listEvents LIKE pattern kept, SQL framing removed
**Decision:** Keep the `%` wildcard pattern syntax in `listEvents`. Remove the explicit "SQL `LIKE`" callout.
**Rationale:** The Stacks query language supports `LIKE` as a filter operator (see `WhereCondition` in `stacks.md`). The wildcard behavior is useful and survives the Stacks migration. What changes is framing — the doc should describe the behavior ("exact match or `LIKE` pattern with `%` wildcards") without naming the SQL implementation.

### S4: Pre-writ types replaced, not left in place
**Decision:** Replace all 16 Work/Piece/Job/Stroke types with 4 writ types.
**Rationale:** The four-level hierarchy was removed from the schema. The Ledger section already documents the writ API (`createWrit`, `listWrits`, `showWrit`, `completeWrit`, `failWrit`, `getWritProgress`). The types table should match. The replacement types are derived from the function signatures already documented in the section.

### S5: Broader doc-vs-reality gap is out of scope
**Decision:** Do not update the doc to match actual `nexus-core` exports.
**Rationale:** Most functions documented in core-api.md (Register, Ledger, Daybook, Conversations, Clockworks) are aspirational — they describe the intended API surface but none are currently exported from `@shardworks/nexus-core`. Reconciling the full doc with current exports is a separate, larger effort. This spec addresses only the pre-Stacks persistence patterns called out in the brief.

### S6: Clockworks architecture doc (clockworks.md) is out of scope
**Decision:** Do not update `docs/architecture/clockworks.md` even though it also contains raw SQL schemas for `events` and `event_dispatches`.
**Rationale:** The architecture doc is a design document, not an API reference. Its SQL schema section describes the logical model. Updating architecture docs to remove all SQL references is a separate effort that requires broader design alignment (e.g., do Clockworks events become Stacks books or remain raw SQL?).

### S7: schema.md is out of scope
**Decision:** Do not update `docs/reference/schema.md` even though it documents `events` and `event_dispatches` as SQL tables.
**Rationale:** The schema reference documents the current physical schema. Until the Clockworks apparatus is implemented with Stacks books and the SQL tables are actually removed, the schema reference should reflect reality.

## Design

All changes are to a single file: `docs/reference/core-api.md`.

### Events Section (R1, R2, R3, R4)

**Remove these function blocks:**
- `readPendingEvents(home): GuildEvent[]` (lines 65–67)
- `markEventProcessed(home, eventId): void` (lines 73–75)
- `listDispatches(home, opts?): DispatchRecord[]` (lines 87–96)
- `recordDispatch(home, opts): void` (lines 98–114)

**Update section header (line 46):**
```
Before: The event system — signaling, reading, validation, dispatch recording.
After:  The event system — signaling, reading, and validation.
```

**Update `signalEvent` description (line 50):**
```
Before: Signal an event — persist it to the Clockworks events table.
After:  Signal an event — persist it to the Clockworks event queue.
```

**Update `listEvents` name filter (line 82):**
```
Before: filter by name pattern (SQL `LIKE` — use `%` for wildcards)
After:  filter by event name (exact match or `LIKE` pattern with `%` wildcards)
```

**Update Types table (lines 116–122):**

Remove `DispatchRecord` and `ListDispatchesOptions` rows. Keep only `ListEventsOptions`.

**Add dispatch tracking callout** after the types table:
> **Dispatch tracking.** Dispatch records (what ran in response to each event) are internal Clockworks operational state, managed by the Clockworks apparatus via Stacks books. They are not part of the `nexus-core` API surface. See the Clockworks section for the runner API that exposes dispatch results.

### Clockworks Section (R5)

**Update section description (line 440):**
```
Before:
The event processing runner — matches pending events to standing orders and dispatches them.

After:
The event processing runner — matches pending events to standing orders and dispatches them. The Clockworks apparatus owns its event and dispatch state via Stacks books (not raw SQL tables). Internal operations — reading pending events, marking events processed, recording dispatches — are handled by the apparatus and are not part of the public API. The runner functions below expose dispatch results without leaking persistence details.
```

### Ledger Shared Types (R6)

**Replace lines 285–300** (the 16 stale types) with:

| Type | Description |
|------|-------------|
| `WritRecord` | id, type, title, description, status, parentId, sessionId, createdAt, updatedAt |
| `CreateWritOptions` | `{ type, title, description?, parentId? }` |
| `ListWritsOptions` | `{ status?, type?, parentId? }` |
| `WritProgress` | `{ total, completed, failed, cancelled, pending, active, ready }` |

## Validation Checklist

- V1 [R1]: `grep -c "listDispatches\|recordDispatch\|DispatchRecord\|ListDispatchesOptions" docs/reference/core-api.md` returns 0.
- V2 [R2]: `grep -c "readPendingEvents\|markEventProcessed" docs/reference/core-api.md` returns 0.
- V3 [R3]: `grep -c "events table\|SQL.*LIKE\|dispatch recording" docs/reference/core-api.md` returns 0.
- V4 [R4]: `grep "Dispatch tracking" docs/reference/core-api.md` matches the callout.
- V5 [R5]: `grep "Stacks books" docs/reference/core-api.md` matches the Clockworks section.
- V6 [R6]: `grep -c "WorkRecord\|PieceRecord\|JobRecord\|StrokeRecord" docs/reference/core-api.md` returns 0. `grep "WritRecord" docs/reference/core-api.md` matches.
- V7: The remaining Events functions (`signalEvent`, `isFrameworkEvent`, `validateCustomEvent`, `readEvent`, `listEvents`) are unchanged except for the SQL de-framing.
- V8: The Clockworks runner functions (`clockTick`, `clockRun`, `clockStart`, `clockStop`, `clockStatus`) and their types are unchanged.

## Test Cases

No automated tests — this is a documentation-only change. Validation is via grep checks in the checklist above.

## Referenced Files (from spec, pre-commission state)

=== REFERENCED FILE: docs/architecture/clockworks.md (pre-commission state) ===
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
| `{type}.ready` | A writ transitions to `ready` — available for dispatch (e.g. `mandate.ready`, `task.ready`) |
| `{type}.completed` | A writ is fulfilled (e.g. `mandate.completed`, `task.completed`) |
| `{type}.failed` | A writ fails (e.g. `mandate.failed`, `task.failed`) |
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

Custom events use any name not in a reserved framework namespace (`anima.*`, `commission.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`, `session.*`). Writ lifecycle events (e.g. `mandate.ready`, `task.completed`) use guild-defined type names as namespaces — they are framework-emitted but not in the reserved list. See the [Event Catalog](../reference/event-catalog.md#writ-lifecycle-events) for how validation handles this. Bundles may also declare events they introduce; these are merged into `guild.json` on installation.

Animas signal custom events using the `signal` tool. The tool validates the event name against declared events in `guild.json` before persisting.

#### Book change events (Stacks auto-wiring)

The Clockworks apparatus registers CDC handlers across all declared books at startup via The Stacks' `watch()` API (see [stacks.md](apparatus/stacks.md#6-change-data-capture-cdc)). This emits `book.<ownerId>.<bookName>.created`, `book.<ownerId>.<bookName>.updated`, and `book.<ownerId>.<bookName>.deleted` events into the Clockworks event stream automatically — no per-book configuration needed.

```typescript
// In clockworks apparatus start()
const stacks = ctx.apparatus<StacksApi>('stacks')
for (const plugin of ctx.plugins) {
  const bookNames = Object.keys(plugin.books ?? {})
  for (const bookName of bookNames) {
    stacks.watch(plugin.id, bookName, async (event) => {
      await clockworksApi.emit(`book.${event.ownerId}.${event.book}.${event.type}`, event)
    }, { failOnError: false })  // clockworks failure must not block writes
  }
}
```

This means any book mutation from any plugin is observable via standing orders without the originating plugin needing to signal events explicitly. Standing orders can respond to book change events just like framework or custom events:

```json
{ "on": "book.nexus-ledger.writs.updated", "run": "audit-writ-changes" }
```

---

### Standing Orders

A standing order is a registered response to an event. Standing orders are **guild policy** — they live in `guild.json` under the `clockworks` key, not in relay descriptors. The guild decides what fires when; a relay is a capability, not a policy.

#### Canonical form

Every standing order has one canonical form: `{ on, run, ...params }`. The `on` key names the event to respond to. The `run` key names the relay to invoke. Any additional keys are **params** passed to the relay via `RelayContext.params`.

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.sealed",  "run": "cleanup-worktree" },
      { "on": "mandate.ready",      "summon": "artificer", "prompt": "..." },
      { "on": "code.reviewed",      "run": "notify-patron" },
      { "on": "deploy.requested",   "run": "deploy", "environment": "staging", "dryRun": true }
    ]
  }
}
```

#### The `summon` verb (syntactic sugar)

The `summon` key is shorthand for invoking the **summon relay** — the stdlib relay that handles anima session dispatch. The Clockworks desugars `summon` orders at dispatch time:

```json
// What the operator writes:
{ "on": "mandate.ready", "summon": "artificer", "prompt": "...", "maxSessions": 5 }

// What the Clockworks dispatches:
{ "on": "mandate.ready", "run": "summon-relay", "role": "artificer", "prompt": "...", "maxSessions": 5 }
```

The `summon` value becomes the `role` param. All other keys pass through as relay params. This means anima dispatch is handled by a regular relay — replaceable, upgradeable, configurable — not baked into the framework.

The **summon relay** resolves the role to an active anima, binds or synthesizes a writ, manifests the anima, hydrates the prompt template, launches a session, and handles post-session writ lifecycle. See [Dispatch Integration](writs.md#dispatch-integration) for the full sequence.

**Summon relay params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `role` | string | *(required)* | Role to summon (set automatically from `summon` value) |
| `prompt` | string | — | Prompt template with `{{writ.title}}`, `{{writ.description}}`, etc. |
| `maxSessions` | number | 10 | Circuit breaker: max session attempts per writ before auto-fail |

**Circuit breaker:** By default, the summon relay will fail a writ after 10 session attempts. This prevents infinite re-dispatch loops when a writ keeps getting interrupted without making progress. Override per standing order with `"maxSessions": 20` or disable with `"maxSessions": 0`.

**Role resolution:** If no active anima fills the named role, the relay throws and the Clockworks signals `standing-order.failed`.

#### Relay params

Any key on a standing order that isn't `on` or `run` (or `summon`/`brief` for sugar forms) is extracted as a param and passed to the relay:

```typescript
export default relay({
  name: 'deploy',
  handler: async (event, { home, params }) => {
    const environment = (params.environment as string) ?? 'production';
    const dryRun = (params.dryRun as boolean) ?? false;
    // ...
  }
});
```

Params default to `{}` when no extra keys are present. Existing relays that destructure only `{ home }` from context are unaffected.

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

A background daemon that polls the event queue and processes events automatically.

| Command | Behavior |
|---|---|
| `nsg clock start [--interval <ms>]` | Start the daemon as a detached background process (default interval: 2000ms) |
| `nsg clock stop` | Send SIGTERM and clean up the PID file |
| `nsg clock status` | Show whether the daemon is running, with PID, uptime, and log file path |

The daemon spawns as a detached child process. It writes a PID file at `<home>/.nexus/clock.pid` and logs to `<home>/.nexus/clock.log` (append mode). Only event-processing cycles are logged; idle polls are silent.

The daemon registers the session provider at startup, enabling the summon relay to dispatch anima sessions autonomously.

Phase 1 commands (`list`, `tick`, `run`) continue to work alongside the daemon. If the daemon is running, `tick` and `run` print a warning but still execute — SQLite handles concurrent access safely.

Core API: `clockStart(home, options?)`, `clockStop(home)`, `clockStatus(home)`. The `clock-status` MCP tool exposes daemon status to animas.

---

## Error Handling

Standing order failures signal a `standing-order.failed` event:

```typescript
{
  name: "standing-order.failed",
  payload: {
    standingOrder: { on: "commission.failed", summon: "steward" },
    triggeringEvent: { id: 42, name: "commission.failed", ... },
    error: "No active anima fills role 'steward'"
  }
}
```

Guilds can respond to this event with their own standing orders — summon an anima, invoke a notification relay, whatever the guild needs. The error handling policy is itself configurable.

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

Animas cannot signal framework events (`anima.*`, `commission.*`, `tool.*`, `session.*`, etc.) or writ lifecycle events (`mandate.ready`, `task.completed`, etc.). Only guild-declared custom events. This keeps the event record trustworthy — framework events come from authoritative code paths.

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
      { "on": "commission.failed",     "summon": "steward" },
      { "on": "code.reviewed",         "run": "post-review-summary" },
      { "on": "standing-order.failed", "summon": "steward" }
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
  handler_type TEXT NOT NULL,          -- 'relay' or 'anima' (relays are stored as 'engine' in older schemas)
  handler_name TEXT NOT NULL,          -- relay name or resolved anima name
  target_role  TEXT,                   -- role name (anima orders only; handler_name is the resolved anima)
  notice_type  TEXT,                   -- 'summon' | null (historical; present on summon relay dispatches)
  started_at   DATETIME,
  ended_at     DATETIME,
  status       TEXT,                   -- 'success' | 'error'
  error        TEXT
);
```

---

## ClockworksKit

The Clockworks apparatus consumes relay contributions from installed plugins. It publishes a `ClockworksKit` interface that kit authors import for type safety:

```typescript
// Published by nexus-clockworks
interface ClockworksKit {
  relays?: RelayDefinition[]
}
```

A plugin contributing relays declares itself as satisfying `ClockworksKit` and names `nexus-clockworks` in its `recommends`:

```typescript
import type { ClockworksKit } from "nexus-clockworks"

export default {
  name: "nexus-signals",
  kit: {
    relays:     [memberJoinedRelay, memberLeftRelay],
    recommends: ["nexus-clockworks"],
  } satisfies ClockworksKit,
} satisfies Plugin
```

The Clockworks apparatus registers relays from both standalone kit packages and its own `supportKit` into a unified relay registry. Callers of the Clockworks API see a single relay list regardless of source.

### Relay Contract

The Clockworks needs a standard invocation contract to call relays generically. Relays export a default using the `relay()` SDK factory from `nexus-core`:

```typescript
import { relay } from '@shardworks/nexus-core';

export default relay({
  handler: async (event: GuildEvent | null, { home, params }) => {
    // event  — the triggering GuildEvent when invoked by a standing order (null for direct invocation)
    // home   — absolute path to the guild root
    // params — extra keys from the standing order (empty object when none)
  }
});
```

The Clockworks runner calls `module.default.handler(event, { home, params })`. Params are extracted from the standing order at dispatch time — any key that isn't `on` or `run` becomes a param. Relays can be named in `run:` standing orders; bespoke framework processes cannot.

---

## Relationship to Existing Concepts

**Relays** — a new artifact type, distinct from tools and existing framework machinery. Relays are purpose-built Clockworks handlers that export a standard `relay()` contract and can be named in `run:` standing orders. Framework processes (manifest, mcp-server, ledger-migrate) are unchanged.

**Tools** — `signal` is a new base tool. All other tools unchanged.

**The Books** — the Clockworks owns its event/dispatch tables as internal operational state, separate from the guild's Books (Register, Ledger, Daybook). Writs live in the Ledger — see the architecture overview.

**Bundles** — may ship default standing orders and custom event declarations, merged into `guild.json` on installation. Same delivery mechanism as other bundle-provided config.

---

## Deferred

- **Natural language trigger syntax** — `'when a commission is posted'` instead of `'commission.posted'`. Worth pursuing once real guilds have standing orders in production and vocabulary needs are understood. Requires validation tooling to be safe.
- **Pre-event hooks** — cancellable `before.*` events. Powerful but complex. Start with observation-only (post-facto) events.
- **Payload schema enforcement** — schema field in custom event declarations is documented but not validated. Enforcement deferred.
- **Phase 2 daemon enhancements** — external event injection (webhooks, file watchers), log rotation, concurrency.
- **Scheduled standing orders** — time-triggered rather than event-triggered. Deferred.

=== REFERENCED FILE: docs/reference/schema.md (pre-commission state) ===
# Schema Reference

The guild's Books database (``.nexus/nexus.db``) — SQLite, WAL mode, foreign keys enforced. All entity IDs are TEXT using prefixed hex format.

---

## Entity Relationship Diagram

```
                            ┌─────────────────────┐
                            │    commissions       │
                            │─────────────────────│
                            │ id (c-)              │
                            │ content              │
                            │ status               │
                            │ workshop             │
                            └──────┬──────┬────────┘
                                   │      │
                    ┌──────────────┘      └──────────────┐
                    │                                    │
        ┌───────────┴──────────┐          ┌──────────────┴──────────┐
        │ commission_assignments│          │  commission_sessions    │
        │──────────────────────│          │─────────────────────────│
        │ commission_id ←──────│          │ commission_id ←─────────│
        │ anima_id ────────────│──┐       │ session_id ─────────────│──┐
        └──────────────────────┘  │       └─────────────────────────┘  │
                                  │                                    │
        ┌─────────────────────────┘                                    │
        │                                                              │
   ┌────┴──────────────┐                                ┌──────────────┴──────┐
   │     animas        │                                │      sessions       │
   │───────────────────│                                │─────────────────────│
   │ id (a-)           │                                │ id (ses-)           │
   │ name (unique)     │                                │ anima_id ───────────│──→ animas
   │ status            │                                │ provider, model     │
   └────┬──────────────┘                                │ trigger, workshop   │
        │                                               │ token usage, cost   │
        │                                               └─────────────────────┘
   ┌────┴──────────────────┐
   │  anima_compositions   │     ┌───────────────┐
   │───────────────────────│     │    roster      │
   │ anima_id (unique) ────│     │───────────────│
   │ curriculum snapshot   │     │ anima_id ──────│──→ animas
   │ temperament snapshot  │     │ role           │
   └───────────────────────┘     └───────────────┘


   ┌─────────────────────┐
   │       writs         │
   │─────────────────────│
   │ id (wrt-)           │
   │ type, title         │
   │ status              │
   │ parent_id ──────────│──→ writs (self-ref, optional)
   │ session_id          │
   └─────────────────────┘
        ↑                    ↑
        │                    │
   commissions.writ_id   sessions.writ_id


   ┌─────────────────────┐          ┌──────────────────────┐
   │      events         │          │   event_dispatches   │
   │─────────────────────│          │──────────────────────│
   │ id (evt-)           │          │ id (ed-)             │
   │ name, payload       │←─────────│ event_id             │
   │ emitter, fired_at   │          │ handler_type/name    │
   │ processed           │          │ target_role          │
   └─────────────────────┘          │ status, error        │
                                    └──────────────────────┘

   ┌─────────────────────┐
   │    audit_log        │
   │─────────────────────│
   │ id (aud-)           │
   │ actor, action       │
   │ target_type/id      │
   │ detail, timestamp   │
   └─────────────────────┘
```

---

## Table-by-Table Reference

### `animas`

The Register — anima identity records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (a-) |
| `name` | TEXT | NOT NULL, UNIQUE | Human-readable name |
| `status` | TEXT | NOT NULL, CHECK | One of: `aspirant`, `active`, `retired` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |

### `anima_compositions`

Frozen snapshots of an anima's training content at instantiation time.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, UNIQUE, FK → animas | One composition per anima |
| `curriculum_name` | TEXT | NOT NULL | Curriculum name at instantiation |
| `curriculum_version` | TEXT | NOT NULL | Curriculum version at instantiation |
| `temperament_name` | TEXT | NOT NULL | Temperament name at instantiation |
| `temperament_version` | TEXT | NOT NULL | Temperament version at instantiation |
| `curriculum_snapshot` | TEXT | NOT NULL | Full curriculum content (frozen) |
| `temperament_snapshot` | TEXT | NOT NULL | Full temperament content (frozen) |
| `composed_at` | TEXT | NOT NULL, DEFAULT now | When the composition was created |

### `roster`

Role assignments — which animas hold which roles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, FK → animas | The anima |
| `role` | TEXT | NOT NULL | Role name (must match guild.json roles) |
| `standing` | INTEGER | NOT NULL, DEFAULT 0 | Reserved for future use |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | When the role was assigned |

### `commissions`

Patron-posted work orders.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (c-) |
| `content` | TEXT | NOT NULL | The commission specification |
| `status` | TEXT | NOT NULL, CHECK | One of: `posted`, `assigned`, `in_progress`, `completed`, `failed` |
| `workshop` | TEXT | NOT NULL | Target workshop name |
| `status_reason` | TEXT | | Human-readable reason for current status |
| `writ_id` | TEXT | FK → writs | The commission's mandate writ (set on posting) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `commission_assignments`

Join table — which animas are assigned to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | |
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | |

UNIQUE constraint on `(commission_id, anima_id)`.

### `writs`

Tracked work items — the Ledger's core table. Writs are typed, tree-structured obligations that replace the earlier four-level hierarchy (works, pieces, jobs, strokes).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (wrt-) |
| `type` | TEXT | NOT NULL | Writ type — guild-defined (e.g. `task`, `feature`) or built-in (`mandate`, `summon`) |
| `title` | TEXT | NOT NULL | Human-readable summary |
| `description` | TEXT | | Full description, acceptance criteria, etc. |
| `status` | TEXT | NOT NULL, DEFAULT 'ready', CHECK | One of: `ready`, `active`, `pending`, `completed`, `failed`, `cancelled` |
| `parent_id` | TEXT | FK → writs | Parent writ (null for root writs) |
| `session_id` | TEXT | | Currently bound session (cleared on completion/interruption) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

Indexes: `idx_writs_parent`, `idx_writs_status`, `idx_writs_type_status`.

**Cross-references:** `commissions.writ_id` points to the commission's mandate writ. `sessions.writ_id` points to the writ the session is working on.

### `audit_log`

The Daybook audit trail — records of all significant actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (aud-) |
| `actor` | TEXT | NOT NULL | Who did it: `patron`, `operator`, `framework`, `instantiate`, anima name |
| `action` | TEXT | NOT NULL | What happened: `commission_posted`, `anima_updated`, `writ_created`, etc. |
| `target_type` | TEXT | | Entity type: `commission`, `anima`, `writ`, `session`, `conversation` |
| `target_id` | TEXT | | Entity ID |
| `detail` | TEXT | | JSON-encoded additional context |
| `timestamp` | TEXT | NOT NULL, DEFAULT now | |

### `events`

The Clockworks event queue.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (evt-) |
| `name` | TEXT | NOT NULL | Event name (e.g. `commission.posted`, `code.reviewed`) |
| `payload` | TEXT | | JSON-encoded event data |
| `emitter` | TEXT | NOT NULL | Who signaled it |
| `fired_at` | TEXT | NOT NULL, DEFAULT now | |
| `processed` | INTEGER | NOT NULL, DEFAULT 0 | 0 = pending, 1 = processed |

### `event_dispatches`

Dispatch records — what happened when a standing order executed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ed-) |
| `event_id` | TEXT | NOT NULL, FK → events | The triggering event |
| `handler_type` | TEXT | NOT NULL | `engine` or `anima` |
| `handler_name` | TEXT | NOT NULL | Engine name or anima name |
| `target_role` | TEXT | | Role name (for anima dispatches) |
| `notice_type` | TEXT | | `summon` or `brief` (for anima dispatches) |
| `started_at` | TEXT | | |
| `ended_at` | TEXT | | |
| `status` | TEXT | | `success` or `error` |
| `error` | TEXT | | Error message if status is error |

### `sessions`

Session records — every session launched through the funnel.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ses-) |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `provider` | TEXT | NOT NULL | Session provider name (e.g. `claude-code`) |
| `model` | TEXT | | Model identifier |
| `trigger` | TEXT | NOT NULL | `consult`, `summon`, `brief`, or `convene` |
| `workshop` | TEXT | | Workshop name (null for guildhall sessions) |
| `workspace_kind` | TEXT | NOT NULL | `guildhall`, `workshop-temp`, or `workshop-managed` |
| `curriculum_name` | TEXT | | |
| `curriculum_version` | TEXT | | |
| `temperament_name` | TEXT | | |
| `temperament_version` | TEXT | | |
| `roles` | TEXT | | JSON array of role names |
| `started_at` | TEXT | NOT NULL | |
| `ended_at` | TEXT | | Null while session is active |
| `exit_code` | INTEGER | | |
| `input_tokens` | INTEGER | | |
| `output_tokens` | INTEGER | | |
| `cache_read_tokens` | INTEGER | | |
| `cache_write_tokens` | INTEGER | | |
| `cost_usd` | REAL | | |
| `duration_ms` | INTEGER | | |
| `provider_session_id` | TEXT | | Provider's own session identifier |
| `record_path` | TEXT | | Path to the SessionRecord JSON file (relative to guild root) |
| `conversation_id` | TEXT | FK → conversations | Conversation this turn belongs to (null for standalone sessions) |
| `turn_number` | INTEGER | | Position within the conversation (1-indexed) |
| `writ_id` | TEXT | FK → writs | Bound writ (set by clockworks for writ-driven sessions; null for conversations) |

### `conversations`

Multi-turn interactions grouping multiple sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (conv-) |
| `status` | TEXT | NOT NULL, DEFAULT 'active', CHECK | One of: `active`, `concluded`, `abandoned` |
| `kind` | TEXT | NOT NULL, CHECK | `consult` or `convene` |
| `topic` | TEXT | | Seeding prompt or subject |
| `turn_limit` | INTEGER | | Maximum total turns (null = unlimited) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `ended_at` | TEXT | | |
| `event_id` | TEXT | | For convene: the triggering event ID |

### `conversation_participants`

Participants in a conversation — human or anima.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (cpart-) |
| `conversation_id` | TEXT | NOT NULL, FK → conversations | |
| `kind` | TEXT | NOT NULL, CHECK | `anima` or `human` |
| `name` | TEXT | NOT NULL | Anima name or `'patron'` |
| `anima_id` | TEXT | | FK to animas (null for humans) |
| `claude_session_id` | TEXT | | Provider session ID for `--resume` threading |

### `commission_sessions`

Join table — which sessions are linked to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `session_id` | TEXT | NOT NULL, FK → sessions | |

PRIMARY KEY on `(commission_id, session_id)`.

### `_migrations`

Internal tracking table for the migration system. Not part of the regular schema.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sequence` | INTEGER | PRIMARY KEY | Migration sequence number |
| `filename` | TEXT | NOT NULL | Migration filename |
| `applied_at` | TEXT | NOT NULL, DEFAULT now | |
| `bundle` | TEXT | | Bundle that delivered this migration |
| `original_name` | TEXT | | Original filename before renumbering |

---

## Status Lifecycles

### Anima

```
aspirant → active → retired
```

- **aspirant** — created but not yet activated (not currently used by `instantiate()`, which creates directly as `active`)
- **active** — manifested for sessions, holds roles, can be dispatched
- **retired** — removed from service, roster entries deleted

### Commission

```
posted → assigned → in_progress → completed
                                → failed
```

- **posted** — created by patron, waiting for dispatch. A mandate writ is created and linked.
- **assigned** — (manual transition) an anima has been assigned
- **in_progress** — the Clockworks has summoned an anima (automatic on `summon` dispatch)
- **completed** — the mandate writ is fulfilled
- **failed** — manually set when the commission cannot be completed

### Writ

```
ready → active → completed
               → failed → cancelled (cascade)
               → pending → ready (when children complete)
                         → completed (auto, if no standing order)
ready → cancelled
```

- **ready** — available for dispatch. Signals `{type}.ready` (e.g. `mandate.ready`, `task.ready`)
- **active** — an anima is working on it (session bound)
- **pending** — the anima called `complete-session` but child writs are still incomplete. Automatically transitions back to `ready` (or auto-completes) when all children finish.
- **completed** — obligation fulfilled. Signals `{type}.completed`. Triggers completion rollup on parent.
- **failed** — unrecoverable failure. Signals `{type}.failed`. Cascades cancellation to incomplete children.
- **cancelled** — withdrawn, either directly or by cascade from a failed parent.

### Conversation

```
active → concluded
       → abandoned
```

- **active** — conversation is in progress, turns can be taken
- **concluded** — conversation ended normally (turn limit reached or explicitly concluded)
- **abandoned** — conversation ended abnormally (browser disconnect, timeout)

---

## ID Conventions

All entity IDs use the format `{prefix}-{8 hex chars}` where the hex is generated from 4 random bytes (`crypto.randomBytes(4)`).

| Prefix | Entity | Example |
|--------|--------|---------|
| `a-` | Anima | `a-5e6f7a8b` |
| `c-` | Commission | `c-a3f7b2c1` |
| `conv-` | Conversation | `conv-1a2b3c4d` |
| `cpart-` | Conversation participant | `cpart-5e6f7a8b` |
| `evt-` | Event | `evt-1a2b3c4d` |
| `ses-` | Session | `ses-deadbeef` |
| `wrt-` | Writ | `wrt-12345678` |
| `aud-` | Audit log entry | `aud-aabbccdd` |
| `ed-` | Event dispatch | `ed-55667788` |
| `r-` | Roster entry | `r-99aabbcc` |
| `ac-` | Anima composition | `ac-ddeeff00` |
| `ca-` | Commission assignment | `ca-11223344` |

8 hex characters = 4 random bytes ≈ 4.3 billion possibilities per prefix. Sufficient for a single-guild system.

Generation: `generateId(prefix)` from `@shardworks/nexus-core`.



## Commission Diff

```
 docs/reference/core-api.md | 69 +++++++---------------------------------------
 1 file changed, 10 insertions(+), 59 deletions(-)

diff --git a/docs/reference/core-api.md b/docs/reference/core-api.md
index 6487c87..c28e5df 100644
--- a/docs/reference/core-api.md
+++ b/docs/reference/core-api.md
@@ -43,11 +43,11 @@ Resolve a single engine from a module's default export. Same pattern as `resolve
 
 ## Events
 
-The event system — signaling, reading, validation, dispatch recording. Events are immutable facts persisted to the Clockworks event queue. The Clockworks runner processes them separately via `nsg clock`.
+The event system — signaling, reading, and validation. Events are immutable facts persisted to the Clockworks event queue. The Clockworks runner processes them separately via `nsg clock`.
 
 ### `signalEvent(home, name, payload, emitter): string`
 
-Signal an event — persist it to the Clockworks events table. Does **not** process the event.
+Signal an event — persist it to the Clockworks event queue. Does **not** process the event.
 
 - `name` — event name (e.g. `"commission.posted"`, `"code.reviewed"`)
 - `payload` — JSON-serializable event data, or `null`
@@ -62,64 +62,27 @@ Check if an event name is in a reserved framework namespace. Reserved namespaces
 
 Validate that a custom event name is declared in `guild.json` clockworks.events. **Throws** if the name is in a reserved namespace or not declared.
 
-### `readPendingEvents(home): GuildEvent[]`
-
-Read all unprocessed events from the queue, ordered by `fired_at` ascending.
-
 ### `readEvent(home, id): GuildEvent | null`
 
 Read a single event by ID.
 
-### `markEventProcessed(home, eventId): void`
-
-Mark an event as processed (sets `processed = 1`).
-
 ### `listEvents(home, opts?): GuildEvent[]`
 
 List events with optional filters. Returns newest first.
 
 **Options (`ListEventsOptions`):**
-- `name?: string` — filter by name pattern (SQL `LIKE` — use `%` for wildcards)
+- `name?: string` — filter by event name (exact match or `LIKE` pattern with `%` wildcards)
 - `emitter?: string` — filter by emitter
 - `pending?: boolean` — `true` = unprocessed only, `false` = processed only, omit for all
 - `limit?: number` — max results
 
-### `listDispatches(home, opts?): DispatchRecord[]`
-
-List event dispatch records with optional filters.
-
-**Options (`ListDispatchesOptions`):**
-- `eventId?: string`
-- `handlerType?: string` — `"engine"` or `"anima"`
-- `handlerName?: string`
-- `status?: string` — `"success"` or `"error"`
-- `limit?: number`
-
-### `recordDispatch(home, opts): void`
-
-Record a dispatch in the `event_dispatches` table. Used by the Clockworks runner.
-
-```typescript
-recordDispatch(home, {
-  eventId: string,
-  handlerType: 'engine' | 'anima',
-  handlerName: string,
-  targetRole?: string,
-  noticeType?: 'summon' | 'brief',
-  startedAt: string,
-  endedAt: string,
-  status: 'success' | 'error',
-  error?: string,
-})
-```
-
 ### Types
 
 | Type | Description |
 |------|-------------|
 | `ListEventsOptions` | Filters for `listEvents()` |
-| `DispatchRecord` | A single dispatch record (id, eventId, handlerType, handlerName, etc.) |
-| `ListDispatchesOptions` | Filters for `listDispatches()` |
+
+> **Dispatch tracking.** Dispatch records (what ran in response to each event) are internal Clockworks operational state, managed by the Clockworks apparatus via Stacks books. They are not part of the `nexus-core` API surface. See the Clockworks section for the runner API that exposes dispatch results.
 
 ---
 
@@ -282,22 +245,10 @@ Returns `{ total, completed, failed, cancelled, pending, active, ready }` — co
 | `CommissionSummary` | id, content, status, workshop, statusReason, createdAt, updatedAt |
 | `CommissionDetail` | Summary + assignments[] + sessions[] |
 | `ListCommissionsOptions` | `{ status?, workshop? }` |
-| `WorkRecord` | id, commissionId, title, description, status, createdAt, updatedAt |
-| `CreateWorkOptions` | `{ title, description?, commissionId? }` |
-| `ListWorksOptions` | `{ status?, commissionId? }` |
-| `UpdateWorkOptions` | `{ title?, description?, status? }` |
-| `PieceRecord` | id, workId, title, description, status, createdAt, updatedAt |
-| `CreatePieceOptions` | `{ title, description?, workId? }` |
-| `ListPiecesOptions` | `{ status?, workId? }` |
-| `UpdatePieceOptions` | `{ title?, description?, status? }` |
-| `JobRecord` | id, pieceId, title, description, status, assignee, createdAt, updatedAt |
-| `CreateJobOptions` | `{ title, description?, pieceId?, assignee? }` |
-| `ListJobsOptions` | `{ status?, pieceId?, assignee? }` |
-| `UpdateJobOptions` | `{ title?, description?, status?, assignee? }` |
-| `StrokeRecord` | id, jobId, kind, content, status, createdAt, updatedAt |
-| `CreateStrokeOptions` | `{ jobId, kind, content? }` |
-| `ListStrokesOptions` | `{ jobId?, status? }` |
-| `UpdateStrokeOptions` | `{ status?, content? }` |
+| `WritRecord` | id, type, title, description, status, parentId, sessionId, createdAt, updatedAt |
+| `CreateWritOptions` | `{ type, title, description?, parentId? }` |
+| `ListWritsOptions` | `{ status?, type?, parentId? }` |
+| `WritProgress` | `{ total, completed, failed, cancelled, pending, active, ready }` |
 
 ---
 
@@ -437,7 +388,7 @@ Full conversation detail including all turns.
 
 ## Clockworks
 
-The event processing runner — matches pending events to standing orders and dispatches them.
+The event processing runner — matches pending events to standing orders and dispatches them. The Clockworks apparatus owns its event and dispatch state via Stacks books (not raw SQL tables). Internal operations — reading pending events, marking events processed, recording dispatches — are handled by the apparatus and are not part of the public API. The runner functions below expose dispatch results without leaking persistence details.
 
 ### `clockTick(home, eventId?): Promise<TickResult | null>`
 

```

## Full File Contents (for context)

=== FILE: docs/reference/core-api.md ===
# Core API Reference

`@shardworks/nexus-core` — the shared infrastructure library for the guild system. All functions take `home: string` (the guild root path) as their first argument unless noted otherwise.

---

## Authoring

> **Note:** The `tool()` factory, `ToolDefinition`, `ToolCaller`, `isToolDefinition()`, and `resolveToolFromExport()` have moved to `@shardworks/tools-apparatus`. See the [Instrumentarium API Contract](../architecture/apparatus/instrumentarium.md) for the tool authoring API.

The following SDK factories remain in `@shardworks/nexus-core`:

### `engine(def): EngineDefinition`

Define a clockwork engine — an event-driven handler invoked by standing orders.

```typescript
engine({
  name: string,
  handler: (event: GuildEvent | null, ctx: EngineContext) => Promise<void>,
}): EngineDefinition
```

The handler receives the triggering `GuildEvent` (or `null` for direct invocation) and an `EngineContext` (`{ home: string }`).

### `isClockworkEngine(obj): obj is EngineDefinition`

Type guard — checks if a value has the `__clockwork: true` brand.

### `resolveEngineFromExport(moduleDefault, engineName?): EngineDefinition | null`

Resolve a single engine from a module's default export. Same pattern as `resolveToolFromExport`.

### Types

| Type | Description |
|------|-------------|
| `GuildEvent` | `{ id, name, payload, emitter, firedAt }` — immutable event from the queue |
| `EngineContext` | `{ home: string }` — injected into engine handlers |
| `EngineDefinition` | A fully-defined clockwork engine (return type of `engine()`) |

---

## Events

The event system — signaling, reading, and validation. Events are immutable facts persisted to the Clockworks event queue. The Clockworks runner processes them separately via `nsg clock`.

### `signalEvent(home, name, payload, emitter): string`

Signal an event — persist it to the Clockworks event queue. Does **not** process the event.

- `name` — event name (e.g. `"commission.posted"`, `"code.reviewed"`)
- `payload` — JSON-serializable event data, or `null`
- `emitter` — who signaled it: anima name, engine name, or `"framework"`
- **Returns:** the event ID (e.g. `"evt-a3f7b2c1"`)

### `isFrameworkEvent(name): boolean`

Check if an event name is in a reserved framework namespace. Reserved namespaces: `anima.`, `commission.`, `tool.`, `migration.`, `guild.`, `standing-order.`, `session.`. Note: writ lifecycle events (e.g. `mandate.ready`, `task.completed`) are framework-emitted but use guild-defined type names — they are not in this list. See [Event Catalog](event-catalog.md#writ-lifecycle-events).

### `validateCustomEvent(home, name): void`

Validate that a custom event name is declared in `guild.json` clockworks.events. **Throws** if the name is in a reserved namespace or not declared.

### `readEvent(home, id): GuildEvent | null`

Read a single event by ID.

### `listEvents(home, opts?): GuildEvent[]`

List events with optional filters. Returns newest first.

**Options (`ListEventsOptions`):**
- `name?: string` — filter by event name (exact match or `LIKE` pattern with `%` wildcards)
- `emitter?: string` — filter by emitter
- `pending?: boolean` — `true` = unprocessed only, `false` = processed only, omit for all
- `limit?: number` — max results

### Types

| Type | Description |
|------|-------------|
| `ListEventsOptions` | Filters for `listEvents()` |

> **Dispatch tracking.** Dispatch records (what ran in response to each event) are internal Clockworks operational state, managed by the Clockworks apparatus via Stacks books. They are not part of the `nexus-core` API surface. See the Clockworks section for the runner API that exposes dispatch results.

---

## Register

Anima identity and lifecycle — creation, querying, updating, and removal.

### `instantiate(opts): InstantiateResult`

Create a new anima in the guild. Validates roles exist and have available seats, reads and snapshots curriculum/temperament content at current versions. All operations run in a single transaction.

**Options (`InstantiateOptions`):**
- `home: string`
- `name: string` — must be unique
- `roles: string[]` — at least one required; each must be defined in guild.json
- `curriculum?: string` — by name (must be registered in guild.json)
- `temperament?: string` — by name (must be registered in guild.json)

**Returns (`InstantiateResult`):** `{ animaId, name, roles, curriculum, temperament }`

### `listAnimas(home, opts?): AnimaSummary[]`

List animas with optional filters by `status` and/or `role`.

### `showAnima(home, animaId): AnimaDetail | null`

Show detailed info for a single anima. Accepts either ID or name.

### `updateAnima(home, animaId, opts): AnimaDetail`

Update an anima's status and/or roles. Accepts either ID or name. When updating roles, replaces all existing roles.

**Options (`UpdateAnimaOptions`):**
- `status?: string` — new status value
- `roles?: string[]` — complete replacement set

### `removeAnima(home, animaId): void`

Retire an anima — sets status to `'retired'` and removes all roster entries. Accepts either ID or name.

### Manifest Functions

These functions assemble an anima's identity for a session.

### `readAnima(home, animaName): AnimaRecord`

Read an anima's full record including roles and composition metadata. **Throws** if not found.

### Tool Resolution

Tool resolution has moved to **The Instrumentarium** (`@shardworks/tools-apparatus`). The Loom resolves an anima's roles into a flat permissions array, then calls `instrumentarium.resolve({ permissions, channel })` to get the available tool set. See [The Instrumentarium — Permission Model](../architecture/apparatus/instrumentarium.md#permission-model).

### `readCodex(home): string`

Read all `.md` files from the `codex/` directory (non-recursive). Returns them joined with `---` separators.

### `readRoleInstructions(home, config, animaRoles): string`

Read role-specific instructions for an anima's roles from the files pointed to by role definitions in guild.json.

### `assembleSystemPrompt(codex, roleInstructions, anima, tools, unavailable?): string`

Assemble the composed system prompt. Sections included in order: Codex → Role Instructions → Training (curriculum) → Temperament → Tool Instructions → Unavailable Tools notice.

### `manifest(home, animaName): Promise<ManifestResult>`

The main entry point for session preparation. Reads composition, resolves tools, assembles system prompt. **Throws** if anima is not active.

**Returns (`ManifestResult`):**
- `anima: AnimaRecord`
- `systemPrompt: string`
- `composition: { codex, roleInstructions, curriculum, temperament, toolInstructions }`
- `tools: ResolvedTool[]`
- `unavailable: UnavailableTool[]`
- `warnings: string[]`

### Types

| Type | Description |
|------|-------------|
| `AnimaSummary` | id, name, status, roles, createdAt |
| `AnimaDetail` | Full detail including curriculum/temperament names and versions |
| `AnimaRecord` | Full record with composition snapshots (used by manifest) |
| `ListAnimasOptions` | `{ status?, role? }` |
| `UpdateAnimaOptions` | `{ status?, roles? }` |
| `InstantiateOptions` | Options for `instantiate()` |
| `InstantiateResult` | `{ animaId, name, roles, curriculum, temperament }` |
| `ResolvedTool` | `{ name, path, instructions, package }` |
| `UnavailableTool` | `{ name, reasons[] }` |
| `ManifestResult` | Full manifest with composition provenance |

---

## Ledger

Commission lifecycle and writ CRUD. All entities are historical records — no deletes, only status transitions.

### Commissions

#### `commission(opts): CommissionResult`

Post a commission to the guild. Creates a record with status `"posted"`, creates a mandate writ linked to the commission, and signals `commission.posted`. Validates that the workshop exists in guild.json.

**Options (`CommissionOptions`):** `{ home, spec, workshop }`

**Returns:** `{ commissionId }`

#### `listCommissions(home, opts?): CommissionSummary[]`

List commissions. Filter by `status` and/or `workshop`.

#### `readCommission(home, commissionId): { id, content, status, workshop, statusReason, writId } | null`

Read a commission record (basic fields only).

#### `showCommission(home, commissionId): CommissionDetail | null`

Extended commission view including assignments (anima ID, name, assigned-at) and linked sessions (session ID, anima ID, started/ended-at).

#### `updateCommissionStatus(home, commissionId, status, reason): void`

Update a commission's status and reason.

### Writs

#### `createWrit(home, opts): WritRecord`

Create a writ. Signals `{type}.ready`. Options: `{ type, title, description?, parentId? }`. The type must be a built-in type (`mandate`, `summon`) or declared in `guild.json` `writTypes`.

#### `listWrits(home, opts?): WritRecord[]`

Filter by `status`, `type`, and/or `parentId`.

#### `showWrit(home, writId): WritRecord | null`

#### `updateWritStatus(home, writId, status): WritRecord`

Transition a writ's status. Signals `{type}.completed` on completion, `{type}.failed` on failure. Failure cascades cancellation to incomplete children.

#### `completeWrit(home, writId): CompletionResult`

Mark a writ as completed. If the writ has incomplete children, transitions to `pending` instead. When all children complete, auto-transitions to `ready` (if a standing order exists for `{type}.ready`) or `completed` (if not). Returns `{ changed, newStatus }`.

#### `failWrit(home, writId, reason): void`

Mark a writ as failed. Cascades cancellation to all incomplete children. Signals `{type}.failed`.

#### `getWritProgress(home, writId): WritProgress`

Returns `{ total, completed, failed, cancelled, pending, active, ready }` — counts of child writs by status.

### Shared Types

| Type | Description |
|------|-------------|
| `CompletionCheck` | `{ complete: boolean, total, done, pending, failed }` |
| `CompletionResult` | `{ changed: boolean, newStatus: string }` |
| `CommissionOptions` | `{ home, spec, workshop }` |
| `CommissionResult` | `{ commissionId }` |
| `CommissionSummary` | id, content, status, workshop, statusReason, createdAt, updatedAt |
| `CommissionDetail` | Summary + assignments[] + sessions[] |
| `ListCommissionsOptions` | `{ status?, workshop? }` |
| `WritRecord` | id, type, title, description, status, parentId, sessionId, createdAt, updatedAt |
| `CreateWritOptions` | `{ type, title, description?, parentId? }` |
| `ListWritsOptions` | `{ status?, type?, parentId? }` |
| `WritProgress` | `{ total, completed, failed, cancelled, pending, active, ready }` |

---

## Daybook

Session tracking and audit trail.

### `listSessions(home, opts?): SessionSummary[]`

List sessions with optional filters. Returns newest first.

**Options (`ListSessionsOptions`):**
- `anima?: string` — filter by anima name or ID
- `workshop?: string`
- `trigger?: string` — `"consult"`, `"summon"`, `"brief"`, or `"convene"`
- `status?: 'active' | 'completed'` — active = no `ended_at`, completed = has `ended_at`
- `limit?: number`

### `showSession(home, sessionId): SessionDetail | null`

Full session detail including all token usage, cost, duration, composition metadata, and record path.

### `listAuditLog(home, opts?): AuditEntry[]`

List audit log entries, newest first.

**Options (`ListAuditLogOptions`):**
- `actor?: string` — e.g. `"patron"`, `"operator"`, `"framework"`, `"instantiate"`
- `action?: string` — e.g. `"commission_posted"`, `"anima_updated"`
- `targetType?: string` — e.g. `"commission"`, `"anima"`, `"writ"`
- `targetId?: string`
- `limit?: number`

### Session Funnel

The unified session infrastructure. ALL sessions flow through `launchSession()`.

### `registerSessionProvider(provider): void`

Register a session provider (e.g. claude-code, claude-api). Called once at startup.

### `getSessionProvider(): SessionProvider | null`

Get the registered session provider.

### `resolveWorkspace(payload): ResolvedWorkspace`

Resolve workspace context from an event payload. Returns `{ kind: 'guildhall' }`, `{ kind: 'workshop-temp', workshop, worktreePath }`, or `{ kind: 'workshop-managed', workshop, worktreePath }`.

### `createTempWorktree(home, workshop): string`

Create a temporary worktree from a workshop's bare repo (detached HEAD at main). Returns the absolute path.

### `removeTempWorktree(home, workshop, worktreePath): void`

Remove a temporary worktree. Logs but does not throw on failure.

### `launchSession(options): Promise<SessionResult>`

Launch a session through the registered provider. The complete lifecycle:
1. Create temp worktree (if `workshop-temp`)
2. Insert `session.started` row in Daybook
3. Signal `session.started` event
4. Delegate to provider
5. Update session row with metrics
6. Write SessionRecord JSON to `.nexus/sessions/`
7. Signal `session.ended` event
8. Tear down temp worktree (if autonomous + workshop-temp)

**Guarantees:** Steps 5–8 execute even if the provider throws.

### Types

| Type | Description |
|------|-------------|
| `SessionSummary` | id, animaId, provider, trigger, workshop, workspaceKind, startedAt, endedAt, exitCode, costUsd, durationMs |
| `SessionDetail` | Full record including token usage, composition metadata, providerSessionId, recordPath |
| `ListSessionsOptions` | Filters for `listSessions()` |
| `SessionProvider` | `{ name, launch(opts), launchStreaming?(opts) }` — the provider contract |
| `SessionProviderLaunchOptions` | What the provider receives (home, manifest, prompt, interactive, cwd, claudeSessionId?, ...) |
| `SessionProviderResult` | What the provider returns (exitCode, tokenUsage?, costUsd?, durationMs, ...) |
| `SessionLaunchOptions` | Full options for `launchSession()` — includes conversationId?, turnNumber?, claudeSessionId?, onChunk? |
| `SessionResult` | `{ sessionId, exitCode, tokenUsage?, costUsd?, durationMs, providerSessionId?, transcript?, conversationId?, turnNumber? }` |
| `SessionChunk` | Union: `{ type: 'text', text }` \| `{ type: 'tool_use', tool }` \| `{ type: 'tool_result', tool }` |
| `WorkspaceContext` | `{ workshop?, worktreePath? }` — standard event payload fields |
| `ResolvedWorkspace` | Discriminated union: guildhall, workshop-temp, or workshop-managed |
| `SessionRecord` | Full session record written to disk as JSON |
| `AuditEntry` | id, actor, action, targetType, targetId, detail, timestamp |
| `ListAuditLogOptions` | Filters for `listAuditLog()` |

---

## Conversations

Multi-turn interaction with animas — web consultation and convene sessions. See the **[Conversations API Reference](./conversations.md)** for the full guide including schema, integration patterns, and analytics queries.

### `createConversation(home, opts): CreateConversationResult`

Create a new conversation with participant records. Does NOT take a first turn.

### `takeTurn(home, conversationId, participantId, message): AsyncGenerator<ConversationChunk>`

Take a turn in a conversation. Manifests the anima, calls `launchSession()` with `--resume` threading, streams response chunks. The core primitive.

### `endConversation(home, conversationId, reason?): void`

End a conversation. Sets status to `'concluded'` or `'abandoned'`.

### `nextParticipant(home, conversationId): { participantId, name } | null`

Next participant in a convene rotation (round-robin). Returns `null` if done.

### `formatConveneMessage(home, conversationId, participantId): string`

Format the message for the next convene participant (new turns since their last).

### `listConversations(home, opts?): ConversationSummary[]`

List conversations. Filter by `status`, `kind`, `limit`.

### `showConversation(home, conversationId): ConversationDetail | null`

Full conversation detail including all turns.

### Types

| Type | Description |
|------|-------------|
| `ConversationChunk` | Union: text, tool_use, tool_result, turn_complete |
| `CreateConversationOptions` | Options for `createConversation()` |
| `CreateConversationResult` | `{ conversationId, participants[] }` |
| `ConversationSummary` | List view with computed turnCount and totalCostUsd |
| `ConversationDetail` | Full view with turns array |
| `ListConversationsOptions` | Filters for `listConversations()` |

---

## Clockworks

The event processing runner — matches pending events to standing orders and dispatches them. The Clockworks apparatus owns its event and dispatch state via Stacks books (not raw SQL tables). Internal operations — reading pending events, marking events processed, recording dispatches — are handled by the apparatus and are not part of the public API. The runner functions below expose dispatch results without leaking persistence details.

### `clockTick(home, eventId?): Promise<TickResult | null>`

Process a single event. If `eventId` is provided, processes that specific event. Otherwise, processes the next pending event. Returns `null` if no events to process.

### `clockRun(home): Promise<ClockRunResult>`

Process all pending events until the queue is empty. Loops because standing order failures may generate new events (`standing-order.failed`).

### `clockStart(home, options?): ClockStartResult`

Start the clockworks daemon as a detached background process. The daemon polls the event queue at the specified interval and processes events automatically.

```typescript
clockStart(home, { interval: 2000 })
// => { pid: 12345, logFile: '/path/to/.nexus/clock.log' }
```

Options: `{ interval?: number }` — polling interval in ms (default 2000). All options are optional. Throws if the daemon is already running.

### `clockStop(home): ClockStopResult`

Stop the running clockworks daemon. Sends SIGTERM and removes the PID file. Handles stale PID files gracefully.

```typescript
clockStop(home)
// => { pid: 12345, stopped: true }
```

### `clockStatus(home): ClockStatus`

Check whether the clockworks daemon is running. Cleans up stale PID files automatically.

```typescript
clockStatus(home)
// => { running: true, pid: 12345, logFile: '...', uptime: 360000 }
// or { running: false }
```

### Types

| Type | Description |
|------|-------------|
| `TickResult` | `{ eventId, eventName, dispatches: DispatchSummary[] }` |
| `DispatchSummary` | `{ handlerType, handlerName, status, error? }` |
| `ClockRunResult` | `{ processed: TickResult[], totalEvents }` |
| `ClockStartOptions` | `{ interval?: number }` |
| `ClockStartResult` | `{ pid, logFile }` |
| `ClockStopResult` | `{ pid, stopped }` |
| `ClockStatus` | `{ running, pid?, logFile?, uptime? }` |

---

## Guild Config

Reading and writing `guild.json` — the guild's central configuration file.

### `readGuildConfig(home): GuildConfig`

Read and parse `guild.json` from the guild root.

### `writeGuildConfig(home, config): void`

Write `guild.json` to the guild root (pretty-printed with trailing newline).

### `guildConfigPath(home): string`

Resolve the path to `guild.json`.

### `createInitialGuildConfig(name, nexusVersion, model): GuildConfig`

Create the default guild.json content for a new guild. All registries start empty.

### Types

| Type | Description |
|------|-------------|
| `GuildConfig` | The full guild.json shape: name, nexus, plugins, settings, plus plugin config sections |

---

## Infrastructure

Path resolution, ID generation, preconditions, workshops, worktrees, bundles, migrations, tool installation, and guild initialization.

### Paths

| Function | Returns |
|----------|---------|
| `findGuildRoot(startDir?)` | Guild root path (walks up looking for `guild.json`). Throws if not found. |
| `nexusDir(home)` | `.nexus` directory path |
| `booksPath(home)` | `.nexus/nexus.db` — the Books SQLite database |
| `ledgerPath(home)` | *(Deprecated)* Alias for `booksPath()` |
| `worktreesPath(home)` | `.nexus/worktrees` — commission worktrees root |
| `workshopsPath(home)` | `.nexus/workshops` — bare clone directory |
| `workshopBarePath(home, name)` | `.nexus/workshops/{name}.git` |

### IDs

#### `generateId(prefix): string`

Generate a prefixed hex ID: `{prefix}-{8 hex chars}`.

| Prefix | Entity |
|--------|--------|
| `a-` | anima |
| `c-` | commission |
| `conv-` | conversation |
| `cpart-` | conversation participant |
| `evt-` | event |
| `ses-` | session |
| `wrt-` | writ |

Additional prefixes used internally: `aud-` (audit log), `ed-` (event dispatch), `r-` (roster), `ac-` (anima composition), `ca-` (commission assignment).

### `VERSION: string`

The framework version string, read from `@shardworks/nexus-core/package.json`.

### Tool Installation

#### `installTool(opts): InstallResult`

Install a tool, engine, curriculum, or temperament into the guild. Supports five source types: registry, git-url, workshop, tarball, link.

**Options (`InstallToolOptions`):** `{ home, source, name?, roles?, commit?, link?, bundle? }`

**Returns (`InstallResult`):** `{ category, name, installedTo, sourceKind, warnings }`

#### `removeTool(opts): RemoveResult`

Remove a tool from the guild. Deregisters from guild.json, removes from disk, cleans up node_modules.

**Options (`RemoveToolOptions`):** `{ home, name, category? }`

#### `classifySource(source, link?): SourceKind`

Classify a source string: `'registry'`, `'git-url'`, `'workshop'`, `'tarball'`, or `'link'`.

### Tool Registry

#### `listTools(home, category?): ToolSummary[]`

List all installed artifacts from guild.json. Filter by category (`'tools'`, `'engines'`, `'curricula'`, `'temperaments'`).

### Preconditions

#### `readPreconditions(descriptorPath): Precondition[]`

Read preconditions from a descriptor file. Returns empty array if none declared.

#### `checkOne(precondition): PreconditionCheckResult`

Run a single precondition check.

#### `checkPreconditions(preconditions): PreconditionCheckResult[]`

Check all preconditions in an array.

#### `checkAllPreconditions(home, config): ToolPreconditionResult[]`

Check preconditions for all tools and engines in a guild.

#### `checkToolPreconditions(descriptorPath): PreconditionCheckResult[]`

Convenience wrapper for install-time warnings.

**Precondition types:**
- `CommandPrecondition` — checks if a command exists on PATH
- `CommandOutputPrecondition` — runs a command, checks stdout against a regex
- `EnvPrecondition` — checks if an env var is set and non-empty

### Workshops

#### `addWorkshop(opts): AddWorkshopResult`

Clone a remote repo as a bare clone and register in guild.json.

#### `removeWorkshop(opts): void`

Remove bare clone, worktrees, and guild.json entry.

#### `listWorkshops(home): WorkshopInfo[]`

List all workshops with status (cloned, active worktree count).

#### `showWorkshop(home, name): WorkshopDetail | null`

Detailed workshop info including bare path and default branch.

#### `createWorkshop(opts): AddWorkshopResult`

Create a new GitHub repo via `gh`, then add it as a workshop. Seeds with an initial commit on `main`.

#### `checkGhAuth(): string | null`

Check if `gh` is installed and authenticated. Returns `null` if OK, error message otherwise.

#### `deriveWorkshopName(input): string`

Derive a workshop name from a URL or `org/name` format.

### Worktrees

#### `setupWorktree(config): WorktreeResult`

Create a git worktree for a commission session. Creates a branch `commission-{id}` from the base branch.

#### `teardownWorktree(home, workshop, commissionId): void`

Remove a commission worktree. Does **not** delete the branch.

#### `listWorktrees(home, workshop?): WorktreeResult[]`

List active commission worktrees.

### Bundles

#### `readBundleManifest(bundleDir): BundleManifest`

Read and validate `nexus-bundle.json`. Enforces: tools/engines require `package`, content requires `package` or `path`, migrations require `path`.

#### `installBundle(opts): InstallBundleResult`

Install all artifacts from a bundle manifest. Handles transitive bundles (nested `nexus-bundle.json`).

#### `isBundleDir(dir): boolean`

Check if a directory contains `nexus-bundle.json`.

### Migrations

#### `discoverMigrations(migrationsDir): MigrationFile[]`

Discover migration files matching `NNN-description.sql`, sorted by sequence.

#### `applyMigrations(home, provenance?): MigrateResult`

Apply pending SQL migrations. Each runs in its own transaction. Tracks applied migrations in `_migrations` table.

### Upgrade

#### `planUpgrade(home, bundleDir, bundleSource?): UpgradePlan`

Plan a framework upgrade by diffing the guild's current state against a bundle. Read-only — inspects the guild and bundle but makes no changes. Returns an `UpgradePlan` describing new migrations, updated content, and stale animas.

#### `applyUpgrade(home, bundleDir, plan): UpgradeResult`

Apply an upgrade plan. Installs new migrations (renumbered into the guild's sequence), updates content artifacts (curricula/temperaments), and bumps the nexus version in `guild.json`. Does **not** recompose stale animas — that is a separate operator decision.

**Types:**
- `UpgradePlan` — `{ bundleSource, migrations, contentUpdates, staleAnimas, isEmpty }`
- `UpgradeResult` — `{ migrationsApplied, contentUpdated, staleAnimaCount }`
- `MigrationPlanEntry` — `{ bundleFilename, guildSequence, guildFilename }`
- `ContentUpdateEntry` — `{ category, name, installedVersion, bundleVersion, bundlePath }`
- `StaleAnimaEntry` — `{ id, name, roles, curriculum, temperament }` (curriculum/temperament are `{ composedVersion, currentVersion } | null`)

### Guild Init

#### `initGuild(home, name, model): void`

Initialize a new guild — creates guild.json, package.json, .git, .nexus directory, and applies migrations.

### Rehydrate

#### `rehydrate(home): RehydrateResult`

Reconstruct runtime state after a fresh clone: re-clone workshop bare repos, `npm install` for registry deps, reinstall workshop/tarball tools from on-disk source, report linked tools needing re-linking.

### Types

| Type | Description |
|------|-------------|
| `SourceKind` | `'registry' \| 'git-url' \| 'workshop' \| 'tarball' \| 'link'` |
| `InstallToolOptions` | Full options for `installTool()` |
| `InstallResult` | `{ category, name, installedTo, sourceKind, warnings }` |
| `RemoveToolOptions` | `{ home, name, category? }` |
| `RemoveResult` | `{ category, name, removedFrom }` |
| `ToolSummary` | `{ name, category, upstream, installedAt, bundle? }` |
| `Precondition` | Union: CommandPrecondition \| CommandOutputPrecondition \| EnvPrecondition |
| `PreconditionCheckResult` | `{ precondition, passed, message? }` |
| `ToolPreconditionResult` | `{ name, category, available, checks, failures }` |
| `AddWorkshopOptions` | `{ home, name, remoteUrl }` |
| `AddWorkshopResult` | `{ name, remoteUrl, barePath }` |
| `RemoveWorkshopOptions` | `{ home, name }` |
| `WorkshopInfo` | `{ name, remoteUrl, addedAt, cloned, activeWorktrees }` |
| `WorkshopDetail` | WorkshopInfo + `{ barePath, defaultBranch }` |
| `CreateWorkshopOptions` | `{ home, repoName, private? }` |
| `WorktreeConfig` | `{ home, workshop, commissionId, baseBranch? }` |
| `WorktreeResult` | `{ path, branch, commissionId }` |
| `BundleManifest` | `{ description?, tools?, engines?, curricula?, temperaments?, migrations? }` |
| `BundlePackageEntry` | `{ package, name? }` |
| `BundleContentEntry` | `{ package?, path?, name? }` |
| `BundleMigrationEntry` | `{ path }` |
| `InstallBundleOptions` | `{ home, bundleDir, bundleSource?, commit? }` |
| `InstallBundleResult` | `{ installed, artifacts, migrationProvenance? }` |
| `MigrationFile` | `{ sequence, filename, path }` |
| `MigrationProvenance` | `{ bundle, originalName }` |
| `MigrateResult` | `{ applied[], skipped[], total }` |
| `RehydrateResult` | `{ workshopsCloned[], workshopsFailed[], fromPackageJson, fromSlotSource[], needsRelink[] }` |



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: docs/reference/schema.md ===
# Schema Reference

The guild's Books database (``.nexus/nexus.db``) — SQLite, WAL mode, foreign keys enforced. All entity IDs are TEXT using prefixed hex format.

---

## Entity Relationship Diagram

```
                            ┌─────────────────────┐
                            │    commissions       │
                            │─────────────────────│
                            │ id (c-)              │
                            │ content              │
                            │ status               │
                            │ workshop             │
                            └──────┬──────┬────────┘
                                   │      │
                    ┌──────────────┘      └──────────────┐
                    │                                    │
        ┌───────────┴──────────┐          ┌──────────────┴──────────┐
        │ commission_assignments│          │  commission_sessions    │
        │──────────────────────│          │─────────────────────────│
        │ commission_id ←──────│          │ commission_id ←─────────│
        │ anima_id ────────────│──┐       │ session_id ─────────────│──┐
        └──────────────────────┘  │       └─────────────────────────┘  │
                                  │                                    │
        ┌─────────────────────────┘                                    │
        │                                                              │
   ┌────┴──────────────┐                                ┌──────────────┴──────┐
   │     animas        │                                │      sessions       │
   │───────────────────│                                │─────────────────────│
   │ id (a-)           │                                │ id (ses-)           │
   │ name (unique)     │                                │ anima_id ───────────│──→ animas
   │ status            │                                │ provider, model     │
   └────┬──────────────┘                                │ trigger, workshop   │
        │                                               │ token usage, cost   │
        │                                               └─────────────────────┘
   ┌────┴──────────────────┐
   │  anima_compositions   │     ┌───────────────┐
   │───────────────────────│     │    roster      │
   │ anima_id (unique) ────│     │───────────────│
   │ curriculum snapshot   │     │ anima_id ──────│──→ animas
   │ temperament snapshot  │     │ role           │
   └───────────────────────┘     └───────────────┘


   ┌─────────────────────┐
   │       writs         │
   │─────────────────────│
   │ id (wrt-)           │
   │ type, title         │
   │ status              │
   │ parent_id ──────────│──→ writs (self-ref, optional)
   │ session_id          │
   └─────────────────────┘
        ↑                    ↑
        │                    │
   commissions.writ_id   sessions.writ_id


   ┌─────────────────────┐          ┌──────────────────────┐
   │      events         │          │   event_dispatches   │
   │─────────────────────│          │──────────────────────│
   │ id (evt-)           │          │ id (ed-)             │
   │ name, payload       │←─────────│ event_id             │
   │ emitter, fired_at   │          │ handler_type/name    │
   │ processed           │          │ target_role          │
   └─────────────────────┘          │ status, error        │
                                    └──────────────────────┘

   ┌─────────────────────┐
   │    audit_log        │
   │─────────────────────│
   │ id (aud-)           │
   │ actor, action       │
   │ target_type/id      │
   │ detail, timestamp   │
   └─────────────────────┘
```

---

## Table-by-Table Reference

### `animas`

The Register — anima identity records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (a-) |
| `name` | TEXT | NOT NULL, UNIQUE | Human-readable name |
| `status` | TEXT | NOT NULL, CHECK | One of: `aspirant`, `active`, `retired` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |

### `anima_compositions`

Frozen snapshots of an anima's training content at instantiation time.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, UNIQUE, FK → animas | One composition per anima |
| `curriculum_name` | TEXT | NOT NULL | Curriculum name at instantiation |
| `curriculum_version` | TEXT | NOT NULL | Curriculum version at instantiation |
| `temperament_name` | TEXT | NOT NULL | Temperament name at instantiation |
| `temperament_version` | TEXT | NOT NULL | Temperament version at instantiation |
| `curriculum_snapshot` | TEXT | NOT NULL | Full curriculum content (frozen) |
| `temperament_snapshot` | TEXT | NOT NULL | Full temperament content (frozen) |
| `composed_at` | TEXT | NOT NULL, DEFAULT now | When the composition was created |

### `roster`

Role assignments — which animas hold which roles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, FK → animas | The anima |
| `role` | TEXT | NOT NULL | Role name (must match guild.json roles) |
| `standing` | INTEGER | NOT NULL, DEFAULT 0 | Reserved for future use |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | When the role was assigned |

### `commissions`

Patron-posted work orders.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (c-) |
| `content` | TEXT | NOT NULL | The commission specification |
| `status` | TEXT | NOT NULL, CHECK | One of: `posted`, `assigned`, `in_progress`, `completed`, `failed` |
| `workshop` | TEXT | NOT NULL | Target workshop name |
| `status_reason` | TEXT | | Human-readable reason for current status |
| `writ_id` | TEXT | FK → writs | The commission's mandate writ (set on posting) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `commission_assignments`

Join table — which animas are assigned to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | |
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | |

UNIQUE constraint on `(commission_id, anima_id)`.

### `writs`

Tracked work items — the Ledger's core table. Writs are typed, tree-structured obligations that replace the earlier four-level hierarchy (works, pieces, jobs, strokes).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (wrt-) |
| `type` | TEXT | NOT NULL | Writ type — guild-defined (e.g. `task`, `feature`) or built-in (`mandate`, `summon`) |
| `title` | TEXT | NOT NULL | Human-readable summary |
| `description` | TEXT | | Full description, acceptance criteria, etc. |
| `status` | TEXT | NOT NULL, DEFAULT 'ready', CHECK | One of: `ready`, `active`, `pending`, `completed`, `failed`, `cancelled` |
| `parent_id` | TEXT | FK → writs | Parent writ (null for root writs) |
| `session_id` | TEXT | | Currently bound session (cleared on completion/interruption) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

Indexes: `idx_writs_parent`, `idx_writs_status`, `idx_writs_type_status`.

**Cross-references:** `commissions.writ_id` points to the commission's mandate writ. `sessions.writ_id` points to the writ the session is working on.

### `audit_log`

The Daybook audit trail — records of all significant actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (aud-) |
| `actor` | TEXT | NOT NULL | Who did it: `patron`, `operator`, `framework`, `instantiate`, anima name |
| `action` | TEXT | NOT NULL | What happened: `commission_posted`, `anima_updated`, `writ_created`, etc. |
| `target_type` | TEXT | | Entity type: `commission`, `anima`, `writ`, `session`, `conversation` |
| `target_id` | TEXT | | Entity ID |
| `detail` | TEXT | | JSON-encoded additional context |
| `timestamp` | TEXT | NOT NULL, DEFAULT now | |

### `events`

The Clockworks event queue.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (evt-) |
| `name` | TEXT | NOT NULL | Event name (e.g. `commission.posted`, `code.reviewed`) |
| `payload` | TEXT | | JSON-encoded event data |
| `emitter` | TEXT | NOT NULL | Who signaled it |
| `fired_at` | TEXT | NOT NULL, DEFAULT now | |
| `processed` | INTEGER | NOT NULL, DEFAULT 0 | 0 = pending, 1 = processed |

### `event_dispatches`

Dispatch records — what happened when a standing order executed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ed-) |
| `event_id` | TEXT | NOT NULL, FK → events | The triggering event |
| `handler_type` | TEXT | NOT NULL | `engine` or `anima` |
| `handler_name` | TEXT | NOT NULL | Engine name or anima name |
| `target_role` | TEXT | | Role name (for anima dispatches) |
| `notice_type` | TEXT | | `summon` or `brief` (for anima dispatches) |
| `started_at` | TEXT | | |
| `ended_at` | TEXT | | |
| `status` | TEXT | | `success` or `error` |
| `error` | TEXT | | Error message if status is error |

### `sessions`

Session records — every session launched through the funnel.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ses-) |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `provider` | TEXT | NOT NULL | Session provider name (e.g. `claude-code`) |
| `model` | TEXT | | Model identifier |
| `trigger` | TEXT | NOT NULL | `consult`, `summon`, `brief`, or `convene` |
| `workshop` | TEXT | | Workshop name (null for guildhall sessions) |
| `workspace_kind` | TEXT | NOT NULL | `guildhall`, `workshop-temp`, or `workshop-managed` |
| `curriculum_name` | TEXT | | |
| `curriculum_version` | TEXT | | |
| `temperament_name` | TEXT | | |
| `temperament_version` | TEXT | | |
| `roles` | TEXT | | JSON array of role names |
| `started_at` | TEXT | NOT NULL | |
| `ended_at` | TEXT | | Null while session is active |
| `exit_code` | INTEGER | | |
| `input_tokens` | INTEGER | | |
| `output_tokens` | INTEGER | | |
| `cache_read_tokens` | INTEGER | | |
| `cache_write_tokens` | INTEGER | | |
| `cost_usd` | REAL | | |
| `duration_ms` | INTEGER | | |
| `provider_session_id` | TEXT | | Provider's own session identifier |
| `record_path` | TEXT | | Path to the SessionRecord JSON file (relative to guild root) |
| `conversation_id` | TEXT | FK → conversations | Conversation this turn belongs to (null for standalone sessions) |
| `turn_number` | INTEGER | | Position within the conversation (1-indexed) |
| `writ_id` | TEXT | FK → writs | Bound writ (set by clockworks for writ-driven sessions; null for conversations) |

### `conversations`

Multi-turn interactions grouping multiple sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (conv-) |
| `status` | TEXT | NOT NULL, DEFAULT 'active', CHECK | One of: `active`, `concluded`, `abandoned` |
| `kind` | TEXT | NOT NULL, CHECK | `consult` or `convene` |
| `topic` | TEXT | | Seeding prompt or subject |
| `turn_limit` | INTEGER | | Maximum total turns (null = unlimited) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `ended_at` | TEXT | | |
| `event_id` | TEXT | | For convene: the triggering event ID |

### `conversation_participants`

Participants in a conversation — human or anima.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (cpart-) |
| `conversation_id` | TEXT | NOT NULL, FK → conversations | |
| `kind` | TEXT | NOT NULL, CHECK | `anima` or `human` |
| `name` | TEXT | NOT NULL | Anima name or `'patron'` |
| `anima_id` | TEXT | | FK to animas (null for humans) |
| `claude_session_id` | TEXT | | Provider session ID for `--resume` threading |

### `commission_sessions`

Join table — which sessions are linked to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `session_id` | TEXT | NOT NULL, FK → sessions | |

PRIMARY KEY on `(commission_id, session_id)`.

### `_migrations`

Internal tracking table for the migration system. Not part of the regular schema.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sequence` | INTEGER | PRIMARY KEY | Migration sequence number |
| `filename` | TEXT | NOT NULL | Migration filename |
| `applied_at` | TEXT | NOT NULL, DEFAULT now | |
| `bundle` | TEXT | | Bundle that delivered this migration |
| `original_name` | TEXT | | Original filename before renumbering |

---

## Status Lifecycles

### Anima

```
aspirant → active → retired
```

- **aspirant** — created but not yet activated (not currently used by `instantiate()`, which creates directly as `active`)
- **active** — manifested for sessions, holds roles, can be dispatched
- **retired** — removed from service, roster entries deleted

### Commission

```
posted → assigned → in_progress → completed
                                → failed
```

- **posted** — created by patron, waiting for dispatch. A mandate writ is created and linked.
- **assigned** — (manual transition) an anima has been assigned
- **in_progress** — the Clockworks has summoned an anima (automatic on `summon` dispatch)
- **completed** — the mandate writ is fulfilled
- **failed** — manually set when the commission cannot be completed

### Writ

```
ready → active → completed
               → failed → cancelled (cascade)
               → pending → ready (when children complete)
                         → completed (auto, if no standing order)
ready → cancelled
```

- **ready** — available for dispatch. Signals `{type}.ready` (e.g. `mandate.ready`, `task.ready`)
- **active** — an anima is working on it (session bound)
- **pending** — the anima called `complete-session` but child writs are still incomplete. Automatically transitions back to `ready` (or auto-completes) when all children finish.
- **completed** — obligation fulfilled. Signals `{type}.completed`. Triggers completion rollup on parent.
- **failed** — unrecoverable failure. Signals `{type}.failed`. Cascades cancellation to incomplete children.
- **cancelled** — withdrawn, either directly or by cascade from a failed parent.

### Conversation

```
active → concluded
       → abandoned
```

- **active** — conversation is in progress, turns can be taken
- **concluded** — conversation ended normally (turn limit reached or explicitly concluded)
- **abandoned** — conversation ended abnormally (browser disconnect, timeout)

---

## ID Conventions

All entity IDs use the format `{prefix}-{8 hex chars}` where the hex is generated from 4 random bytes (`crypto.randomBytes(4)`).

| Prefix | Entity | Example |
|--------|--------|---------|
| `a-` | Anima | `a-5e6f7a8b` |
| `c-` | Commission | `c-a3f7b2c1` |
| `conv-` | Conversation | `conv-1a2b3c4d` |
| `cpart-` | Conversation participant | `cpart-5e6f7a8b` |
| `evt-` | Event | `evt-1a2b3c4d` |
| `ses-` | Session | `ses-deadbeef` |
| `wrt-` | Writ | `wrt-12345678` |
| `aud-` | Audit log entry | `aud-aabbccdd` |
| `ed-` | Event dispatch | `ed-55667788` |
| `r-` | Roster entry | `r-99aabbcc` |
| `ac-` | Anima composition | `ac-ddeeff00` |
| `ca-` | Commission assignment | `ca-11223344` |

8 hex characters = 4 random bytes ≈ 4.3 billion possibilities per prefix. Sufficient for a single-guild system.

Generation: `generateId(prefix)` from `@shardworks/nexus-core`.

=== CONTEXT FILE: docs/reference/event-catalog.md ===
# Event Catalog

The Clockworks event system — every framework event, custom event rules, and standing order wiring.

---

## Framework Events

Framework events are signaled by core modules and the Clockworks runner. They use reserved namespaces (`commission.`, `session.`, `standing-order.`) and **cannot** be signaled by animas or operators.

### Commission Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `commission.posted` | `{ commissionId, workshop }` | `framework` | A new commission is posted via `commission()` |
| `commission.session.ended` | `{ commissionId, workshop?, exitCode }` | `framework` | A session launched for a commission completes (success or failure) |
| `commission.completed` | `{ commissionId }` | `framework` | `completeCommissionIfReady()` transitions status to `completed` |

**`commission.posted`** is the primary entry point for the commission pipeline. The framework creates a `mandate` writ and signals `mandate.ready` — standing orders typically wire that to summon an anima (e.g. `{ on: "mandate.ready", summon: "artificer" }`).

**`commission.session.ended`** fires when any session associated with a commission finishes. Useful for post-session automation (merge worktrees, check completion, notify).

**`commission.completed`** fires when the commission's mandate writ is fulfilled. This is a terminal event — no further work expected.

### Session Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `session.started` | `{ sessionId, anima, trigger, workshop, workspaceKind }` | `framework` | A session begins (after Daybook row is inserted) |
| `session.ended` | `{ sessionId, anima, trigger, workshop, exitCode, durationMs, costUsd, error }` | `framework` | A session completes (even if the provider threw) |
| `session.record-failed` | `{ sessionId?, error, phase, anima? }` | `framework` | Failed to write session record to Daybook or disk |

**`session.ended`** fires **guaranteed** — the session funnel wraps the provider call in try/finally. The `error` field is non-null if the provider threw. The `costUsd` field may be null if the provider doesn't report cost.

**`session.record-failed`** is a diagnostic event. The `phase` field indicates where the failure occurred: `"insert"` (initial row), `"write-record"` (JSON to disk), or `"update-row"` (final metrics).

### Writ Lifecycle Events

Writ lifecycle events use the writ's **type** as the event namespace. For example, a writ of type `mandate` emits `mandate.ready`, `mandate.completed`, etc. A guild-defined type like `task` emits `task.ready`, `task.completed`, etc.

| Event Pattern | Payload | Emitter | When |
|---------------|---------|---------|------|
| `{type}.ready` | `{ writId, parentId?, commissionId? }` | `framework` | Writ transitions to `ready` — available for dispatch |
| `{type}.completed` | `{ writId, parentId?, commissionId? }` | `framework` | Writ transitions to `completed` |
| `{type}.failed` | `{ writId, parentId?, commissionId? }` | `framework` | Writ transitions to `failed` |

**`{type}.ready`** is the primary dispatch signal. Standing orders wire these to summon animas (e.g. `{ on: "mandate.ready", summon: "artificer" }`). When a commission is posted, the framework creates a `mandate` writ and signals `mandate.ready`.

**Completion rollup:** When all children of a writ complete, the parent transitions from `pending` to `ready` (if a standing order exists for `{type}.ready`) or auto-completes (if not). This cascades upward through the tree — child completion can ripple up to fulfill the root mandate and complete the commission.

**Failure cascade:** When a writ fails, all its incomplete children are cancelled.

#### Event namespace and validation

Writ lifecycle events are **framework-emitted** but use **guild-defined type names** as their namespace. A guild with a `task` writ type gets `task.ready` events — these aren't in the reserved framework namespaces, and they aren't declared in `clockworks.events` either. This is intentional:

- The framework emits them freely (it calls `signalEvent()` directly, bypassing validation).
- An anima calling `signal('task.ready')` will be **rejected** by `validateCustomEvent()` — the event isn't declared in `clockworks.events`, and animas can't spoof writ state transitions.

This asymmetry is a feature: the framework controls writ lifecycle events; animas cannot forge them.

### Clockworks Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `standing-order.failed` | `{ standingOrder, triggeringEvent: { id, name }, error }` | `framework` | A standing order execution fails (engine throws or anima session fails) |

**Loop guard:** If a `standing-order.failed` event was itself triggered by another `standing-order.failed` event, the Clockworks runner skips processing to prevent infinite cascades.

### Reserved Namespaces

The following namespaces are reserved for framework events. Animas cannot signal events in these namespaces via the `signal` tool — `validateCustomEvent()` will throw.

```
anima.
commission.
tool.
migration.
guild.
standing-order.
session.
```

**Note:** Writ lifecycle events (e.g. `mandate.ready`, `task.completed`) use guild-defined type names as namespaces, which are *not* in this reserved list. They are still framework-only — see [Writ Lifecycle Events](#writ-lifecycle-events) for how validation handles this.

---

## Custom Events

Custom events are declared in `guild.json` and can be signaled by animas (via the `signal` MCP tool) or by engines.

### Declaring Custom Events

Add events to `guild.json` under `clockworks.events`:

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "A code review has been completed",
        "schema": { "prUrl": "string", "approved": "boolean" }
      },
      "deploy.requested": {
        "description": "A deployment was requested"
      }
    }
  }
}
```

- `description` — human-readable purpose (optional but recommended)
- `schema` — payload schema hint (informational only, not enforced at runtime)

### Validation Rules

1. The event name must **not** start with a reserved namespace prefix
2. The event name **must** be declared in `guild.json` `clockworks.events`
3. Both rules are enforced by `validateCustomEvent()`, which is called by the `signal` MCP tool

### Signaling Custom Events

From an anima (via the `signal` tool):
```
signal code.reviewed { "prUrl": "https://...", "approved": true }
```

From an engine:
```typescript
import { signalEvent } from '@shardworks/nexus-core';
signalEvent(home, 'code.reviewed', { prUrl: '...', approved: true }, 'my-engine');
```

Framework events bypass `validateCustomEvent()` — they call `signalEvent()` directly.

---

## Standing Order Wiring

Standing orders connect events to actions. They are declared in `guild.json` under `clockworks.standingOrders`.

### Order Types

#### `run` — Execute an engine

```json
{ "on": "session.ended", "run": "completion-rollup" }
```

The Clockworks runner imports the engine by name from `guild.json.engines`, calls its handler with the triggering event, and records a dispatch.

#### `summon` — Launch an anima session

```json
{ "on": "commission.posted", "summon": "artificer" }
```

Resolves the role to an active anima, manifests it, and launches a full session through the session funnel. For commission events, also writes commission assignments and updates commission status to `"in_progress"`.

The `prompt` for the session comes from the commission content (for commission events) or the event payload's `brief` field.

#### `brief` — Launch an anima session (lightweight)

```json
{ "on": "code.reviewed", "brief": "steward" }
```

Same as `summon` but semantically lighter — no commission lifecycle updates.

### Dispatch Lifecycle

When the Clockworks runner processes an event:

1. Find all standing orders where `on` matches the event name
2. For each matching order:
   a. Execute the action (`run` engine, or `summon`/`brief` anima)
   b. Record a dispatch in `event_dispatches` (started_at, ended_at, status, error)
   c. If the action failed, signal `standing-order.failed`
3. Mark the event as processed

### Role Resolution

For `summon` and `brief` orders, the role name is resolved to a specific anima:
- Query the roster for active animas holding the role
- If multiple animas share the role, the one with the lowest ID is selected
- If no active anima holds the role, the dispatch fails with an error

### No-Provider Behavior

If no session provider is registered (e.g. during testing or CLI-only operation), `summon` and `brief` orders are recorded as **skipped** — the intent is logged but no session is launched.

---

## Cookbook

Common patterns for wiring events to actions.

### Standard Commission Pipeline

The default commission flow: patron posts → workshop prepared → mandate dispatched → session runs → workshop merged.

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.posted", "run": "workshop-prepare" },
      { "on": "mandate.ready", "summon": "artificer", "prompt": "You have been assigned a commission.\n\n{{writ.title}}\n\n{{writ.description}}" },
      { "on": "mandate.completed", "run": "workshop-merge" }
    ]
  }
}
```

When a commission is posted, the framework creates a `mandate` writ and signals `mandate.ready`. The standing order summons an artificer. When the artificer calls `complete-session`, the mandate completes (or enters `pending` if child writs exist), and `mandate.completed` triggers the merge engine.

### Multi-Level Writ Decomposition

An artificer can decompose a mandate into child writs, each dispatched independently:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.posted", "run": "workshop-prepare" },
      { "on": "mandate.ready", "summon": "sage", "prompt": "Plan this commission.\n\n{{writ.title}}\n\n{{writ.description}}" },
      { "on": "task.ready", "summon": "artificer", "prompt": "{{writ.title}}\n\n{{writ.description}}" },
      { "on": "mandate.completed", "run": "workshop-merge" }
    ]
  }
}
```

The sage receives the mandate, creates `task` child writs, and calls `complete-session`. The mandate enters `pending`. Each `task.ready` event summons an artificer. When all tasks complete, the mandate auto-transitions to `ready` → completes → triggers the merge.

### Custom Writ Types

Guilds declare custom writ types in `guild.json` to match their workflow vocabulary:

```json
{
  "writTypes": {
    "task": { "description": "A concrete unit of work" },
    "feature": { "description": "A user-facing capability" },
    "bug": { "description": "A defect to fix" }
  }
}
```

Each type gets its own lifecycle events (`task.ready`, `feature.completed`, `bug.failed`) and can be wired to different standing orders.

Multiple standing orders can match the same event — they execute in declaration order.

=== CONTEXT FILE: docs/reference/conversations.md ===
# Conversations API Reference

Multi-turn interaction with animas — web consultation and convene sessions.

Conversations group multiple sessions (turns) into a single logical interaction. Each turn is a full `launchSession()` call through the standard session funnel — same manifest pipeline, same metrics, same session records. The conversation layer is thin: it groups sessions, threads claude session IDs for `--resume`, and tracks overall conversation state.

---

## Concepts

### Kinds

| Kind | Description | Participants |
|------|-------------|-------------|
| `consult` | Human talks to an anima (from dashboard or CLI) | 1 human + 1 anima |
| `convene` | Multiple animas hold a turn-limited dialogue | N animas |

### Turns and Sessions

Each turn in a conversation produces a session row in the `sessions` table. All per-turn metrics (cost, tokens, duration, transcript) live in the existing session infrastructure. The conversation tables add grouping and state on top.

**Human turns** in a consult do not produce sessions. The human's message is passed as the `prompt` to the anima's `takeTurn()` call and appears in the anima's session record as `userPrompt`. This means cost/token analytics are always agent-side — which is what you want for budget tracking. For dialogue reconstruction, `showConversation()` interleaves the anima's prompt (the human's message) with the anima's response.

### Session Threading

Conversation turns use claude's `--resume` flag to maintain conversational continuity. The first turn for each anima participant starts a fresh claude session. Subsequent turns resume it with the `providerSessionId` captured from the previous turn's result. This ID is stored on the `conversation_participants` record and passed through `launchSession()` → provider.

### Manifest at Turn Time

Animas are manifested via `manifest()` on each turn, not at conversation creation time. This means the anima's system prompt, tools, and MCP config reflect the current guild state when the turn is taken. If a tool is installed mid-conversation, the next turn picks it up.

---

## Database Schema

### New Tables

```sql
-- Conversation: one logical multi-turn interaction
CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,               -- conv_xxxx
    status      TEXT NOT NULL DEFAULT 'active', -- active | concluded | abandoned
    kind        TEXT NOT NULL,                  -- consult | convene
    topic       TEXT,                           -- seeding prompt / subject
    turn_limit  INTEGER,                        -- max total turns (null = unlimited)
    created_at  TEXT NOT NULL,
    ended_at    TEXT,
    event_id    TEXT                            -- for convene: triggering event
);

-- Participant in a conversation (human or anima)
CREATE TABLE conversation_participants (
    id                TEXT PRIMARY KEY,          -- cpart_xxxx
    conversation_id   TEXT NOT NULL REFERENCES conversations(id),
    kind              TEXT NOT NULL,             -- anima | human
    name              TEXT NOT NULL,             -- anima name or 'patron'
    anima_id          TEXT,                      -- FK to animas (null for humans)
    claude_session_id TEXT                       -- threaded via --resume
);
```

### Sessions Table Extensions

```sql
ALTER TABLE sessions ADD COLUMN conversation_id TEXT REFERENCES conversations(id);
ALTER TABLE sessions ADD COLUMN turn_number     INTEGER;
```

- **`conversation_id`** — groups turns. Null for standalone sessions (summon, brief, terminal consult).
- **`turn_number`** — 1-indexed position within the conversation. Useful for analytics: cost-per-turn curves, cache efficiency trends.

### Analytics Queries

```sql
-- Total cost of a conversation
SELECT SUM(cost_usd) FROM sessions WHERE conversation_id = ?;

-- Per-participant cost breakdown
SELECT a.name, SUM(s.cost_usd), SUM(s.input_tokens), SUM(s.output_tokens)
FROM sessions s JOIN animas a ON a.id = s.anima_id
WHERE s.conversation_id = ?
GROUP BY a.name;

-- Cost per turn (do later turns get cheaper from caching?)
SELECT turn_number, cost_usd, cache_read_tokens
FROM sessions WHERE conversation_id = ?
ORDER BY turn_number;
```

---

## Session Infrastructure Changes

### SessionProviderLaunchOptions

Added field:

```ts
claudeSessionId?: string
```

When provided, the provider uses `--resume SESSION_ID` to continue an existing conversation instead of starting a fresh session.

### SessionProvider Interface

Added optional method:

```ts
launchStreaming?(options: SessionProviderLaunchOptions): {
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionProviderResult>;
}
```

Returns an async iterable of `SessionChunk` for real-time streaming AND a promise for the final result. Used by `takeTurn()` to stream responses to the dashboard. Falls back to `launch()` when not implemented.

### SessionChunk

```ts
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }
```

### SessionLaunchOptions

Added fields:

```ts
conversationId?: string   // written to sessions.conversation_id
turnNumber?: number       // written to sessions.turn_number
claudeSessionId?: string  // passed through to provider for --resume
onChunk?: (chunk: SessionChunk) => void  // streaming callback
```

The trigger type union is extended: `'consult' | 'summon' | 'brief' | 'convene'`.

---

## Conversation API

All functions take `home: string` (the guild root path) as their first argument.

### `createConversation(home, options): CreateConversationResult`

Create a new conversation with participant records. Does NOT take a first turn.

**Options (`CreateConversationOptions`):**
- `kind: 'consult' | 'convene'`
- `topic?: string` — seeding prompt or subject
- `turnLimit?: number` — max total turns (null = unlimited)
- `participants: Array<{ kind: 'anima' | 'human'; name: string }>` — at least one participant
- `eventId?: string` — for convene: the triggering event ID

**Returns (`CreateConversationResult`):**
- `conversationId: string` — the new conversation ID (`conv_xxxx`)
- `participants: Array<{ id: string; name: string; kind: string }>` — with generated IDs

### `takeTurn(home, conversationId, participantId, message): AsyncGenerator<ConversationChunk>`

Take a turn in a conversation. The core primitive.

For anima participants:
1. Reads conversation state (checks active, turn limit)
2. Manifests the anima via `manifest()` — standard pipeline
3. Calls `launchSession()` with `claudeSessionId` for `--resume`
4. Streams `ConversationChunk`s as they arrive from the provider
5. Updates participant's `claude_session_id` for next turn
6. Auto-concludes if turn limit reached

For human participants: no-op (returns immediately). The human's message should be passed as the `message` argument to the next anima `takeTurn()` call.

**ConversationChunk:**
```ts
type ConversationChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }
  | { type: 'turn_complete'; turnNumber: number; costUsd?: number }
```

**Throws** if conversation is not active or turn limit reached.

### `endConversation(home, conversationId, reason?): void`

End a conversation explicitly. Sets status to `'concluded'` (default) or `'abandoned'`. Idempotent — no-op if already ended.

### `nextParticipant(home, conversationId): { participantId, name } | null`

Get the next participant in a convene rotation (round-robin by creation order). Returns `null` if conversation is not active, turn limit reached, or no anima participants.

### `formatConveneMessage(home, conversationId, participantId): string`

Format the message for the next participant in a convene. Returns only what happened since their last turn (other participants' responses), avoiding duplicate context with `--resume`. Returns the conversation topic if it's the participant's first turn.

### `listConversations(home, opts?): ConversationSummary[]`

List conversations with optional filters.

**Options (`ListConversationsOptions`):**
- `status?: string` — `'active'`, `'concluded'`, or `'abandoned'`
- `kind?: string` — `'consult'` or `'convene'`
- `limit?: number`

**Returns (`ConversationSummary`):**
- `id, status, kind, topic, turnLimit, createdAt, endedAt`
- `participants: Array<{ id, name, kind }>`
- `turnCount: number` — computed from sessions table
- `totalCostUsd: number` — computed from sessions table

### `showConversation(home, conversationId): ConversationDetail | null`

Full conversation detail including all turns.

**Returns (`ConversationDetail`):** extends `ConversationSummary` with:
- `turns: Array<{ sessionId, turnNumber, participant, prompt, exitCode, costUsd, durationMs, startedAt, endedAt }>`

The `prompt` field on each turn is the input message (in a consult, this is the human's message). Together with the session's transcript, this reconstructs the full dialogue.

---

## Integration Patterns

### Dashboard — Web Consultation

```ts
// Start a consultation
const { conversationId, participants } = createConversation(home, {
  kind: 'consult',
  participants: [
    { kind: 'human', name: 'patron' },
    { kind: 'anima', name: 'steward' },
  ],
});

const animaPart = participants.find(p => p.name === 'steward')!;

// On each message from browser:
for await (const chunk of takeTurn(home, conversationId, animaPart.id, userMessage)) {
  ws.send(JSON.stringify(chunk));
}

// On disconnect:
endConversation(home, conversationId, 'abandoned');

// On reconnect with stored conversationId:
const state = showConversation(home, conversationId);
// Restore UI from state.turns
```

### Clockworks — Convene

```ts
const { conversationId } = createConversation(home, {
  kind: 'convene',
  topic: hydratedPrompt,
  turnLimit: 10,
  participants: standingOrder.participants.map(name => ({ kind: 'anima', name })),
  eventId,
});

while (true) {
  const next = nextParticipant(home, conversationId);
  if (!next) break;

  const message = formatConveneMessage(home, conversationId, next.participantId);
  for await (const chunk of takeTurn(home, conversationId, next.participantId, message)) {
    // stream to dashboard, log, etc.
  }
}
```

---

## Types Summary

| Type | Description |
|------|-------------|
| `ConversationChunk` | Union: text, tool_use, tool_result, turn_complete |
| `SessionChunk` | Union: text, tool_use, tool_result (without turn_complete) |
| `CreateConversationOptions` | Options for `createConversation()` |
| `CreateConversationResult` | `{ conversationId, participants[] }` |
| `ConversationSummary` | List view with computed turnCount and totalCostUsd |
| `ConversationDetail` | Full view with turns array |
| `ListConversationsOptions` | Filters for `listConversations()` |

## ID Prefixes

| Prefix | Entity |
|--------|--------|
| `conv-` | conversation |
| `cpart-` | conversation participant |



## Codebase Structure (surrounding directories)

```
=== TREE: docs/reference/ ===
conversations.md
core-api.md
event-catalog.md
schema.md


```
