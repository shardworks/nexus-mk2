## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/detached-sessions-smoke-test.md`:

---

# Detached Sessions — Smoke Test Plan

**Prerequisite:** The integration fixes from the review (tool server boot, session registration, `session-running`/`session-record` whitelisting) must land first. This plan assumes those are in place.

The goal is to prove, with increasing confidence, that a detached session can run end-to-end and survive a guild restart mid-session.

## Test Environment

- **Throwaway guild** at `/tmp/detached-smoke-guild/` (or a dedicated scratch path).
- **Nothing important in it.** No real codexes, no writs we care about.
- **Disable the Spider** for most tests so we control session dispatch directly — use `nsg animate` or an equivalent low-level entry point. Only enable the Spider once the basics work.
- **Guild config**: `animator.detached = true`, `tools.serverPort = 7471` (or whatever the default is).

## Phase 1: Static Verification (No Runtime)

**Goal:** Catch dumb mistakes before any claude process is spawned.

1. `pnpm -r build` — everything compiles, no TS errors.
2. `pnpm -r test` — all new tests pass (babysitter, detached, session-lifecycle, tool-server).
3. `pnpm -r lint` — no new warnings.
4. Inspect the compiled `dist/babysitter.js` — confirm it exists at the path `resolveBabysitterPath()` expects.
5. `node packages/plugins/claude-code/dist/babysitter.js < /dev/null` — should error cleanly with "Empty config received on stdin", exit 1. Proves the entry point works.

**Pass criteria:** All five pass. If any fail, stop and fix before proceeding.

## Phase 2: Tool Server in Isolation

**Goal:** Prove the tool server boots, serves tools, and enforces session auth.

1. Start a minimal guild: `nsg start` (or whatever daemon entry point exists after the daemon brief lands).
2. Check the server is listening: `curl -s http://127.0.0.1:7471/api/tools/list` — should return a JSON list of tools.
3. Try an anima-only tool without a session ID: `curl -s -X POST http://127.0.0.1:7471/api/session/running -d '{}'` — expect **401 X-Session-Id header required**.
4. Register a fake session: `curl -s -X POST http://127.0.0.1:7471/sessions -H 'Content-Type: application/json' -d '{"sessionId": "test-1", "tools": ["session-running", "session-record"]}'` — expect **201** and the session back.
5. Call `session-running` with the fake session: `curl -s -X POST http://127.0.0.1:7471/api/session/running -H 'X-Session-Id: test-1' -H 'Content-Type: application/json' -d '{"sessionId": "test-1", "startedAt": "2026-04-10T00:00:00Z", "provider": "claude-code"}'` — expect **200** and the session written to the sessions book.
6. Verify CDC fires: `sqlite3 .nexus/nexus.db "SELECT id, json_extract(content, '\$.status') FROM books_animator_sessions WHERE id = 'test-1'"` — status should be `running`.
7. Deregister: `curl -s -X DELETE http://127.0.0.1:7471/sessions/test-1` — expect **200**.
8. Stop the guild: `nsg stop`. Verify the port is free (`lsof -i :7471` returns nothing).

**Pass criteria:** All 8 steps pass. If any fail, fix the tool server wiring before proceeding.

## Phase 3: Babysitter in Isolation

**Goal:** Prove the babysitter can spawn claude, stream transcripts, and report lifecycle events.

1. Start the guild (tool server + animator).
2. Write a config JSON to a file:
   ```json
   {
     "sessionId": "smoke-1",
     "guildToolUrl": "http://127.0.0.1:7471",
     "dbPath": "/tmp/detached-smoke-guild/.nexus/nexus.db",
     "claudeArgs": ["--setting-sources", "user", "--dangerously-skip-permissions", "--model", "sonnet"],
     "cwd": "/tmp/detached-smoke-guild",
     "env": {},
     "prompt": "Say hello world and exit.",
     "tools": [],
     "startedAt": "2026-04-10T00:00:00Z",
     "provider": "claude-code",
     "metadata": { "test": "smoke" }
   }
   ```
3. **Register the session** with the tool server first (POST /sessions with `tools: ["session-running", "session-record"]`).
4. Pipe the config to the babysitter: `cat config.json | node packages/plugins/claude-code/dist/babysitter.js`.
5. Watch stderr for progress.
6. In another terminal, tail the transcripts book: `watch -n1 "sqlite3 .nexus/nexus.db \"SELECT length(content) FROM books_animator_transcripts WHERE id='smoke-1'\""` — should see the transcript length grow in real time.
7. Wait for claude to exit.
8. Check the sessions book: `sqlite3 .nexus/nexus.db "SELECT json_extract(content, '\$.status'), json_extract(content, '\$.exitCode') FROM books_animator_sessions WHERE id='smoke-1'"` — should be `completed` and `0`.
9. Check the transcripts book for the full message sequence.
10. Check `.nexus/dlq/` is empty.

**Pass criteria:** Session runs to completion. Transcript is visible in SQLite while claude is still running. Final status is `completed`. No DLQ files.

## Phase 4: Guild Restart Mid-Session

**Goal:** The critical test — prove a session survives a guild restart.

