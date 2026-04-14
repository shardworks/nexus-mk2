# Heartbeat-Based Reconciliation and Process-Group Cancellation

## Summary

Replace the PID-based orphan recovery with a heartbeat-based reconciliation model, add process-group cancellation, enforce terminal-state immutability, and clean up system-prompt temp directories. After this change, dead sessions are detected within ~120s regardless of host type, cancellation reliably kills both the babysitter and the anima process, and duplicate lifecycle reports are safely idempotent.

## Current State

### Session lifecycle reporting

The babysitter (`packages/plugins/claude-code/src/babysitter.ts`) reports two lifecycle events to the guild via HTTP:

1. **Ready report** — `reportRunning(config, claudePid, timeoutMs?)` sends `{ sessionId, startedAt, provider, metadata, cancelMetadata: { pid: claudePid } }` to the `session-running` tool endpoint. The guild handler (`packages/plugins/animator/src/tools/session-running.ts`) merges this into the SessionDoc, transitioning `pending` → `running`, and refreshes `lastActivityAt`.

2. **Terminal report** — `reportResult(config, result, transcript, timeoutMs?)` sends `{ sessionId, status, exitCode, ... }` to the `session-record` tool endpoint. The handler (`packages/plugins/animator/src/session-record-handler.ts`) writes the terminal SessionDoc, refreshes `lastActivityAt`, and writes the transcript. It guards against overwriting `cancelled` status but not other terminal states.

There is no heartbeat between these two events.

### Orphan recovery

`recoverOrphans(sessions)` in `packages/plugins/animator/src/startup.ts` scans sessions with `status === 'running'` (not `pending`), reads `cancelMetadata.pid`, and calls `process.kill(pid, 0)`. If the process is dead (ESRCH), it marks the session `failed`. The helper `isProcessAlive(pid)` encapsulates the signal-0 check. This runs once at startup, in a fire-and-forget IIFE in `packages/plugins/animator/src/animator.ts` `start()` method, after `drainDlq()`.

### Cancellation

The provider's `cancel(cancelMetadata)` in `packages/plugins/claude-code/src/index.ts` reads `cancelMetadata.pid` and calls `process.kill(pid, 'SIGTERM')` with a positive PID — targeting only the claude process, not the process group. The babysitter has no SIGTERM handler; it relies on default Node behavior.

