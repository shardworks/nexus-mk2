# Writ → Rig Cascade on Terminal Status

## Summary

When a writ transitions to any terminal status (cancelled, failed, completed), the spider must automatically cancel the associated rig — closing the cascade gap that currently leaves rigs running after their writ is resolved. The existing rig→writ CDC handler must also be hardened against already-terminal writs to prevent circular cascade failures.

## Current State

The spider registers a Phase 1 CDC watcher on `spider/rigs` in its `start()` method (`packages/plugins/spider/src/spider.ts`, line ~2065). When a rig reaches a terminal status, this handler calls `clerk.transition(rig.writId, ...)` to cascade the terminal status to the writ:

```typescript
// spider.ts — existing rig→writ CDC handler (lines 2065-2122)
stacks.watch<RigDoc>(
  'spider',
  'rigs',
  async (event) => {
    if (event.type !== 'update') return;
    const rig = event.entry;
    const prev = event.prev;
    if (rig.status === prev.status) return;

    if (rig.status === 'completed') {
      // ... resolution logic ...
      await clerk.transition(rig.writId, 'completed', { resolution });
    } else if (rig.status === 'failed') {
      const failedEngine = rig.engines.find((e) => e.status === 'failed');
      const resolution = failedEngine?.error ?? 'Engine failure';
      await clerk.transition(rig.writId, 'failed', { resolution });
    } else if (rig.status === 'cancelled') {
      const cancelledEngine = rig.engines.find((e) => e.status === 'cancelled' && e.error);
      const resolution = cancelledEngine?.error ?? 'Rig cancelled';
      await clerk.transition(rig.writId, 'cancelled', { resolution });
    }
  },
  { failOnError: true },
);
```

**The reverse direction does not exist.** When a writ is cancelled via `clerk.transition(writId, 'cancelled')`, no mechanism cancels the associated rig. Engines continue consuming throttle slots and model spend.

**The existing handler has a bug:** it calls `clerk.transition()` unconditionally. If the writ is already terminal (e.g., was cancelled before the rig), `clerk.transition()` throws an illegal-transition error. Because the handler runs as Phase 1 (`failOnError: true`), this rolls back the entire transaction — including the rig status change that triggered the handler. This means `rig-cancel` is broken today for any rig whose writ is already terminal.

Key types (unchanged by this work):

```typescript
// packages/plugins/clerk/src/types.ts
type WritStatus = 'new' | 'ready' | 'active' | 'waiting' | 'completed' | 'failed' | 'cancelled';

// packages/plugins/spider/src/types.ts
type RigStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
```

The clerk defines terminal statuses as: `completed`, `failed`, `cancelled` (`packages/plugins/clerk/src/clerk.ts`, line 73).

The spider's `cancel()` method (`packages/plugins/spider/src/spider.ts`, line 1882) is already idempotent for terminal rigs — it returns the rig unchanged without throwing.

The spider's `forWrit()` method (`packages/plugins/spider/src/spider.ts`, line 1846) looks up a rig by writ ID: `rigsBook.find({ where: [['writId', '=', writId]], limit: 1 })`.

The spider holds `writsBook = stacks.readBook<WritDoc>('clerk', 'writs')` (line 2060) — a read-only handle on the clerk's writs book that sees the current transactional state inside CDC handlers.

## Requirements

- R1: When a writ transitions to any terminal status (`cancelled`, `failed`, `completed`), the spider must cancel the associated rig if one exists and is non-terminal.
- R2: The rig cancellation must be atomic with the writ status change — if the rig cancel fails, the writ status change must roll back (Phase 1 CDC).
- R3: When there is no rig for the writ (e.g., writ was never dispatched), the cascade must be a silent no-op.
- R4: When the rig is already terminal (e.g., the rig completed before the writ was cancelled), the cascade must be a silent no-op.
- R5: The existing rig→writ CDC handler must tolerate already-terminal writs — when the writ is already in a terminal status, the handler must skip the `clerk.transition()` call instead of throwing.
- R6: The circular cascade path (writ cancelled → rig cancelled → CDC fires → writ already terminal → skip) must complete without error and without transaction rollback.
- R7: Child writ→rig cascades must work naturally through the clerk's existing parent→child cascade — no special child-rig handling in the spider.

