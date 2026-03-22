# Commission: Workshop Isolation for Commission Dispatch

## What I Need

When I post a commission, the golem that receives it needs to properly prepare the workshop before delivering it to any animas for work. This means:

1. **A commission-specific git branch exists**, created from `main`.
2. **The branch is checked out in a session-specific worktree**, so the anima works in an isolated directory — not in a shared checkout, and not stepping on other commissions.
3. **The anima agent is started in this worktree.**

When the anima completes its work (commits and pushes the commission branch):

4. **The golem merges the commission branch into `main` and pushes.** The anima should not merge — it just pushes its branch.
5. **If the merge succeeds**, the worktree and branch are cleaned up.
6. **If the merge fails due to conflicts**, the worktree and branch are cleaned up and the commission is marked as failed with a clear message describing the conflict.

Additionally, commissions need a **status reason** — short text describing what caused the current state. For example: "posted by patron" at creation, "dispatched to Valdris" at dispatch, "work completed in commit abc1234" on success, "failed due to merge conflict" on failure. Every state transition should update the status reason.

## How I'll Evaluate

- I will post a commission and verify the anima runs in its own worktree on a commission-specific branch — not directly on `main`.
- I will verify that after the anima finishes, its work is merged to `main` and pushed.
- I will simulate a merge conflict and verify the golem reports failure cleanly without leaving broken state.
- I will run two commissions concurrently and verify they don't interfere with each other.