`launchDetached()` in `packages/plugins/claude-code/src/detached.ts` polls for `cancelMetadata` via `pollForProcessInfo()`, falling back to `{ pid: proc.pid }` (the babysitter's PID).

The Animator's `cancel()` method in `packages/plugins/animator/src/animator.ts` reads `doc.cancelMetadata` and passes it opaquely to the provider.

### SessionDoc type

```typescript
// packages/plugins/animator/src/types.ts
export interface SessionDoc {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  output?: string;
  cancelMetadata?: Record<string, unknown>;
  lastActivityAt?: string;
  authorizedTools?: string[];
  [key: string]: unknown;
}
```

### AnimatorSessionProvider interface

```typescript
// packages/plugins/animator/src/types.ts
export interface AnimatorSessionProvider {
  name: string;
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
    processInfo?: Promise<Record<string, unknown>>;
  };
  cancel?(cancelMetadata: Record<string, unknown>): Promise<void>;
}
```

### BabysitterConfig type

```typescript
// packages/plugins/claude-code/src/babysitter.ts
export interface BabysitterConfig {
  sessionId: string;
  guildToolUrl: string;
  dbPath: string;
  claudeArgs: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
  tools: SerializedTool[];
  startedAt: string;
  provider: string;
  metadata?: Record<string, unknown>;
}
```

### Animator supportKit.books

```typescript
// packages/plugins/animator/src/animator.ts, inside createAnimator()
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
    },
    transcripts: {
      indexes: ['sessionId'],
    },
  },
  tools: [sessionList, sessionShow, summonTool, sessionCancel, sessionRunning, sessionRecord],
  // ...
}
```

### System-prompt temp directory

`buildBabysitterConfig()` in `packages/plugins/claude-code/src/detached.ts` creates a temp directory via `fs.mkdtempSync(path.join(os.tmpdir(), 'nsg-detached-'))`, writes the system prompt file, and adds `--system-prompt-file` to `claudeArgs`. The babysitter has no knowledge of this directory and does not clean it up.

## Requirements

- R1: The babysitter must send a heartbeat to the guild every 30 seconds while the session is in `running` state. The heartbeat updates `lastActivityAt` on the session record to the guild's wall-clock time.
- R2: A new `session-heartbeat` tool endpoint must exist in the Animator, accepting `{ sessionId }` and updating `lastActivityAt`.
- R3: The guild must maintain a `guild_alive_at` timestamp in a dedicated `state` Stacks book, updated every 30 seconds via an unref'd timer.
- R4: At guild startup, the reconciler must compute a downtime credit from the gap between the previous `guild_alive_at` and now. This credit is applied only to the startup reconciliation pass.
- R5: The reconciler must scan sessions in both `pending` and `running` states. When `now - lastActivityAt - downtimeCredit > 90s`, the session must be transitioned to `failed` with an error message including the silence duration.
- R6: The reconciler must run periodically every 30 seconds during guild uptime via an unref'd timer, with a boolean single-flight guard to prevent overlapping runs.
- R7: When a session record lacks `lastActivityAt`, the reconciler must backfill it to `now`, persist the update, log a warning, and skip that record for the current pass.
- R8: The `cancelMetadata` field on `SessionDoc` must be renamed to `cancelHandle` across all readers and writers.
- R9: The cancel handle must be a tagged structure. For local-process hosts: `{ kind: 'local-pgid', pgid: number }`. The `session-running` tool's Zod param must validate this as a strict discriminated union.
- R10: The babysitter must report `cancelHandle: { kind: 'local-pgid', pgid: process.pid }` in the ready report. Since the babysitter is spawned with `detached: true` (which calls `setsid()`), `process.pid` equals the process group ID.
- R11: The provider's `cancel()` must dispatch on `cancelHandle.kind`. For `local-pgid`, it must signal the process group via `process.kill(-pgid, 'SIGTERM')`. For unrecognized kinds, log a warning and skip.
- R12: The babysitter must install a SIGTERM handler inside `runBabysitter()` after spawning claude. The handler sets a `cancelled` flag and sends SIGTERM to the claude process. The normal exit path checks this flag and reports status `cancelled` instead of computing status from the exit code.
- R13: The `session-record` handler must reject writes to sessions already in any terminal state (`completed`, `failed`, `timeout`, `cancelled`). It must return `{ ok: true, sessionId, status: existingStatus }` (not error), log at info level, and still write the transcript if provided.
- R14: The `BabysitterConfig` must gain an optional `systemPromptTmpDir?: string` field. The babysitter's `finally` block must delete this directory alongside its own `tmpDir`.
- R15: The `reportRunning` function signature must change from `(config, claudePid, timeoutMs?)` to `(config, cancelHandle, timeoutMs?)` where `cancelHandle` is `Record<string, unknown>`. The payload must use the field name `cancelHandle` (not `cancelMetadata`).
- R16: The `AnimatorSessionProvider.cancel?` method parameter name must remain `cancelMetadata` for now (renamed in a future commission), but the Animator's `cancel()` method must read `doc.cancelHandle` (the new field name) and pass it to the provider.
- R17: The `launchDetached` processInfo fallback must construct `{ kind: 'local-pgid', pgid: proc.pid }` instead of `{ pid: proc.pid }`.
- R18: `pollForProcessInfo` must poll for `doc.cancelHandle` (renamed field) instead of `doc.cancelMetadata`.
- R19: The `isProcessAlive` function must be deleted from `startup.ts`.
- R20: The `session-heartbeat` tool must be registered in `packages/plugins/animator/src/tools/index.ts` and added to the `supportKit.tools` array in `animator.ts`.

## Design

### Type Changes

#### SessionDoc (packages/plugins/animator/src/types.ts)

```typescript
export interface SessionDoc {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  /** The final assistant text from the session. */
  output?: string;
  /**
   * Provider-owned opaque handle for cross-process cancellation.
   * Written by the Animator from the provider's processInfo at session launch.
   * The Animator does not interpret this — it passes it back to the provider's
   * cancel() method when cancellation is requested.
   *
   * Shape is tagged by host type:
   * - local process: { kind: 'local-pgid', pgid: number }
   * - future container: { kind: 'container', containerId: string }
   * - future remote: { kind: 'remote', jobId: string, host: string }
   */
  cancelHandle?: Record<string, unknown>;
  /**
   * ISO timestamp of the last lifecycle signal from the session host.
   *
   * Updated on: pending pre-write, ready report (session-running),
   * heartbeat, terminal report (session-record). The guild writes its
   * own wall-clock time — never a host-supplied timestamp.
   *
   * The reconciler uses this to detect dead sessions:
   *   if (now - lastActivityAt - downtimeCredit > 90_000ms) → failed
   */
  lastActivityAt?: string;
  /**
   * Tool names this session is authorized to call over the Tool HTTP API.
   */
  authorizedTools?: string[];
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}
```

#### GuildStateDoc (new type, packages/plugins/animator/src/types.ts)

```typescript
/**
 * Operational state stored in the Animator's 'state' book.
 * Single well-known document with id 'guild-heartbeat'.
 */
export interface GuildStateDoc {
  id: string;
  /** ISO timestamp of the last guild self-heartbeat. */
  guildAliveAt: string;
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}
```

#### BabysitterConfig (packages/plugins/claude-code/src/babysitter.ts)

```typescript
export interface BabysitterConfig {
  sessionId: string;
  guildToolUrl: string;
  dbPath: string;
  claudeArgs: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
  tools: SerializedTool[];
  startedAt: string;
  provider: string;
  metadata?: Record<string, unknown>;
  /** Temp directory for the system prompt file. Cleaned up in finally block. */
  systemPromptTmpDir?: string;
}
```

### Behavior

#### Session heartbeat endpoint (S1, R2, R20)

A new tool `session-heartbeat` in `packages/plugins/animator/src/tools/session-heartbeat.ts`:

```typescript
export default tool({
  name: 'session-heartbeat',
  description: 'Refresh session liveness timestamp',
  instructions:
    'Called periodically by session babysitters to assert liveness. ' +
    'Updates lastActivityAt to the guild wall-clock time. ' +
    'Not intended for patron or anima use.',
  params: {
    sessionId: z.string().describe('The session ID'),
  },
  callableBy: 'anima',
  permission: 'write',
  handler: async (params) => {
    const stacks = guild().apparatus<StacksApi>('stacks');
    const sessions = stacks.book<SessionDoc>('animator', 'sessions');

    const doc = await sessions.get(params.sessionId);
    if (!doc) {
      return { ok: false, error: 'Session not found' };
    }

    // Only refresh for non-terminal sessions.
    const terminal = new Set(['completed', 'failed', 'timeout', 'cancelled']);
    if (terminal.has(doc.status)) {
      return { ok: true, sessionId: params.sessionId, status: doc.status };
    }

    await sessions.patch(params.sessionId, {
      lastActivityAt: new Date().toISOString(),
    });

    return { ok: true, sessionId: params.sessionId };
  },
});
```

Register in `packages/plugins/animator/src/tools/index.ts`:
```typescript
export { default as sessionHeartbeat } from './session-heartbeat.ts';
```

Add to `supportKit.tools` array in `packages/plugins/animator/src/animator.ts`:
```typescript
tools: [sessionList, sessionShow, summonTool, sessionCancel, sessionRunning, sessionRecord, sessionHeartbeat],
```

#### Host-side heartbeat timer (S1, R1)

In `runBabysitter()` (`packages/plugins/claude-code/src/babysitter.ts`), after the ready report completes (after `await runningPromise`), start a setTimeout chain:

```typescript
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleHeartbeat() {
  heartbeatTimer = setTimeout(async () => {
    const route = toolNameToRoute('session-heartbeat');
    const url = `${config.guildToolUrl}${route}`;
    try {
      await callGuildHttpApi(url, config.sessionId, { sessionId: config.sessionId }, HEARTBEAT_TIMEOUT_MS);
    } catch {
      // Dropped — next heartbeat in 30s. Staleness threshold (90s) tolerates this.
    }
    scheduleHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

scheduleHeartbeat();
```

When the heartbeat needs to stop (before the terminal report), clear it:
```typescript
if (heartbeatTimer) {
  clearTimeout(heartbeatTimer);
  heartbeatTimer = null;
}
```

The heartbeat timer must be cleared in three places:
1. Before the terminal report in the normal exit path.
2. In the SIGTERM handler (before letting the normal exit path run).
3. In the `catch` block of the top-level error handler.

#### Guild self-heartbeat and downtime credit (S2, R3, R4)

In `packages/plugins/animator/src/animator.ts`, within `start()`:

1. Declare `state` book alongside `sessions` and `transcripts`:
   ```typescript
   const state = stacks.book<GuildStateDoc>('animator', 'state');
   ```

2. Add the `state` book to `supportKit.books`:
   ```typescript
   books: {
     sessions: { indexes: ['startedAt', 'status', 'conversationId', 'provider'] },
     transcripts: { indexes: ['sessionId'] },
     state: {},
   },
   ```

3. Compute downtime credit before running the reconciler:
   ```typescript
   const GUILD_HEARTBEAT_INTERVAL_MS = 30_000;
   const GUILD_HEARTBEAT_DOC_ID = 'guild-heartbeat';

   // Read previous guild_alive_at and compute downtime credit.
   let downtimeCredit = 0;
   try {
     const prev = await state.get(GUILD_HEARTBEAT_DOC_ID);
     if (prev?.guildAliveAt) {
       const gap = Date.now() - new Date(prev.guildAliveAt).getTime();
       downtimeCredit = Math.max(0, gap - GUILD_HEARTBEAT_INTERVAL_MS);
     }
   } catch { /* fresh install — no credit */ }

   // Write the initial guild_alive_at.
   await state.put({ id: GUILD_HEARTBEAT_DOC_ID, guildAliveAt: new Date().toISOString() });
   ```

4. Start a guild self-heartbeat timer:
   ```typescript
   const guildHeartbeatTimer = setInterval(async () => {
     try {
       await state.put({ id: GUILD_HEARTBEAT_DOC_ID, guildAliveAt: new Date().toISOString() });
     } catch (err) {
       console.warn(`[animator] Failed to update guild_alive_at: ${err instanceof Error ? err.message : err}`);
     }
   }, GUILD_HEARTBEAT_INTERVAL_MS);
   guildHeartbeatTimer.unref();
   ```

#### Reconciler rewrite (S3, S9, R5, R7, R19)

Replace `recoverOrphans` in `packages/plugins/animator/src/startup.ts`. Delete `isProcessAlive`. The new signature:

```typescript
export async function recoverOrphans(
  sessions: Book<SessionDoc>,
  downtimeCreditMs: number = 0,
): Promise<number>
```

Behavior:

1. Query non-terminal sessions:
   ```typescript
   const active = await sessions.find({
     where: [['status', 'IN', ['pending', 'running']]],
   });
   ```

2. For each session:
   - If `lastActivityAt` is missing (legacy record): backfill to `now`, persist via `sessions.patch(doc.id, { lastActivityAt: new Date().toISOString() })`, log `[animator] Backfilled lastActivityAt for legacy session ${doc.id}`, and **skip** this session for the current pass (it gets one staleness window to heartbeat).
   - Otherwise: compute `silence = Date.now() - new Date(doc.lastActivityAt).getTime()`. Subtract `downtimeCreditMs`. If `silence - downtimeCreditMs > 90_000`, transition to `failed`:
     ```typescript
     const effectiveSilence = silence - downtimeCreditMs;
     // ... transition with error:
     error: `No heartbeat received for ${Math.round(effectiveSilence / 1000)}s — session host presumed dead (reconciled)`,
     ```

3. Log summary: `[animator] Reconciler: marked ${recovered} dead sessions as failed`.

#### Periodic reconciler (S4, R6)

In `packages/plugins/animator/src/animator.ts`, within `start()`, after the initial DLQ drain + reconciler run:

```typescript
const RECONCILER_INTERVAL_MS = 30_000;
let reconciling = false;

const reconcilerTimer = setInterval(async () => {
  if (reconciling) return;
  reconciling = true;
  try {
    await recoverOrphans(sessions, 0); // No downtime credit for periodic passes
  } catch (err) {
    console.warn(`[animator] Periodic reconciler failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    reconciling = false;
  }
}, RECONCILER_INTERVAL_MS);
reconcilerTimer.unref();
```

#### Cancel handle rename (S5, R8)

Rename `cancelMetadata` → `cancelHandle` on `SessionDoc` and update every reader/writer:

| File | Change |
|---|---|
| `packages/plugins/animator/src/types.ts` | `cancelMetadata?` → `cancelHandle?` on `SessionDoc`; update JSDoc. `AnimatorSessionProvider.cancel?` parameter name stays `cancelMetadata` (future rename). |
| `packages/plugins/animator/src/animator.ts` | `recordRunning()`: `cancelMetadata` → `cancelHandle`. `cancel()` method: `doc.cancelMetadata` → `doc.cancelHandle`. `processInfo` write: spread into `cancelHandle`. |
| `packages/plugins/animator/src/tools/session-running.ts` | Zod param: `cancelMetadata` → `cancelHandle`. Handler: merge into `cancelHandle` field. |
| `packages/plugins/animator/src/session-record-handler.ts` | Preserve `cancelHandle` from existing doc (was `cancelMetadata`). |
| `packages/plugins/animator/src/startup.ts` | `recoverOrphans` no longer reads cancel metadata at all (no PID check). No direct change needed. |
| `packages/plugins/claude-code/src/index.ts` | `provider.cancel()`: reads `cancelMetadata.kind` (the parameter name from the interface is unchanged). |
| `packages/plugins/claude-code/src/detached.ts` | `pollForProcessInfo()`: polls `doc.cancelHandle`. `launchDetached()` fallback: constructs `{ kind: 'local-pgid', pgid: proc.pid }`. |
| `packages/plugins/claude-code/src/babysitter.ts` | `reportRunning()`: payload field `cancelMetadata` → `cancelHandle`. |

#### Strict cancel handle validation (S5, R9)

In `packages/plugins/animator/src/tools/session-running.ts`, replace the Zod param:

```typescript
// Old:
cancelMetadata: z.record(z.string(), z.unknown()).optional(),

