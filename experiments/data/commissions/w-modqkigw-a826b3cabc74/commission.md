**Site:** `packages/plugins/clerk/src/clerk.ts` `handleParentTerminal()` at lines ~783–804. When a parent transitions to `completed` but children are still non-terminal, the code logs a warning and *does not* cancel the children, on the rationale that this indicates an upstream bookkeeping gap.

**Why this matters now:** During this commission's reading I found the asymmetry surprising — `failed` and `cancelled` cascade to children, `completed` warns but leaves children alone. If completed-with-live-children is genuinely an upstream gap, the warning is correct; if it's a legitimate state (e.g. parent completed independently of subtask outcomes), the warning is noise.

**Suggested investigation:** Audit which call sites can produce parent→completed with non-terminal children. If none can in current code, the warning is a tripwire (good). If some can (e.g. a future workflow where parent completion is independent), the cascade rule needs revisiting.

Not a bug today, but a behavior worth pinning down before more commissions build on the cascade semantics.