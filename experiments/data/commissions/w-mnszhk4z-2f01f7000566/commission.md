_Imported from `.scratch/clockworks-mvp-brief.md` (2026-04-10)._

## Goal

Introduce a minimum-viable Clockworks apparatus whose only initial signal class is **timer-related events**. The MVP must (1) fill a real gap today — something CDC fundamentally cannot do; (2) be a genuine subset of the forward-looking Clockworks spec, so future expansion (framework events, custom events, book-change bridging, summon sugar) slots in without rewrites; (3) not disturb any existing CDC consumer — Laboratory keeps subscribing to Stacks `watch()` directly.

## Status

Active draft brief, awaiting Sean's review before turning into a proper spec doc. No code yet.

## Next Steps

Get Sean's read on the seven open questions below, especially #1 (is timers really the right first signal class?), #5 (does MVP include the daemon, or only manual `nsg clock tick`?), and #7 (is "Clockworks" still the right name for this scope?). If the direction lands, turn this brief into a proper spec doc at `/workspace/nexus/docs/architecture/apparatus/clockworks.md` (replacing or slimming the current forward-looking doc into "full spec / where we're headed"), then it's commissionable.

## Context

**Current state.** Everything reactive in the guild is database-change-driven. Stacks emits CDC, Laboratory (and future consumers) subscribe. This covers every "X happened in the Books, therefore do Y" scenario.

**What CDC cannot express:**

- *"Nothing happened for 10 minutes"* — stale-rig detection, stuck-writ nudges
- *"Every night at 02:00"* — nightly snapshots, rollups, cleanup passes
- *"Every 5 minutes"* — periodic health checks, instrument scoring cadences
- *"In 15 minutes, unless cancelled"* — delayed actions (deferred, not in MVP)

Timers are the one causal input CDC will never produce. Starting here gives the apparatus an exclusive role from day one, forces the minimum-useful vocabulary into existence, doesn't require migrating any current CDC consumer, and creates a natural forcing function for the daemon (Phase 2 of the forward-looking spec).

### Shape of the MVP

**Package.** `@shardworks/clockworks` — new apparatus plugin in `/workspace/nexus/packages/plugins/clockworks/`. Depends on `stacks` (event table) and `nexus-core`.

**guild.json stanza:**

```json
{
  "clockworks": {
    "schedules": {
      "stale-rig-sweep":   { "every": "5m" },
      "nightly-rollup":    { "cron": "0 2 * * *" },
      "instrument-scored": { "every": "1h" }
    },
    "standingOrders": [
      { "on": "timer.stale-rig-sweep",   "run": "sweep-stale-rigs" },
      { "on": "timer.nightly-rollup",    "run": "laboratory-rollup" },
      { "on": "timer.instrument-scored", "run": "score-instruments" }
    ]
  }
}
```

Two sub-keys, both required. Schedules are the source; standing orders are the policy. A schedule with no standing orders is valid (fires events nobody handles — visible in `nsg clock list`). A standing order for a `timer.*` event with no matching schedule is a config error caught at startup.

**Schedule syntax.** Two forms — `{ "every": "<duration>" }` (parser accepts `30s`, `5m`, `1h`, `24h`) or `{ "cron": "<expr>" }` (standard 5-field cron). Only one per schedule.

**Catch-up policy: none.** If the daemon is down for an hour and a `5m` schedule missed 12 ticks, fire **once** on resume and update `next_due_at` to now + interval. No storm-on-restart.

**Event shape:**

```typescript
{
  name: "timer.stale-rig-sweep",
  payload: {
    schedule: "stale-rig-sweep",
    scheduledFor: "2026-04-10T14:25:00Z",
    firedAt:      "2026-04-10T14:25:03Z",
    drift_ms: 3000
  },
  emitter: "clockworks",
  firedAt: "2026-04-10T14:25:03Z"
}
```

`drift_ms` is free observability — lets us notice if the daemon is lagging.

