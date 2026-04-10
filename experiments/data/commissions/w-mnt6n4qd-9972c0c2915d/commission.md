Implement the attached spec for zombie engine detection and reaping in the spider apparatus.

Context: this spec was produced by a previous spec-writer session (ses-mnt38fmk-40a0aafa) against writ w-mnt2p847-f9719e6e603d, but the draft worktree was cleaned up before the spec could be committed. The content below was recovered from the Claude transcript verbatim.

---

# Zombie Engine Detection and Reaping

## Summary

Add zombie engine detection and reaping to the spider apparatus. Zombie engines — engines marked `running` in the rigs book whose underlying process (babysitter + claude) is dead — silently consume `maxConcurrentEngines` throttle slots, blocking new rig dispatch. The spider will detect zombies both at startup and periodically during the crawl loop, using PID liveness checks gated by a configurable age threshold.

## Current State

The spider's crawl loop (`packages/plugins/spider/src/spider.ts`) runs five phases in priority order:

```
crawl() → tryCollect > tryProcessGrafts > tryCheckBlocked > tryRun > trySpawn
```

`tryCollect()` iterates running engines with session IDs and checks the session's status. Engines whose sessions are in non-terminal states (`running`, `pending`) or missing are skipped (line 1302):

```typescript
if (!session || session.status === 'running' || session.status === 'pending') continue;
```

This means an engine whose session is stuck in `running` (because the babysitter died without delivering a session-record) is waited on forever. The engine counts against `maxConcurrentEngines` (checked by `countRunningEngines()` in `tryRun` and `trySpawn`), blocking new dispatch.

The animator already has startup-only orphan recovery (`packages/plugins/animator/src/startup.ts`):

```typescript
export async function recoverOrphans(sessions: Book<SessionDoc>): Promise<number>
```

This checks PID liveness via `isProcessAlive(pid)` and marks dead sessions as `failed`. However:
1. It runs once at startup, not periodically.
2. It's async and uncoordinated with spider startup — race condition possible.
3. It operates on sessions, not engines — even when a session transitions to `failed`, the spider must crawl to pick it up.

The spider's `start()` method (`line 2016`) performs no recovery of running engines from a prior daemon run.

**Key types (current):**

```typescript
// packages/plugins/spider/src/types.ts
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'skipped';

export interface EngineInstance {
  id: string;
  designId: string;
  status: EngineStatus;
  upstream: string[];
  givensSpec: Record<string, unknown>;
  when?: string;
  yields?: unknown;
  error?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  block?: BlockRecord;
}

export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
  variables?: Record<string, unknown>;
  maxEnginesPerRig?: number;
  maxConcurrentEngines?: number;
  maxConcurrentEnginesPerRig?: number;
}
```

```typescript
// packages/plugins/animator/src/types.ts (relevant fields)
export interface SessionDoc {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  cancelMetadata?: Record<string, unknown>; // contains { pid: number } for claude-code
  startedAt: string;
  // ...
}
```

## Requirements