// New:
cancelHandle: z.union([
  z.object({ kind: z.literal('local-pgid'), pgid: z.number() }),
]).optional().describe('Tagged cancel handle for cross-process cancellation'),
```

The union is extensible — future container support adds a new member without changing existing variants.

#### Babysitter cancel handle in ready report (S5, R10, R12, R15)

In `packages/plugins/claude-code/src/babysitter.ts`:

Change `reportRunning` signature:
```typescript
export async function reportRunning(
  config: BabysitterConfig,
  cancelHandle: Record<string, unknown>,
  timeoutMs?: number,
): Promise<void>
```

The payload becomes:
```typescript
const payload = {
  sessionId: config.sessionId,
  startedAt: config.startedAt,
  provider: config.provider,
  metadata: config.metadata,
  cancelHandle,
};
```

Call site in `runBabysitter()`:
```typescript
const cancelHandle = { kind: 'local-pgid' as const, pgid: process.pid };
const runningPromise = reportRunning(config, cancelHandle, retryTimeoutMs).catch((err) => {
  process.stderr.write(`[babysitter] Failed to report running: ${err}\n`);
});
```

#### Provider cancel dispatch (S5, R11)

In `packages/plugins/claude-code/src/index.ts`:

```typescript
async cancel(cancelMetadata: Record<string, unknown>): Promise<void> {
  const kind = cancelMetadata.kind as string | undefined;

  if (kind === 'local-pgid') {
    const pgid = cancelMetadata.pgid as number | undefined;
    if (pgid === undefined) return;
    try {
      process.kill(-pgid, 'SIGTERM');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
        return; // Process group already dead
      }
      throw err;
    }
    return;
  }

  // Unknown kind — log and skip
  if (kind) {
    console.warn(`[claude-code] Unknown cancelHandle kind: ${kind}`);
  }
},
```

Note: the parameter name remains `cancelMetadata` to match the `AnimatorSessionProvider` interface (R16). The Animator reads `doc.cancelHandle` and passes it as the `cancelMetadata` argument.

#### launchDetached processInfo fallback (S5, R17, R18)

In `packages/plugins/claude-code/src/detached.ts`:

`pollForProcessInfo` — change `doc?.cancelMetadata` to `doc?.cancelHandle`:
```typescript
if (doc?.cancelHandle) {
  return doc.cancelHandle;
}
```

`processInfo` fallback in `launchDetached`:
```typescript
// Fallback: construct cancel handle from babysitter PID (which is its PGID
// because it was spawned with detached: true → setsid())
return { kind: 'local-pgid', pgid: proc.pid };
```

#### Babysitter SIGTERM handler (S6, R12)

Inside `runBabysitter()`, after spawning claude:

```typescript
let cancelledBySignal = false;