1. Start the guild.
2. Register a session with the tool server (as in Phase 3).
3. Spawn a babysitter with a **long-running prompt**: "Write a detailed 2,000-word essay about the history of clockwork automata, citing specific inventors and dates. Then critique your own essay."
4. Wait ~30 seconds (enough for claude to be well underway, writing to the transcript book).
5. **Stop the guild**: `nsg stop`.
6. Verify:
   - Guild process is gone (`pgrep -f 'nsg start'` empty).
   - Babysitter process is still alive (`pgrep -f babysitter.js` returns a pid).
   - Claude process is still alive (`pgrep -f 'claude.*mcp-config.*nsg-babysitter'`).
   - Transcript book still being written (the transcript length in SQLite keeps growing — remember the babysitter writes directly, not through the guild).
7. **Let claude attempt a tool call while the guild is down.** If the prompt doesn't trigger one naturally, write a test prompt that explicitly asks claude to call a read-only tool (e.g., "list all writs via the writ-list tool"). Observe: babysitter stderr should show retry attempts.
8. **Start the guild back up**: `nsg start`.
9. Verify the in-flight tool call succeeds within the 60s retry window. Session continues.
10. Wait for claude to exit naturally.
11. Verify final status:
    - `sessions` book: status `completed`, exit code 0.
    - Transcript book has the full essay + critique.
    - No DLQ files.
    - Laboratory has observed the session start and end (check laboratory DB).

**Pass criteria:** Session survives the restart, tool calls resume after guild comes back, final state is consistent.

**Failure modes to watch for:**
- Babysitter dies when guild dies → detached spawn isn't actually detached.
- Tool calls fail permanently after retry exhaust → retry window too short, or `X-Session-Id` is dropped somewhere.
- Session state is lost after restart → session registry wasn't re-populated (the registry is in-memory, which is a problem — see follow-up below).
- Transcript book shows stale data → WAL concurrency issue.

## Phase 5: DLQ Path

**Goal:** Prove that if the guild is down *when the session ends*, the result is DLQ'd and processed on next guild boot.

1. Start guild, register session, spawn babysitter with a fast prompt ("Say hi and exit.").
2. **Immediately stop the guild** (before claude finishes, but close enough that claude will finish while guild is down).
3. Wait for claude to exit (check `pgrep`).
4. Verify:
   - `.nexus/dlq/smoke-dlq.json` exists.
   - File contents match the expected session-record payload.
   - Babysitter process has exited.
5. Start the guild back up.
6. Verify:
   - `[animator] DLQ drain: processed 1 of 1 pending session results` in logs.
   - `.nexus/dlq/` is empty.
   - Sessions book has the record.
7. No orphan recovery triggered for this session.

**Pass criteria:** DLQ'd session is recovered on next boot, no data loss.

## Phase 6: Orphan Recovery

**Goal:** Prove that a session whose babysitter died without reporting is marked as failed on guild restart.

1. Start guild, register session, spawn babysitter with a prompt that will take ~60s.
2. Let `session-running` fire (confirm sessions book has status `running` + a PID).
3. **Kill the babysitter hard**: `kill -9 $(pgrep -f babysitter.js)`. This takes claude down with it (via process group).
4. Verify the sessions book still shows `running` (no graceful report happened).
5. Restart the guild.
6. Verify:
   - `[animator] Orphan recovery: marked 1 dead sessions as failed` in logs.
   - Sessions book shows `failed` with error "Session process died unexpectedly (orphaned)".

**Pass criteria:** Orphaned session is cleaned up on restart.

## Phase 7: Real Session Through the Spider

**Goal:** Prove the full path — commission → writ → Spider → Loom → Animator → babysitter.

1. Start guild with Spider enabled.
2. Post a trivial commission: "Add a comment to README.md that says 'smoke test ran here'". Codex: a throwaway repo in the smoke-test guild.
3. Watch the Spider rig progress through draft → implement → review → seal.
4. Verify the implement session was run via the babysitter (check the process tree during execution).
5. Verify the seal lands a commit to the throwaway codex.
6. Restart the guild once during the implement phase and verify the rig still completes.

**Pass criteria:** Commission completes successfully, including a mid-run restart.

## Non-Goals (for this smoke test)

- Performance benchmarking (how many concurrent babysitters can one box handle?)
- Long-running sessions (>1 hour)
- Docker-hosted sessions
- Session cancellation via `nsg session cancel` across a restart
- Resume sessions (`--resume` chains across restart)

These are all valid follow-up tests once the basics work.

## Known Follow-Ups (not blockers for smoke test)

- **Session registry is in-memory.** A guild restart clears it, so any babysitter spawned before the restart has an unregistered session after restart. Its tool calls will start failing with 403 once the server comes back. **This is a real problem for Phase 4.** Mitigation: persist the session registry to Stacks, or re-populate on boot by scanning sessions with status `running`. Probably the latter — small, cheap, no schema churn.
- System prompt tmpDir leak (see review #5).
- 5s poll interval on `pollForTerminalStatus` (review #7).
- Bounded retry window (60s) may be too short for longer guild outages. Consider making it configurable.

---

## Summary

Work shipped via writ w-mns1y9da-140be98187cb. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/detached-sessions-smoke-test.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mns1y9da-140be98187cb.