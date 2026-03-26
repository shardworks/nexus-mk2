# Spec: Orphaned Writ Recovery (Option A)

## Problem

The summon-engine is a synchronous blocking handler inside the daemon's event loop. It owns the full session lifecycle:

```
daemon tick → summon-engine → activateWrit → launchSession (blocks 30+ min) → interruptWrit?
```

The post-session cleanup (lines 153–158 of `summon.ts`) only runs if the engine handler completes normally. If the daemon process dies, is killed, or crashes while a session is running, writs are left in `active` status permanently. There is no recovery mechanism.

This is the root cause of the "stale writ" operational incidents observed in recent sessions.

---

## Scope

This spec covers **Option A: Startup Recovery** — a targeted fix that scans for orphaned writs at daemon startup and recovers them without changing the dispatch model.

Out of scope: queue-based dispatch, long-lived sessions, concurrency improvements.

---

## Orphaned Writ Classification

A writ in `active` status is potentially orphaned after a daemon crash. Three sub-cases:

### Case 1: Writ `active`, session `ended_at IS NOT NULL`
The session completed normally (the session funnel has strong try/finally guarantees — `ended_at` always gets written). The daemon died between `launchSession` returning and summon-engine's post-session `interruptWrit` call.

**Recovery action: `interruptWrit` → fires `<type>.ready` for re-dispatch.**

This is the highest-confidence case. The session is definitively over.

### Case 2: Writ `active`, session `ended_at IS NULL`
The session row exists but was never closed. Either:
- The daemon died while the session was running and the provider process died with it (or completed but couldn't update the row)
- Extremely rare: the daemon was killed and restarted mid-session with the provider still running in the background

In the second sub-case, the orphaned provider session can't properly close the writ anyway — summon-engine's post-session code lives in the daemon process, not the provider process. Interrupting is still the right call.

**Recovery action: close out the dangling session row, then `interruptWrit` → fires `<type>.ready` for re-dispatch.**

"Close out" means: set `ended_at = now()`, `exit_code = -1` (crash sentinel) if null. This keeps the session table consistent and prevents the session from appearing as "still running" in `nsg session list --status active`.

### Case 3: Writ `active`, no session record at all
`activateWrit` was called but `launchSession` never ran — daemon crashed between those two calls in summon-engine.

**Recovery action: `interruptWrit` → fires `<type>.ready` for re-dispatch.**

---

## New Core API

Add `recoverOrphanedWrits(home: string): RecoveryReport` to `writ.ts` (or a new `recovery.ts` if it gets large).

```typescript
export interface RecoveredWrit {
  writId: string;
  writType: string;
  sessionId: string | null;
  orphanCase: 1 | 2 | 3;
}

export interface RecoveryReport {
  recovered: RecoveredWrit[];
}
```

### Implementation logic

```sql
-- Find all writs in active status
SELECT w.id, w.type, w.session_id
FROM writs w
WHERE w.status = 'active'
```

For each result:

- **No `session_id`** → Case 3 → `interruptWrit(home, w.id)`
- **Has `session_id`, session row has `ended_at IS NOT NULL`** → Case 1 → `interruptWrit(home, w.id)`
- **Has `session_id`, session row has `ended_at IS NULL`** → Case 2 → close session row, then `interruptWrit(home, w.id)`

Closing a Case 2 session row:
```sql
UPDATE sessions
SET ended_at = datetime('now'), exit_code = -1
WHERE id = ? AND ended_at IS NULL
```

`interruptWrit` already handles: `active → ready`, clears `session_id`, fires `<type>.ready`, writes audit log. No changes needed there.

### Error handling

- If `interruptWrit` throws for a given writ (e.g. concurrent daemon already recovered it), log and continue — don't abort the whole scan.
- Return the full `RecoveryReport` regardless; let callers decide whether to log it.

### Export

Export `recoverOrphanedWrits` from `packages/core/src/index.ts`.

---

## Daemon Integration

In `clock-daemon.ts`, call `recoverOrphanedWrits(home)` once at startup, after the session provider is registered, before the poll loop begins:

```typescript
// After provider registration, before the main loop:
try {
  const report = recoverOrphanedWrits(home);
  if (report.recovered.length > 0) {
    log(`Startup recovery: interrupted ${report.recovered.length} orphaned writ(s): ${
      report.recovered.map(r => r.writId).join(', ')
    }`);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log(`Startup recovery failed: ${msg} — continuing anyway`);
}
```

Errors in recovery must not prevent the daemon from starting.

---

## CLI Exposure (Optional, low priority)

Consider `nsg clock recover` — runs the same scan without starting the daemon. Useful for manual recovery and for operators who run the daemon externally. Not blocking for the core fix.

If implemented, it's a thin wrapper: call `recoverOrphanedWrits(home)`, print the report, exit.

---

## Secondary Issue: `NEXUS_WRIT_ID` env var

Not addressed in this spec but worth noting: summon-engine sets `process.env.NEXUS_WRIT_ID` on the daemon process (summon.ts lines 131-150). If the clockworks daemon ever processes two summon events concurrently (not currently possible — `clockRun` is sequential), this would race. The fix is to pass `writId` through tool context rather than env var. Deferred; no concurrent dispatch today.

---

## Files to Change

| File | Change |
|------|--------|
| `packages/core/src/writ.ts` | Add `recoverOrphanedWrits` function |
| `packages/core/src/index.ts` | Export `recoverOrphanedWrits`, `RecoveredWrit`, `RecoveryReport` |
| `packages/core/src/clock-daemon.ts` | Call `recoverOrphanedWrits` at startup |
| `packages/core/src/writ.test.ts` | Tests for all three cases |

---

## Tests

All three orphan cases should be covered in `writ.test.ts`:

1. **Case 1**: Create writ → activate with session ID → insert session row with `ended_at` set → run recovery → writ is `ready`, audit log has `writ_interrupted`
2. **Case 2**: Create writ → activate with session ID → insert session row with `ended_at = NULL` → run recovery → session row gets `ended_at` and `exit_code = -1`, writ is `ready`
3. **Case 3**: Create writ → manually set status to `active` with no session ID → run recovery → writ is `ready`
4. **No-op**: No active writs → recovery runs cleanly, returns empty report
5. **Terminal writ not touched**: Create a completed/failed writ → recovery does not touch it

---

## Re-dispatch Consideration

`interruptWrit` fires `<type>.ready`. If the daemon is already running when recovery fires these events, the clockworks will pick them up on the next tick and re-dispatch the work normally. This is the intended behavior — interrupted writs are retried automatically.

The circuit breaker in summon-engine (`maxSessions`, default 10) already limits runaway retries. Recovery-triggered re-dispatches count against this limit.

---

## What This Does Not Fix

- A writ that goes orphaned while the daemon is running (not a crash scenario — requires a bug in summon-engine itself, like an unhandled exception that bypasses the try/finally). These are logic bugs, not infrastructure gaps.
- The case where the daemon crashes between `activateWrit` and `insertSessionRow` in the session funnel — the writ is `active` with a `session_id` that doesn't exist yet. This is Case 3 (no session record), which is handled.
- Concurrent dispatch of multiple summons (the serial nature of the daemon means one session blocks the next — a separate concern, addressed by Option B).
