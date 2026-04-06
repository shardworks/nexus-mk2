# Observations

## Refactoring opportunities skipped for scope

1. **`tryRun()` and `tryCollect()` share rig-status-check logic.** Both functions have inline `allCompleted` checks that determine if a rig should transition to `completed`. With `blocked` added, both also need `isRigBlocked()` checks. This is an opportunity to extract a `resolveRigStatus(engines) → RigStatus` helper, but doing so as a refactor risks destabilizing existing tests. Decision D16 addresses the `isRigBlocked` extraction; the broader `resolveRigStatus` refactor is left for later.

2. **`failEngine()` hardcodes the cancellation predicate.** The function has `if (e.status === 'pending')` as its cancel condition. Adding `|| e.status === 'blocked'` works but the function is accumulating special cases. A future cleanup could use a set of "non-terminal, non-running" statuses.

3. **`tryRun()` queries ALL running rigs every cycle.** `tryCheckBlocked()` will query running + blocked rigs. As rig counts grow, these linear scans may benefit from pagination or a priority queue. Not a problem at current scale but worth noting for future optimization.

## Suboptimal conventions followed for consistency

1. **Condition validation uses a function instead of Zod.** The Fabricator has no Zod dependency. Introducing one would break the clean dependency boundary. The `validate?: (condition: unknown) => boolean` pattern is less ergonomic than Zod schemas but maintains the Fabricator's zero-dependency stance. Block type authors can use Zod internally and wrap it in validate(). (Decision D5.)

2. **`lastCheckedAt` stored on the block record in Stacks.** This means every checker evaluation that returns false triggers a Stacks write (to update lastCheckedAt). An in-memory cache would be cheaper but wouldn't survive process restarts. The Stacks write is a patch on an existing document (the rig's engines array), so it piggybacks existing I/O. Acceptable overhead for correctness. (Decision D13.)

## Doc/code discrepancies found during inventory

1. **`docs/architecture/apparatus/spider.md` tool list** says `supportKit.tools: [crawlOneTool, crawlContinualTool]` but actual code has five tools including rigShowTool, rigListTool, rigForWritTool. The doc is stale.

2. **`docs/guides/building-engines.md`** describes a completely different engine concept (Clockworks handlers with standing orders and `nexus-engine.json`). This is NOT the same system as `EngineDesign` objects registered with the Fabricator. No Clockworks apparatus exists in the current codebase. The guide either describes a pre-apparatus architecture or an unbuilt system.

3. **`docs/architecture/apparatus/spider.md` static graph** describes `yields: null` as initial value on EngineInstances, but actual code uses `yields?: unknown` (optional, not set at spawn time).

4. **`docs/architecture/apparatus/spider.md` CDC handler** shows structured resolution string using `sealYields.sealedCommit`, but code uses `JSON.stringify(sealEngine.yields)`.

## Potential risks in adjacent code

1. **Process restart between unblock and re-run.** If the Spider process restarts after `tryCheckBlocked()` unblocks an engine (sets it to `pending`) but before `tryRun()` re-runs it, the `priorBlock` context is lost (it's held in memory per D23). The engine still runs correctly — it just doesn't know it was previously blocked. This is acceptable for advisory context but worth documenting for engine authors.

2. **Checker functions running within the crawl loop.** Checkers are expected to be lightweight (HTTP calls, Stacks reads). A slow or hanging checker would block the entire crawl cycle. The brief acknowledges this is the baseline; the crawl loop is already synchronous (one action per call). A future improvement could add per-checker timeouts.

3. **`crawl-continual` observability for blocked rigs.** When all rigs are blocked and no writs are ready, `crawl()` returns null (idle). The `crawl-continual` loop increments idleCount. If `maxIdleCycles` is set, the loop may stop even though there are blocked rigs that could unblock. This is the current idle detection behavior; blocked rigs should probably not count as "idle" since work is pending. However, addressing this would change `crawl-continual` semantics — noted for future consideration.