const onSigterm = () => {
  cancelledBySignal = true;
  // Stop heartbeat timer first
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
  // Propagate SIGTERM to the claude process
  if (claudeProc && claudeProc.pid && !claudeProc.killed) {
    try {
      claudeProc.kill('SIGTERM');
    } catch { /* already dead */ }
  }
  // The normal claude exit path will run, check cancelledBySignal,
  // and report status 'cancelled' instead of computing from exit code.
};

process.on('SIGTERM', onSigterm);
```

When building the terminal report (after claude exits), replace the status computation:

```typescript
// Old:
const status = result.exitCode === 0 ? 'completed' : 'failed';

// New:
const status = cancelledBySignal
  ? 'cancelled'
  : result.exitCode === 0 ? 'completed' : 'failed';
```

This applies in `reportResult` — the caller (`runBabysitter`) must pass the `cancelledBySignal` state. The simplest approach: add an optional `statusOverride` to the `reportResult` call, or compute the status in `runBabysitter` and pass it. Since `reportResult` currently computes status internally from exit code, change it to accept an explicit status:

In `reportResult`, add an optional `statusOverride` parameter:
```typescript
export async function reportResult(
  config: BabysitterConfig,
  result: StreamJsonResult,
  transcript: Record<string, unknown>[],
  timeoutMs?: number,
  statusOverride?: 'cancelled',
): Promise<void> {
  // ...
  const status = statusOverride ?? (result.exitCode === 0 ? 'completed' : 'failed');
  // ...
}
```

Call site in `runBabysitter`:
```typescript
await reportResult(config, result, acc.transcript, retryTimeoutMs, cancelledBySignal ? 'cancelled' : undefined);
```

Clean up the signal handler in the `finally` block:
```typescript
process.removeListener('SIGTERM', onSigterm);
```

#### Terminal-state immutability (S7, R13)

In `packages/plugins/animator/src/session-record-handler.ts`, replace the cancelled-only guard with a general terminal-state guard:

```typescript
// Old:
if (currentDoc?.status === 'cancelled') {
  // ... write transcript, return
}

