# Periodic tick for the Reckoner

## Intent

Switch the Reckoner from CDC-driven per-writ-update evaluation to a
periodic tick. Add a `reckoner.tick` relay handler that, on each fire,
queries all currently-held petitions, runs them as a batch through the
configured scheduler, and applies the resulting decisions. Kit-contribute
a standing order with `schedule: '@every 60s'` targeting the relay.
Remove the existing CDC handler on `clerk/writs`, the `runCatchUpScan`
startup pass, and the per-writ-update entry into `considerWrit`.

## Motivation

Today's Reckoner is reactive: a CDC handler on `clerk/writs` runs the
per-action consider-flow on every writ update, plus a startup catch-up
scan picks up pre-existing held petitions. This works for a single-writ
stub like always-approve, but the design intent (per c-mod99ris and
c-moisx6fx) is for schedulers to weigh the whole candidate set against
priorities and capacity — a global view the per-writ path can't offer.
The tick gives the scheduler that global view, and unifies pre-existing
held writs with new ones into a single evaluation path.

For the always-approve v0 default, the visible change is a latency
shift: a held petition now waits up to one tick interval (60s) before
approval, instead of being approved on its CDC update. The trade is
acceptable because the next scheduler — priority-walk and beyond —
depends on the global-view path being the canonical one.

## Non-negotiable decisions

### Schedule — hard-coded `@every 60s` in the kit contribution

The Reckoner's kit contribution declares `schedule: '@every 60s'` as
a fixed value. No `reckoner.tickSchedule` config knob in this
commission. Operators wanting different cadence wait until a real need
surfaces (parked future work).

Source: c-moiw5wkv (D-5).

### Tick replaces CDC entirely — single evaluation path

The CDC handler on `clerk/writs`, the `runCatchUpScan` startup pass,
and any per-writ-update entry into `considerWrit` are removed. The tick
is the only path that drives scheduler evaluation. New petitions wait
up to 60s before first evaluation; pre-existing held petitions get
evaluated on the first tick after apparatus start.

`considerWrit` either becomes the per-writ branch invoked from the
tick loop or its logic folds into the tick handler directly —
implementer's call.

Source: c-moiw5wkv (D-7).

### Tick handler — fixed sequence per fire

On each fire of the `reckoner.tick` relay:

1. Resolve the active scheduler from the registry (cached at start by
   the scheduler-registry commission).
2. Re-read `reckoner.schedulerConfig` from `guild.json`. Validate via
   the resolved scheduler's `validateConfig` if present. Throw → log
   fail-loud, skip this tick.
3. Query candidates: held petitions are writs in their initial-equivalent
   phase carrying `ext.reckoner`. Use the same query shape today's
   `runCatchUpScan` uses (find-by-phase, then filter to those with
   `ext.reckoner`).
4. Apply the existing source-validation gate (`isSourceRegistered` against
   `enforceRegistration`) and disabled-source filter (`isSourceDisabled`).
   Writs failing those gates produce a Reckonings decline row and skip
   the scheduler call.
5. Build `SchedulerInput { candidates, capacity, now, config }`.
   `capacity` is the v0 stub from the registry commission. `now` is
   `new Date()`.
6. Call `scheduler.evaluate(input)`. Apply each returned `SchedulerDecision`:
   - `approve` → `clerk.transition` to the writ's active target phase
     (reuse the existing `resolveActiveTargetPhase` helper).
   - `decline` → `clerk.transition` to the writ's cancelled target phase.
   - `defer` → no transition; outcome recorded as a Reckonings row only.
7. Append one Reckonings row per writ considered, mirroring the existing
   per-action shape.

The Reckoner's existing per-action idempotency check (`writId` plus
the writ's current `updatedAt` as the dedupe key) carries forward — a
writ already processed at its current `updatedAt` is a no-op for the
tick. This keeps repeated ticks against unchanged writs from emitting
duplicate Reckonings rows.

Source: c-moiw5wkv (D-6, D-7), c-moisx6fx (per-call config flow).

### Standing order — kit-contributed via the new substrate

The Reckoner's kit contribution gains a standing-order entry alongside
its existing `relays` / `events` contributions:

    { schedule: '@every 60s', run: 'reckoner.tick' }

No `id` field (per the additive-merge model from the Clockworks
kit-contributed standing-orders commission). Operators may append
additional standing orders in `guild.json` if they want them, but they
cannot override or disable this one in this commission.

Source: c-moiw5wkv (D-5); the additive-merge model from the Clockworks
kit-standing-orders commission.

### Behavioral cases that must hold

- A guild with no held petitions ticks every 60s and writes nothing —
  no Reckonings rows, no errors. The empty-candidate path is exercised.
- Pre-existing held petitions at apparatus start are picked up on the
  first tick after start, not at start itself. No catch-up scan runs.
- A scheduler that throws inside `evaluate` does not corrupt apparatus
  state — the tick is skipped, no rows are written, the apparatus stays
  up.
- A held petition whose source becomes disabled mid-flight gets a
  decline row on the next tick (the disabled-source gate runs every
  tick, not just at petition time).
- Repeated ticks against the same writ at the same `updatedAt` are
  idempotent — no duplicate Reckonings rows.

## Out of scope

- **Operator-configurable tick cadence.** Hard-coded `@every 60s` for
  this commission; future enhancement parked.
- **Tick disable / pause mechanism.** No way to suspend the tick from
  operator config in this commission.
- **Capacity-aware scheduling.** `CapacitySnapshot` remains a stub from
  the registry commission; capacity-tracking lands when a capacity-aware
  scheduler does.
- **Multi-scheduler dispatch within a tick.** One active scheduler per
  Reckoner instance.
- **Pulse / framework-event emissions on tick.** The auto-wired Clockworks
  book events on `reckoner/reckonings` continue to fire as today; no new
  framework events from this commission.

## References

- **c-mod99ris** — Reckoner design parent.
- **c-moiw5lvp** — umbrella click (tick-registration via Option B).
- **c-moiw5wkv** — design click for this commission (locked decisions
  D-5, D-6, D-7).
- **c-moixb74x** — parked future-improvement: operator-configurable tick
  cadence.
- **c-moisx6fx** — scheduler kit-contribution registry (this commission
  depends on the registry brief).