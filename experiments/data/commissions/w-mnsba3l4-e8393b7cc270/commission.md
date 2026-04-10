# Eliminate the `running`-without-`sessionId` race in spider engine launch

## Why this brief exists

In `packages/plugins/spider/src/spider.ts`, `tryStart` performs two sequential `rigsBook.patch` calls around the engine's `design.run`:

```typescript
// 1. Mark engine as running before executing
const startedEngines = rig.engines.map((e) =>
  e.id === pending.id ? { ...e, status: 'running' as const, startedAt: now } : e,
);
await rigsBook.patch(rig.id, { engines: startedEngines });

// 2. Run the engine — for detached sessions this includes spawning
//    the babysitter and pre-writing the pending SessionDoc
engineResult = await design.run(givens, context);

// 3. Now (and only now) write sessionId
if (engineResult.status === 'launched') {
  const { sessionId } = engineResult;
  const launchedEngines = updatedRig.engines.map((e) =>
    e.id === pending.id ? { ...e, status: 'running' as const, sessionId } : e,
  );
  await rigsBook.patch(rig.id, { engines: launchedEngines });
}
```

Between patch (1) and patch (3) there is a window — the duration of `design.run` — during which the engine is in `running` status with no `sessionId`. With the new detached session path, that window now includes spawning a child process and pre-writing a SessionDoc, so it has grown from "instantaneous" to "easily observable" (hundreds of milliseconds to a few seconds).

The patron caught this on `rig-mnsat1fz-23ccfaac` — the review engine appeared in `running` state with no session data, because the UI snapshot landed mid-window. We patched the symptom in the UI by adding rig auto-refresh, but the underlying invariant violation remains: **any reader of the rigs book during that window sees an engine in `running` status that nothing in the system can join to a session.** That's a class of bug that will keep biting in different ways (debugging, monitoring, recovery, integration tests, …).

## What needs to happen (planning scope)

Design a refactor that makes the invariant **`engine.status === 'running' ⇒ engine.sessionId` is set** hold continuously.

The plan should answer:

1. **Where does the session id come from?** The cleanest fix is for the spider to allocate the session id *before* calling `design.run` and pass it into the engine via context. The engine then uses that pre-allocated id for its session launch instead of generating its own. Decision: should id allocation move to the spider, or should the engine pre-emptively return its id via a separate "prepare" step?
2. **What does the engine launch contract look like?** Today, engines that launch sessions return `{ status: 'launched', sessionId }` from `run()`. The contract change might look like:
   - **Option α** — `context` now carries an `allocatedSessionId: string` and engines must use it. `run()` no longer returns a sessionId; the spider already knows it.
   - **Option β** — Add a new optional `prepare()` method to engine designs that returns the session id (or other pre-launch metadata) before `run()` is called. Spider patches the engine with that metadata, then calls `run()`.
   - **Option γ** — Make `run()` itself accept a `setSessionId(id)` callback that engines invoke as soon as they have one. Spider patches on the callback.
3. **Which engines are affected?** The current launchers are `implement`, `review`, `revise`, and `anima-session`. Audit each to understand any per-engine differences in how they currently obtain a session id.
4. **What about non-launching engines?** Most engines (draft, seal, etc.) don't launch sessions and complete synchronously. The refactor must not change their contract.
5. **What about the `pending` SessionDoc pre-write?** `launchDetached` currently pre-writes a `pending` SessionDoc using its own generated session id. If the spider allocates the id upfront, the launch path needs to use the allocated id when pre-writing. Trace this end-to-end and make sure the babysitter, the tool server's authorize callback, and the spider's tryCollect all see the same id from the moment the engine moves to `running`.
6. **Atomicity.** Should the "set running + set sessionId" patch be a single `rigsBook.patch` or remain two patches? Single patch closes the race entirely; two patches still leaves a microsecond window. Recommend single patch.
7. **Test strategy.** What's the smallest test that asserts the invariant? Probably an integration-shaped test: launch an engine, observe the rigs book at the moment it transitions to `running`, assert sessionId is non-null at every observable state. This dovetails with the **daemon e2e integration tests** brief already in flight — the same test fixture should cover this invariant.

## Dependencies on other work

- **Daemon end-to-end integration tests** (`w-mnsb1tck-b6400a10f699`) — the test fixture from that planning will be where this invariant is asserted. Soft dependency: this can be planned independently, but the test that proves it works will live in that fixture.
- **Spider rig view auto-refresh** (separate mandate) — already shipping the symptomatic UI fix. This brief addresses the underlying race so the UI fix becomes belt-and-suspenders rather than load-bearing.

## Files likely affected

- `/workspace/nexus/packages/plugins/spider/src/spider.ts` — `tryStart` and engine launch sequencing
- `/workspace/nexus/packages/plugins/spider/src/types.ts` — engine design / context types if option α or γ is chosen
- `/workspace/nexus/packages/plugins/spider/src/engines/implement.ts`
- `/workspace/nexus/packages/plugins/spider/src/engines/review.ts`
- `/workspace/nexus/packages/plugins/spider/src/engines/revise.ts`
- `/workspace/nexus/packages/plugins/spider/src/engines/anima-session.ts`
- `/workspace/nexus/packages/plugins/claude-code/src/detached.ts` — if the session id allocation contract changes upstream of the babysitter
- `/workspace/nexus/packages/plugins/animator/src/*` — if the session provider interface needs to accept a pre-allocated id

## Recommendation from the patron's side

Lean toward **Option α** (allocated id in context) and **single-patch atomicity**. It's the most boring fix and pushes id allocation to a single owner (the spider). But this is a brief, not a mandate — if planning surfaces a reason to prefer β or γ, take it.