# Reattach detached-HEAD branch ref in the seal flow

## Intent

The seal flow's rebase-and-retry loop fails to make progress when the draft worktree's HEAD is detached. After rebase, the new commits exist only at the worktree's detached HEAD; the draft branch ref in the bare clone is never advanced. Each subsequent retry resolves the source-branch ref to its pre-rebase commit, the FF check fails again, and after the retry budget is exhausted the seal throws "Sealing failed after 3 retries" — a misleading message that points at the symptom (retries exhausted) rather than the cause (stale branch ref).

The fix is to make the seal flow self-healing: after each rebase, detect whether the source-branch ref matches the worktree's HEAD, and if not, **reattach** the branch ref to point at the rebased HEAD. The seal then resumes normal forward progress (FF on the next loop iteration). No new error path; the recovery is transparent.

## Motivation

This bug was identified during the Apr-26 reckoner-apparatus rename commission. The seal failed; investigation showed the worktree HEAD was detached at the rebased commit, but the bare clone's `refs/heads/draft-...` still pointed at the pre-rebase commit. The detached-HEAD state had been introduced earlier — the worktree's HEAD reflog showed two `git checkout HEAD~1` operations issued during review/revise (almost certainly to inspect the prior tree state). Once HEAD detaches, `git rebase` still produces correct commits but cannot advance the branch ref. The seal's retry loop is blind to the discrepancy.

This is observably distinct from genuine concurrent-push contention (where origin keeps moving and FF keeps failing legitimately). The retry loop's design assumed each rebase advances the source branch — when that assumption is violated, the loop is a no-op disguised as effort. Without the reattach fix, every implement → review → revise sequence that touches `git checkout` in the worktree is liable to reproduce this failure and require manual patron recovery.

## Non-negotiable decisions

- **Mechanism is reattach, not fail.** When the seal flow detects the source-branch ref does not match the worktree's HEAD after a rebase, it must update the branch ref to point at HEAD. Do not throw, do not require operator intervention, do not skip the retry — reattach silently and let the seal flow continue. (Source: `c-mohzb1ha`.)
- **Reattach is scoped to the rebase retry path.** The fix lives in the function that drives the rebase + FF retry loop. Other code paths (e.g., the implement engine's commit step, draft open/abandon) are out of scope. The detached-HEAD state was already present at seal time; the seal flow is where the broken assumption lives, and where the repair belongs.
- **No detached-HEAD prevention.** This commission does not change implement/review/revise engine behavior, does not add guards against `git checkout` in the worktree, and does not introduce new abstractions for worktree state hygiene. It only patches the specific assumption inside seal that the source-branch ref advances after rebase.
- **Preserve existing concurrent-contention behavior.** Genuine FF failures on subsequent retries (where the rebase did advance the branch ref but the target moved again) must continue to work as today. Reattach is additive; it only fires when the branch ref is stale relative to HEAD.
- **The reattach is observable.** Log a single line when it fires, with the source branch name, the old branch SHA, and the new HEAD SHA. This produces a signal that distinguishes "seal succeeded after detached-HEAD recovery" from "seal succeeded normally" so the failure mode remains visible in retrospectives.

## Behavioral cases the design depends on

- A seal where the worktree HEAD was detached before the rebase begins (e.g., draft committed in detached state, or `git checkout HEAD~1` was run mid-flow) succeeds end-to-end: rebase produces a new commit at detached HEAD, reattach updates the branch ref, FF on the next iteration succeeds, push lands on origin.
- A seal where the rebase advances the branch ref normally (HEAD attached) does not trigger the reattach path — the source ref already matches HEAD and the loop continues as today.
- A seal where the target branch is moving on origin (genuine concurrent contention) still retries up to the configured budget and exits with the existing failure message — the reattach path does not mask real contention.
- A seal where the rebase produces no new commits (already up to date — source already on top of target) still completes correctly, whether HEAD was attached or detached.

## Out of scope

- Detecting or preventing detached HEAD in the implement, review, or revise engines.
- Reworking the seal retry-budget mechanics or the "after 3 retries" error message.
- Adding worktree-state assertions to other Scriptorium API surfaces (`openDraft`, `abandonDraft`, etc.).
- Any change to remote-ref advancement (`advanceToRemote`) or fetch behavior.
- Surfacing concurrent-seal-contention to the patron via Oculus / Reckoner / Sentinel — tracked separately under `c-mof5scdo`.
- Updating the existing Apr-26 reckoner-rename writ outcome — already recovered manually.

## References

- `c-mohzb1ha` — diagnosis and decided fix mechanism (this commission's source click).
- `c-mof5scdo` — concurrent-seal-contention parent failure-class click; this commission narrows root cause for at least the Apr-26 incident.