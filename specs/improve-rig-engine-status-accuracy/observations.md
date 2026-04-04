# Observations: Improve Rig Engine Status Accuracy

## Doc/Code Discrepancies

1. **Guild metaphor engine states don't include `failed` or `cancelled`.** The guild-metaphor.md (line 93) describes three engine states: *idle*, *working*, *complete*. The code already has four (`pending`, `running`, `completed`, `failed`) and this commission adds a fifth (`cancelled`). The metaphor doc's tone guidance says "technical details belong in the reference docs" so this may be intentional abstraction — but `failed` is a conceptually significant state that the metaphor currently omits. A future commission could reconcile the metaphor's engine lifecycle description with reality.

2. **Spider spec uses `yields: null` but the code uses `yields?: unknown`.** The spider.md spec (lines 150-163) shows engine instances initialized with `yields: null`, but the `EngineInstance` type in `types.ts` declares `yields?: unknown` (optional, no null). The actual code in `buildStaticEngines()` omits yields entirely from the initial engine objects. Minor, but a future spec cleanup could align them.

3. **Rigging doc says "propagate completion state to downstream engines" but this doesn't happen for failure.** The rigging.md (line 69) step 6 says "Record engine yields; propagate completion state to downstream engines" — but in practice, only success state propagates. This commission fixes the gap for failure, but the rigging doc's description of step 6 could be made more precise: completion state propagates via the crawl loop (next pending engine becomes runnable), not via explicit state writes.

## Refactoring Opportunities

4. **`failEngine()` recomputes the full engines array but only changes one engine.** The function maps over all engines to update one. After this commission it will map over all engines to update potentially many. The pattern works fine, but if rigs ever grow large (dynamic rigs with many engines), a targeted patch of individual engine statuses within the array would be more efficient. Not worth changing now — the static pipeline has 5 engines.

5. **No helper to determine "downstream engines" exists.** The Spider has `findRunnableEngine()` (finds pending engines with completed upstream) but no general graph utility for downstream traversal. This commission doesn't need one (it cancels all pending engines), but future dynamic rig features (partial failure, branch-specific cancellation) would benefit from a `findDownstreamEngines(engineId)` utility. Worth noting for when dynamic rigs arrive.

## Potential Risks

6. **Consumers of `EngineStatus` may not handle the new `'cancelled'` value.** The `EngineStatus` type is exported publicly from `@shardworks/spider-apparatus`. Any code that does exhaustive switch/if on engine status values will get a TypeScript compile error (which is the desired behavior — it forces handling). But any runtime code that doesn't use TypeScript strict checking could silently ignore cancelled engines. The rig-show and rig-list tools just pass through the data, so they're fine. Worth checking if any guild-side code (tools, standing orders) inspects engine status.
