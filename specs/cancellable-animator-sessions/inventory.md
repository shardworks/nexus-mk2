# Inventory: Cancellable Animator Sessions

## Brief

> We need a way to cancel Animator sessions which are currently running. This includes killing the claude process, closing API connects, etc. Ideally, this is something that could be done from another process than the one that spawned it -- so the session itself must persist some sort of metadata that can be used to cancel the session, rather than requiring an in-memory handle or such. Consider support for currently in-memory process based sessions, but also a future state where sessions run in docker containers or remote vms.
>
> This change should include:
> - any new statuses for SessionDoc that make sense
> - new tool(s) for cancelling sessions

---

## Affected Code

### Files to Modify

| File | Change |
|------|--------|
| `packages/plugins/animator/src/types.ts` | Add `'cancelled'` to `SessionDoc.status`; add `'cancelled'` to `SessionResult.status`; add `cancelMetadata`/`pid` field to `SessionDoc`; add `cancel()` to `AnimatorApi`; extend `AnimatorSessionProvider.launch()` return type to include a cancellation signal/pid; extend `SessionProviderResult.status` to include `'cancelled'` |
| `packages/plugins/animator/src/animator.ts` | Implement `cancel()` on `AnimatorApi`; persist process metadata (PID) to SessionDoc after launch; handle `'cancelled'` final state in `recordSession` and `buildSessionResult` |
| `packages/plugins/animator/src/tools/index.ts` | Re-export the new `session-cancel` tool |
| `packages/plugins/claude-code/src/index.ts` | Expose process PID from `launch()` return value; expose an abort mechanism (signal or kill function); update `spawnClaudeStreamJson` and `spawnClaudeStreamingJson` to support external kill |

### Files to Create

| File | Purpose |
|------|---------|
| `packages/plugins/animator/src/tools/session-cancel.ts` | New `session-cancel` tool — reads session's persisted metadata (PID) from Stacks and kills the process |

### Files to Modify (Tests)

| File | Change |
|------|--------|
| `packages/plugins/animator/src/animator.test.ts` | Add tests for `cancel()` lifecycle: PID persisted, process killed, status transitions to `'cancelled'` |
| `packages/plugins/animator/src/tools/session-tools.test.ts` | Add tests for `session-cancel` tool |

---

## Current Type Signatures (verbatim from source)

### `SessionDoc` — `packages/plugins/animator/src/types.ts:331`

```typescript
export interface SessionDoc {
  id: string;
  /**
   * Session status. Initially written as `'running'` when the session is
   * launched (Step 2), then updated to a terminal status (`'completed'`,
   * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
   */
  status: 'running' | 'completed' | 'failed' | 'timeout';
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
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}
```

### `SessionResult` — `packages/plugins/animator/src/types.ts:70`

