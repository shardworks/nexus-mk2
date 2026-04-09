---
author: plan-writer
estimated_complexity: 8
---

# Cancellable Animator Sessions

## Summary

Add the ability to cancel running Animator sessions from any process. This includes a new `'cancelled'` terminal status, persistent cancel metadata on `SessionDoc` for cross-process cancellation, a `cancel()` method on `AnimatorApi`, a provider-level cancel interface, the claude-code SIGTERM implementation, and a `session-cancel` tool.

## Current State

The Animator (`packages/plugins/animator/src/animator.ts`) launches sessions via a pluggable session provider and records results to The Stacks. There is no mechanism to cancel a running session.

**Session status values today:**

- `SessionDoc.status`: `'running' | 'completed' | 'failed' | 'timeout'`
- `SessionResult.status`: `'completed' | 'failed' | 'timeout'` (terminal only)
- `SessionProviderResult.status`: `'completed' | 'failed' | 'timeout'`

**AnimatorApi today:**

```typescript
export interface AnimatorApi {
  summon(request: SummonRequest): AnimateHandle;
  animate(request: AnimateRequest): AnimateHandle;
  subscribeToSession(sessionId: string): AsyncIterable<SessionChunk> | null;
}
```

**AnimatorSessionProvider.launch() return type today:**

```typescript
launch(config: SessionProviderConfig): {
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionProviderResult>;
};
```

**SessionDoc today** — no process metadata field. When a session is running, no information exists in The Stacks that could be used to kill the process from another OS process.

**The claude-code provider** (`packages/plugins/claude-code/src/index.ts`) spawns `claude` via `node:child_process.spawn()`. The `ChildProcess` handle (including PID) is local to the spawn helper functions (`spawnClaudeStreamJson`, `spawnClaudeStreamingJson`) and is never surfaced to the Animator.

**The result handler** in `animate()` (lines 471-489 of `animator.ts`) awaits the provider result promise, builds a `SessionResult`, and writes it to Stacks via `recordSession()`. It uses `sessions.put()` which does a full replace. It does not read the current doc before writing.

**The `recordRunning()` function** (line 309) writes the initial `'running'` record via `sessions.put()`. It does not include any process metadata.

**Existing tools:** `session-list`, `session-show`, `summon`. No cancel tool exists.

## Requirements

