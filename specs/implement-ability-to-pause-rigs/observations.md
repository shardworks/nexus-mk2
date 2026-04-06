# Observations

## Refactoring opportunities skipped

1. **Rig status resolution is duplicated across tryRun() and tryCollect().** Both have inline `allCompleted` checks. Adding rig-blocked detection introduces a third outcome in both paths. A `resolveRigStatus(engines): RigStatus` helper would centralize all three outcomes (completed, blocked, running) but risks destabilizing existing well-tested paths. D20 addresses only the isRigBlocked extraction.

2. **failEngine() cancellation predicate is growing.** Currently `e.status === 'pending'`; becomes `=== 'pending' || === 'blocked'`. A `CANCELLABLE_STATUSES` set would be cleaner but is cosmetic at two entries.

3. **Three queries per crawl cycle.** tryCollect, tryRun, and now tryCheckBlocked each query rigs independently. A batch-load-once-pass-through-all-phases pattern would reduce I/O but would change the existing code structure.

## Suboptimal conventions followed for consistency

1. **BlockTypeRegistry duplicates EngineRegistry pattern.** Spider's new BlockTypeRegistry replicates the same ~30 line scanning pattern from Fabricator's EngineRegistry. A shared generic ContributionRegistry<T> would DRY this up, but premature generalization across packages is worse than local duplication.

2. **lastCheckedAt persisted on every check cycle.** When tryCheckBlocked() evaluates a checker that returns false, it writes lastCheckedAt to Stacks even though nothing changed semantically. An in-memory cache would be cheaper but wouldn't survive process restarts.

3. **priorBlock lost on process restart.** Spider holds block record in memory between unblock (tryCheckBlocked) and re-run (tryRun). Process restart loses it. Acceptable for advisory context; engine authors should not depend on priorBlock for correctness.

## Doc/code discrepancies

1. **spider.md tool list** says `[crawlOneTool, crawlContinualTool]` but code has five tools. Three undocumented.

2. **building-engines.md** describes Clockworks handlers (nexus-engine.json, standing orders) — a completely different system from Fabricator EngineDesign. No Clockworks apparatus exists in the codebase.

3. **spider.md static graph** says `yields: null` but code uses `yields?: unknown` (optional, not set at spawn).

4. **spider.md CDC handler** shows structured resolution string but code uses `JSON.stringify(sealEngine.yields)`.

## Potential risks

1. **crawl-continual idle detection vs blocked rigs.** When all rigs are blocked and no writs ready, crawl() returns null. crawl-continual increments idleCount. With maxIdleCycles set, the loop may stop even though blocked rigs could unblock later. Blocked rigs should arguably not count as idle.

2. **Slow checkers block the crawl loop.** tryCheckBlocked() calls checkers synchronously. A slow HTTP call blocks the entire cycle. Per-checker timeouts could mitigate but aren't in scope.

3. **Concurrent block checks.** Two rapid crawl cycles could both evaluate the same blocked engine. Low risk in single-process mode; worth noting for future multi-Spider.

4. **Spider now scans two contribution fields.** With block types added to Spider's consumes, Spider scans both kit contributions and its own supportKit for blockTypes. The scanning logic (subscribe to plugin:initialized, iterate kits at startup) must handle blockTypes in addition to — or independent of — how Fabricator handles engines. Spider's start() will need the same scan-then-subscribe pattern Fabricator uses.
