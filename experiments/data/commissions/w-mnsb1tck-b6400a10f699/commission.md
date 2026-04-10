# Daemon end-to-end integration tests for `nsg start`/`nsg stop`

## Why this brief exists

The `nsg start`/`nsg stop` daemon mode landed with unit-level test coverage that was strong in isolation but missed the cross-apparatus state machines that govern real guild operation. On the patron's first real run of the daemon, three regressions shipped that no unit test caught:

1. **`spider.ts:tryCollect` treated `'pending'` SessionDocs as terminal.** The pre-write pending state crossed an apparatus boundary (claude-code wrote it, spider read it) without spider knowing about the new state. Every animator unit test passed; every spider unit test passed. The bug only manifested when both packages ran in the same process against a real sessions book, and the symptom was "rigs finish in 6ms with zero work performed."
2. **`resolveBabysitterPath()` returned `babysitter.js`** even in source mode (`.ts`), so the babysitter died with `MODULE_NOT_FOUND` immediately. No unit test exercised the actual spawn from a source-mode daemon.
3. **Spawn used bare `node` argv** without forwarding `--experimental-transform-types`, so even with the right path the `.ts` babysitter wouldn't load.

All three would have been caught by a single end-to-end test that boots the daemon in foreground from source mode, posts a real commission, and asserts that the rig actually advances past pending. The boundary between "pending SessionDoc" and "spider collect" is exactly the kind of cross-cutting state that unit tests miss and integration tests catch.

## What needs to happen (planning scope)

Design an integration test suite that exercises the full launch → execute → collect cycle for the daemon. The plan should answer:

1. **Fixture strategy.** What's the smallest test guild that's still faithful to production? Three approaches in tension:
   - **Workspace fixture guild** — `mkdtemp` + copy fixture + `pnpm install` + spawn real `nsg start`. Highest fidelity, slowest, most fragile to package version drift.
   - **In-process foreground boot with stub apparatuses** — call `startForeground()` directly against a tmp dir whose `guild.json` references only the minimum apparatuses. Fast, no install, but less faithful (no real spawn / re-exec) and would require refactoring `startForeground()` to take an injectable shutdown trigger so tests don't have to send real SIGTERM.
   - **Hybrid** — in-process for the daemon-loop wiring (authorize closure, tool server reachable, graceful shutdown), plus a tiny smoke test that just verifies `node cli.ts start --foreground --guild-root <empty-dir>` exits with the right error. Splits the spawn layer from the loop layer.
2. **Coverage scope.** Which scenarios are in the first cut, and which are explicitly deferred? Candidate scenarios, in priority order:
   - **a. End-to-end happy path:** `nsg start` → tool server reachable at `/api/tools/list` → `nsg stop` → tool server unreachable → no stale processes → pidfile cleaned up.
   - **b. Stale-pidfile cleanup → spawn:** stale pid in the file, `nsg start` removes it and the new daemon comes up.
   - **c. Already-running idempotency under real spawn:** start daemon, run `nsg start` again, verify it prints "already running" and exits 0 without disturbing anything.
   - **d. Foreground daemon loop authorize closure:** boot foreground, verify the Tool HTTP Server uses the Stacks-backed authorize closure (a tool call with a valid `X-Session-Id` matching a doc with that tool in `authorizedTools` returns 200; without it returns 401/403).
   - **e. Pending → running → completed cross-apparatus state machine:** post a real commission, assert that within N seconds the SessionDoc transitions through pending → running → terminal AND the spider's tryCollect picks it up (this is the canonical regression catch — it would have caught the `pending` bug from the patron's first run).
   - **f. In-flight tool call during shutdown:** mock an in-flight HTTP request to the tool server, send SIGTERM, verify the response completes without crashing mid-response.
   - **g. Detached anima session survival:** spawn a fake babysitter (a node script that sleeps for 10s and writes a marker), call `nsg stop`, verify the babysitter is still alive after the daemon exits.
3. **Refactors required.** What needs to change in the production code to make it testable? At minimum, `startForeground()` likely needs an optional `{ stopSignal: AbortSignal }` parameter to allow graceful shutdown without real signals. Are there other seams that need to be opened up?
4. **Dependencies on other in-flight work.**
   - The **oculus stop hook** TODO (separate brief in flight) would let scenario (a) and (f) verify graceful oculus shutdown too. Plan for it as a soft dependency: tests should not block on it, but should be designed so the oculus assertions can be added once the hook lands.
5. **Treat as the canonical example for cross-apparatus testing.** Any new SessionDoc state, any new writ status, any new apparatus boundary should plug into this fixture going forward. The plan should describe the *pattern*, not just this one suite.

## Files likely affected

- New: `packages/framework/cli/src/commands/start.integration.test.ts` (or similar)
- Refactor: `packages/framework/cli/src/commands/start.ts` — `startForeground({ stopSignal? })`
- Possibly: helper to scaffold a minimal test guild, possibly extracted from `packages/framework/cli/src/commands/test-helpers.ts`

## Recommendation from the patron's side

The current leaning is **Option C (hybrid)**: cover items a, d, e, c with the in-process approach as the first cut; defer b, f, g to a follow-up. But this is a brief, not a mandate — if the planning surfaces a better approach, take it.