// New:
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);
if (currentDoc && TERMINAL_STATUSES.has(currentDoc.status)) {
  // Session already terminal — don't overwrite. Write transcript if provided.
  console.log(
    `[animator] Dropping duplicate session-record for ${params.sessionId} (already ${currentDoc.status})`,
  );
  if (params.transcript && params.transcript.length > 0) {
    try {
      await transcripts.put({ id: params.sessionId, messages: params.transcript });
    } catch (err) {
      console.warn(
        `[animator] Failed to record transcript for terminal session ${params.sessionId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return { ok: true, sessionId: params.sessionId, status: currentDoc.status };
}
```

#### System-prompt temp dir cleanup (S8, R14)

In `packages/plugins/claude-code/src/detached.ts`, `buildBabysitterConfig()`:

When a system prompt temp dir is created, include it in the config:
```typescript
if (config.systemPrompt) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsg-detached-'));
  const systemPromptPath = path.join(tmpDir, 'system-prompt.md');
  fs.writeFileSync(systemPromptPath, config.systemPrompt);
  claudeArgs.push('--system-prompt-file', systemPromptPath);
  // Store for babysitter cleanup:
  return {
    // ... all existing fields ...
    systemPromptTmpDir: tmpDir,
  };
}
```

The return structure already includes all fields; add `systemPromptTmpDir` conditionally (only when a system prompt temp dir was created).

In `packages/plugins/claude-code/src/babysitter.ts`, in the `finally` block of `runBabysitter()`:

```typescript
finally {
  await mcpHandle?.close().catch(() => {});
  db?.close();
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  if (config.systemPromptTmpDir) {
    fs.rmSync(config.systemPromptTmpDir, { recursive: true, force: true });
  }
}
```

### Non-obvious Touchpoints

- **`packages/plugins/animator/src/tools/index.ts`** — must add `export { default as sessionHeartbeat } from './session-heartbeat.ts'` for the new tool.
- **`packages/plugins/animator/src/animator.ts` import list** — must import `sessionHeartbeat` from `'./tools/index.ts'` and `GuildStateDoc` from `'./types.ts'`.
- **`packages/plugins/animator/src/animator.ts` `recordRunning()` function** (line 317–355) — uses `cancelMetadata` in its merge logic. Must rename to `cancelHandle`.
- **`packages/plugins/animator/src/animator.ts` `cancel()` method** (line 389–436) — reads `doc.cancelMetadata`. Must change to `doc.cancelHandle`.
- **`packages/plugins/animator/src/animator.ts` `start()` `initPromise`** (line 548–558) — writes `cancelMetadata` to the running record via `recordRunning`. Must pass as `cancelHandle`.
- **`packages/plugins/claude-code/src/detached.ts` `authorizedTools` array** (line 312–317) — already includes `'session-heartbeat'`. No change needed.
- **Test files** — every test that asserts `cancelMetadata` must be updated to `cancelHandle`. Every test that asserts `{ pid: N }` must be updated to `{ kind: 'local-pgid', pgid: N }`. Orphan recovery tests must be fully rewritten for heartbeat-based semantics.

## Validation Checklist

- V1 [R1, R2, R20]: Run the guild with a detached session. Grep guild stderr for `session-heartbeat` tool registration. Verify that the session record's `lastActivityAt` advances every ~30s while the session is running: `select lastActivityAt from books_animator_sessions where id = '<sessionId>'` polled twice 30s apart shows different timestamps.

- V2 [R3, R4]: Stop the guild for 60s, then restart. Check the `state` book for a `guild-heartbeat` document: `select * from books_animator_state where id = 'guild-heartbeat'`. Verify `guildAliveAt` is recent. Verify that in-flight sessions from before the restart are NOT reconciled as failed (the 60s downtime is credited).

- V3 [R5, R6, R7, R19]: Kill a babysitter process (`kill -9 <babysitter-pid>`) while the guild is running. Within ~120s, the session record must transition to `failed` with error matching `"No heartbeat received for .* — session host presumed dead"`. Verify `isProcessAlive` is no longer exported from `startup.ts`: `grep -r 'isProcessAlive' packages/plugins/animator/src/startup.ts` returns nothing.

- V4 [R5]: Create a session record in `pending` state with `lastActivityAt` set 120s in the past (no babysitter running). Trigger a reconciler pass. The session must transition to `failed`.

- V5 [R7]: Create a session record in `running` state with no `lastActivityAt` field. Trigger a reconciler pass. The record must gain `lastActivityAt = now` and remain `running`. On the next pass 30s+ later (without heartbeats), it must transition to `failed`.

- V6 [R8, R9, R10, R15]: Start a detached session. Read the session record after it reaches `running`. The record must contain `cancelHandle: { kind: 'local-pgid', pgid: <number> }` and must NOT contain `cancelMetadata`. The `pgid` value must equal the babysitter's PID.

- V7 [R11]: Cancel a running session via `session-cancel`. Both the babysitter and the claude process must die (verify with `ps`). The signal must have been sent to the process group (negative PID).

- V8 [R12]: Send SIGTERM to the babysitter process (`kill <babysitter-pid>`). The session record must transition to `cancelled` (not `failed`). The claude process must also die.

- V9 [R13, R14]: Put a session into `failed` state (e.g., via reconciler). Then call `session-record` with `status: 'completed'` and a transcript for the same session. The session must remain `failed`. The transcript must be written to the transcripts book.

- V10 [R14, R16]: Put a session into `completed` state. Call `session-record` again with the same sessionId and `status: 'completed'`. The handler must return `{ ok: true }` without error. No duplicate transcript write.

- V11 [R17, R18]: Start a detached session but prevent the babysitter from reporting running (e.g., block the tool server port briefly). The `processInfo` promise must resolve with `{ kind: 'local-pgid', pgid: <babysitter-pid> }` as the fallback.

- V12 [R14]: In `babysitter.ts`, confirm that `systemPromptTmpDir` is deleted in the finally block. Start a session with a system prompt. After the session completes, verify the temp directory no longer exists: `ls /tmp/nsg-detached-*` should not include the session's temp dir.

- V13 [R9]: Call `session-running` with `cancelHandle: { pid: 12345 }` (old format, missing `kind`). The call must be rejected by Zod validation (HTTP 400 or equivalent tool error).

## Test Cases

### Heartbeat endpoint

- **Happy path**: Call `session-heartbeat` with a valid running session ID. `lastActivityAt` is updated. Returns `{ ok: true }`.
- **Terminal session**: Call `session-heartbeat` for a `completed` session. `lastActivityAt` is NOT updated. Returns `{ ok: true, status: 'completed' }`.
- **Unknown session**: Call `session-heartbeat` with a non-existent session ID. Returns `{ ok: false, error: 'Session not found' }`.

### Heartbeat timer (babysitter)

- **Timer starts after ready report**: Mock the guild HTTP server. After `runBabysitter` reports running, verify that heartbeat POSTs to `/api/session/heartbeat` arrive every ~30s.
- **Timer stops before terminal report**: Verify no heartbeat calls arrive after the claude process exits and the terminal report is sent.
- **Heartbeat failure is silent**: Configure the mock server to reject heartbeats. The babysitter must continue running and eventually report its terminal state normally.

### Guild self-heartbeat

- **Writes on startup**: After `start()`, the `state` book contains `{ id: 'guild-heartbeat', guildAliveAt: <recent> }`.
- **Updates periodically**: After 30s, `guildAliveAt` has advanced.
- **Downtime credit computed correctly**: Write a `guild-heartbeat` doc with `guildAliveAt` = 2 minutes ago. Call `start()`. The computed downtime credit must be approximately `120_000 - 30_000 = 90_000ms`.

### Reconciler

- **Stale running session**: Insert a session with `status: 'running'`, `lastActivityAt` = 120s ago. Call `recoverOrphans(sessions, 0)`. Session transitions to `failed` with the staleness error message.
- **Stale pending session**: Same as above with `status: 'pending'`. Must also transition to `failed`.
- **Fresh session untouched**: Insert a session with `lastActivityAt` = 10s ago. Call `recoverOrphans`. Session remains `running`.
- **Downtime credit applied**: Insert a session with `lastActivityAt` = 100s ago. Call `recoverOrphans(sessions, 30_000)`. Effective silence = 70s < 90s threshold. Session remains `running`.
- **Downtime credit not applied to periodic**: Same session, call `recoverOrphans(sessions, 0)`. Silence = 100s > 90s. Session transitions to `failed`.
- **Legacy backfill**: Insert a session with `status: 'running'`, no `lastActivityAt`. Call `recoverOrphans`. Session gains `lastActivityAt` = now and remains `running`. Second call 120s later (simulated): session transitions to `failed`.
- **Single-flight guard**: Start two overlapping `recoverOrphans` calls. Only one executes; the second is skipped.
- **Terminal sessions ignored**: Insert a `completed` session. `recoverOrphans` does not touch it.

### Cancel handle

- **Strict Zod validation accepts new format**: Call `session-running` with `cancelHandle: { kind: 'local-pgid', pgid: 12345 }`. Succeeds.
- **Strict Zod validation rejects old format**: Call `session-running` with `cancelHandle: { pid: 12345 }`. Rejected by Zod.
- **Strict Zod validation rejects garbage**: Call `session-running` with `cancelHandle: { kind: 'unknown', foo: 'bar' }`. Rejected by Zod.
- **Provider dispatches on local-pgid**: Mock `process.kill`. Call `provider.cancel({ kind: 'local-pgid', pgid: 42 })`. Verify `process.kill(-42, 'SIGTERM')` was called (negative PID).
- **Provider handles ESRCH**: Mock `process.kill` to throw ESRCH. Call `provider.cancel({ kind: 'local-pgid', pgid: 42 })`. No error thrown.
- **Provider skips unknown kind**: Call `provider.cancel({ kind: 'future-thing' })`. No error, no kill call.
- **Provider handles missing kind**: Call `provider.cancel({})`. No error, no kill call.
- **Fallback constructs handle**: In `launchDetached`, when `pollForProcessInfo` times out, the returned processInfo is `{ kind: 'local-pgid', pgid: <babysitter-pid> }`.

### SIGTERM handler

- **Sets cancelled flag**: Install SIGTERM handler in `runBabysitter`. Send SIGTERM to the process. The terminal report must use status `cancelled`.
- **Propagates to claude**: After SIGTERM, the claude child process must receive SIGTERM (verify via mock `claudeProc.kill` call).
- **Heartbeat timer stopped**: After SIGTERM, no further heartbeat calls are made.
- **Cleanup still runs**: After SIGTERM → cancelled exit, MCP server is closed, db is closed, tmpDir and systemPromptTmpDir are deleted.

### Terminal-state immutability

- **Rejects write to completed session**: Session in `completed`. Call `handleSessionRecord` with `status: 'failed'`. Session remains `completed`. Returns `{ ok: true, status: 'completed' }`.
- **Rejects write to failed session**: Session in `failed` (reconciled). Call `handleSessionRecord` with `status: 'completed'`. Session remains `failed`.
- **Writes transcript for duplicate**: Session in `failed` (no transcript). Call `handleSessionRecord` with `status: 'completed'` and a transcript. Session status unchanged. Transcript written.
- **Preserves cancelled behavior**: Session in `cancelled`. Same behavior as before — status unchanged, transcript written if provided.

### System-prompt temp dir cleanup

- **Config field populated**: `buildBabysitterConfig` with `systemPrompt` set produces a config with `systemPromptTmpDir` pointing to an existing directory.
- **Config field absent**: `buildBabysitterConfig` without `systemPrompt` produces a config with `systemPromptTmpDir` undefined.
- **Cleanup in finally**: After `runBabysitter` completes, both `tmpDir` and `systemPromptTmpDir` are deleted.
