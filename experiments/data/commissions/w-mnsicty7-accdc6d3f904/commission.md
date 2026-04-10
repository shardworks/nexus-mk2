## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/spider-engine-throttling-brief.md`:

---

# Throttle concurrent spider engine starts

## Background

Currently, the spider will spawn as many available engines as it can, based on which ones are ready to start. With detached sessions now landed, this means many concurrent AI sessions can run in parallel — bounded only by how fast new ready engines appear. We want to provide two dimensions of throttling:

- limit each rig to one concurrent engine, to avoid race conditions with rig-local resources (e.g. the draft worktree)
- limit the overall number of engines across all rigs to help manage costs and conserve system resources

## Configuration

Introduce two new guild config variables under the `spider` key:

- **`maxConcurrentEngines`** — total number of engines which may be running at once, as an absolute system-wide limit. Default to **3**. Applies to engines of any kind.
- **`maxConcurrentEnginesPerRig`** — total number of engines which may be running within a single rig. Default to **1**.

Both should be plumbed through `SpiderConfig` in `packages/plugins/spider/src/types.ts` and read via `g.guildConfig().spider`.

## Throttle semantics

Throttling is **uniform** — every engine counts the same against the limits. This is intentional, with a known caveat (see "Known long-tail" below).

Before starting a new engine, the spider should check the rigs book for engines currently in flight:

- **System-wide count** = total number of engines across all running rigs with `engine.status === 'running'`.
- **Per-rig count** = number of engines in the same rig with `engine.status === 'running'`.

If starting an engine would push **either** count over its respective limit, the spider must not start that engine. The engine stays in `pending` status (its pre-running status) and the next crawl tick will re-evaluate.

## Crawl priority order

The current `spider.crawl()` already runs phases in this order: `tryCollect → tryProcessGrafts → tryCheckBlocked → tryRun → trySpawn`, returning after the first phase that does work. That ordering is correct for throttling — preserve it. Make sure the throttle is enforced in the right phases:

1. **`tryCollect`** — always runs, no limit. Collecting completes engines and frees slots, so it must never be blocked by the throttle.
2. **`tryProcessGrafts`** — no throttle check needed. Grafts modify the rig DAG; they don't start engines.
3. **`tryCheckBlocked`** — no throttle check needed. Unblocking moves an engine from `blocked` back to `pending`; it doesn't start it.
4. **`tryRun`** — subject to per-rig and system-wide limits. When iterating runnable engines, skip any that would breach either limit. If all runnable engines are deferred, return `null` (idle this tick) and the loop will retry on the next tick.
5. **`trySpawn`** — subject to system-wide limit only. If the system-wide limit is reached, do not spawn new rigs (they would just sit with their first engine in `pending` waiting for a slot, cluttering the rig list).

## Pre-running status

Engines that the spider has not yet started are in `pending` status. When the throttle defers an engine, it stays in `pending` — there is no new status. The spider's existing `findRunnableEngine` already returns engines in `pending` status whose upstream is complete; the throttle is a layer on top of that filter.

## Observability

Throttle deferrals are silent. The spider does not log per-deferral (the crawl loop runs every few seconds and a saturated system would drown the log), does not write any new field to the engine record, and the Oculus UI does not render a special cue for throttled engines. Deferred engines simply remain in `pending` and will be picked up on a future tick once a slot frees.

Rationale: deferral is a transient effect of overall system state, not a property of any individual engine. Persisting it as a field would permanentize a condition that's really just "computed from (rigs book, config) at this instant," and the visual cue isn't valuable enough to justify either the persistence or the render-time derivation. If throttling ever becomes confusing in practice ("why isn't this engine running?"), revisit.

## Known long-tail (acknowledged limitation)

Throttling is uniform: every engine counts the same. This means **clockwork engines** (engines that complete synchronously without launching a session — e.g. `seal` and `draft`) are throttled the same as **quick engines** (engines that launch an AI session — e.g. `implement`, `review`, `revise`, `anima-session`). The spider intentionally has no a-priori knowledge of which is which; that information only becomes available when `design.run()` returns its `'completed'` vs `'launched'` discriminator, by which point the side effects of a quick engine launch are already done.

In practice this means: if `maxConcurrentEngines=3` and three quick AI sessions are mid-flight, a freshly-completed rig that wants to seal will sit in `pending` until one of the quick engines finishes — even though the seal would itself only consume the slot for a few hundred milliseconds. That's the long-tail.

**This is acceptable for the first cut** because the workaround is simple (raise `maxConcurrentEngines` to leave headroom). If the long-tail becomes painful in practice, the follow-up is to add explicit type metadata to `EngineDesign` (a new `kind: 'quick' | 'clockwork'` field) so the spider can exempt clockwork engines from the throttle. That refactor is out of scope for this brief; capture it as a follow-up TODO.

## Implementation pointers

- `packages/plugins/spider/src/spider.ts`
    - `tryRun()` (≈ line 1526) — admission check goes here.
    - `trySpawn()` — admission check for system-wide limit.
    - The runnable engine finder is `findRunnableEngine()` (≈ line 133).
- `packages/plugins/spider/src/types.ts` — add `maxConcurrentEngines?: number` and `maxConcurrentEnginesPerRig?: number` to `SpiderConfig`.
- The crawl loop is single-threaded (`crawl-continual` `while` + `await crawl()`), so there's no concurrent admission to worry about — the throttle check at the start of `tryRun` reflects steady state.

## Tests

- Unit: count function returns the expected value across rigs in various states (`pending`, `running`, `completed`, `blocked`, `failed`, `cancelled`).
- Unit: `tryRun` defers an engine when it would breach the global limit; defers when it would breach the per-rig limit; starts when both checks pass.
- Unit: `trySpawn` defers when the global limit is reached.
- Behavioral: with a synthetic guild that has multiple ready writs and `maxConcurrentEngines=2`, exactly 2 engines reach `running` status; the rest stay `pending` until a slot frees.
- Regression: existing single-engine-per-tick behavior is preserved; `tryCollect` is never throttled.

## Out of scope

- Adding explicit type metadata to `EngineDesign` for clockwork-vs-quick exemption (parked follow-up).
- Changing crawl tick interval or polling cadence.
- Per-codex or per-anima limits.
- Cost-aware throttling (e.g. dollars-per-hour caps).

---

## Summary

Work shipped via writ w-mnsbxn1u-055e79b9be62. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/spider-engine-throttling-brief.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mnsbxn1u-055e79b9be62.