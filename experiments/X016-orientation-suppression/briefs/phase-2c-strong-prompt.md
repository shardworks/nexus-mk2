# Continuing: Periodic tick for the Reckoner

**Begin work immediately. Do not summarize the task before starting.
Make your first turn a code change, not orientation. Trust the prior
session's work — do not re-validate prior commits before producing
new output.**

## Situation

You are continuing implementation work begun in a prior session. The
prior session delivered the Reckoner core source migration to the new
periodic-tick model and committed it as a single checkpoint
(`feat(reckoner): periodic tick replaces the CDC handler — partial`).

The reckoner package builds clean at this checkpoint and its primary
test surface (`reckoner-tick.test.ts`, 13 tests) passes. **Cascade
tests in adjacent files and the documentation are not yet updated**
— they still reflect the pre-tick CDC model and are red against the
new code.

Your job is to complete the cascades.

## What the prior session committed

- `packages/plugins/reckoner/src/types.ts` — `ReckoningDeferReason`
  extended with `dependency_pending` and `dependency_failed`.
- `packages/plugins/reckoner/src/tick.ts` — **new file**. The
  `runTick()` handler, the `reckoner.tick` relay contribution, and
  the `@every 60s` standing-order contribution. ~700 lines.
- `packages/plugins/reckoner/src/reckoner.ts` — refactored. CDC
  observer (`handleWritsChange`), per-writ-update path (`considerWrit`
  entry, `runScheduler` per-call shape), and `runCatchUpScan` startup
  pass all removed. The apparatus now declares
  `recommends: ['clockworks']` and exposes `runTick(event?)` as the
  test-hook entry point.
- `packages/plugins/reckoner/src/reckoner-cdc.test.ts` — **deleted**
  (945 lines). The CDC test surface is obsolete.
- `packages/plugins/reckoner/src/reckoner-tick.test.ts` — **new
  file** (742 lines). The replacement test surface for the tick model.
  13 tests, all passing.
- `packages/plugins/reckoner/src/reckoner.test.ts` — small fixture
  tweak to align with the new shape.
- `packages/plugins/reckoner/package.json` and `pnpm-lock.yaml` —
  added `@shardworks/clockworks-apparatus` dependency.

## What remains

The following files still reflect the pre-tick CDC model and need to
be updated. They are independent of one another — pick any order.

### Reckoner-internal test cascades

- `packages/plugins/reckoner/src/reckoner-scheduler.test.ts` —
  `runScheduler` signature changed; test fixtures need to drive
  `runTick(event?)` instead of the per-writ-update path. Reckonings
  row writes are now batched per tick, not per CDC update.
- `packages/plugins/reckoner/src/reckoner-depends-on.test.ts` —
  same: switch from CDC-update-driven harness to tick-driven harness.
- `packages/plugins/reckoner/src/integration.test.ts` — end-to-end
  fixture (Stacks + Clerk + Reckoner). Update to drive tick fires
  rather than CDC observer triggers.

### Vision-keeper cascade (collateral)

- `packages/plugins/vision-keeper/src/integration.test.ts` —
  vision-keeper's tests assumed Reckoner's CDC handler would
  auto-accept their petitions on creation. With CDC gone they need
  to drive a tick fire to get acceptance.
- `packages/plugins/vision-keeper/src/vision-keeper.test.ts` —
  same dependency on CDC auto-ack.

### Documentation cascade

The four documentation files still describe the CDC model and the
"absence of a row is a defer signal" guidance, both of which the
new tick model contradicts. Reconcile each end-to-end:

- `docs/architecture/apparatus/reckoner.md` — primary spec doc.
  Update §"What the Reckoner does NOT do (in v0)" (CDC was the v0
  model) and §"Outcome mapping" (defer rows are now emitted).
- `docs/architecture/petitioner-registration.md` — §"Reckoner
  behavior" names the three outcomes; update the Defer bullet for
  the new dependency-aware defers and the per-tick cadence.
- `docs/architecture/reckonings-book.md` — defer-reasons enum
  gains `dependency_pending` and `dependency_failed`; the
  "deferUntil and deferSignal" guidance needs a carve-out for
  dependency-defer rows.
- `packages/plugins/reckoner/README.md` — high-level apparatus
  prose; update for the tick model.

### Verification at completion

- `pnpm --filter @shardworks/reckoner-apparatus test` must pass.
- `pnpm --filter @shardworks/vision-keeper-apparatus test` must pass.
- `grep -rn "CDC handler\|runCatchUpScan\|considerWrit" docs/` must
  return zero hits in the four docs above (any surviving CDC
  references signal incomplete cascade).