## Design

### Behavior

**New CDC handler — writ→rig cascade (R1, R2, R3, R4):**

When a writ status changes to a terminal status, the spider cancels the associated rig:

1. When a `clerk/writs` update event fires and the writ's status changed to `completed`, `failed`, or `cancelled`:
   - Call `api.forWrit(writ.id)` to look up the associated rig.
   - When no rig exists, return (silent no-op — R3).
   - When the rig is already terminal (`completed`, `failed`, or `cancelled`), return (silent no-op — R4). The spider's `cancel()` handles this internally, but checking first avoids a redundant cancel cycle.
   - Call `api.cancel(rig.id)` to cancel the rig.
2. The handler runs as Phase 1 (`failOnError: true`) — the rig cancellation is atomic with the writ status change (R2).

**Guard in existing rig→writ CDC handler (R5, R6):**

At the top of the existing `stacks.watch('spider', 'rigs', ...)` handler, after the status-change check and before any branch logic:

1. Read the writ's current status via `writsBook.get(rig.writId)`.
2. When the writ is `null` (shouldn't happen, but defensive), return.
3. When the writ's status is `completed`, `failed`, or `cancelled`, return — the writ is already terminal, no transition needed.
4. Otherwise, proceed to the existing branch logic (`completed` / `failed` / `cancelled`).

This breaks the circular cascade: writ cancelled → new handler fires → rig cancelled → existing handler fires → reads writ → already cancelled → returns (R6).

### Cascade Flow After Change

**Path A — writ cancelled first (new path):**
```
clerk.transition(writId, 'cancelled')
  → clerk/writs CDC fires (clerk's parent/child cascade)
  → NEW: spider CDC on clerk/writs fires
    → api.forWrit(writId) → finds rig
    → api.cancel(rigId)
      → cancelEngine patches rig to cancelled
      → spider/rigs CDC fires (existing rig→writ handler)
        → writsBook.get(rig.writId) → status is 'cancelled'
        → GUARD: already terminal → return (no clerk.transition call)
```

**Path B — rig cancelled first (existing path, now guarded):**
```
spider.cancel(rigId)
  → cancelEngine patches rig to cancelled
  → spider/rigs CDC fires (existing rig→writ handler)
    → writsBook.get(rig.writId) → status is 'active'
    → GUARD: not terminal → proceed
    → clerk.transition(rig.writId, 'cancelled', { resolution })
    → clerk/writs CDC fires
      → NEW: spider CDC on clerk/writs fires
        → api.forWrit(writId) → finds rig → already cancelled → return
```

### Non-obvious Touchpoints

- **`packages/plugins/spider/src/spider.ts` import line 24** — currently imports `ClerkApi` and `WritDoc` from `@shardworks/clerk-apparatus`. No new imports needed; `WritDoc` already provides the `status` field, and the terminal statuses can be checked inline without importing the clerk's `TERMINAL_STATUSES` constant (which is not exported).
- **`packages/plugins/clerk/src/clerk.ts` lines 525-543** — the clerk's own CDC on `clerk/writs` runs as Phase 1. The spider's new handler on the same book will run after the clerk's handler in the same transaction (handler registration order: clerk starts first, then spider). The clerk's `handleParentTerminal()` cascading to children is what produces the child writ CDC events that the spider's handler will process (R7).

## Validation Checklist

- V1 [R1, R2]: Create a writ, crawl to spawn a rig with a running engine, cancel the writ via `clerk.transition(writId, 'cancelled')`. Assert the rig's status is `cancelled` and the animator session was cancelled.
- V2 [R1, R3]: Cancel a writ that has no associated rig (never dispatched). Assert no error is thrown.
- V3 [R1, R4]: Create a writ and rig, cancel the rig first (so it's already terminal), then cancel the writ. Assert no error is thrown and the rig remains cancelled.
- V4 [R5, R6]: Create a writ and rig, cancel the writ. Verify the full circular cascade completes: writ cancelled → rig cancelled → rig→writ CDC fires → guard skips → no error. Assert both writ and rig are cancelled.
- V5 [R5]: Cancel a rig whose writ is already terminal (cancelled via a separate path). Assert the rig cancellation succeeds — this is the existing bug that the guard fixes.
- V6 [R1]: Create a writ and rig, fail the writ via `clerk.transition(writId, 'failed')`. Assert the rig is cancelled.
- V7 [R7]: Create a parent writ with a child writ, each with an associated rig. Cancel the parent writ. Assert both the parent's rig and the child's rig are cancelled (the child cascade happens via the clerk's `handleParentTerminal` → child writ cancelled → spider CDC cancels child's rig).
- V8 [R1, R4]: Create a writ and a rig that has already completed. Complete the writ. Assert no error (the rig is already terminal, so the cascade is a no-op).

## Test Cases

**Happy path — writ cancelled cascades to rig:**
- Post a writ, crawl to spawn a rig, advance rig to have a running engine with an animator session. Cancel the writ via `clerk.transition(writId, 'cancelled')`. Expected: rig status is `cancelled`, animator.cancel was called for the session, pending engines are cancelled.

**Writ failed cascades to rig:**
- Post a writ, crawl to spawn a rig with a running engine. Fail the writ via `clerk.transition(writId, 'failed')`. Expected: rig status is `cancelled` (rigs are always cancelled, not failed, when cascade-cancelled).

**Writ cancelled with no rig (no-op):**
- Post a writ (don't crawl). Cancel the writ. Expected: no error, writ is cancelled, no rig-related side effects.

**Writ cancelled but rig already terminal:**
- Post a writ, spawn rig, cancel the rig directly. Then cancel the writ. Expected: no error, writ and rig both cancelled.

**Circular cascade — writ cancelled first:**
- Post a writ, spawn rig. Cancel writ. The cascade fires: writ→rig (new handler cancels rig) → rig→writ (existing handler detects writ already terminal, skips). Expected: no error, no transaction rollback, both writ and rig are cancelled.

**Circular cascade — rig cancelled first:**
- Post a writ, spawn rig. Cancel rig. The cascade fires: rig→writ (existing handler transitions writ) → writ→rig (new handler finds rig already terminal, skips). Expected: no error, both writ and rig are cancelled.

**Existing bug fix — cancel rig when writ is already cancelled:**
- Post a writ, spawn rig. Cancel the writ (no rig cascade yet — this simulates the current state before the new handler exists by directly patching the writ status). Cancel the rig via `spider.cancel(rigId)`. Expected: rig cancellation succeeds (the guard in the existing handler skips the `clerk.transition()` call).

**Parent/child cascade — parent writ cancelled cascades to child's rig:**
- Post a parent writ, post a child writ (with `parentId`), spawn rigs for both. Cancel the parent writ. Expected: parent writ cancelled → `handleParentTerminal` cancels child writ → spider CDC cancels child's rig. Both rigs end up cancelled.

**Edge case — writ completed with completed rig (no-op):**
- Post a writ, spawn rig, complete the rig (which cascades to complete the writ via existing handler). The writ→rig handler fires for the writ completion but the rig is already terminal. Expected: no error, both writ and rig are completed.

**Edge case — blocked rig with cancelled writ:**
- Post a writ, spawn rig, block the rig (status: `blocked`). Cancel the writ. Expected: rig is cancelled, blocked engine is cancelled, pending input requests are rejected.