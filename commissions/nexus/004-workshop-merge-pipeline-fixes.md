# Commission: Fix workshop-merge pipeline

## Title

Fix three workshop-merge pipeline bugs: duplicate events, worktree race, stale bare clone

## Description

The merge pipeline has three bugs, all visible when `writ.completed` fires and `workshop-merge` runs. Observed in production: the engine fired twice, both attempts failed — one due to a missing worktree, one due to a stale bare clone.

### Bug 1: Duplicate `writ.completed` event

`workshop-merge` fired twice, indicating `writ.completed` was signaled twice for the same writ. Investigate and fix the source of the duplicate. Likely candidates:

- `completeWrit` signals `writ.completed` directly, AND `rollupParent` signals it again when the parent rolls up — if the writ is both a root and a child in some code path, both could fire.
- The Clockworks processed the same event twice (missing guard against duplicate dispatch).

Regardless of source, `workshop-merge` should be idempotent: check whether the writ's branch has already been merged before attempting. If the branch is already in main (or the writ is already in a terminal state beyond `completed`), skip silently.

### Bug 2: Worktree torn down before workshop-merge runs

The session funnel tears down the worktree during session cleanup. The `writ.completed` event is signaled earlier (when `complete-session` is called, during the session), but if the Clockworks daemon processes it asynchronously after the session ends, the worktree is already gone.

The fix: `workshop-merge` should not depend on the worktree. The artificer's commits are already in the bare clone's branch (worktrees share the object store). The merge engine should operate entirely on the bare clone — merge the writ branch into `main` inside the bare clone, then push. No worktree required.

If the bare clone approach is not feasible for some reason, the alternative is: don't tear down the worktree in session cleanup; instead, let `workshop-merge` tear it down after a successful merge (or failed merge, with an error record).

### Bug 3: Stale bare clone — push rejected

The bare clone's `main` is behind the remote. The merge engine merges the writ branch into local `main` successfully but the push fails (non-fast-forward). Fix: fetch the bare clone before attempting the merge. The sequence should be:

1. `git fetch origin` in the bare clone
2. Merge the writ branch into `origin/main` (or local `main` after fetch)
3. Push

If the fetch + merge results in a conflict (concurrent work merged to main after this writ branched), the engine should fail the writ with a clear `writ.merge-failed` reason explaining the conflict, rather than leaving it in a silent error state.

## Acceptance Criteria

- [ ] `workshop-merge` checks whether the writ branch is already merged before attempting — idempotent on duplicate `writ.completed` events
- [ ] Source of duplicate `writ.completed` identified and fixed (or documented if intentional)
- [ ] `workshop-merge` operates on the bare clone directly — no dependency on worktree existence
- [ ] `workshop-merge` fetches the bare clone from remote before merge/push
- [ ] If the post-fetch merge conflicts, engine signals `writ.merge-failed` with a clear reason
- [ ] Existing merge tests still pass; new test covering the duplicate-event idempotency case

## Workshop

nexus
