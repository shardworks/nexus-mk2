# Allow `nsg rig cancel` to operate when its writ is already in a terminal status

## Summary

`nsg rig cancel` currently fails with a writ-transition error when the rig's associated writ is already `cancelled`, `completed`, or `failed`. This blocks the patron's ability to clean up a rig whose writ has been cancelled out-of-band (or whose writ was completed by a different path — a scenario that also exists when a rig hangs after its writ is sealed).

Fix: make rig cancellation independently valid for any non-terminal rig, regardless of the associated writ's status. When the writ is already terminal, skip the writ transition and proceed with rig cancellation only.

## Observed failure

```
$ nsg rig cancel --rig-id rig-mnrpc8xr-3234956c --reason "zombie"
Error: Cannot transition writ "w-mnrpc5cb-8af970211086" to "cancelled":
status is "cancelled", expected one of: new, ready, active, waiting.
```

The writ was already `cancelled`. The rig was still `running` with one `running` engine and five `pending` engines. The CLI refused to cancel the rig because its cancel path unconditionally attempts to also transition the writ, and that transition is illegal from a terminal state.

The patron worked around this by doing a direct SQLite edit of `books_spider_rigs` on 2026-04-10 to mark the rig `cancelled` and flip its engine statuses. That workaround should not be necessary — it bypasses event emission and lifecycle guarantees.

## Current implementation

The rig-cancel path lives in the spider plugin and is exposed through:

- `SpiderApi.cancel(rigId: string, options?: { reason?: string })` — the programmatic entry point, in `packages/plugins/spider/src/spider.ts`.
- The `rig-cancel` tool handler (same package) which wraps the API and is what `nsg rig cancel` ultimately invokes.
- Possibly a CLI command wrapper in `packages/framework/cli/src/commands/` — path to confirm during inventory.

The current `SpiderApi.cancel()` implementation (exact line numbers to verify) does something like:

1. Load the rig from `rigsBook`.
2. Transition the associated writ to `cancelled` via the Clerk.
3. Mark all non-terminal engines in the rig as `cancelled` (or `failed`).
4. Mark the rig itself as `cancelled`, set `completedAt`, record the reason.
5. Persist the rig back to `rigsBook`.

The failure mode in step 2 aborts the whole sequence before step 3 runs.

## Desired behavior

1. Load the rig.
2. Look up the associated writ.
3. **If the writ is in a non-terminal state (`new`, `ready`, `active`, `waiting`)**: transition it to `cancelled` as today.
4. **If the writ is already in a terminal state (`cancelled`, `completed`, `failed`)**: skip the writ transition, log that it was skipped, and proceed.
5. Continue with engine cancellation, rig status update, and persistence.
6. Return success.

The rig cancellation itself should be an unconditional operation on any rig that is not already in a terminal status. A rig whose writ is already terminal is exactly the case where cleanup is most needed, so blocking cancellation in that case is backwards.

If the rig is itself already in a terminal state (`cancelled`, `completed`, `failed`), `cancel()` should return idempotently (no-op, no error) — this lets scripts retry safely.

## Edge cases

- **Writ is `completed`, rig is still `running`**. This is unusual but possible if the seal engine signalled completion but some downstream engine hung. Cancelling the rig should work and should not un-complete the writ.
- **Writ is `failed`, rig is still `running`**. Same treatment: cancel the rig, leave the writ alone.
- **Rig has no associated writ** (if that's ever possible — verify during inventory). Rig cancel should still succeed.
- **Concurrent cancel**: two callers race to cancel the same rig. The second should observe a terminal rig status and no-op.

## Test coverage

Add cases to `packages/plugins/spider/src/spider.test.ts` (or the rig-cancel test file if there is one):

1. Cancel a rig whose writ is `cancelled` → rig transitions to `cancelled`, writ is untouched, no error thrown.
2. Cancel a rig whose writ is `completed` → same.
3. Cancel a rig whose writ is `failed` → same.
4. Cancel a rig whose writ is `active` → both rig and writ transition to `cancelled` (existing happy path — regression guard).
5. Cancel a rig that is already `cancelled` → no-op, no error.
6. Cancel a rig whose engines include a mix of `running`, `pending`, and `completed` statuses → running and pending become `cancelled`, completed are preserved.

## Non-goals

- Cascading writ-cancel to rig-cancel automatically. That is a separate brief ("writ cancellation should cascade to its rig") — this mandate fixes the reverse path only: making rig-cancel resilient to already-terminal writs.
- Zombie engine detection or reaping. Separate brief ("zombie engine detection and reaping").
- Redesigning the rig lifecycle. Minimal change: one conditional around the writ transition step.

## Pointers

- `packages/plugins/spider/src/spider.ts` — `SpiderApi.cancel()` implementation.
- `packages/plugins/spider/src/tools/` — rig-cancel tool handler.
- `packages/plugins/clerk/src/clerk.ts` — writ transition logic (read-only reference — no changes needed here).
- Related incident: `rig-mnrpc8xr-3234956c` was manually reaped via direct DB edit on 2026-04-10 after this bug blocked the CLI path. That rig's state is a useful fixture for writing the test cases.