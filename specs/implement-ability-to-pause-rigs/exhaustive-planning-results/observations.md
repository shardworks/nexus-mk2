# Observations

## Refactoring opportunities skipped to keep scope narrow

1. **`tryRun()` and `tryCollect()` duplicate the rig-status resolution pattern.** Both have inline `allCompleted` checks that determine rig completion. Adding rig-blocked detection introduces a third outcome for both paths. A `resolveRigStatus(engines): RigStatus` helper would centralize this, but the refactor risks destabilizing the existing well-tested code paths. Decision D19 addresses the isRigBlocked extraction only.

2. **`failEngine()` hardcodes its cancellation predicate.** The current `if (e.status === 'pending')` becomes `if (e.status === 'pending' || e.status === 'blocked')` — a growing predicate. A future cleanup could use a set like `const CANCELLABLE: Set<EngineStatus> = new Set(['pending', 'blocked'])` but this is cosmetic.

3. **`tryRun()` and `tryCollect()` each query all running rigs on every cycle.** Adding `tryCheckBlocked()` adds a third query (running + blocked rigs). These are indexed queries on small datasets, but as rig counts grow, three full-table scans per crawl cycle could become a concern. A future optimization could batch-load rigs once per crawl and pass them through all phases.

## Suboptimal conventions followed for consistency

1. **`validate()` as a plain function instead of a Zod schema.** The Fabricator has no Zod dependency, and adding one would break its clean dependency boundary. Block type authors bear the cost of wrapping Zod schemas in a `validate()` function. This is less ergonomic but architecturally correct.

2. **`lastCheckedAt` persisted to Stacks on every check-skipped cycle.** When `tryCheckBlocked()` runs a checker that returns false, it writes `lastCheckedAt` to the block record. This Stacks write happens even though nothing changed semantically. An in-memory cache would be cheaper but wouldn't survive process restarts. The write piggybacks on the existing engines array patch pattern.

3. **priorBlock is lost on process restart.** The Spider holds the block record in memory between unblock (tryCheckBlocked) and re-run (tryRun). If the process restarts between these two steps, the engine runs without priorBlock context. This is acceptable for an advisory field, but engine authors should be warned not to depend on it for correctness.

## Doc/code discrepancies found during inventory

1. **`docs/architecture/apparatus/spider.md` — tool list:** Docs say `supportKit.tools: [crawlOneTool, crawlContinualTool]` but actual code has five tools: `[crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool]`. Three tools undocumented.

2. **`docs/guides/building-engines.md` — wrong engine concept entirely:** This guide describes Clockworks handlers registered via `nexus-engine.json` and standing orders. No such system exists in the current codebase. The `EngineDesign` type in the Fabricator and the engines contributed via kit `engines` field are the actual engine system. The guide either documents a planned-but-unbuilt system or a superseded architecture. Significant terminology collision.

3. **`docs/architecture/apparatus/spider.md` — yields: null vs yields?: unknown:** Docs describe `yields: null` as the initial value on EngineInstances. Actual code uses `yields?: unknown` (optional field, undefined at spawn time).

4. **`docs/architecture/apparatus/spider.md` — CDC resolution string:** Docs show a structured `Sealed at ${sealYields.sealedCommit} (${sealYields.strategy}, ...)` resolution string. Actual code uses `JSON.stringify(sealEngine.yields)` — a raw JSON dump.

## Potential risks in adjacent code

1. **`crawl-continual` idle detection vs blocked rigs.** When all rigs are blocked and no writs are ready, `crawl()` returns null (tryCheckBlocked skipped all engines because pollIntervalMs hasn't elapsed, or all checkers returned false). `crawl-continual` increments idleCount. If `maxIdleCycles` is set, the loop may stop even though rigs are blocked and could unblock later. Blocked rigs should arguably not count as "idle" — but changing this would alter `crawl-continual` semantics. Worth a follow-up consideration.

2. **Slow checkers block the crawl loop.** `tryCheckBlocked()` calls checker functions synchronously within the crawl cycle. A checker that makes a slow HTTP call (e.g., github-workflow with a 30s timeout) blocks the entire loop. The brief acknowledges this as the baseline; the crawl loop is already synchronous. Per-checker timeouts could be added as a future improvement.

3. **Concurrent block checks on the same engine.** If two Spider processes (or two rapid crawl cycles) both evaluate the same blocked engine, both might unblock it. The second would try to transition a 'pending' engine. This is a read-then-write race. The practical risk is low in single-process mode, but worth noting for future multi-Spider scenarios.
