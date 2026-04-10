_Imported from `.scratch/todo/daemon-e2e-integration-tests.md` (2026-04-10)._

## Goal

Build end-to-end integration test coverage for the `nsg start`/`nsg stop` daemon mode. Unit tests cover the pidfile state machine and tool metadata in isolation, but the regressions that bit Sean's first real daemon run all lived at multi-apparatus boundaries that no unit test exercises. The integration test surface is where cross-cutting state machines get caught.

## Status

Parked. Daemon shipped (nexus@e16cd02) with unit-level coverage; integration coverage was deferred. Three regressions caught on first real run prove the gap matters.

## Next Steps

Implement Option C (hybrid). First refactor `startForeground()` to accept an optional `{ stopSignal: AbortSignal }` parameter so tests can trigger graceful shutdown without sending real signals. Then build the smallest possible test guild — a tmp dir with `guild.json` declaring `@shardworks/stacks-apparatus` + `@shardworks/tools-apparatus` + `@shardworks/animator-apparatus`, using already-installed workspace packages (no npm install). Cover items 1, 5, 6 from the gap list first; defer items 2, 3, 4. Ensure the test exercises the spider-collect / pending-SessionDoc boundary explicitly — that's the canonical multi-apparatus failure pattern.

## Context

**What's covered today** (unit-level only, in `start.test.ts` and `stop.test.ts`):

- Pidfile state machine via signal/poll/escalate against real spawned subprocesses
- Tool metadata, no-guild error, live-PID idempotency check

**What's NOT covered, because it requires a real guild boot:**

1. **End-to-end happy path:** `nsg start` → tool server reachable at `/api/tools/list` → `nsg stop` → tool server unreachable → no stale processes → pidfile cleaned up.
2. **Stale-pidfile cleanup → spawn:** stale pid in file, `nsg start` removes it and the new daemon comes up.
3. **In-flight tool call during shutdown:** mock an in-flight HTTP request, send SIGTERM, verify the response completes.
4. **Detached anima session survival:** spawn a fake babysitter, `nsg stop`, verify the babysitter is still alive after the daemon exits.
5. **Foreground daemon loop:** boot foreground, verify Tool HTTP Server uses the Stacks-backed authorize closure (valid `X-Session-Id` → 200; missing → 401/403).
6. **Already-running idempotency under real spawn:** start daemon, run `nsg start` again, verify "already running" exit code 0 with no disturbance.

**Approach options:**

- **A. Workspace fixture guild.** Tmp dir with full `guild.json` + `package.json`, real `pnpm install` per test run. Highest fidelity, slowest, most fragile.
- **B. In-process foreground boot with stub apparatuses.** `createGuild()` against minimal `guild.json` (stacks + tools only); call `startForeground()` directly; SIGTERM-to-self via `process.kill(process.pid, ...)`. Fast, but SIGTERM-to-self is awkward and doesn't exercise the spawn/re-exec layer.
- **C. Hybrid.** Option B for daemon-loop wiring (authorize closure, tool server reachability, graceful shutdown), plus a separate smaller smoke test for the spawn/re-exec layer (`node cli.ts start --foreground --guild-root <empty-dir>` exits cleanly with "no guild" error).

**Recommendation: Option C.** Refactor `startForeground()` for injectable shutdown trigger. Build the minimal test guild from already-installed workspace packages. Cover items 1, 5, 6 first.

## The bug class this catches

Sean's first real daemon run (2026-04-10) shipped three regressions because unit tests don't exercise the full launch → collect cycle:

1. **`spider.ts:tryCollect` treated `'pending'` SessionDocs as terminal.** The pre-write pending state crossed an apparatus boundary (claude-code wrote it, spider read it) without spider knowing about the new state. Every animator unit test passed; every spider unit test passed. Bug only manifested when both packages ran in the same process against a real sessions book.
2. **`resolveBabysitterPath()` returned `babysitter.js`** even in source mode (`.ts`), so the babysitter died with `MODULE_NOT_FOUND` immediately. No unit test exercised the actual spawn from a source-mode daemon.
3. **Spawn used bare `node` argv** without forwarding `--experimental-transform-types`, so even with the right path the `.ts` babysitter wouldn't load.

All three would have been caught by a single end-to-end test that boots the daemon in foreground from source mode, posts a real commission, and asserts that within N seconds either the rig advances past pending, or the session has actual transcript output, or the test fails loudly.

**The boundary between "pending SessionDoc" and "spider collect" is exactly the kind of cross-cutting state that unit tests miss and integration tests catch.** Treat as the canonical example: any new SessionDoc state must be exercised end-to-end through the spider crawl loop.

**Children:**

- T5.1 — race-safe pending session recovery in animator startup
- T5.2 — session directory isolation (the contamination incident; container vs flag-hardening tradeoff)
- ~~oculus stop hook~~ — already shipped (verified `async stop()` in `oculus.ts:605`)

## References

- Source doc: `.scratch/todo/daemon-e2e-integration-tests.md`
- Daemon mode landed: nexus@e16cd02
- Files to create/modify:
  - New: `/workspace/nexus/packages/framework/cli/src/commands/start.integration.test.ts`
  - Refactor: `/workspace/nexus/packages/framework/cli/src/commands/start.ts` — `startForeground({ stopSignal? })`
  - Helper: extract minimal-test-guild scaffolding into `packages/framework/cli/src/commands/test-helpers.ts`
- Existing unit tests: `start.test.ts`, `stop.test.ts`
- Verified shipped: oculus stop hook — `/workspace/nexus/packages/plugins/oculus/src/oculus.ts:605`

## Notes

- Dependency: would have benefited from the oculus stop hook landing first; that's now done.
- 2026-04-10: opened from .scratch import as the umbrella for T5 (daemon hardening).