# Writ Cancellation → Rig Cascade

## Summary

Add a CDC watcher in the Spider that detects writ cancellation and automatically cancels the associated rig, closing the gap where cancelled writs leave orphaned rigs consuming throttle slots and model spend. Also fix the existing rig→writ CDC handler to guard against already-terminal writs, which is both a standalone bug and a prerequisite for circular cascade safety.

## Current State

**Rig→writ cascade exists** (`packages/plugins/spider/src/spider.ts`, lines 2065–2122): A Phase 1 CDC watcher on `spider/rigs` detects terminal rig states and calls `clerk.transition()` to move the associated writ to the same terminal status.

**Writ→rig cascade does not exist**: When a writ is cancelled via `clerk.transition(writId, 'cancelled')`, no code cancels the associated rig. The rig continues running, consuming engine slots and babysitter subprocesses.

**Circular cascade bug on main**: The rig→writ CDC handler (lines 2065–2122) unconditionally calls `clerk.transition()` without checking if the writ is already terminal. `clerk.transition()` throws when the target status is not in `ALLOWED_FROM` for the current status. Since the handler runs in Phase 1 (`failOnError: true`), this rolls back the entire transaction — meaning you cannot cancel a rig whose writ is already cancelled.

**Parent→child cascade exists** (`packages/plugins/clerk/src/clerk.ts`, lines 530–548): A Phase 1 CDC watcher on `clerk/writs` calls `handleParentTerminal()` which cancels all non-terminal children when a parent writ reaches any terminal status.

**Key existing code:**

```typescript
// spider.ts — SpiderApi.cancel() (lines 1882–1939)
async cancel(rigId: string, options?: { reason?: string }): Promise<RigDoc>
// Idempotent: returns unchanged rig if already completed/failed/cancelled.
// Finds active engine, cancels animator session (best-effort), calls cancelEngine(),
// rejects pending input requests.

// spider.ts — SpiderApi.forWrit() (lines 1846–1849)
async forWrit(writId: string): Promise<RigDoc | null>
// Looks up rig by writId index. Returns null if no rig exists.

// spider.ts — writsBook (line 2060)
writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
// Read-only handle to clerk/writs already exists in spider scope.
```

```typescript
// clerk.ts — TERMINAL_STATUSES (line 73)
const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled']);

// clerk.ts — ALLOWED_FROM (status machine)
cancelled: ['new', 'ready', 'active', 'waiting']  // cannot transition from completed/failed/cancelled
```

## Requirements

- R1: When a writ transitions to `cancelled`, the Spider must automatically cancel the associated rig (if one exists) within the same transaction.
- R2: The writ→rig cascade must be implemented as a CDC watcher in the Spider watching `clerk/writs`, running in Phase 1 (`failOnError: true`).
- R3: When the cascade fires and no rig exists for the cancelled writ (e.g., draft writs, quest writs), the handler must return silently with no logging.
- R4: The cancel reason passed to `spider.cancel()` must be `"Writ <writId> cancelled"` where `<writId>` is the actual writ ID.
- R5: Only the `cancelled` status must trigger rig cancellation. Writs transitioning to `completed` or `failed` must not cancel the rig.
- R6: The existing rig→writ CDC handler must guard against already-terminal writs by reading the writ before calling `clerk.transition()`. When the writ is already terminal (`completed`, `failed`, or `cancelled`), skip the transition silently.
- R7: The circular cascade (writ cancelled → rig cancelled → CDC tries to cancel writ again) must be safe: the terminal guard from R6 causes the second leg to no-op.
- R8: Subtree cascade must work end-to-end: cancelling a parent writ triggers clerk's parent→child cascade, each child cancellation triggers the new writ→rig CDC handler, and each child's rig is cancelled. No explicit subtree code is needed — this emerges from S1 + the existing parent→child cascade.

## Design

### Rig→Writ CDC Handler Fix (S2)

In the existing `stacks.watch<RigDoc>('spider', 'rigs', ...)` handler at line 2065 of `spider.ts`, add a terminal-writ guard before each `clerk.transition()` call.

After the status-change check (`if (rig.status === prev.status) return;`), before entering the `if/else if` chain for `completed`/`failed`/`cancelled`, read the writ and check if it is already terminal:

```typescript
const writ = await writsBook.get(rig.writId);
if (!writ) return;
const writIsTerminal = writ.status === 'completed' || writ.status === 'failed' || writ.status === 'cancelled';
if (writIsTerminal) return;
```