**Handler contract (relays).** Adopt the forward-looking spec's `relay()` contract now, unchanged. Relays contributed by plugins via a new `relays` kit field; Clockworks collects them at startup (same pattern as Spider engines). Standing order's `run:` names the relay. **Not in MVP:** `summon` sugar, summon relay, anima dispatch via Clockworks. Relays are pure code handlers only.

**Persistence.** Two tables matching the forward-looking spec schema (so we don't rewrite later) — `events` and `event_dispatches` — plus one MVP-specific `clockworks_schedule_state` table. Reconciled at startup against the `guild.json` declaration (new schedules get `next_due_at` from now; removed schedules deleted; mutated schedules recomputed).

**Runner.** Six commands: `nsg clock list / tick / run / start / stop / status`. Daemon poll interval default 30s (coarse enough to be cheap, fine enough that a `5m` schedule never drifts by more than 30s). Core API: `clockStart`, `clockStop`, `clockStatus`, `clockTick`.

**Error handling.** If a relay throws, the dispatch row is marked `status: 'error'` with the error message; the event is still marked processed. **No `standing-order.failed` recursive handling in MVP** — surface failures via `nsg clock list --errors`.

### Explicitly NOT in MVP

- Framework events (`commission.sealed`, `mandate.ready`)
- Custom guild events (no `signal` tool)
- Book change events via Stacks `watch()` (Laboratory keeps direct subscription)
- Summon sugar / anima dispatch through Clockworks
- `standing-order.failed` recursive handling
- Delayed one-shots ("emit X in 15 minutes" — different data model)
- Catch-up / missed-run storms

Each is additive on top of the MVP without breaking anything.

### Initial use cases (justification)

1. **Stale rig sweep** (`every: 5m`) — detect rigs stuck in `active` with no session activity for > N minutes
2. **Instrument scoring cadence** (`cron: "0 */2 * * *"`) — run blind/aware/integration scoring on a schedule
3. **Commission log coherence check** (`every: 1h`) — flag commissions with null complexity or missing review dates
4. **Laboratory rollup** (`cron: "0 2 * * *"`) — nightly snapshot of pipeline health
5. **Sanctum draft GC** (`cron: "0 3 * * 0"`) — weekly sweep of `.scratch/`

If only one or two feel real, MVP is premature. Most feel real → on firm ground.

### Open questions for Sean

1. **Is timers the right first signal class?** Argument: CDC can't do it. Alternatives: webhooks, external process signals, operator intent (`nsg signal`).
2. **Handler flavor — relay only, or tools also nameable in MVP?** Lean: **relay only** (cleaner).
3. **Schedule declaration location.** Currently `guild.json`. Alternative: plugin-contributed schedules via kit field. Lean: **`guild.json`** for MVP, but plugin-contributed might matter sooner than expected for Laboratory.
4. **Default daemon interval — 30s.** Too coarse? Too fine?
5. **Does MVP include the daemon, or only manual tick?** A timer apparatus without a daemon is nearly useless. Lean: **daemon in MVP**.
6. **Stacks-backed or its own SQLite?** Stacks gives books / CDC for free; own DB gives isolation. Lean: **Stacks** (consistent with every other apparatus).
7. **Naming.** Is "Clockworks" still right, or should MVP pick something narrower (e.g., "Metronome") until it grows beyond timers? Lean: **keep Clockworks** — matches forward-looking spec.

## References

- Source doc: `.scratch/clockworks-mvp-brief.md`
- Forward-looking spec: `/workspace/nexus/docs/architecture/clockworks.md`
- Target spec home (if approved): `/workspace/nexus/docs/architecture/apparatus/clockworks.md`
- Cross-link: T8 (unify-capability-registries) — relays stay in Clockworks per that quest's proposed split
- Pattern reference: Spider engine kit-contribution pattern, Astrolabe kit wiring

## Notes

- 2026-04-10: opened from .scratch import as a standalone root quest (no children — the brief is internally complete; sub-questions live as the seven open questions in Context).