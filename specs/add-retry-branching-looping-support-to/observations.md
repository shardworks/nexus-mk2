# Observations

## Refactoring opportunities skipped to keep scope narrow

1. **Template validation duplication.** `validateTemplates()` (config path, ~lines 289-415) and `validateKitTemplate()` (kit path, ~lines 650-756) implement nearly identical validation logic (duplicate IDs, designId check, upstream references, cycle detection, resolutionEngine check, variable references). Adding `when` validation to both will increase this duplication. A shared `validateTemplate()` helper that both call would reduce maintenance burden, but was deferred to avoid scope creep.

2. **`allCompleted` check duplication.** Rig completion is checked in both `tryCollect` (line 1005) and `tryRun` (line 1235) with identical logic: `engines.every(e => e.status === 'completed')`. With the D7 change (adding `skipped` to the check), this should be extracted to a shared `isRigComplete()` helper, similar to the existing `isRigBlocked()`. This is a natural refactoring point.

3. **`findRunnableEngine` inline in `isRigBlocked`.** `isRigBlocked()` constructs a synthetic `RigDoc` to call `findRunnableEngine()`. This is a code smell — the function should accept an `EngineInstance[]` directly.

## Suboptimal conventions followed for consistency

4. **Extended result type pattern (D20/D21).** Ideally the `graft` field would live on `EngineRunResult` in the Fabricator package. The Spider-side extension type is a workaround for the circular package dependency (Spider depends on Fabricator; `RigTemplateEngine` is owned by Spider). If the package structure were redesigned, a shared types package could hold both `EngineRunResult` and `RigTemplateEngine`, allowing a clean unified type.

## Doc/code discrepancies found during analysis

5. **`docs/architecture/apparatus/spider.md`** is significantly stale. It describes: (a) only 4 CrawlResult variants (current code has 7), (b) a `spawnStaticRig()` function that no longer exists (replaced by template system), (c) `SpiderConfig.role` which was moved to `SpiderConfig.variables.role`, (d) no mention of block types, input requests, rig templates, or template mappings. This doc should be rewritten to match the current implementation.

6. **`docs/architecture/apparatus/fabricator.md`** shows `EngineRunContext` without a `rigId` field, but the code has `rigId: string` on the type. The doc also shows `EngineRunResult` without the `blocked` variant which was added with block type support.

7. **`docs/architecture/apparatus/review-loop.md`** has accurate "implementation notes" throughout marking the gap between design target and shipped code. These notes correctly describe the linear pipeline as the current state and the branching/retry pattern as the target. This brief implements what those notes describe as missing.

## Potential risks noticed in adjacent code

8. **Quick engine graft timing.** For quick engines (those returning `launched`), the graft can only be returned when the engine's `collect()` method runs, since `run()` returns `launched` (not `completed`). The current `collect()` signature returns `Promise<unknown>` (yields only). If a quick engine needs to graft, the collect method would need to return the extended result type. This is a subtle interaction — the current collect method returns yields directly, not an `EngineRunResult`. The Spider's tryCollect uses the engine's collect to get yields, then wraps them. Grafting from quick engines may require changes to the collect path or may need to be deferred to a follow-up.

9. **Race conditions with graft + CDC.** When a grafting engine completes and new engines are appended, the rig stays in `running` status. If the graft processing fails (validation error), the engine has already been marked completed. The rig would need to be failed after the engine was marked completed — which means two separate patches. The existing `failEngine()` pattern handles this, but the code path is subtle.

10. **`when` on engines without upstream.** A `when` clause on an engine with `upstream: []` would reference yields from an engine that isn't declared as upstream. The startup validation (D12) catches this, but it's a template authoring pitfall worth calling out in documentation.
