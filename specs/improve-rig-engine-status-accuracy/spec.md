---
author: plan-writer
author_version: 2026-04-03
estimated_complexity: 3
---

# Improve Rig Engine Status Accuracy

## Summary

When a rig engine fails, all pending downstream engines should be marked `cancelled` so the rig snapshot accurately reflects that those engines will never run. Currently they remain in `pending`, which is misleading.

## Current State

**`/workspace/nexus/packages/plugins/spider/src/types.ts`** defines the engine status enum:

```typescript
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';
```

**`/workspace/nexus/packages/plugins/spider/src/spider.ts`** contains `failEngine()`, the sole function that handles engine failure:

```typescript
async function failEngine(
  rig: RigDoc,
  engineId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString();
  const updatedEngines = rig.engines.map((e) =>
    e.id === engineId
      ? { ...e, status: 'failed' as const, error: errorMessage, completedAt: now }
      : e,
  );
  await rigsBook.patch(rig.id, {
    engines: updatedEngines,
    status: 'failed',
  });
}
```

This function marks the failed engine and sets the rig to `failed`, but leaves all other engines untouched. A rig with five engines where `draft` failed looks like:

| Engine    | Status    |
|-----------|-----------|
| draft     | failed    |
| implement | pending   |
| review    | pending   |
| revise    | pending   |
| seal      | pending   |

The downstream `pending` engines are effectively dead (the Spider only queries `running` rigs, so they will never execute), but their status doesn't reflect this.

An existing Phase 1 CDC handler on the rigs book watches for rig status changes to `completed` or `failed` and transitions the associated writ via the Clerk. This handler fires when `failEngine()` patches the rig, and it will continue to work unchanged — it reads from the engine list in the CDC event, which will now include the cancelled statuses.

## Requirements

- R1: The `EngineStatus` type must include `'cancelled'` as a valid status value.
- R2: When an engine fails (via `failEngine()`), all engines in the same rig with `status === 'pending'` must be set to `status: 'cancelled'` in the same `patch()` call.
- R3: Engines in `'running'` status must NOT be set to `'cancelled'` — only `'pending'` engines are cancelled.
- R4: Cancelled engines must NOT have `completedAt` set — the field must remain `undefined`.
- R5: Cancelled engines must NOT have `error` set — cancellation is not an error, it is a consequence of another engine's failure.
- R6: Engines already in `'completed'` or `'failed'` status must be left untouched.
- R7: The existing CDC handler on the rigs book (writ transition on rig failure/completion) must continue to work correctly with the updated engine data.
- R8: Existing failure tests must be updated to assert downstream engine cancellation alongside the existing failure assertions.
- R9: Dedicated tests must verify: (a) first-engine failure cancels all downstream engines, (b) mid-pipeline failure preserves completed upstream engines while cancelling pending downstream engines, (c) a running engine is not cancelled.
- R10: The Spider API contract doc (`docs/architecture/apparatus/spider.md`) must be updated to document the `cancelled` engine status and the downstream cancellation behavior on failure.

## Design

### Type Changes

**`/workspace/nexus/packages/plugins/spider/src/types.ts`** — the `EngineStatus` type:

```typescript
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
```

No other type changes. `EngineInstance`, `RigDoc`, `RigStatus`, and all yield types remain unchanged. The `EngineInstance.status` field already uses `EngineStatus`, so it automatically accepts `'cancelled'`.

### Behavior

**`failEngine()` in `/workspace/nexus/packages/plugins/spider/src/spider.ts`:**

When mapping over the engines array to build `updatedEngines`:

- When `e.id === engineId`: set `status: 'failed'`, `error: errorMessage`, `completedAt: now` (unchanged from current behavior).
- When `e.status === 'pending'`: set `status: 'cancelled'`. Do not set `completedAt` or `error`.
- Otherwise (engine is `'running'`, `'completed'`, or already `'failed'`): leave unchanged.

The rig `status` is still set to `'failed'` in the same `patch()` call (unchanged). The CDC handler fires once with the complete picture — all engines in their final states.

**Why `failEngine()` and not a CDC handler:** The brief says "use the stacks CDC for this." The existing CDC handler on the rigs book already fires when `failEngine()` patches the rig to `failed`, cascading the failure to the writ. The cancellation is included in the same `patch()` call, so the CDC event that fires already contains the full, accurate engine data. Adding a second CDC handler to write back to the same book would create a cascade (the second write would re-fire the CDC), adding complexity for no behavioral gain.