```typescript
export interface SessionResult {
  id: string;
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout';
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

### `AnimatorApi` — `packages/plugins/animator/src/types.ts:179`

```typescript
export interface AnimatorApi {
  summon(request: SummonRequest): AnimateHandle;
  animate(request: AnimateRequest): AnimateHandle;
  subscribeToSession(sessionId: string): AsyncIterable<SessionChunk> | null;
}
```

### `AnimatorSessionProvider` — `packages/plugins/animator/src/types.ts:243`

```typescript
export interface AnimatorSessionProvider {
  name: string;
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
}
```

### `SessionProviderResult` — `packages/plugins/animator/src/types.ts:302`

```typescript
export interface SessionProviderResult {
  status: 'completed' | 'failed' | 'timeout';
  exitCode: number;
  error?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  transcript?: TranscriptMessage[];
  output?: string;
}
```

### `SessionProviderConfig` — `packages/plugins/animator/src/types.ts:264`

```typescript
export interface SessionProviderConfig {
  systemPrompt?: string;
  initialPrompt?: string;
  model: string;           // (required, from resolveModel())
  conversationId?: string;
  cwd: string;
  streaming?: boolean;
  tools?: ResolvedTool[];
  environment?: Record<string, string>;
}
```

### `AnimateHandle` — `packages/plugins/animator/src/types.ts:157`

```typescript
export interface AnimateHandle {
  sessionId: string;
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionResult>;
}
```

### `AnimateRequest` — `packages/plugins/animator/src/types.ts:23`

```typescript
export interface AnimateRequest {
  sessionId?: string;
  context: AnimaWeave;
  prompt?: string;
  cwd: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  streaming?: boolean;
  environment?: Record<string, string>;
}
```

---

## Current Implementation Details

### `animator.ts` — Key Data Structures

**`activeSessions` map** (in-memory, not persisted):
```typescript
const activeSessions = new Map<string, SessionBroadcaster>();
```
Keyed by session id. Entries removed ~30 s after session ends. This is the only in-memory handle the Animator currently has on a running session. Has no process metadata; cannot be used cross-process.

**`recordRunning()`** — writes the initial Stacks record on session launch:
```typescript
await sessions.put({
  id,
  status: 'running',
  startedAt,
  provider: providerName,
  conversationId: request.conversationId,
  metadata: request.metadata,
});
```
Note: this is where a `pid` or `processMetadata` field would naturally be written. But the PID isn't available at this call site yet — the provider `launch()` returns `{ chunks, result }`, not a PID.

**`animate()` flow** (simplified):
1. `id = request.sessionId ?? generateId(...)` — session id generated
2. `provider.launch(providerConfig)` — returns `{ chunks, result }` synchronously
3. `recordRunning(...)` — initial Stacks write (status: 'running') — fire-and-forget
4. Background: consume provider chunks → broadcaster
5. `result` promise: await `providerResultPromise`, then call `recordSession()`

The PID is **never returned** from `provider.launch()`. There's no mechanism to kill the process from outside `launch()`.

### `claude-code/src/index.ts` — Spawn Functions

Two internal functions (not exported):

**`spawnClaudeStreamJson(args, cwd, env, stdinData)`** — non-streaming path:
- `spawn('claude', args, { stdio: ['pipe', 'pipe', 'inherit'] })`
- `proc` is fully local; PID accessible as `proc.pid` but never returned
- Result promise resolves on `proc.on('close', ...)`
- No kill/abort mechanism

**`spawnClaudeStreamingJson(args, cwd, env, stdinData)`** — streaming path:
- Same spawn, also fully local, PID accessible as `proc.pid` but not returned
- Returns `{ chunks: AsyncIterable<SessionChunk>, result: Promise<StreamJsonResult> }`
- No kill/abort mechanism

The `provider.launch()` return type currently is:
```typescript
{
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionProviderResult>;
}
```

To expose the PID (or an abort handle), `launch()` must either:
- Return a `pid?: number` alongside `chunks` and `result`, or
- Return a `cancel?: () => void` function, or
- Return a richer object with process metadata

**MCP Server cleanup:** The `prepareSession()` / `cleanup()` flow already handles this:
```typescript
const cleanup = async () => {
  await mcpHandle?.close().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
};
```
`cleanup()` is called in the `.then()` after the process exits — i.e., it's automatic post-exit. For a forced cancel, cleanup would also need to run.

### Stacks: `sessions` book indexes

Current indexes on `sessions` book:
```
indexes: ['startedAt', 'status', 'conversationId', 'provider']
```
`status` is already indexed — efficient querying for `status = 'running'` already works.

### Tool patterns (from existing tools)

**`session-list.ts`** — queries Stacks directly via `stacks.readBook()`, no `AnimatorApi` needed:
```typescript
const stacks = guild().apparatus<StacksApi>('stacks');
const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
```
Permission: `'read'`. No `callableBy` restriction (available to all callers).

**`session-show.ts`** — same pattern, `stacks.readBook()`, no `AnimatorApi`:
- Permission: `'read'`.

**`summon.ts`** — calls `guild().apparatus<AnimatorApi>('animator')`:
- `callableBy: 'patron'`, `permission: 'animate'`

**`writ-cancel.ts`** (clerk, sibling pattern):
- `permission: 'clerk:write'`
- Calls `ClerkApi.transition()` to change status

---

## The Cross-Process Cancellation Problem

The brief says cancellation should work from a different process than the one that spawned the session. This is the core design challenge.

**What's currently available cross-process:** The `SessionDoc` in the Stacks (SQLite) — any process with access to the guild's Stacks database can read it. Currently it contains no process handle (no PID, no container ID, etc.).

**What needs to be added:**
- A persistent process identifier in `SessionDoc` (written at launch time)
- For local processes: OS PID
- For future docker/VM sessions: container ID, remote job ID, etc.

**The gap in current architecture:** `provider.launch()` returns synchronously with `{ chunks, result }` but does not return a PID or any cancellation signal. The PID is created inside the provider but stays there. To surface the PID cross-process, the provider must return it as part of the `launch()` return value, and the Animator must write it to the SessionDoc.

**Timing issue:** The PID is available immediately after `spawn()`. The `recordRunning()` call also fires immediately. But currently `recordRunning()` is called before the result of `launch()` is used (they're at the same indentation level in `animate()`). The PID would be available synchronously from `launch()` and could be included in the `recordRunning()` call or a subsequent `sessions.patch()` call.

---

## Adjacent Patterns

### Writ Cancellation (Clerk) — `packages/plugins/clerk/src/tools/writ-cancel.ts`

The clerk's `writ-cancel` tool transitions a writ to `'cancelled'` status via `ClerkApi.transition()`. Pattern:
- Tool takes `id` + optional `resolution` string
- Calls apparatus API to do the transition
- Apparatus validates the state machine transition
- Returns updated doc

**Applicability:** The `session-cancel` tool will follow the same shape — takes a `sessionId`, calls `AnimatorApi.cancel()` or equivalent, which updates the SessionDoc status. The difference is that session cancellation also involves killing an OS process.

### WritDoc terminal statuses — `packages/plugins/clerk/src/types.ts:22`

```typescript
export type WritStatus = 'new' | 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
```
Writs have `'cancelled'` as a terminal status alongside `'completed'` and `'failed'`. The same pattern applies naturally to sessions: `'cancelled'` is a terminal status for a session that was forcibly stopped.

### Stacks `patch()` — `packages/plugins/stacks/src/types.ts:98`

```typescript
patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
```
Partially updates a document. This would be the right method for:
1. Writing the PID to the `SessionDoc` after `recordRunning()` (partial update, not full replace)
2. Updating status to `'cancelled'` during cancel

---

## Existing Context

### In-Progress / Scratch Notes

No scratch notes found in `docs/in-progress/` specifically for the animator.

### `docs/architecture/apparatus/animator.md` — Open Questions Section

```
- Timeout. How are session timeouts configured? MVP: no timeout.
- Concurrency. Can multiple sessions run simultaneously? Current answer: yes.
```

The cancellation brief addresses the implicit timeout/kill question.

### `docs/architecture/apparatus/animator.md` — Future: Event Signalling

Mentions future `session.started` and `session.ended` events. A `session.cancelled` event would fit naturally here.

---

## SessionDoc Status Values — Current vs. Needed

| Status | Currently | Needed | Notes |
|--------|-----------|--------|-------|
| `'running'` | ✓ | ✓ | Transient; written at launch |
| `'completed'` | ✓ | ✓ | Terminal; session exited 0 |
| `'failed'` | ✓ | ✓ | Terminal; non-zero exit or throw |
| `'timeout'` | ✓ | ✓ | Terminal; session exceeded time limit |
| `'cancelled'` | ✗ | ✓ | Terminal; explicitly killed |
| `'cancelling'` | ✗ | ? | Intermediate state between cancel-requested and process-dead |

**`'cancelling'` status question:** There's a window between "cancel requested" and "process confirmed dead." Depending on design choice, there may or may not be an intermediate `'cancelling'` status. This is a decision for the analyst.

---

## `SessionResult` Status vs. `SessionDoc` Status

There is a current design distinction:
- `SessionDoc.status` = `'running' | 'completed' | 'failed' | 'timeout'` (includes running)
- `SessionResult.status` = `'completed' | 'failed' | 'timeout'` (terminal only)

`SessionResult` is the return value from `AnimateHandle.result` — it only exists after a session completes. So adding `'cancelled'` to `SessionResult.status` makes sense if the `result` promise is eventually resolved with a cancelled status when cancellation is requested during a running session.

**`SessionProviderResult.status`** — also currently `'completed' | 'failed' | 'timeout'`. If the provider is killed via SIGTERM, the process closes with a non-zero exit code. The provider's `close` handler gets `code` = null or some signal-dependent code. Currently this would map to `'failed'`. To get `'cancelled'`, the provider needs to know it was killed intentionally and return `status: 'cancelled'`.

---

## Cross-Process PID Persistence Design Space

To cancel a session from another process:

**Option A — PID field on SessionDoc:**
Add `pid?: number` to `SessionDoc`. Written by the Animator after `launch()` returns. A cancel tool reads it from Stacks and calls `process.kill(pid, 'SIGTERM')`.
- Pro: simple, no new infrastructure
- Con: PID namespace is OS-local; doesn't generalize to docker/remote VMs
- Con: PID may be reused by OS if session died and another process took the PID

**Option B — Opaque `processMetadata` object:**
Add `processMetadata?: Record<string, unknown>` to `SessionDoc`. Provider writes whatever it needs (e.g. `{ pid: 12345 }` for local, `{ containerId: 'abc123' }` for docker). The `AnimatorApi.cancel()` method reads this and dispatches to the current provider's cancel logic.
- Pro: extensible for future execution environments
- Pro: provider owns the interpretation of its own metadata
- Con: more complex; requires provider to have a `cancel(metadata)` method

**Option C — Separate cancelMetadata field:**
Like Option B but named `cancelMetadata` to distinguish from caller-supplied `metadata`.
- Same tradeoffs as B but clearer separation of concerns

**Option D — Provider-level abort signal:**
Add an `AbortSignal` or `AbortController` to `SessionProviderConfig`. The provider binds it to the process. The Animator passes it through. For cross-process cancellation, the Animator creates a new `AbortController` on-demand from the persisted PID.
- This is more of an in-process pattern and doesn't directly help with cross-process cancellation.

---

## `AnimatorSessionProvider` Interface Extension Needed

Currently `launch()` returns `{ chunks, result }`. To support cancellation, it needs to return something more. Options:

**Option 1 — Add `pid` to return type:**
```typescript
launch(config: SessionProviderConfig): {
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionProviderResult>;
  pid?: number;  // OS process ID for local providers
};
```

**Option 2 — Add opaque `processMetadata`:**
```typescript
launch(config: SessionProviderConfig): {
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionProviderResult>;
  processMetadata?: Record<string, unknown>;
};
```

**Option 3 — Add `cancel()` method to AnimatorSessionProvider:**
```typescript
export interface AnimatorSessionProvider {
  name: string;
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
  cancel?(sessionId: string, processMetadata: Record<string, unknown>): Promise<void>;
}
```
This approach keeps `launch()` unchanged and adds a separate cancel method on the provider. The Animator calls `provider.cancel(id, metadata)` when a session needs to be killed. The provider implements the kill logic for its execution environment.

**Option 4 — Add `kill()` to the launch return:**
```typescript
launch(config: SessionProviderConfig): {
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionProviderResult>;
  kill?: () => void;  // in-process kill; for cross-process, use persisted metadata
};
```

---

## `AnimatorApi` Cancel Method Shape

New method needed on `AnimatorApi`:
```typescript
cancel(sessionId: string): Promise<{ status: 'cancelled' | 'not_running' }>;
```
Or possibly:
```typescript
cancel(sessionId: string): Promise<SessionDoc>;
```

---

## Tool: `session-cancel`

Expected shape (following sibling tools):
```typescript
export default tool({
  name: 'session-cancel',
  description: 'Cancel a running session',
  params: {
    id: z.string().describe('Session id'),
    signal: z.enum(['SIGTERM', 'SIGKILL']).optional().describe('...'),
  },
  permission: 'animate',  // or 'read'?
  handler: async (params) => { ... }
});
```

Questions for analyst:
- Does this call `AnimatorApi.cancel()` or operate directly on Stacks + `process.kill()`?
- What `callableBy` / `permission` is appropriate for a destructive action like cancellation?
- Should it be patron-only or also callable by animas?

---

## Doc/Code Discrepancies

1. **`animator.md` Kit Contribution block** lists tools as `[sessionList, sessionShow, summon]` — matches code.

2. **`animator.md` `SessionResult.status`** shows `'completed' | 'failed' | 'timeout'` — matches code exactly.

3. **`summon.ts` `callableBy`** is `'patron'` in code. The `animator.md` says "CLI-only (`callableBy: 'cli'`)" — this is a discrepancy. Code says `'patron'`, doc says `'cli'`. The test seeds don't exercise `callableBy`. The code is the ground truth: `callableBy: 'patron'`.

4. **`session-list.ts` status filter enum** includes `'running'` as a valid filter value — the `session-tools.test.ts` has a test for filtering by `'running'`. This is correct behavior. The doc doesn't mention that `'running'` is a filterable status (it focuses on terminal states) but the code works fine.

5. **`model` field in `SessionProviderConfig`** — in `types.ts:264`, the interface has `model` as a required field (no `?`). But the JSDoc comment says "May be undefined if composition is not yet implemented" for `systemPrompt`. The `buildProviderConfig()` in `animator.ts` always passes `model` from `resolveModel()`. This is consistent.

---

## Summary of Changes Required

### `types.ts`
- `SessionDoc.status`: add `'cancelled'`
- `SessionDoc`: add `processMetadata?: Record<string, unknown>` (or `pid?: number`)
- `SessionResult.status`: add `'cancelled'`
- `SessionProviderResult.status`: add `'cancelled'`
- `AnimatorSessionProvider.launch()` return type: add process metadata or kill mechanism
- `AnimatorApi`: add `cancel(sessionId: string): Promise<...>`

### `animator.ts`
- After `provider.launch()`, write process metadata (PID) to `SessionDoc` via `sessions.patch()`
- Implement `AnimatorApi.cancel()`:
  - Read `SessionDoc` from Stacks; verify status is `'running'`
  - Extract `processMetadata` (PID for local processes)
  - Kill the process (via `process.kill(pid, 'SIGTERM')` or similar)
  - Update `SessionDoc.status` to `'cancelled'` (or `'cancelling'` transitionally)
  - Handle case where session is in-memory (same process) vs. remote process

### `claude-code/src/index.ts`
- Return `pid` (or `processMetadata: { pid }`) from `provider.launch()`
- Handle SIGTERM gracefully in the process close handler (map to `status: 'cancelled'`)

### `tools/session-cancel.ts` (new)
- Read SessionDoc from Stacks
- Validate session is cancellable (status: 'running')
- Delegate to `AnimatorApi.cancel()` or directly kill process via persisted PID

### `tools/index.ts`
- Export `sessionCancel`

### `animator.test.ts`
- Tests for cancel() on in-process sessions
- Tests for cancel() on unknown sessions
- Tests for cancel() on already-terminal sessions (idempotency)

### `tools/session-tools.test.ts`
- Tests for session-cancel tool

---

## Files Confirmed Unaffected

- `packages/plugins/stacks/` — no changes needed; `patch()` already exists on `Book`
- `packages/plugins/loom/` — not involved in cancellation
- `packages/plugins/clerk/` — not involved (pattern reference only)
- `packages/framework/arbor/` — no changes
- `packages/framework/cli/` — no changes (CLI surface via tools, not direct)
- `packages/plugins/animator/src/index.ts` — may need to re-export new `cancel` type if any
