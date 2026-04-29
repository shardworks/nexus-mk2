# Clockworks Retrofit Candidates

Analysis of earlier features and plugins that could be augmented or
rewritten more robustly now that Clockworks (event substrate +
time-driven schedules + plugin-contributed standing orders + relays)
has landed.

## What Clockworks Now Offers

- **Event substrate** — `ClockworksApi.emit` (trusted) and `signal`
  tool (validated, anima-callable).
- **Standing orders** — declarative `{on, run, with?}` or
  `{schedule, run, with?}` bindings, hot-editable from `guild.json`.
- **Time-driven schedules** — `@every Ns` and standard 5-field cron.
- **Plugin-contributed default standing orders** —
  `ClockworksKit.standingOrders` lets a plugin ship its own wiring
  out-of-the-box.
- **Plugin-contributed relays** — `ClockworksKit.relays` registers
  named handlers that standing orders dispatch to.
- **CDC bridge** — `clockworks-stacks-signals` auto-emits
  `book.<owner>.<book>.<created|updated|deleted>` for every Stacks
  mutation (with the `clockworks/events` carve-out).
- **Universal writ-status events** — `writ.<type>.<state>` fires on
  every writ phase transition (every type, every state, every
  registered transition).
- **Standing-order failure events** —
  `clockworks.standing-order.failed` with loop guard, so monitoring
  composes uniformly.
- **`summon-relay`** — stdlib bridge from event dispatch to anima
  session launch with mustache templating and per-writ circuit
  breaker.
- **Daemon** — long-running process drains the event queue and
  fires schedules without an operator at the keyboard.

## Tier A — Clean fit, real simplification

### 1. Spider's block-types are the strongest candidate

Three of the four built-ins poll on a fixed interval that the event
substrate now subsumes:

| Block type        | Today                                              | What clockworks now offers                                          |
|-------------------|----------------------------------------------------|---------------------------------------------------------------------|
| `writ-phase`      | polls every 10 s, reads `clerk/writs`              | `writ.<type>.<state>` emits exactly when phase changes              |
| `book-updated`    | polls every 10 s, reads target book                | `book.<owner>.<book>.<created\|updated>` emits per mutation         |
| `animator-paused` | polls every 10 s, reads `animator/state`           | `book.animator.state.updated` (via CDC bridge) emits on flips       |
| `scheduled-time`  | polls every 30 s, just compares timestamps         | could become a synthesized per-engine schedule entry (bigger lift)  |

The first three are nearly mechanical: register the block, subscribe
to the event, clear the hold inline. Wakeup latency drops from up to
10 s to one daemon tick, and the plugin stops hammering Stacks with
`find()` calls every interval. The polling fallback can stay as a
safety net at a much longer interval (60 s+).