**No changes to `findRunnableEngine()`, `tryCollect()`, `tryRun()`, or `trySpawn()`:** These functions already filter by rig status (`running`) and engine status (`pending` with completed upstream). The cancellation is a reporting accuracy change — the engines were already effectively dead.

### Non-obvious Touchpoints

**`/workspace/nexus/docs/architecture/apparatus/spider.md`** — two locations need updating:

1. **The `EngineInstance` type definition** (around line 132): the inline status type `'pending' | 'running' | 'completed' | 'failed'` must add `| 'cancelled'`.

2. **The "Engine Failure" section** (around line 592): currently a 4-step list. A step must be added between the current steps 1 and 2 (after engine is marked failed, before rig is marked failed) describing the cancellation of all pending engines in the same write.

## Validation Checklist

- V1 [R1]: `grep "EngineStatus" /workspace/nexus/packages/plugins/spider/src/types.ts` shows `'cancelled'` in the union.
- V2 [R2, R3, R4, R5, R6]: Run the spider test suite (`node --test packages/plugins/spider/src/spider.test.ts` from the nexus root). The new and updated tests verify that: pending engines become cancelled, running engines are untouched, completed engines are untouched, cancelled engines have no `completedAt`, cancelled engines have no `error`.
- V3 [R7]: The existing test "engine failure → rig failed → writ transitions to failed via CDC" continues to pass — the writ still transitions to `failed` after the rig patch.
- V4 [R8]: Existing failure tests (e.g. "marks engine and rig failed when engine design is not found", "session failure propagates") now include assertions on downstream engine statuses.
- V5 [R9]: A dedicated test block exists with at least three scenarios: (a) draft fails → implement, review, revise, seal are all `cancelled`; (b) implement fails after draft completed → draft stays `completed`, review/revise/seal are `cancelled`; (c) a manually-set `running` engine is not cancelled when another engine fails.
- V6 [R10]: The spider.md doc's EngineInstance type definition includes `'cancelled'`, and the Engine Failure section describes the downstream cancellation step.
- V7 [R2]: In the `failEngine()` source, the engine map callback has an explicit branch for `e.status === 'pending'` that sets `status: 'cancelled'`.

## Test Cases

**Update existing tests** (add downstream assertions to each):

1. **"marks engine and rig failed when engine design is not found"** — after crawl, assert that all engines after `draft` (implement, review, revise, seal) have `status === 'cancelled'`.

2. **"non-serializable engine yields cause engine and rig failure"** — same pattern: assert downstream engines are cancelled.

3. **"session failure propagates: engine fails → rig fails → writ transitions to failed"** — after implement fails, assert review/revise/seal are `cancelled`, and draft remains `completed`.

4. **"engine failure → rig failed → writ transitions to failed via CDC"** — assert engine statuses on the failed rig: the injected broken engine is `failed`, downstream engines are `cancelled`.

5. **"marks engine and rig failed when session failed"** — assert downstream engines are cancelled.

**New dedicated test block** (`describe('downstream engine cancellation', ...)`):

6. **First engine failure cancels all downstream** — Post a writ, spawn the rig, crawl to fail draft (e.g. inject bad designId). Assert: draft is `failed`, implement/review/revise/seal are all `cancelled`. No cancelled engine has `completedAt` or `error` set.

7. **Mid-pipeline failure preserves completed upstream** — Post a writ, spawn, manually patch draft to `completed` with yields, then inject bad designId on implement. Crawl to fail. Assert: draft is `completed` (unchanged), implement is `failed`, review/revise/seal are `cancelled`.

8. **Running engine is not cancelled** — Post a writ, spawn, manually patch draft to `completed`, implement to `running` with a sessionId, and review to `pending`. Then inject a scenario where the rig is failed via `failEngine()` on a different engine (e.g. patch a third engine to trigger failure). Assert: the `running` engine retains `running` status, only `pending` engines become `cancelled`.

9. **Cancelled engines have no completedAt** — In any failure scenario, iterate all cancelled engines and assert `completedAt === undefined`.

10. **Cancelled engines have no error** — In any failure scenario, iterate all cancelled engines and assert `error === undefined`.
