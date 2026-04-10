# TODO — Daemon end-to-end integration tests

## Context

The `nsg start`/`nsg stop` daemon mode landed in nexus@e16cd02 with unit-level test coverage:

- **`stop.test.ts`** — exercises pidfile state machine and signal/poll/escalate against real spawned subprocesses (READY-marker handshake to avoid races). Covers SIGTERM happy path and SIGKILL escalation.
- **`start.test.ts`** — exercises tool metadata, no-guild error, and the live-PID idempotency check.

What's NOT covered, because it requires a real guild boot (Arbor + apparatuses + Stacks + tool server + Oculus + Spider):

1. **End-to-end happy path:** `nsg start` → tool server reachable at `/api/tools/list` → `nsg stop` → tool server unreachable → no stale processes → pidfile cleaned up.
2. **Stale-pidfile cleanup → spawn:** stale pid in the file, `nsg start` removes it and the new daemon comes up.
3. **In-flight tool call during shutdown:** mock an in-flight HTTP request to the tool server, send SIGTERM, verify the response completes (or at least doesn't crash mid-response).
4. **Detached anima session survival:** spawn a fake babysitter (a node script that sleeps for 10s and writes a marker), call `nsg stop`, verify the babysitter is still alive after the daemon exits.
5. **Foreground daemon loop:** boot foreground, verify Tool HTTP Server uses the Stacks-backed authorize closure (a tool call with a valid `X-Session-Id` matching a doc with that tool in `authorizedTools` returns 200; a tool call without it returns 401/403).
6. **Already-running idempotency under real spawn:** start daemon, run `nsg start` again, verify it prints "already running" and exits 0 without disturbing anything.

## Approach options

### Option A — Workspace fixture guild

Build a tiny test fixture: a directory with `guild.json` declaring stacks + tools + animator + claude-code (or a mock provider) + spider + oculus, plus a `package.json` that pins workspace versions of those packages. The integration test (`packages/framework/cli/src/integration/daemon.test.ts`) does:

1. `mkdtemp` → copy fixture
2. `pnpm install --filter ...` (or `npm link` to the workspace) — slow
3. `spawn(node, [cli.ts, 'start', '--guild-root', tmp])`
4. Poll the tool server, run assertions
5. `spawn(node, [cli.ts, 'stop', '--guild-root', tmp])`
6. Cleanup

**Pros:** highest fidelity. **Cons:** slow (npm install per test run, even cached); fragile (any package version drift breaks the fixture); large.

### Option B — In-process foreground boot with stub apparatuses

Build a synthetic guild via `createGuild()` against a tmp dir whose `guild.json` references only `stacks` and `tools` (the minimum the daemon needs). Skip oculus/spider — the daemon already handles them being absent gracefully. The test runs `startForeground()` directly (not via spawn), then makes HTTP calls to the running tool server, then sends SIGTERM via `process.kill(process.pid, 'SIGTERM')` and verifies the shutdown handler ran.

**Pros:** fast, no install. **Cons:** runs in the test process — SIGTERM-to-self is awkward (the test runner gets it); less faithful (no real spawn, no real --foreground re-exec). Would need to refactor `startForeground` to take an injectable shutdown trigger so we can call shutdown directly instead of via SIGTERM.

### Option C — Hybrid

Use Option B for the daemon-loop wiring (authorize closure, tool server reachable, graceful shutdown of tool server) and skip the spawn/re-exec layer entirely. Cover the spawn layer separately with a smaller smoke test that just verifies `node cli.ts start --foreground --guild-root <empty-dir>` exits with a clear error (no guild) — proving the re-exec path is wired up.

**Pros:** balances speed and coverage. **Cons:** still need the tool-server reachability bits.

## Recommendation

Start with **Option C**:

1. Refactor `startForeground()` to accept an optional `{ stopSignal: AbortSignal }` parameter, allowing tests to trigger graceful shutdown without sending real signals.
2. Build the smallest possible test guild: a tmp dir with `guild.json` declaring `@shardworks/stacks-apparatus` + `@shardworks/tools-apparatus` + `@shardworks/animator-apparatus`. Use the workspace's already-installed packages — no npm install needed if we run from inside the monorepo.
3. Cover items 1, 5, 6 from the list above. Defer items 2, 3, 4 to a follow-up.

Dependencies on other TODOs: none, but this would benefit from the **oculus stop hook** TODO landing first so test 3 can verify oculus shutdown too.

## Real-world bug that motivates this TODO

On Sean's first real run of the daemon (2026-04-10), three regressions
shipped because the unit tests didn't exercise the full launch → collect
cycle:

1. **`spider.ts:tryCollect` treated `'pending'` SessionDocs as terminal.**
   The pre-write pending state crossed an apparatus boundary (claude-code
   wrote it, spider read it) without spider knowing about the new state.
   Every animator unit test passed; every spider unit test passed. The
   bug only manifested when both packages ran in the same process against
   a real sessions book.

2. **`resolveBabysitterPath()` returned `babysitter.js`** even in source
   mode (`.ts`), so the babysitter died with MODULE_NOT_FOUND immediately.
   No unit test exercised the actual spawn from a source-mode daemon.

3. **Spawn used bare `node` argv** without forwarding
   `--experimental-transform-types`, so even with the right path the
   `.ts` babysitter wouldn't load.

All three would have been caught by a single end-to-end test that:

  a. Boots the daemon in foreground from source mode
  b. Posts a real commission
  c. Asserts that within N seconds either the rig advances past pending
     OR the session has actual transcript output OR (failing both) the
     test fails loudly

The integration test surface is where multi-apparatus state machines
get exercised. **The boundary between "pending SessionDoc" and "spider
collect" is exactly the kind of cross-cutting state that unit tests miss
and integration tests catch.** Treat this as the canonical example when
designing the integration test fixture: any new SessionDoc state must
be exercised end-to-end through the spider crawl loop.

## Files

- New: `/workspace/nexus/packages/framework/cli/src/commands/start.integration.test.ts` (or similar)
- Refactor: `/workspace/nexus/packages/framework/cli/src/commands/start.ts` — `startForeground({ stopSignal? })`
- Potentially: helper to scaffold a minimal test guild, possibly extracted from `packages/framework/cli/src/commands/test-helpers.ts`
