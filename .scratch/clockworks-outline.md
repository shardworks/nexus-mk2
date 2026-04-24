# Clockworks Implementation — Task Outline

## Context

The Clockworks apparatus described in `docs/architecture/clockworks.md` is currently **not implemented**. The doc specifies the full design; `ClockworksConfig` types exist in `nexus-core`; but there is no apparatus plugin, no event store, no runner, no relay SDK, no `signal` tool, and no CLI commands. A plugin named `clockworks-retry` exists but is an unrelated retry apparatus.

This outline decomposes the implementation into twelve commissions, ordered so that each can be reviewed and dispatched when its dependencies land. The substance capstone is task 11 — **scheduled standing orders (cron)** — which is the MVP-1 feature Reckoner needs for its polling tick (see `c-mod9a54n`, `c-mo1mql8a`). Task 12 is a documentation refresh that brings the architecture doc into sync with what actually ships.

All commissions target the `nexus` codex.

## Task list

| # | Title | Short description | Depends on |
|---|---|---|---|
| 1 | Clockworks apparatus skeleton | Create `@shardworks/clockworks-apparatus` plugin package; declare `events` and `event_dispatches` books via Stacks; register the plugin; publish `ClockworksApi` type surface (no runtime behavior yet) | — |
| 2 | Relay contract and ClockworksKit | Add `relay()` factory to `nexus-core`; define `ClockworksKit.relays` kit contribution type; build a unified relay registry that merges relays from installed plugins and the Clockworks' own `supportKit` | 1 |
| 3 | Event emission API and `signal` tool | `ClockworksApi.emit(name, payload, emitter)` writes to the events book; add the `signal` base tool with validation against `guild.json` `clockworks.events`; add `nsg signal` CLI alias | 1 |
| 4 | Event-triggered standing order dispatcher | Read pending events; resolve matching standing orders from `guild.json`; invoke relays via the registry in registration order; write dispatch records; pass params through `RelayContext` | 1, 2, 3 |
| 5 | Summon relay (stdlib) | Ship the stdlib `summon` relay — role resolution, writ binding/synthesis, manifest, session launch, post-session writ lifecycle. Invoked via `run: summon-relay` like any other relay | 4 |
| 6 | Manual operator CLI — `nsg clock list/tick/run` | Operator commands for event-queue inspection and manual processing; no daemon | 4 |
| 7 | Framework event emission wiring | Signal `commission.*`, `session.*`, `anima.*`, `tool.*`, `migration.*`, `guild.*`, and writ-lifecycle `{type}.ready/completed/stuck/failed` from their authoritative core code paths | 3 |
| 8 | Stacks CDC auto-wiring for book events | In the apparatus start hook, register a CDC handler on every declared book that re-emits `book.<ownerId>.<book>.<type>` events into the Clockworks stream | 1, 3 |
| 9 | Error handling and loop guard | Catch relay throws; signal `standing-order.failed` with triggering event and error; tag these events so a failed error-handler does not cascade into an infinite loop | 4 |
| 10 | Clockworks daemon — `nsg clock start/stop/status` | Background daemon that polls the events book at a configurable interval; writes PID file and log; registers the session provider at startup so the summon relay can dispatch autonomously | 4, 5, 6 |
| 11 | Scheduled standing orders (cron) — MVP-1 | Extend `guild.json` standing order shape to accept time-pattern triggers (cron expressions or fixed intervals); tick-triggered dispatch alongside event-triggered; the feature the Reckoner needs for its polling tick | 4, 9, 10 |
| 12 | Refresh Clockworks architecture doc | Update `docs/architecture/clockworks.md` to match the shipped surface: `with:` params namespace, removal of `summon:`/`brief:` sugar, promotion of scheduled standing orders from "Deferred" to a first-class section, and refreshed examples throughout | 4, 11 |

## Dependency graph (visual)

