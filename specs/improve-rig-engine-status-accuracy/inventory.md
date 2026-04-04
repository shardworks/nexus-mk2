# Inventory: Improve Rig Engine Status Accuracy

## Problem Summary

When an engine in a rig fails, `failEngine()` marks only that engine as `failed` and sets the rig status to `failed`. All other engines (downstream ones still in `pending`, potentially upstream ones still in `running`) retain their pre-failure status. The brief asks that downstream engines be transitioned to an appropriate state (e.g. `cancelled`) when a rig fails, using the stacks CDC mechanism.

---

## Affected Code

### Primary file: `/workspace/nexus/packages/plugins/spider/src/spider.ts`

**`failEngine()` function (lines 128–143)** — the core function that needs modification. Current implementation:

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
      : e,   // <-- all other engines left untouched
  );
  await rigsBook.patch(rig.id, {
    engines: updatedEngines,
    status: 'failed',
  });
}
```

This is the single point where engine failure is handled. It is called from:
- `tryCollect()` (line 165) — session failed/timeout
- `tryCollect()` (line 186) — non-serializable yields
- `tryRun()` (line 228) — missing engine design
- `tryRun()` (line 265) — non-serializable clockwork yields
- `tryRun()` (line 287) — engine run() throws

**CDC handler on rigs book (lines 428–456)** — Phase 1 cascade that transitions the writ when a rig reaches a terminal state. Currently only reacts to rig-level `completed`/`failed` status changes. This is the existing CDC watcher and the brief says "use the stacks CDC" — but the actual change likely belongs in `failEngine()` directly (which writes the rig update that triggers the CDC), rather than in a new CDC handler. The CDC handler downstream of the rig update is already in place for writ transitions.

### Types file: `/workspace/nexus/packages/plugins/spider/src/types.ts`

**`EngineStatus` type (line 11):**
```typescript
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';
```
Needs a new status value. `'cancelled'` is the natural choice — it parallels `WritStatus` which already includes `'cancelled'`.

**`RigStatus` type (line 50):**
```typescript
export type RigStatus = 'running' | 'completed' | 'failed';
```
No change needed — rig-level status is already correct.

**`EngineInstance` interface (lines 25–46):** No structural changes needed — the `status` field already uses `EngineStatus`.

### Public exports: `/workspace/nexus/packages/plugins/spider/src/index.ts`

Exports `EngineStatus` — any consumers of this type will see the new value automatically.

### Test file: `/workspace/nexus/packages/plugins/spider/src/spider.test.ts`

Large file (~1500+ lines). Key test patterns:

- Uses `node:test` (`describe`, `it`, `beforeEach`, `afterEach`) with `node:assert/strict`
- `buildFixture()` helper creates in-memory Stacks + mock Clerk/Fabricator/Animator/Spider
- `postWrit()` helper creates a writ via Clerk
- `rigsBook()` helper gets direct book handle for assertions
- Tests access engines via `rig.engines.find((e: EngineInstance) => e.id === 'draft')` pattern

**Existing failure tests that will need updating:**

1. **"marks engine and rig failed when engine design is not found"** (line 453) — currently only asserts the failed engine's status. Should also assert downstream engines are `cancelled`.

2. **"non-serializable engine yields cause engine and rig failure"** (line 482) — similar.

3. **"session failure propagates: engine fails → rig fails → writ transitions to failed"** (line 584) — asserts `implement` engine is `failed` but doesn't check downstream engines (`review`, `revise`, `seal`). Should assert they are `cancelled`.

4. **"engine failure → rig failed → writ transitions to failed via CDC"** (line 774) — asserts rig and writ status but not individual engine statuses.

5. **"marks engine and rig failed when session failed"** (line 691) — in the collect section.

**New tests needed:**
- When the first engine (`draft`) fails, all downstream engines (`implement`, `review`, `revise`, `seal`) should be `cancelled`
- When a mid-pipeline engine (`implement`) fails, earlier completed engines stay `completed`, later pending engines become `cancelled`
- A `running` engine upstream of the failure point should NOT be cancelled (edge case: in theory only one engine runs at a time in the static pipeline, but the data model allows it)

### Documentation files

- `/workspace/nexus/docs/architecture/apparatus/spider.md` — lines 92-93 describe the walk function behavior, line 168 says "The rig is **failed** when any engine has `status === 'failed'`", lines 592-603 describe engine failure handling. The doc says nothing about transitioning downstream engines. Will need updating.
- `/workspace/nexus/docs/architecture/rigging.md` — line 69 mentions "propagate completion state to downstream engines" but only in the success case.
- `/workspace/nexus/docs/guild-metaphor.md` — line 93 says engines move through three states: idle, working, complete. Doesn't mention failure or cancellation. The metaphor doc is deliberately abstract and may not need updating.

### Adjacent code: Stacks CDC mechanism

- `/workspace/nexus/packages/plugins/stacks/src/cdc.ts` — the CDC registry implementation. `CdcRegistry` class with `watch()`, `firePhase1()`, `firePhase2()` methods.
- `/workspace/nexus/packages/plugins/stacks/src/types.ts` — `ChangeEvent<T>`, `ChangeHandler<T>`, `WatchOptions` types. Phase 1 = failOnError true (inside transaction), Phase 2 = failOnError false (after commit).

The brief says "use the stacks CDC for this." Two interpretations:
1. Add a new CDC watcher on the rigs book that reacts to rig status changing to `failed` and cancels downstream engines — but this would be a second write to the same book being watched (re-entrancy concern).
2. Do it inside `failEngine()` which already writes the rig update — simpler, and the CDC handler already exists to cascade to the writ. The rig CDC handler already fires on the status change to `failed` and transitions the writ.

The more likely intent: modify `failEngine()` to also set downstream engines to `cancelled` in the same `patch()` call. The existing CDC handler on the rigs book then fires (as it already does) and transitions the writ. The "stacks CDC" reference may mean "the existing CDC-driven writ transition already handles the rig-level status; now make the engine-level statuses accurate too so that the CDC event contains correct engine data."

Alternatively, the patron may want a new CDC watcher (Phase 1 cascade) that specifically watches for engine status changes and cancels downstream engines. This would be more architecturally pure but adds complexity.

---

## Adjacent Patterns

### How does the Clerk handle `cancelled`?

The Clerk already has `cancelled` as a terminal WritStatus:
```typescript
// clerk/src/types.ts line 20
export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
```
Transitions: `ready | active → cancelled`. So `cancelled` is an established concept in the system.

### How does the guild metaphor handle engine states?

The guild metaphor (guild-metaphor.md line 93) describes three engine states: idle, working, complete. The code uses four: `pending`, `running`, `completed`, `failed`. Adding `cancelled` would be a fifth code-level state. The metaphor doc uses abstract terms that don't need to map 1:1 to implementation status enums.

### How does `findRunnableEngine()` work?

```typescript
function findRunnableEngine(rig: RigDoc): EngineInstance | null {
  for (const engine of rig.engines) {
    if (engine.status !== 'pending') continue;
    const allUpstreamDone = engine.upstream.every((upstreamId) => {
      const dep = rig.engines.find((e) => e.id === upstreamId);
      return dep?.status === 'completed';
    });
    if (allUpstreamDone) return engine;
  }
  return null;
}
```

This only looks for `pending` engines with all `completed` upstream. Once the rig is `failed`, the Spider only looks at `running` rigs (via `rigsBook.find({ where: [['status', '=', 'running']] })`), so a failed rig's pending engines would never run anyway. The change is purely about status accuracy/reporting, not behavior — the engines are already effectively dead, they just don't say so.

### Static pipeline structure

```
draft (upstream: []) → implement (upstream: ['draft']) → review (upstream: ['implement']) → revise (upstream: ['review']) → seal (upstream: ['revise'])
```

Linear chain. If engine N fails, engines N+1..4 are downstream and should be cancelled. Engines 0..N-1 are upstream — completed ones stay completed; there shouldn't be any running upstream engines in the static pipeline (only one engine runs at a time).

---

## Existing Context

### Known gaps

`/workspace/nexus-mk2/docs/future/known-gaps.md` — no entry for this issue.

### Architecture TODO

`/workspace/nexus/docs/architecture/index.md` line 361 has a TODO mentioning writ lifecycle states including `cancelled` but it's about writ documentation, not engine states.

### Spider spec "Future Evolution" section

The spider spec (`/workspace/nexus/docs/architecture/apparatus/spider.md` line 600) mentions:
> "No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction."

This change aligns with making the failure state more informative for patron inspection.

---

## Doc/Code Discrepancies

1. **Guild metaphor says three engine states; code has four (soon five).** The metaphor doc (line 93) says "idle, working, complete" — code uses `pending`, `running`, `completed`, `failed`. The metaphor is deliberately abstract, but `failed` is a significant omission. Adding `cancelled` widens the gap further.

2. **Spider spec says `yields: null` in engine instances; code uses `yields?: unknown` (optional, not null).** The spec (line 153-162) shows `yields: null` for uninitialized engines; the actual `EngineInstance` type (types.ts line 37) uses `yields?: unknown` with no `null`. Minor discrepancy.

3. **Rigging doc mentions "propagate completion state to downstream engines" (line 69) but this only exists for success.** For failure, downstream engines are not propagated to at all — they're just abandoned in `pending`. This is the exact gap this brief addresses.

---

## Files Summary

### Will be modified:
- `/workspace/nexus/packages/plugins/spider/src/types.ts` — add `'cancelled'` to `EngineStatus`
- `/workspace/nexus/packages/plugins/spider/src/spider.ts` — modify `failEngine()` to cancel downstream engines
- `/workspace/nexus/packages/plugins/spider/src/spider.test.ts` — update existing failure tests, add new tests for downstream cancellation

### May need updating:
- `/workspace/nexus/docs/architecture/apparatus/spider.md` — document the new behavior
- `/workspace/nexus/packages/plugins/spider/src/index.ts` — already exports `EngineStatus`, no change needed

### Will NOT be modified:
- `/workspace/nexus/packages/plugins/stacks/src/cdc.ts` — CDC mechanism works as-is
- `/workspace/nexus/packages/plugins/stacks/src/types.ts` — no changes needed
- `/workspace/nexus/packages/plugins/clerk/src/types.ts` — already has `cancelled` on WritStatus
- `/workspace/nexus/packages/plugins/spider/src/engines/*.ts` — engine implementations unchanged
- `/workspace/nexus/packages/plugins/spider/src/tools/*.ts` — tools unchanged (they display whatever status is on the engine)