This guard uses the existing `writsBook` read-only handle (line 2060). `writsBook.get()` reads within the transaction context, so it sees the current (possibly just-modified) writ status. When the writ is already terminal — whether from an explicit cancel, a prior cascade, or any other path — the handler skips silently.

This replaces the need to guard each individual `clerk.transition()` branch. A single early return covers all three terminal rig statuses.

### Writ→Rig CDC Watcher (S1)

Register a new CDC watcher in the Spider's `start()` method, after the existing `stacks.watch<RigDoc>(...)` block (after line 2122). The watcher observes `clerk/writs`:

```typescript
stacks.watch<WritDoc>(
  'clerk',
  'writs',
  async (event) => {
    if (event.type !== 'update') return;

    const writ = event.entry;
    const prev = event.prev;

    // Only act when status changes to cancelled
    if (writ.status === prev.status) return;
    if (writ.status !== 'cancelled') return;

    // Look up the associated rig
    const rig = await api.forWrit(writ.id);
    if (!rig) return;

    // Cancel the rig
    await api.cancel(rig.id, { reason: `Writ ${writ.id} cancelled` });
  },
  { failOnError: true },
);
```

Place this new watcher immediately after the closing of the existing rig→writ watcher and before the closing brace of the `start()` method.

### Behavior

**When a writ transitions to `cancelled`:**
1. The clerk's own CDC handler fires first (clerk starts before spider — registration order): `handleParentTerminal()` cancels non-terminal children; `handleChildTerminal()` notifies the parent.
2. The spider's new CDC handler fires: detects `writ.status === 'cancelled'`, calls `api.forWrit(writ.id)`.
3. If `forWrit` returns `null` (no rig for this writ), handler returns silently.
4. If a rig exists, calls `api.cancel(rig.id, { reason: 'Writ <writId> cancelled' })`.
5. `api.cancel()` is idempotent — if the rig is already terminal (from a prior cancel path), it returns the rig unchanged.
6. `api.cancel()` cancels the active engine, cancels the animator session (best-effort), marks pending/blocked engines cancelled, rejects pending input requests.
7. The rig patch to `cancelled` fires the existing rig→writ CDC handler.
8. The rig→writ handler reads the writ via `writsBook.get()`, finds it already `cancelled`, and returns silently (R6 guard).

**When a writ transitions to `completed` or `failed`:**
- The new watcher returns early (`writ.status !== 'cancelled'`). The rig is not touched.

**When a cancelled writ has no rig:**
- `api.forWrit(writ.id)` returns `null`. Handler returns silently. No logging.

**Subtree cascade (parent cancel → child rigs cancel):**
1. Parent writ cancelled → clerk CDC fires `handleParentTerminal()` → each non-terminal child writ transitions to `cancelled`.
2. Each child writ `cancelled` transition fires the spider CDC handler → `forWrit(childWritId)` → `api.cancel(childRigId)`.
3. Each child rig cancellation fires the rig→writ CDC handler → reads child writ → already `cancelled` → skips silently.
4. All of this happens within a single Phase 1 transaction, bounded by `MAX_CASCADE_DEPTH = 16`.

**Circular cascade safety:**
- The cycle is: writ→cancelled → spider CDC cancels rig → rig→cancelled → spider CDC tries to cancel writ → writ already `cancelled` → guard returns → done.
- The guard at the rig→writ handler breaks the cycle. `spider.cancel()` idempotency provides a secondary safety net if the rig→writ handler were to somehow fire twice.

### Non-obvious Touchpoints

- The misleading comment at line 2119 (`// 'blocked' and 'cancelled' (handled above) — no further CDC action`) should be clarified while modifying the surrounding code. Change to: `// 'blocked' — no CDC action (rig is waiting for unblock, not terminal)`.

## Validation Checklist

