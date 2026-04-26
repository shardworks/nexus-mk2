# Restore green clockworks tests

## Intent

Several tests in `@shardworks/clockworks-apparatus` have been failing on `main` for an unknown duration, hidden behind upstream build regressions that were just resolved. Get them back to passing so the `pnpm test` step in CI can go green.

## Motivation

CI was red for ~36 hours on two layered build regressions (`b98151f` WritPhase widening + `91d7eda` missing `better-sqlite3`). Now that both fixes have landed and the build is green, CI is reaching `pnpm test` for the first time in days and revealing pre-existing test failures. Verified on a clean stash on 2026-04-26 — these are not caused by either of the recent fixes; they have simply been hidden behind them. With the build now green, these are the last barrier between the pipeline and full green.

## Known failures (from CI log on commit f0e690c)

The failures cluster in two test files:

**Dispatcher / processEvents integration:**
- happy path: emit, processEvents, dispatch row + processed flag round-trip
- failure path: a throwing relay records an error row and still flips processed
- returns zero counts on an empty queue and writes nothing
- throws aggregated when any standing order in guild.json is malformed
- end-to-end SOF emit + loop-guard cycle through the apparatus surface
- (suite-level) "Clockworks — processEvents integration"

**Writ-lifecycle integration:**
- posting a root mandate fires `mandate.ready`, `commission.posted`, `commission.state.changed`
- drives a root mandate through `stuck → open → completed` and observes the full sequence
- a child non-mandate writ fires `{type}.ready` but NOT `commission.*` events

## One known clue

The `stuck → open → completed` test fails with:

> Cannot transition writ "w-..." from "new" to "stuck": legal transitions from "new" are "open", "cancelled"

This suggests the writ state machine has tightened initial-phase transitions and the fixtures still try the now-illegal `new → stuck` shortcut. Whether the same root cause applies to the `processEvents` failures is unknown — investigate.

## Out of scope

- Don't extend the clockworks test surface or refactor the test harness.
- Don't touch `writ-lifecycle-observer.test.ts` — those 13 unit tests already pass.
- Don't redesign anything. Goal is restore-to-green, not improvement.

## References

- Click `c-mof6dpzr` — meta-investigation into why the review step did not catch the upstream build breaks (these failures are layer 3 in that stack).
- Recent landings: `42b6369` (clockworks WritPhase fix), `f0e690c` (animator shim deletion).