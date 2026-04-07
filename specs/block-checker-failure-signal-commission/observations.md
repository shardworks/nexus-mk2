# Observations — Block Checker Failure Signal Commission

## Doc/code discrepancies

1. **spider.md is substantially stale on blocking.** The architecture doc (`docs/architecture/apparatus/spider.md`) has zero mention of block types, the `BlockType` interface, `BlockRecord`, the `'blocked'` engine/rig status, or the `checkBlocked` crawl phase. The entire blocking system was added after the doc was written. This commission will widen the gap further (adding `CheckResult`). A future commission to update spider.md would be valuable.

2. **spider.md's EngineInstance type is missing `blocked` status and `block` field.** Doc shows `status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'` — code has `'blocked'` as well. Doc also omits the `block?: BlockRecord` field.

3. **spider.md's RigDoc status is missing `blocked`.** Doc shows `status: 'running' | 'completed' | 'failed'` — code has `'blocked'`.

## Refactoring opportunities skipped

4. **Clerk's TERMINAL_STATUSES is not exported.** The `writ-status` checker will hardcode `['completed', 'failed', 'cancelled']` because the clerk package doesn't export this set. A future commission could export it (or a `isTerminal(status)` helper) from `@shardworks/clerk-apparatus` so consumers don't drift if the status machine evolves. Skipped here to keep scope narrow.

5. **isBlockType() type guard only checks structural shape.** It verifies `typeof check === 'function'` but can't validate the return type. This is inherent to runtime type checking and not fixable, but worth noting — a block type returning booleans after this change would compile (since the guard doesn't validate) but cause runtime misbehavior in `tryCheckBlocked()`. The spec's pending-as-default approach (D4/D24) mitigates this somewhat since `true`/`false` would fall through to the pending branch rather than causing a crash.

## Potential risks

6. **Boolean backward compatibility for external block types.** The brief says "None of these block types are in use by any shipped engine yet, so there are no external consumers to migrate." This is true today, but any custom block types registered via `plugin:initialized` would break silently at runtime (returning booleans instead of CheckResult strings). The Spider's `tryCheckBlocked` approach of defaulting unknown values to 'pending' (per D4) provides a soft landing — a boolean-returning checker would behave as always-pending rather than crashing — but this silent degradation could be hard to diagnose. A console.warn for unexpected check() return values could help, but is out of scope.