- R1: `SessionDoc.status` must include `'cancelled'` as a terminal status alongside `'completed'`, `'failed'`, and `'timeout'`.
- R2: `SessionResult.status` must include `'cancelled'` as a terminal status.
- R3: `SessionProviderResult.status` must include `'cancelled'` as a terminal status.
- R4: `SessionDoc` must have a `cancelMetadata?: Record<string, unknown>` field for persisting provider-owned opaque process metadata (e.g. `{ pid: number }` for local processes, `{ containerId: string }` for future docker).
- R5: `AnimatorSessionProvider.launch()` must return `processInfo?: Promise<Record<string, unknown>>` alongside `chunks` and `result`. The promise resolves with provider-specific metadata as soon as the process is spawned.
- R6: `AnimatorSessionProvider` must support an optional `cancel?(cancelMetadata: Record<string, unknown>): Promise<void>` method. Providers that support cancellation implement this; the Animator calls it with the stored `cancelMetadata` from the SessionDoc.
- R7: The initial `'running'` record written by `recordRunning()` must await the `processInfo` promise from `launch()` and include the resolved value as `cancelMetadata` on the SessionDoc.
- R8: `AnimatorApi` must expose `cancel(sessionId: string, options?: { reason?: string }): Promise<SessionDoc>`. When called on a running session, it must: (a) patch the SessionDoc to `status: 'cancelled'` with `endedAt`, `durationMs`, and the reason in the `error` field; (b) call `provider.cancel(cancelMetadata)` if cancelMetadata is available; (c) return the updated SessionDoc.
- R9: When `cancel()` is called on a session that is already in a terminal state (`completed`, `failed`, `timeout`, `cancelled`), it must return the existing SessionDoc without modification (idempotent no-op).
- R10: When `cancel()` is called with a session ID that does not exist, it must throw an error `'Session "{id}" not found.'`.
- R11: When `cancel()` is called on a running session whose `cancelMetadata` is not yet available (process hasn't spawned), it must still patch the SessionDoc to `'cancelled'`. The kill signal is skipped but the result handler will detect the cancelled status.
- R12: The `animate()` result handler must read the current SessionDoc from Stacks before writing. When the stored status is already `'cancelled'`, the handler must: (a) skip the SessionDoc overwrite; (b) write the partial transcript if available; (c) resolve `AnimateHandle.result` with a `SessionResult` having `status: 'cancelled'` (not reject).
- R13: The claude-code provider must implement `cancel(cancelMetadata)` by sending `SIGTERM` to the PID in `cancelMetadata.pid`. It must catch `ESRCH` silently (process already dead) and let `EPERM` and other errors propagate.
- R14: The claude-code provider's `processInfo` promise must resolve with `{ pid: number }` — the OS process ID of the spawned `claude` process.
- R15: A `session-cancel` tool must exist with `callableBy: 'patron'`, `permission: 'animate'`, accepting `{ id: string, reason?: string }`. It must delegate to `AnimatorApi.cancel()` and return the full updated `SessionDoc`.
- R16: The `session-list` tool's status parameter must include `'cancelled'` in its `z.enum`.
- R17: The cancelled session's `exitCode` must be whatever the OS reports (not fabricated).

## Design

### Type Changes

**`packages/plugins/animator/src/types.ts` — SessionResult:**

```typescript
export interface SessionResult {
  id: string;
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  provider: string;
  exitCode: number;
  error?: string;
  conversationId?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  output?: string;
}
```

**`packages/plugins/animator/src/types.ts` — SessionProviderResult:**

```typescript
export interface SessionProviderResult {
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  exitCode: number;
  error?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  transcript?: TranscriptMessage[];
  output?: string;
}
```

**`packages/plugins/animator/src/types.ts` — SessionDoc:**

```typescript
export interface SessionDoc {
  id: string;
  /**
   * Session status. Initially written as `'running'` when the session is
   * launched, then updated to a terminal status (`'completed'`, `'failed'`,
   * `'timeout'`, or `'cancelled'`) after the provider exits or cancel is called.
   */
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
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
  /**
   * Provider-owned opaque metadata for cross-process cancellation.
   * Written by the Animator from the provider's processInfo at session launch.
   * The Animator does not interpret this — it passes it back to the provider's
   * cancel() method when cancellation is requested.
   *
   * Shape is provider-specific:
   * - claude-code: { pid: number }
   * - future docker: { containerId: string }
   * - future remote: { jobId: string, host: string }
   */
  cancelMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}
```

**`packages/plugins/animator/src/types.ts` — AnimatorApi:**

```typescript
export interface AnimatorApi {
  summon(request: SummonRequest): AnimateHandle;
  animate(request: AnimateRequest): AnimateHandle;
  subscribeToSession(sessionId: string): AsyncIterable<SessionChunk> | null;

  /**
   * Cancel a running session.
   *
   * Patches the SessionDoc to 'cancelled' with endedAt, durationMs, and
   * the optional reason in the error field. If cancelMetadata is available,
   * delegates to the provider's cancel() method to kill the process.
   *
   * Idempotent: if the session is already in a terminal state, returns the
   * existing SessionDoc without modification. Throws if the session ID
   * does not exist.
   *
   * Does NOT wait for the process to die — returns immediately after
   * patching and sending the kill signal.
   */
  cancel(sessionId: string, options?: { reason?: string }): Promise<SessionDoc>;
}
```

**`packages/plugins/animator/src/types.ts` — AnimatorSessionProvider:**

```typescript
export interface AnimatorSessionProvider {
  name: string;

  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
    /**
     * Provider-specific process metadata for cross-process cancellation.
     * Resolves as soon as the process is spawned. The Animator persists the
     * resolved value as `cancelMetadata` on the SessionDoc.
     *
     * Optional — providers that don't support cancellation omit this.
     */
    processInfo?: Promise<Record<string, unknown>>;
  };

  /**
   * Cancel a running session using previously persisted process metadata.
   *
   * Called by the Animator with the cancelMetadata from the SessionDoc.
   * The provider interprets the metadata and kills the process.
   *
   * Optional — providers that don't support cancellation omit this.
   */
  cancel?(cancelMetadata: Record<string, unknown>): Promise<void>;
}
```

### Behavior

#### `animate()` — recording the initial 'running' record (R7)

When `provider.launch()` returns a `processInfo` promise, `recordRunning()` must await it and include the resolved value as `cancelMetadata` in the initial `sessions.put()` call. The existing fire-and-forget pattern is preserved — `animate()` assigns the result of the async `recordRunning` to `initPromise` without awaiting it inline, so streaming is not blocked.

Concretely, the `recordRunning()` function gains a `cancelMetadata?: Record<string, unknown>` parameter. In `animate()`, a wrapper awaits the processInfo promise and then calls `recordRunning()`:

```
const initPromise = (async () => {
  let cancelMetadata: Record<string, unknown> | undefined;
  if (processInfoPromise) {
    try {
      cancelMetadata = await processInfoPromise;
    } catch (err) {
      console.warn(`[animator] Failed to get processInfo for ${id}: ${err}`);
    }
  }
  await recordRunning(sessions, id, startedAt, provider.name, request, cancelMetadata);
})();
```

The `recordRunning()` function includes `cancelMetadata` in its `sessions.put()` call alongside the existing fields.

#### `cancel()` — the cancellation flow (R8, R9, R10, R11)

```
cancel(sessionId, options?)
  ├─ 1. Read SessionDoc from Stacks
  │     → not found: throw Error('Session "{id}" not found.')
  │     → status !== 'running': return doc as-is (idempotent no-op)
  │
  ├─ 2. Patch SessionDoc:
  │     status: 'cancelled'
  │     endedAt: new Date().toISOString()
  │     durationMs: computed from startedAt
  │     error: options?.reason (if provided)
  │
  ├─ 3. If doc.cancelMetadata exists:
  │     ├─ Resolve the provider via resolveProvider(config)
  │     ├─ If provider.cancel exists, call provider.cancel(doc.cancelMetadata)
  │     └─ Catch and log errors (don't propagate — the SessionDoc is already patched)
  │
  └─ 4. Return the updated SessionDoc from step 2
```

When `cancelMetadata` is absent (process hasn't spawned yet — R11), the SessionDoc is still patched to `'cancelled'`. The process may start and run briefly, but the result handler (R12) will detect the cancelled status and not overwrite it.

#### `animate()` result handler — cancellation detection (R12)

The result handler (the `result` promise in `animate()`) currently awaits the provider result, builds a `SessionResult`, and calls `recordSession()` to write it. This must be modified:

**Before writing the SessionDoc, read the current document.** If its status is already `'cancelled'`, the session was cancelled (by this process or another):

- **Happy path (provider resolves):** When `sessions.get(id)` returns a doc with `status === 'cancelled'`:
  1. Build a `SessionResult` from the provider result but override `status` to `'cancelled'`, and set `error` and `endedAt`/`durationMs` from the stored doc.
  2. Write the partial transcript to the transcripts book (R14 — partial transcripts are valuable for debugging).
  3. Do NOT overwrite the sessions doc (it's already correct).
  4. Resolve the promise with the cancelled `SessionResult`.

- **Error path (provider rejects):** Same check. When the provider rejects (process killed → non-zero exit → error thrown), read the SessionDoc. If status is `'cancelled'`:
  1. Build a cancelled `SessionResult` with the stored `endedAt`/`durationMs`/`error`.
  2. **Resolve** (not reject) the promise — cancellation is intentional, not an error (R12/R13).
  3. Do NOT call `recordSession()`.

When the stored status is NOT `'cancelled'`, proceed with the existing behavior (write the session result normally, re-throw on error).

#### claude-code provider — processInfo (R14)

Both spawn helpers (`spawnClaudeStreamJson` and `spawnClaudeStreamingJson`) have access to `proc.pid` immediately after `spawn()`. The provider's `launch()` method must create and resolve a `processInfo` promise with `{ pid }` once the process is spawned.

In the current `launch()` flow, `prepareSession()` is async (MCP server start). The spawn happens inside the `.then()` callback. The `processInfo` promise must be created outside the `.then()` chain and resolved from within it:

```
launch(config) {
  let resolveProcessInfo: ((info: Record<string, unknown>) => void) | null = null;
  const processInfo = new Promise<Record<string, unknown>>((resolve) => {
    resolveProcessInfo = resolve;
  });

  const result = prepareSession(config).then(async ({ tmpDir, args, mcpHandle }) => {
    // ... build args ...
    if (config.streaming) {
      const spawned = spawnClaudeStreamingJson(args, ...);
      // spawned has access to proc.pid — need to surface it
      resolveProcessInfo!({ pid: spawned.pid });
      // ... rest of streaming flow
    } else {
      // non-streaming path — spawn happens inside spawnClaudeStreamJson
      const { result: rawResult, pid } = spawnClaudeStreamJson(args, ...);
      resolveProcessInfo!({ pid });
      // ... rest of non-streaming flow
    }
  });

  return { chunks, result, processInfo };
}
```

This requires the two internal spawn helpers to return the PID alongside their existing return values. `spawnClaudeStreamingJson` currently returns `{ chunks, result }` — it must also return `pid`. `spawnClaudeStreamJson` currently returns `Promise<StreamJsonResult>` — it must return `{ result: Promise<StreamJsonResult>, pid: number }` instead.

Specifically:

**`spawnClaudeStreamJson`** changes from:
```typescript
function spawnClaudeStreamJson(...): Promise<StreamJsonResult>
```
to:
```typescript
function spawnClaudeStreamJson(...): { result: Promise<StreamJsonResult>; pid: number }
```
The function creates `proc` via `spawn()`, then returns `{ result: new Promise(...), pid: proc.pid! }` instead of returning the promise directly.

**`spawnClaudeStreamingJson`** changes from:
```typescript
function spawnClaudeStreamingJson(...): { chunks, result }
```
to:
```typescript
function spawnClaudeStreamingJson(...): { chunks, result, pid: number }
```
It returns `proc.pid!` alongside the existing fields.

#### claude-code provider — cancel() (R13)

```typescript
async cancel(cancelMetadata: Record<string, unknown>): Promise<void> {
  const pid = cancelMetadata.pid as number | undefined;
  if (pid === undefined) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
      // Process already dead — expected for race conditions. Silent no-op.
      return;
    }
    throw err;
  }
}
```

SIGTERM gives the claude process a chance to clean up. The existing cleanup chain in the spawning process (MCP server close, tmpDir removal) still runs because the process close event fires normally.

### Non-obvious Touchpoints

- **`packages/plugins/animator/src/tools/index.ts`** — must add the `sessionCancel` re-export.
- **`packages/plugins/animator/src/animator.ts` line 511** — the `supportKit.tools` array must include the new `sessionCancel` tool: `tools: [sessionList, sessionShow, summonTool, sessionCancel]`.
- **`packages/plugins/animator/src/index.ts`** — the barrel file exports types from `types.ts`. No new named type exports are needed (cancel is added to the existing `AnimatorApi` interface), but verify nothing is missing after the type changes.
- **`packages/plugins/claude-code/src/index.ts` line 143** — the `provider` const must add the `cancel` method. Its type annotation in the `launch()` return must also include `processInfo`.

## Validation Checklist

- V1 [R1, R2, R3]: Verify `'cancelled'` is in all three status unions. `grep -n "cancelled" packages/plugins/animator/src/types.ts` must show it in `SessionDoc.status`, `SessionResult.status`, and `SessionProviderResult.status`.
- V2 [R4]: Verify `cancelMetadata?: Record<string, unknown>` exists on `SessionDoc`. `grep "cancelMetadata" packages/plugins/animator/src/types.ts` must match the field declaration.
- V3 [R5, R7]: Launch a session with a fake provider that returns processInfo. Verify the SessionDoc in Stacks contains the `cancelMetadata` value after the 'running' record is written.
- V4 [R6]: Verify `AnimatorSessionProvider` has `cancel?` method. `grep "cancel?" packages/plugins/animator/src/types.ts` must show the optional method on the interface.
- V5 [R8, R17]: Cancel a running session and verify: (a) SessionDoc status is `'cancelled'`; (b) `endedAt` and `durationMs` are set; (c) the reason string appears in the `error` field; (d) `exitCode` is the OS-reported value (not fabricated).
- V6 [R9]: Cancel an already-completed session. Verify the SessionDoc is returned unchanged (no fields modified, no error thrown).
- V7 [R10]: Call `cancel('ses-nonexistent')`. Verify it throws `'Session "ses-nonexistent" not found.'`.
- V8 [R11]: Cancel a session whose `cancelMetadata` is null/undefined. Verify the SessionDoc is patched to `'cancelled'` without error (kill is skipped).
- V9 [R12]: In a test with a fake provider, call `cancel()` while the provider result is pending. When the provider result resolves (or rejects), verify: (a) the SessionDoc is NOT overwritten (stays `'cancelled'`); (b) `AnimateHandle.result` resolves (not rejects) with `status: 'cancelled'`.
- V10 [R12, R14]: In a test with a fake provider that has a transcript, cancel the session and verify the partial transcript is written to the transcripts book.
- V11 [R13]: Verify the claude-code provider's `cancel()` method sends SIGTERM. In a unit test, mock `process.kill` and call `provider.cancel({ pid: 12345 })`. Verify `process.kill(12345, 'SIGTERM')` was called. Also verify that `{ code: 'ESRCH' }` errors are swallowed silently and `{ code: 'EPERM' }` errors propagate.
- V12 [R14]: Verify the claude-code provider returns `processInfo` from `launch()`. Await the promise and verify it resolves with `{ pid: <number> }`.
- V13 [R15]: Invoke the `session-cancel` tool handler with `{ id: '<running-session>', reason: 'test' }`. Verify it returns the full SessionDoc with `status: 'cancelled'` and `error: 'test'`.
- V14 [R16]: Verify the `session-list` tool accepts `status: 'cancelled'` without validation error. `grep "cancelled" packages/plugins/animator/src/tools/session-list.ts` must show it in the z.enum.
- V15 [R15]: Verify `session-cancel` tool has `callableBy: ['patron']` and `permission: 'animate'`.

## Test Cases

### AnimatorApi.cancel() — happy path
- Scenario: Launch a session with a fake provider. While running, call `cancel(sessionId, { reason: 'Cost overrun' })`.
- Expected: Returns SessionDoc with `status: 'cancelled'`, `error: 'Cost overrun'`, `endedAt` set, `durationMs` > 0.

### AnimatorApi.cancel() — idempotent on terminal session
- Scenario: Complete a session normally. Call `cancel(sessionId)`.
- Expected: Returns the existing SessionDoc with `status: 'completed'`, no fields modified.

### AnimatorApi.cancel() — idempotent on already-cancelled
- Scenario: Cancel a running session. Call `cancel(sessionId)` again.
- Expected: Returns the SessionDoc with `status: 'cancelled'`, no change from first cancel.

### AnimatorApi.cancel() — missing session
- Scenario: Call `cancel('ses-nonexistent')`.
- Expected: Throws `'Session "ses-nonexistent" not found.'`.

### AnimatorApi.cancel() — no cancelMetadata yet
- Scenario: Use a provider whose processInfo promise never resolves (simulating slow spawn). Call `cancel()` before processInfo resolves.
- Expected: SessionDoc patched to `'cancelled'`. No kill attempted. No error thrown.

### Result handler — detects external cancellation
- Scenario: Launch a session with a fake provider that returns after a delay. Before it returns, directly patch the SessionDoc to `'cancelled'` (simulating cross-process cancel). Let the provider resolve.
- Expected: `AnimateHandle.result` resolves with `status: 'cancelled'`. SessionDoc in Stacks still has `status: 'cancelled'` (not overwritten to `'completed'`).

### Result handler — detects cancellation on error path
- Scenario: Launch a session with a throwing fake provider. Before the throw, patch SessionDoc to `'cancelled'`. Let the provider reject.
- Expected: `AnimateHandle.result` resolves (NOT rejects) with `status: 'cancelled'`.

### Result handler — writes partial transcript on cancel
- Scenario: Launch a session with a fake provider that has a transcript. Cancel it. Let the provider resolve.
- Expected: Transcript is written to the transcripts book. Session record is not overwritten.

### cancelMetadata persistence
- Scenario: Launch a session with a provider whose processInfo resolves to `{ pid: 42 }`.
- Expected: After the 'running' record is written, `sessions.get(id)` returns a doc with `cancelMetadata: { pid: 42 }`.

### claude-code cancel — ESRCH handling
- Scenario: Call `provider.cancel({ pid: 999999 })` where PID 999999 does not exist.
- Expected: Resolves without error (ESRCH swallowed).

### claude-code cancel — EPERM propagation
- Scenario: Call `provider.cancel({ pid })` where the PID belongs to another user (mock process.kill to throw EPERM).
- Expected: Error propagates.

### session-cancel tool — basic invocation
- Scenario: Seed a running session in Stacks. Invoke `sessionCancel.handler({ id: 'ses-00000001', reason: 'manual stop' })`.
- Expected: Returns full SessionDoc with `status: 'cancelled'`, `error: 'manual stop'`.

### session-cancel tool — session not found
- Scenario: Invoke `sessionCancel.handler({ id: 'ses-nonexistent' })`.
- Expected: Throws `'Session "ses-nonexistent" not found.'`.

### session-list — filter by cancelled
- Scenario: Seed sessions with various statuses including `'cancelled'`. Call `sessionList.handler({ status: 'cancelled', limit: 20 })`.
- Expected: Returns only sessions with `status: 'cancelled'`.

### session-list — cancelled absent without filter
- Scenario: Seed sessions with various statuses. Call `sessionList.handler({ limit: 20 })`.
- Expected: All sessions returned, including any with `status: 'cancelled'`.