---

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
4. Compose the `SchedulerInput` from the candidate set + petitioner
   metadata + the running tick id.
5. Call `scheduler.evaluate(input)`. The returned decisions are an
   array of `{ writId, outcome, reason? }`.
6. For each decision, in input order: apply the outcome via the same
   transition path the CDC handler used, write a Reckonings row, and
   continue. Per-decision failure is logged and does not abort the
   tick — the next decision still runs.

The tick handler runs synchronously from the relay's `run()` callback;
do not introduce async fan-out. A single tick can take seconds; that
is acceptable.

Source: c-moiw5wkv (D-3, D-7).

### Defer outcomes always emit a Reckonings row

Every consideration outcome — accept, defer, decline — emits a row.
The pre-tick model treated `defer` as "absence of a row is the signal."
That model is wrong for tick-driven evaluation: without a defer row,
operators can't see why a petition is sitting and cannot diagnose
deferral cycles.

The defer row carries:
- `outcome: 'deferred'`
- `deferReason` from the scheduler's decision reason (`'priority' |
  'queue_depth' | 'time_hold' | 'patron_policy' | 'other'` for
  scheduler-emitted defers; `'dependency_pending' | 'dependency_failed'`
  for dependency-aware defers in a parallel commission).
- `deferNote: <reason string>` (free-form, from the decision).
- `deferCount`, `firstDeferredAt`, `lastDeferredAt`: running counters
  derived from prior deferred rows for the same `writId`.
- `deferUntil` and `deferSignal`: optional, populated when the
  decision carries them (scheduler-driven defers only — the
  dependency-aware defer rows in the parallel commission populate
  neither, per the polling-only stance).

Source: c-modaqnpt, c-mod9a54n.

### Pre-seal tick fail-loud

A tick that fires before the scheduler-registry seal (`activeScheduler`
unresolved) MUST fail loud:

```
[reckoner] tick: activeScheduler not resolved — scheduler registry
            not yet sealed. Cannot evaluate this tick.
```

Production wiring guarantees the seal happens before any tick fires
(both happen during apparatus boot, with the seal first). The fail-
loud is a tripwire for test-fixtures that boot Reckoner outside the
normal sequence and a guard against any future refactor that breaks
the ordering invariant.

### Test surface — replace, don't extend

The CDC test surface (`reckoner-cdc.test.ts`) goes away. Replace with
`reckoner-tick.test.ts` driving `runTick(event?)` directly. The test-
only `ReckonerTestHooks.handleWritsChange` and `runCatchUpScan` entries
are replaced with `runTick`. Existing scheduler-aware tests
(`reckoner-scheduler.test.ts`) and the integration test get fixture
updates to drive tick fires rather than CDC update events.

Documentation gains a new sub-section in
`docs/architecture/apparatus/reckoner.md` describing the tick model,
the `@every 60s` cadence, and the always-emit-row policy.

### Soft-recommend Clockworks

Reckoner declares `recommends: ['clockworks']`. The Reckoner still
boots without Clockworks installed — the relay simply never fires.
The standing order is kit-contributed; Clockworks loads it only when
present. This preserves Reckoner-without-Clockworks as a valid
configuration (the registry-only mode) while making the tick the
canonical evaluation path when Clockworks is installed.

Source: c-moiw5wkv (D-2).

## Verification

- `pnpm --filter @shardworks/reckoner-apparatus test` — full reckoner
  test suite passes.
- `pnpm --filter @shardworks/vision-keeper-apparatus test` — vision-
  keeper tests pass (they consume the Reckoner; the CDC removal is a
  cascade fix, not an API break).
- `pnpm --filter @shardworks/reckoner-apparatus typecheck` — no
  errors.
- `grep -rn "CDC handler\|runCatchUpScan" packages/plugins/reckoner/src
  packages/plugins/vision-keeper/src docs/architecture/apparatus/
  docs/architecture/petitioner-registration.md
  docs/architecture/reckonings-book.md
  packages/plugins/reckoner/README.md` returns zero hits.

## References

- **Brief writ**: this writ.
- **Sibling open mandate**: w-moiyh0jz (dependency-aware consideration
  gate) — in flight in parallel; that commission's deferred-dependent
  wakeup model relies on this tick existing.
- **Concluded design click**: c-moiw5wkv — the design analysis (D-2,
  D-5, D-6, D-7).
- **c-moixb74x** — parked future-improvement: operator-configurable tick
  cadence.
- **c-moisx6fx** — scheduler kit-contribution registry (this commission
  depends on the registry brief).