- R1: When spider starts, the system must detect all engines with `status === 'running'` and a `sessionId`, look up the corresponding session, and fail any engine whose session is in `pending` status (orphaned pre-detached session from prior daemon run).
- R2: When spider starts, the system must detect all engines with `status === 'running'` and a `sessionId`, look up the corresponding session, and fail any engine whose session has `cancelMetadata.pid` set to a PID that is no longer alive.
- R3: Startup zombie recovery must run as fire-and-forget async in the spider's `start()` method, matching the animator's orphan recovery pattern.
- R4: During each crawl cycle, before `tryCollect`, a new `tryReapZombies` phase must check running engines whose `startedAt` is older than `zombieThresholdMs` for zombie status.
- R5: When `tryReapZombies` finds a running engine older than `zombieThresholdMs` whose session's `cancelMetadata.pid` process is dead, the system must call `failEngine()` on that engine with error message `'Engine process died unexpectedly (zombie reaped)'`.
- R6: When `tryReapZombies` finds a running engine older than `zombieThresholdMs` whose session has no `cancelMetadata.pid` (no PID registered) and the session status is `pending` or `running`, the system must call `failEngine()` on that engine with error message `'Engine session has no process ID after threshold (zombie reaped)'`.
- R7: When `tryReapZombies` finds a running engine older than `zombieThresholdMs` whose session's `cancelMetadata.pid` process is alive, the system must skip that engine (legitimately running).
- R8: `tryReapZombies` must return `{ action: 'rig-completed', rigId, writId, outcome: 'failed' }` when it reaps a zombie, consistent with `failEngine()` setting the rig to `failed`.
- R9: `SpiderConfig` must accept an optional `zombieThresholdMs` field (number, default `300000`) controlling the minimum age of a running engine before it is eligible for periodic zombie detection.
- R10: The spider must include its own `isProcessAlive(pid: number): boolean` function — a local duplicate of the animator's implementation — rather than importing from the animator package.
- R11: Reaped zombie engines must use `status: 'failed'` (existing status). No new `EngineStatus` variant is added. The error message on the engine distinguishes zombies from other failures.
- R12: Startup recovery must log `[spider] Zombie recovery: reaped N zombie engines` when it reaps one or more zombies (matching the animator's `[animator] Orphan recovery: marked N dead sessions as failed` pattern).
- R13: `tryReapZombies` must log `[spider] Reaped zombie engine "${engineId}" in rig "${rigId}" — process dead` when it reaps an engine during the crawl loop.
- R14: When a running engine has no `sessionId` (running without a launched session — should not normally occur for quick engines), `tryReapZombies` must skip it.

## Design

### Type Changes

The only type change is adding `zombieThresholdMs` to `SpiderConfig`:

```typescript
// packages/plugins/spider/src/types.ts — SpiderConfig
export interface SpiderConfig {
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
  variables?: Record<string, unknown>;
  maxEnginesPerRig?: number;
  maxConcurrentEngines?: number;
  maxConcurrentEnginesPerRig?: number;
  /**
   * Minimum age (in milliseconds) of a running engine before it is eligible
   * for zombie detection during the crawl loop. Engines younger than this
   * threshold are skipped — their sessions may still be starting.
   * Default: 300000 (5 minutes).
   */
  zombieThresholdMs?: number;
}
```

No changes to `EngineStatus`, `CrawlResult`, `EngineInstance`, or `RigDoc`.

### Behavior

#### `isProcessAlive(pid: number): boolean`

Add this as a module-level function in `packages/plugins/spider/src/spider.ts`, near the top with the other utility functions (`countRunningEngines`, etc.):

```typescript
/**
 * Check if a process with the given PID is alive.
 * Uses process.kill(pid, 0) which sends signal 0 (no-op) to check existence.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    // EPERM means the process exists but we can't signal it — treat as alive.
    return true;
  }
}
```

This is not exported — it is internal to spider.ts. It duplicates the animator's `isProcessAlive` from `packages/plugins/animator/src/startup.ts` to avoid a cross-plugin internal import.

#### `tryReapZombies(): Promise<CrawlResult | null>` — periodic crawl phase

Add as an inner function inside `createSpider()`, alongside `tryCollect`, `tryRun`, etc.

**When called (every crawl cycle):**

1. Read `zombieThresholdMs` from `spiderConfig` (default `300000`).
2. Query `rigsBook.find({ where: [['status', '=', 'running']] })` — same query as `tryCollect`.
3. For each running rig, for each engine with `status === 'running'`:
   a. If engine has no `sessionId`, skip (not a launched quick engine, or not yet assigned — R14).
   b. If engine has no `startedAt`, skip (cannot evaluate age).
   c. Compute age: `Date.now() - new Date(engine.startedAt).getTime()`. If age < `zombieThresholdMs`, skip.
   d. Read session: `await sessionsBook.get(engine.sessionId)`.
   e. If session does not exist, skip (handled separately by tryCollect's existing logic).
   f. If session status is terminal (`completed`, `failed`, `timeout`, `cancelled`), skip — `tryCollect` will handle it normally.
   g. Extract `pid` from `session.cancelMetadata?.pid`.
   h. If `pid` is a number and `isProcessAlive(pid)` returns `true`, skip (legitimately running — R7).
   i. If `pid` is a number and `isProcessAlive(pid)` returns `false`: log and call `failEngine(rig, engine.id, 'Engine process died unexpectedly (zombie reaped)')`. Return `{ action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' }` (R5, R8).
   j. If `pid` is not a number (no PID registered) and session status is `pending` or `running` and age ≥ threshold: log and call `failEngine(rig, engine.id, 'Engine session has no process ID after threshold (zombie reaped)')`. Return `{ action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' }` (R6, R8).
4. Return `null` if no zombies found.

Logging on reap: `console.log('[spider] Reaped zombie engine "${engineId}" in rig "${rigId}" — process dead')` (R13).

#### `crawl()` — updated phase order

```typescript
async crawl(): Promise<CrawlResult | null> {
  const reaped = await tryReapZombies();
  if (reaped) return reaped;

  const collected = await tryCollect();
  if (collected) return collected;

  const grafted = await tryProcessGrafts();
  if (grafted) return grafted;

  const checked = await tryCheckBlocked();
  if (checked) return checked;

  const ran = await tryRun();
  if (ran) return ran;

  const spawned = await trySpawn();
  if (spawned) return spawned;

  return null;
}
```

#### Startup zombie recovery — in `start()`

Add an async IIFE at the end of `start()`, after books are initialized and CDC watches are set up:

```typescript
// Zombie recovery — reap engines left running from a previous daemon run.
// Fire-and-forget async, matching animator's orphan recovery pattern.
void (async () => {
  try {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    let reaped = 0;

    for (const rig of runningRigs) {
      for (const engine of rig.engines) {
        if (engine.status !== 'running' || !engine.sessionId) continue;

        const session = await sessionsBook.get(engine.sessionId);

        // At startup, any engine whose session is still pending is definitionally
        // orphaned — no babysitter can still be starting from the previous run.
        if (session && session.status === 'pending') {
          await failEngine(rig, engine.id, 'Engine session stuck in pending at startup (zombie reaped)');
          reaped++;
          break; // failEngine sets rig to failed; move to next rig.
        }

        // Session running with a dead PID — zombie.
        if (session && session.status === 'running') {
          const pid = session.cancelMetadata?.pid;
          if (typeof pid === 'number' && !isProcessAlive(pid)) {
            await failEngine(rig, engine.id, 'Engine process died unexpectedly (zombie reaped)');
            reaped++;
            break; // failEngine sets rig to failed; move to next rig.
          }
          // No PID at startup + session running = also orphaned (babysitter
          // never registered its PID with the session before the crash).
          if (typeof pid !== 'number') {
            await failEngine(rig, engine.id, 'Engine session has no process ID at startup (zombie reaped)');
            reaped++;
            break;
          }
        }

        // Session missing — skip; may have been cleaned up or never written.
        // Session in terminal state — tryCollect will handle it on first crawl.
      }
    }

    if (reaped > 0) {
      console.log(`[spider] Zombie recovery: reaped ${reaped} zombie engines`);
    }
  } catch (err) {
    console.error('[spider] Zombie recovery failed:', err instanceof Error ? err.message : String(err));
  }
})();
```

**Key differences from periodic detection:**
- No age threshold — at startup, all prior-run engines are stale by definition.
- Sessions in `pending` status are always reaped (R1, D9).
- Sessions in `running` with no PID are always reaped (no babysitter ever registered).
- Uses `break` after `failEngine` because `failEngine` sets the rig to `failed` and cascades cancellation to sibling engines — no need to check other engines in the same rig.

### Non-obvious Touchpoints

- **`packages/plugins/spider/src/spider.ts` top-level doc comment** (lines 1-18): The doc comment describes the crawl priority as `collect > checkBlocked > run > spawn`. Update to `reapZombies > collect > processGrafts > checkBlocked > run > spawn` to reflect the new phase.

- **`packages/plugins/spider/src/spider.test.ts` mock animator**: The existing mock animator writes session docs with terminal status eagerly in `summon()`. Zombie tests need sessions that remain in `running` or `pending` status. The test must write session docs directly to the sessions book with non-terminal status and a specific `cancelMetadata.pid` to simulate zombie conditions.

## Validation Checklist

- V1 [R1, R9]: Start spider with a rig containing a running engine whose session is in `pending` status. Verify the engine is failed with error containing `'zombie reaped'` and the rig transitions to `failed`.

- V2 [R2, R10]: Start spider with a rig containing a running engine whose session is in `running` status with a `cancelMetadata.pid` pointing to a dead PID. Verify the engine is failed with error containing `'zombie reaped'`.

- V3 [R3]: Verify that `start()` returns synchronously (does not return a Promise). The zombie recovery runs in the background and does not block guild startup.

- V4 [R4, R5, R8]: Set up a running engine with `startedAt` older than `zombieThresholdMs`, session in `running` status with a dead PID. Call `crawl()`. Verify `tryReapZombies` fires before `tryCollect`, the engine is failed, and the return value is `{ action: 'rig-completed', rigId, writId, outcome: 'failed' }`.

- V5 [R6]: Set up a running engine older than `zombieThresholdMs` with a session in `running` status and no `cancelMetadata.pid`. Call `crawl()`. Verify the engine is failed with error containing `'no process ID'`.

- V6 [R7]: Set up a running engine older than `zombieThresholdMs` with a session in `running` status and a `cancelMetadata.pid` that IS alive. Call `crawl()`. Verify the engine is NOT reaped — `crawl()` returns `null` or a non-reap result.

- V7 [R4]: Set up a running engine with `startedAt` younger than `zombieThresholdMs`, session in `running` status with a dead PID. Call `crawl()`. Verify the engine is NOT reaped (too young).

- V8 [R9]: Pass `{ spider: { zombieThresholdMs: 1000 } }` in guild config. Set up a running engine with `startedAt` 2 seconds ago and a dead-PID session. Call `crawl()`. Verify the engine IS reaped (custom threshold respected).

- V9 [R11]: After a zombie engine is reaped, verify `engine.status === 'failed'` and `engine.error` contains `'zombie reaped'`. Verify EngineStatus type has not been modified.

- V10 [R12]: Start spider with zombie engines present. Verify console output includes `[spider] Zombie recovery: reaped N zombie engines`.

- V11 [R13]: Crawl with a zombie-eligible engine. Verify console output includes `[spider] Reaped zombie engine`.

- V12 [R14]: Set up a running engine with no `sessionId`. Call `crawl()`. Verify `tryReapZombies` skips it (no error, no reap).

- V13 [R8]: After reaping, verify that `failEngine` cascaded correctly: all pending/blocked sibling engines are set to `cancelled`, and the rig status is `failed`.

## Test Cases

**Startup recovery:**

1. **Pending session at startup → reaped.** Create a rig with a running engine whose session is in `pending` status. Start spider. Assert: engine status is `failed`, error contains `'zombie reaped'`, rig status is `failed`.

2. **Running session with dead PID at startup → reaped.** Create a rig with a running engine whose session is in `running` status with `cancelMetadata: { pid: 999999 }` (dead PID). Start spider. Assert: engine is failed, rig is failed.

3. **Running session with live PID at startup → not reaped.** Create a rig with a running engine whose session is in `running` status with `cancelMetadata: { pid: process.pid }` (current process — alive). Start spider. Assert: engine remains `running`.

4. **Running session with no PID at startup → reaped.** Create a rig with a running engine whose session is in `running` status with no `cancelMetadata`. Start spider. Assert: engine is failed.

5. **Multiple rigs with zombies at startup.** Create two rigs each with a running zombie engine. Start spider. Assert: both rigs are failed, log message shows `reaped 2 zombie engines`.

6. **No zombies at startup.** Start spider with no running rigs. Assert: no log message, no errors.

**Periodic detection (tryReapZombies):**

7. **Engine older than threshold with dead PID → reaped.** Set engine `startedAt` to 6 minutes ago (threshold = 5 min default). Session `running` with dead PID. `crawl()` → engine failed, returns `rig-completed/failed`.

8. **Engine younger than threshold with dead PID → not reaped.** Set engine `startedAt` to 1 minute ago. Session `running` with dead PID. `crawl()` → engine remains running.

9. **Engine older than threshold with live PID → not reaped.** Set engine `startedAt` to 6 minutes ago. Session `running` with `pid: process.pid`. `crawl()` → engine remains running.

10. **Engine older than threshold, session pending, no PID → reaped.** Set engine `startedAt` to 6 minutes ago. Session `pending` with no PID. `crawl()` → engine failed.

11. **Engine with no sessionId → skipped.** Running engine with no `sessionId`. `crawl()` → tryReapZombies skips, no error.

12. **Custom zombieThresholdMs respected.** Config `zombieThresholdMs: 60000`. Engine `startedAt` 2 minutes ago with dead PID session. `crawl()` → engine reaped (2 min > 1 min threshold).

13. **tryReapZombies runs before tryCollect.** Set up a zombie engine (dead PID, old) AND a completed session on a different engine. Call `crawl()` once. Assert: the zombie reap result is returned (not the collect result). Call `crawl()` again. Assert: the completed session is now collected.

14. **failEngine cascades correctly on reap.** Rig with 3 engines: first completed, second running (zombie), third pending. Reap second engine. Assert: second is `failed`, third is `cancelled`, rig is `failed`.

15. **Session in terminal state → skipped by tryReapZombies.** Engine older than threshold with session in `failed` status. `crawl()` → tryReapZombies skips it, tryCollect picks it up instead.

**Edge cases:**

16. **Engine with sessionId but missing session doc.** Engine is running, older than threshold, but `sessionsBook.get(sessionId)` returns null. `crawl()` → tryReapZombies skips it (does not crash, does not reap).

17. **Rig already in terminal state.** Rig with `status: 'failed'` containing a running engine (inconsistent state). `tryReapZombies` queries only `status === 'running'` rigs, so this rig is never examined.

18. **Engine with startedAt undefined.** Running engine with sessionId but no `startedAt`. `crawl()` → tryReapZombies skips it (cannot compute age).