- V1 [R1, R2]: Cancel a writ that has an active (running or blocked) rig via `clerk.transition(writId, 'cancelled')`. Verify the rig transitions to `cancelled` and the cancelled engine has `error: 'Writ <writId> cancelled'`. Verify this happens atomically (no intermediate committed state where writ is cancelled but rig is running).
- V2 [R3]: Cancel a writ that has no associated rig (create a writ, don't crawl). Verify no error is thrown and no rig-related side effects occur.
- V3 [R4]: After a writ-triggered rig cancellation, read the cancelled engine's `error` field. Verify it matches `'Writ <writId> cancelled'` with the actual writ ID.
- V4 [R5]: Transition a writ to `completed` while its rig is still running. Verify the rig is NOT cancelled (still `running`). Same for `failed`.
- V5 [R6]: Directly cancel a rig whose writ is already in `cancelled` status. Verify the rig cancellation succeeds (no rollback), and the writ remains `cancelled` without errors.
- V6 [R6]: Directly cancel a rig whose writ is already `completed`. Verify the rig cancellation succeeds and the writ remains `completed`.
- V7 [R7]: Cancel a writ that has an active rig and verify the full circular path completes without error: writ→cancelled, rig→cancelled, rig→writ CDC fires but no-ops on the already-cancelled writ.
- V8 [R8]: Create a parent writ with two child writs, each with a rig. Cancel the parent. Verify: both children transition to `cancelled`, both child rigs transition to `cancelled`, parent writ is `cancelled`.
- V9 [R1, R8]: Cancel a parent writ and verify that the spider's `cancel()` was called for each child rig (check engine error fields contain `'Writ <childWritId> cancelled'`).

## Test Cases

All tests go in `packages/plugins/spider/src/spider.test.ts` using the existing `buildFixture()` / `postWrit()` / `rigsBook()` infrastructure. Add a new `describe('Spider — writ→rig cascade')` block after the existing `'Spider — rig cancellation'` describe block.

**Test 1 — Writ cancel cascades to running rig:**
- Post a writ, crawl to spawn a rig, advance the rig to a running state (pre-complete draft engine, crawl to start implement).
- Call `clerk.transition(writ.id, 'cancelled')`.
- Assert: rig status is `cancelled`. Active engine status is `cancelled` with `error` containing the writ ID. Pending engines are `cancelled`. Writ status is `cancelled`.

**Test 2 — Writ cancel cascades to blocked rig:**
- Post a writ, manually insert a blocked rig with a pending input request.
- Call `clerk.transition(writ.id, 'cancelled')`.
- Assert: rig status is `cancelled`. Blocked engine is `cancelled` with block cleared. Input request is `rejected`.

**Test 3 — Writ cancel with no rig is silent:**
- Post a writ (don't crawl — no rig exists).
- Call `clerk.transition(writ.id, 'cancelled')`.
- Assert: writ is `cancelled`, no errors thrown.

**Test 4 — Only cancelled triggers cascade (completed):**
- Post a writ, crawl to spawn rig, advance to running state.
- Call `clerk.transition(writ.id, 'completed')`. (Note: must be from `active` status.)
- Assert: rig is still `running` (not cancelled).

**Test 5 — Only cancelled triggers cascade (failed):**
- Post a writ, crawl to spawn rig, advance to running state.
- Call `clerk.transition(writ.id, 'failed')`.
- Assert: rig is still `running` (not cancelled).

**Test 6 — Circular cascade is safe:**
- Post a writ, crawl to spawn rig, advance to running state.
- Call `clerk.transition(writ.id, 'cancelled')`.
- Assert: no errors thrown. Writ is `cancelled`. Rig is `cancelled`. (Exercises full cycle: writ→rig CDC → rig→writ CDC → terminal guard → done.)

**Test 7 — Rig cancel with already-cancelled writ succeeds (S2 guard):**
- Post a writ. Transition writ to `cancelled` (no rig — just a standalone writ).
- Manually insert a running rig referencing that writ.
- Call `spider.cancel(rig.id)`.
- Assert: rig transitions to `cancelled` without rollback. Writ remains `cancelled`.

**Test 8 — Rig cancel with already-completed writ succeeds (S2 guard):**
- Post a writ, manually insert a completed rig referencing it, then transition writ to `completed` via the rig→writ CDC.
- Manually insert a second running rig referencing the same writ (unusual but possible in theory).
- Call `spider.cancel(secondRig.id)`.
- Assert: rig cancellation succeeds. Writ remains `completed`.

**Test 9 — Parent cancel cascades to child rigs:**
- Post a parent writ. Post two child writs with `parentId`.
- Crawl to spawn rigs for both children. Advance both to running state.
- Call `clerk.transition(parent.id, 'cancelled')`.
- Assert: parent is `cancelled`. Both children are `cancelled`. Both child rigs are `cancelled`. Each child rig's cancelled engine has `error` containing the respective child writ ID.

**Test 10 — Writ cancel reason format:**
- Post a writ, crawl to spawn rig, advance to running.
- Call `clerk.transition(writ.id, 'cancelled')`.
- Read the cancelled rig. Find the engine that was active. Assert its `error` field equals `'Writ <actual-writ-id> cancelled'` (exact format, using the real ID).

**Test 11 — Cascade with already-terminal rig is idempotent:**
- Post a writ, manually insert an already-cancelled rig for it.
- Call `clerk.transition(writ.id, 'cancelled')`.
- Assert: no errors. Rig remains `cancelled` (unchanged). Writ is `cancelled`.