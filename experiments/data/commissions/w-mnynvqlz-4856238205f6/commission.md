# Detached Sessions — Host Logging Independence

Fix a structural coupling between the session host (the `babysitter` process in the `claude-code` plugin) and the guild process that spawned it.

**The problem.** The babysitter is spawned with `stdio: ['pipe', 'ignore', 'inherit']`. The `'inherit'` on fd 2 means the babysitter's stderr is the guild's stderr fd, aliased into the child. When the guild restarts, that fd becomes dead; subsequent stderr writes from the babysitter can produce EPIPE and, depending on Node's signal/error handling at that moment, can crash the babysitter. This is a silent failure mode: the babysitter — the whole reason detached sessions are supposed to survive guild restarts — has its logging lifetime tied to the guild's fd lifetime.

**The fix.** The session host must open its own log sink as its first action, redirect its stderr writes to that sink, and then never consult the inherited fd 2 again. Nothing the guild does (including exit) can affect the host's ability to run or log.

One package touched: `packages/plugins/claude-code/`. One operational documentation update in the animator or claude-code README (wherever session-host operational guidance currently lives).

## Changes

### 1. Babysitter opens its own log sink as its very first action

In `packages/plugins/claude-code/src/babysitter.ts`, before any other initialization (before config parse, before MCP server start, before guild HTTP calls, before claude spawn), the babysitter must:

- Resolve a per-session log-file path. The path must be deterministic from the session id and guild home so that tooling can find it later. Recommended shape:

      <guildHome>/logs/sessions/<sessionId>.log

  where `<guildHome>` is the guild root that owns the session. If the directory does not exist, create it recursively.

- Open the file for append. Use `fs.openSync(logPath, 'a')` to get a file descriptor the babysitter fully owns.

- **Redirect the babysitter's own stderr to this fd.** The constraint is: after babysitter startup, no code path inside the babysitter may write to the fd 2 it inherited from its parent. The simplest portable approach is to replace `process.stderr.write` with a function that writes to the owned fd, installed early — before any import that could write to stderr on its own behalf. That way all downstream `console.error`, `process.stderr.write`, and internal Node diagnostic writes land in the owned file instead of the inherited fd.

- The inherited fd 2 is then no longer consulted by any code path in the babysitter. An EPIPE on the old fd has no effect because nothing writes to it anymore.

- Write a startup banner line to the new sink as the first thing after redirect: `[babysitter] session=<id> pid=<pid> pgid=<pgid> started at <iso>`. This confirms the redirect worked and gives operators a landmark when reading the log.

### 2. Spawn configuration changes

In `packages/plugins/claude-code/src/detached.ts`, the spawn that creates the babysitter currently uses `stdio: ['pipe', 'ignore', 'inherit']`. Change to `['pipe', 'ignore', 'ignore']`. The babysitter no longer needs stderr inheritance — it owns its own sink.

Note: `'pipe'` on stdin is still required because the guild delivers configuration via stdin JSON. Do not touch stdin handling.

### 3. `BabysitterConfig` gains a log directory field

`BabysitterConfig` currently lacks a log-sink path. Add:

- `logDir: string` — the directory under which the babysitter writes its per-session log file. Populated by `buildBabysitterConfig` from `<guildHome>/logs/sessions/`. The babysitter joins this with `<sessionId>.log` to get the final path.

Do **not** push the full resolved path in — keep the join logic inside the babysitter so that the sink-opening is the first thing the babysitter does and cannot be split across processes.

### 4. Operational documentation

Document the log location in the animator README (or the claude-code README, wherever session-host operational guidance currently lives):

- Location: `<guildHome>/logs/sessions/<sessionId>.log`
- Format: line-oriented, utf-8, one log record per line. No structured logging required in this commission — the existing `console.error` shape is sufficient.
- Lifetime: logs persist until explicitly removed. This commission does **not** add rotation, retention, or garbage-collection. Those are follow-up concerns and not required for the fix.
- Ownership: owned by the babysitter process. The guild reads these files (for post-hoc debugging) but does not write to them.

### 5. Tests

Testing the stderr redirect directly is painful because Node's `process.stderr` is global. Instead, test the two observable consequences:

- **Log file is created.** Spawn a test babysitter (the existing `babysitter.test.ts` harness already does this for other behaviours) with a custom `logDir`, let it start up, assert that `<logDir>/<sessionId>.log` exists and contains the startup banner.
- **Guild stderr is not touched after babysitter start.** Spawn the babysitter as a child, capture the parent's stderr with `stdio: ['pipe', 'pipe', 'pipe']`, let the babysitter log a few lines internally (by triggering a known code path), then assert that the parent's captured stderr does **not** contain those lines. This verifies the redirect is in effect.
- **Babysitter survives EPIPE on inherited fd.** Hardest to test in isolation; an acceptable proxy is a spawn-then-close-parent-stdin test that confirms the babysitter does not crash when its inherited fd 2 is closed. If this test is too flaky to write portably, document why and skip it — the primary guarantee is carried by the previous two tests.

## Out of scope

- **Log rotation, retention, or cleanup.** Logs grow without bound for this commission. A follow-up may add rotation; not here.
- **Structured logging / JSON log format.** The current logs are free-form text and that is sufficient. Restructuring them is a separate concern.
- **Dashboard or CLI integration for reading session logs.** Out of scope. The README gets a location pointer and that is enough for this commission.
- **Transcript store abstraction.** Completely separate concern. The transcript is not a log; the log is not a transcript. The babysitter's direct SQLite access for transcripts must not be touched here.
- **`session-running` handler idempotency, DLQ ordering tests, `callableBy` filter consolidation.** Tracked in a separate commission. This commission does not touch any of those code paths.
- **Monkey-patching alternatives.** If there is a cleaner way to redirect `process.stderr` to an owned fd (e.g., a Node API or a native helper), the implementer may use it, but the constraint is: after babysitter startup, no code path inside the babysitter may write to the fd 2 it inherited from its parent. The redirect must be complete.

## Constraints

- One package: `packages/plugins/claude-code/`. One README update on the animator or claude-code side if operational docs live there.
- No changes to the session lifecycle protocol, heartbeat protocol, or cancel-handle shape.
- `BabysitterConfig` gains one new field (`logDir`); existing consumers must continue to compile.
- `pnpm -w lint && pnpm -w test` must pass.
- The fd-2 redirect must be the **first** action the babysitter takes — before any import that could log to stderr on its own behalf. Concretely: the imports at the top of `babysitter.ts` cannot log to stderr during module init, or the redirect is defeated. Verify this by running the babysitter standalone and checking the log sink captured every line.

## Exit criteria

- A guild restart during an in-flight session does not produce EPIPE crashes in the babysitter. Before this change, the inherited fd 2 is the suspected silent-death vector; after this change, the inherited fd is not consulted post-startup.
- `<guildHome>/logs/sessions/<sessionId>.log` exists for every session and contains all babysitter-side logging for that session.
- Parent stderr does not contain any babysitter-side logging after the redirect.
- All new and existing tests pass.