# Observations — Cancellable Animator Sessions

## Doc/Code Discrepancies

1. **`summon` tool `callableBy` mismatch.** The `docs/architecture/apparatus/animator.md` says the summon tool has `callableBy: 'cli'` but the code has `callableBy: 'patron'`. The code is correct — `'cli'` is not a valid `ToolCaller` value (the valid values are `'patron'`, `'anima'`, `'library'`). The doc should be updated.

2. **`session-list` status enum is manually maintained.** The status parameter uses `z.enum(['running', 'completed', 'failed', 'timeout'])` — a hardcoded list. This will need updating for every new status. Consider deriving from a shared constant, though this is a minor DX concern, not a bug.

## Refactoring Opportunities Skipped

3. **Provider launch() return type is ad-hoc.** The return type `{ chunks, result }` is an inline object literal, not a named interface. Adding `processInfo` makes it a 3-field return. This should arguably be a named interface (e.g. `LaunchHandle`) for readability and documentation, but introducing a new type is scope expansion.

4. **Claude-code spawn functions are duplicated.** `spawnClaudeStreamJson` and `spawnClaudeStreamingJson` share ~70% of their code (spawn, stdin pipe, NDJSON parsing, close handler). The streaming variant adds chunk queuing. These could be unified into a single function with a streaming flag. Not in scope — the duplication is manageable.

5. **No graceful shutdown path for the animator.** When the parent process (nsg) exits, running sessions are orphaned. The `activeSessions` map is lost. There's no cleanup hook that sends SIGTERM to running sessions on parent exit. This is orthogonal to cancel-on-demand but worth noting.

## Risks in Adjacent Code

6. **PID reuse window.** Between reading the PID from the SessionDoc and sending SIGTERM, the original process may have died and the OS may have reassigned the PID to an unrelated process. On Linux, PID reuse wraps at `pid_max` (default 32768, max 4194304). The risk is low for short-lived guilds but non-zero for long-running daemon-style deployments. A future enhancement could use `pidfd_open()` (Linux 5.3+) for race-free PID lifecycle management.

7. **recordRunning uses put(), not patch().** The initial session record is written with `sessions.put({ id, status: 'running', ... })`. If cancel() patches the doc to 'cancelled' during the gap between `launch()` and `recordRunning()`, the `put()` in `recordRunning()` would overwrite the entire doc back to 'running'. This is a very narrow race (the processInfo promise hasn't even resolved yet at that point), but the fix is straightforward: use `patch()` in recordRunning or check the current status before writing. The spec should address this.

8. **The `buildResult` function in claude-code maps non-zero exit to 'failed'.** When a process is killed by SIGTERM, the exit code is non-zero (typically 143 on Linux, null on macOS). The `buildResult` function returns `status: 'failed'` for any non-zero exit. The Animator's result handler overrides this to 'cancelled' when it detects cancellation — but only if the Stacks coordination works correctly (D12). Worth testing carefully.
