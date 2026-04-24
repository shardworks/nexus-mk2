The brief asserts that the direct patch `f8da251` (removing the `msg.type === 'result'` + rate-limit-text branch from `detectRateLimitFromNdjson` and its regression-guard test) is live as a precondition of this commission.

The current worktree (`draft-mod5oi7y-8cdae475`, head `97325b0`) contains the branch at `packages/plugins/claude-code/src/index.ts` lines 95-104 and the matching test at `packages/plugins/claude-code/src/rate-limit-detection.test.ts` line 58. A `git log --all --oneline | grep f8da251` returns nothing on this branch.

Either (a) the direct patch landed on `main` after this worktree diverged and will be rebased in before merge, (b) the direct patch is queued and has not yet landed, or (c) the precondition claim in the brief is incorrect. The implementer should verify the patch is present on the intended merge base before assuming the brief's precondition holds.

Decision D15 already hedges against this by defensively removing the branch as part of the commission, but confirming the direct patch's status closes the ambiguity in the lineage record.