This also retires the one motivation I see for the speculative
"rig-level clockworks events" inquiry (click `c-mo3ibj94`) being an
*additive* feature — the events already exist universally; it's the
consumer (Spider's gate evaluator) that hasn't picked them up yet.

### 2. Sentinel's per-writ pulses → standing orders

The Sentinel is a Phase-2 CDC observer on `clerk/writs` that filters
for "phase entered stuck" and "phase entered failed" on root mandates
and emits a Lattice pulse. That filter is exactly what the universal
writ-status events express:

```json
{ "on": "writ.mandate.stuck",  "run": "sentinel-stuck-pulse" }
{ "on": "writ.mandate.failed", "run": "sentinel-failed-pulse" }
```

…shipped as kit-contributed defaults. The `queue-drained` branch is
genuinely different (it joins writ-state with rig-state across the
whole queue), so leave that as a CDC observer. But two of three
trigger types move to declarative wiring, and the Sentinel becomes a
relay package rather than an apparatus that observes Stacks
directly.

The idempotency-via-pulse-existence trick still works — relays are
required to be idempotent anyway, and the existing `alreadyEmitted()`
predicate ports over unchanged.

### 3. The sanctum Laboratory → standing orders

Three CDC watchers (writs, sessions, links). Rewrite map:

| Today                                                         | New shape                                                                |
|---------------------------------------------------------------|--------------------------------------------------------------------------|
| `clerk/writs` create → write `commission.md` + log skeleton   | `on: writ.mandate.new` → `laboratory-init-commission` relay              |
| `clerk/writs` update → completed/failed → spawn instrument-review.sh | `on: writ.mandate.completed` (and `.failed`) → `laboratory-trigger-review` |
| `animator/sessions` update → write session record             | `on: animator.session.ended` → `laboratory-record-session` relay         |
| `clerk/links` create where type=fixes → mark revision-required | stays CDC — the link payload doesn't have its own event                 |

Three benefits: the same Clockworks daemon you already trust runs
the work unattended; a relay throw becomes a
`clockworks.standing-order.failed` event your monitoring already
understands; the per-handler dispatch row gives durable provenance
for every commission-log mutation that's currently invisible.

This also cleans up the "fire `bin/instrument-review.sh` as a
detached child process" pattern — a relay is the real abstraction
for "do this thing when an event fires," and `summon-relay` already
proves the pattern works for spawning work in response to events.

## Tier B — Worth doing, lower urgency

### 4. Vision-keeper decline-feedback relay → kit-contributed default

The Vision-keeper README has a "Wiring the decline-feedback relay"
section that instructs operators to paste a standing order into
`guild.json`. With kit-contributed standing orders now first-class,
the install experience becomes "just install the plugin."

### 5. Audit every plugin README for "please add this standing order" paragraphs

Each one is a candidate for the kit-contributed default treatment.
Quick grep to do this systematically. Likely candidates beyond
Vision-keeper: any plugin that emits an event today and documents how
to consume it in operator config.

## Tier C — Flag, don't pursue independently

### 6. Lattice's startup pending-scan and Clockworks's crash-window concern are the same problem

Click `c-mofxqp25` already tracks the Clockworks crash-window
question (primary tx commits but the Phase-2 watcher's `events.put`
doesn't run). Lattice has its own "rescue pending pulses across
restart" loop. If we ever build a generic "rescan for missed work"
primitive, both consumers could share it. Worth folding into that
existing inquiry rather than chasing as a separate thread.

## What stays as it is

- **Clerk's children-behavior-engine** — Phase 1 (in-transaction)
  cascade. Must run synchronously with the writ patch; events aren't
  appropriate.
- **Spider's writ-cancelled / rig-status cascades** — Phase 1
  cascades; same constraint.
- **Lattice's pulse dispatcher** — already lean; the watcher gives
  it tight control over `pending`-state filtering. Marginal benefit
  from migrating.
- **Reckoner's `@every 60s` tick** — already wired through Clockworks
  as a kit-contributed standing order. This is the reference
  implementation.
- **Animator's session-lifecycle emissions** — already routed through
  Clockworks (`animator.session.started`, `.ended`,
  `.record-failed`). Reference implementation.

## Leverage Ranking

1. **Spider block-types** — biggest cumulative effect (every blocked
   engine in the queue benefits, and the place new block types will
   multiply); rewrite is mechanical.
2. **Sanctum Laboratory** — modest LOC, but it's experiment-data
   plumbing and the new shape is materially more debuggable.
3. **Sentinel stuck/failed** — small, clean; makes the Sentinel a
   more honest plugin (less "framework observer," more "policy
   declaration").
4. **Kit-contributed default standing orders sweep** — broad-stroke
   ergonomics, cheap to do once a convention is picked.

## Suggested Starting Point

Spider block-types: hottest code path, clearest before/after, four
block-types form a tidy single-commission unit of work. None of the
other items depend on it; they can pipeline behind it or in
parallel.

## Notes on framing

None of the candidates are *broken* — they all work. The pitch is
that the new substrate offers a more declarative, more observable,
and more uniform way to express what they're already doing, and
reduces the "every plugin invents its own observer" surface area.
