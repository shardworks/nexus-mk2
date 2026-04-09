# Observations

Punch list of things noticed during analysis that are outside the brief's scope but worth recording.

## Doc/Code Discrepancies

1. **clerk.md "Kit Interface" section is stale.** The doc says "The Clerk does not consume kit contributions. No `consumes` declaration." The actual code has `consumes: ['writTypes']` in the apparatus declaration and fully processes kit-contributed writ types in `registerKitWritTypes()`. The doc should be updated to reflect the current implementation.

2. **clerk.md supportKit tools list is stale.** The doc lists tools through `writ-publish` but omits `writ-link`, `writ-unlink`, and `writ-types` which are present in the current implementation.

3. **clerk.md "Future: Writ Hierarchy" completion rollup contradicts the brief.** The doc says "All children `completed` → parent auto-transitions to `completed`." The brief says parent transitions to "the ready state." The brief takes precedence as patron intent. This entire Future section should be replaced with the actual implemented design once this commission is complete.

4. **writ-list tool is missing 'new' from status filter enum.** The zod schema for the status param is `z.enum(['ready', 'active', 'completed', 'failed', 'cancelled'])` — 'new' was added to WritStatus as part of the draft writ feature but the tool enum was not updated. This is a pre-existing bug that D29 addresses incidentally.

## Refactoring Opportunities

5. **transition() could benefit from a hook/callback system.** The brief's requirements add significant logic to the transition flow (CDC handler, parent transitions, sibling cancellations). Currently transition() is a flat method. As more side effects accumulate, consider extracting a TransitionPipeline that runs pre/post hooks. Not needed for this commission (CDC handles the side effects) but worth noting if more transition-triggered behaviors are added.

6. **The test harness in clerk.test.ts could be extracted.** The `setupCore()` / `buildClerkCtx()` / fake guild pattern is ~80 lines of boilerplate. With parent/child tests adding significant coverage, the test file will grow substantially. Consider extracting the test harness into a shared `test-helpers.ts` file (similar to `packages/framework/cli/src/commands/test-helpers.ts`). Not blocking for this commission.

7. **The `writ-show` tool fetches links separately from the writ.** It calls `clerk.show()` and `clerk.links()` in parallel. With parent/children added, the tool will need additional queries (parent writ, children summary). Consider a `clerk.showEnriched()` method that returns the writ with all associated context in one call. Not required — the tool handler can compose queries directly.

## Potential Risks

8. **CDC cascade depth with large hierarchies.** The Stacks cascade depth limit is 16. A failure at the bottom of a deep hierarchy triggers: child fail (depth +1) → N sibling cancels (each +1) → parent fail (depth +1) → parent's siblings (each +1) → grandparent... Each level adds ~(1 + sibling_count) to depth. A 3-level hierarchy with 5 children per level could approach the limit. For v1, this is acceptable (deep/wide hierarchies are a "design smell" per clerk.md), but if hierarchies grow, the depth limit may need increasing or the cascade strategy may need batching.

9. **Race condition: Spider spawns rig for a writ as children are being added.** If the Spider's `trySpawn()` reads a writ as `ready` and creates a rig, but between the read and the `clerk.transition(writ.id, 'active')` call, a child is added (transitioning the parent to `waiting`), the Spider's transition call will fail. The Spider already has a try/catch for transition errors in trySpawn(), so it will log and continue. However, a dangling rig (created for a waiting writ) would exist. This is the same class of race condition that already exists between multiple Spider instances. For v1, it's acceptable. A future improvement could use optimistic locking or a two-phase spawn.

10. **No explicit hierarchy depth limit.** The brief says "DAG" but the structure is actually a forest (single parent per child). No maximum depth is enforced. The CDC cascade depth limit (16) provides an implicit bound on failure propagation depth, but deeper hierarchies could exist and function normally for non-failure cases. Adding an explicit configurable depth limit is a possible future safeguard.

## Adjacent Opportunities

11. **The `decompose()` batch API deferred from this commission** could be added as a thin wrapper: open a transaction, call post() N times with parentId, return all children. This would be a good follow-up commission — small scope, high value for planning animas.

12. **The `active → waiting` transition (planning engine flow)** was explicitly deferred because it requires Spider changes. When the Spider needs to support the flow where a rig's engine creates children mid-execution, the Spider's CDC handler on rigs would need to check the writ's status before transitioning and gracefully handle `waiting` writs. This is a significant cross-package change suitable for its own commission.