```
1 skeleton
├── 2 relay + kit
│   └── 4 dispatcher ←── 3 emit + signal ←──┐
│       ├── 5 summon relay                   │
│       ├── 6 manual CLI                     │
│       ├── 9 error handling                 │
│       └── 10 daemon (+5, +6)              │
│           └── 11 cron (+4, +9)             │
├── 3 emit + signal ─────────────────────────┤
│   └── 7 framework events ──────────────────┘
└── 8 CDC auto-wiring (+3)
```

## Parallelism opportunities after task 4 lands

Once the event-triggered dispatcher (#4) is in place, these can proceed in parallel:

- **Task 5** (summon relay) — unblocks autonomous session dispatch
- **Task 6** (manual CLI) — unblocks operator-driven debugging
- **Task 7** (framework events) — unblocks real event data flowing through the system
- **Task 8** (CDC wiring) — unblocks book-change observability
- **Task 9** (error handling) — makes the system safe to run

Task 10 (daemon) and Task 11 (cron) compose those landed pieces. Task 11 is the payoff.

## Why this ordering

- **Skeleton first (#1).** Nothing can reference the apparatus package until it exists. Book schemas are the foundation — event store plus dispatch log.
- **Relay contract before dispatcher (#2 before #4).** The dispatcher needs a relay to call, and it needs to know how to call it. Defining the contract and registry first lets #4 focus on wiring, not on inventing.
- **Emit API before dispatcher (#3 before #4).** The dispatcher reads from the events book; something must be able to write to it. The signal tool and emit API are the minimum writers needed for end-to-end smoke testing.
- **Dispatcher before everything downstream (#4 as the fulcrum).** Once events can be emitted and relays can be invoked in response, the rest is additive.
- **Summon relay separate from dispatcher (#5).** The summon flow is substantial (anima resolution, writ lifecycle, session launch) and would dominate the dispatcher commission if bundled. Keeping it separate lets #4 ship with a simple no-op relay test case only, and gives #5 focused review attention. Summon is a regular relay with no special casing — invoked via `run: summon-relay` like any other.
- **Framework events late (#7).** Until the dispatcher exists, there is nothing to consume the events. Emitting them earlier risks building "emit into the void" without a real test. Also: framework event emission is the most invasive commission (touches many core code paths) and benefits from landing once the rest of the plumbing is proven.
- **Cron last (#11).** Cron scheduling adds a new trigger source that reuses the whole event-triggered pipeline (registry, relay invocation, dispatch records). Building on top of a working system is cheaper than inventing two dispatch paths at once.

## Scope fences for the decomposition

- **Standing-order shape: `{ on | schedule, run, with? }` — params live under `with:`, never flat-spread.** Top-level keys are Clockworks-reserved metadata (`on`, `schedule`, `run`, and any future Clockworks additions like `id`, `enabled`, `description`). Relay params go in the `with:` object. This guarantees no collision between Clockworks-reserved keywords and user-authored param names — a new Clockworks feature can claim a new top-level key without ever shadowing a relay's params. Pattern follows GitHub Actions' `with:`.
- **No `summon:` or `brief:` sugar forms.** The sugar variants currently anticipated in `guild-config.ts`'s `StandingOrder` union are dropped as part of task 4 (dispatcher). Summon is a regular relay invoked via `run: summon-relay` with its inputs inside `with:`. Sugar can be added later if real usage shows operators want it; punting keeps the surface tight.
- **The existing `reckoner` plugin** in `packages/plugins/reckoner/` is an unrelated observer apparatus that happens to share a name with the new petition-scheduler Reckoner (currently being designed under `c-mod99ris`). Its rename is out of scope for this decomposition — it's a separate cleanup pass Sean can do whenever.
- **Natural-language trigger syntax**, **pre-event hooks**, **payload schema enforcement**, and **webhook/external-event injection** are all listed as "Deferred" at the bottom of the architecture doc. Not in any of these commissions.
- **The `clockworks-retry` plugin** is orthogonal; these commissions do not touch it.
