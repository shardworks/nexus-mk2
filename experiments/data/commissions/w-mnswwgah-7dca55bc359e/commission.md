## Opened With

From the original writ-substrate design (`.scratch/conversation-topics-as-writs.md`):

> If two Cocos are simultaneously updating the same topic's summary, last-write-wins will silently drop one session's edits.

Three options were sketched:

1. **Optimistic concurrency** — version-stamped writes; reject writes with a stale version and force the caller to re-read and retry.
2. **Append-only session journal** — structured sub-section in the body (e.g. `## Session Notes`) that each session appends to rather than rewriting. The Summary section stays last-write-wins but the append-only channel prevents data loss.
3. **Accept the risk for v1** — concurrent-session work on the same quest is rare in practice; revisit when it bites.

v1 shipped with option 3 (accept the risk).

## Summary

Currently unmitigated. The workflow assumes single-session-at-a-time on any given quest, which is mostly true today but will become false as more autonomous agents (Astrolabe, future planners) start touching quests alongside Coco. The failure mode is silent data loss — one session reads, another session reads+writes, first session writes over the second.

**Open:**
- Has this actually bitten anyone yet? (No known incidents as of 2026-04-10.)
- Is the append-only journal cheap enough to ship preemptively, or should we wait for a real incident?
- Does the Clerk have any existing version/etag plumbing that optimistic concurrency could plug into, or would it require new infrastructure?

The append-only journal is attractive because it degrades gracefully — even if two sessions race, both entries land, and a human can reconcile later. The Summary section stays unstable but is anyway "current thinking, mutable by design."

## Notes

- 2026-04-10: Imported from `.scratch/conversation-topics-as-writs.md` § "Open design questions not yet resolved" #2.
- Parent quest: w-mnswvmj7-2112b86f710a (writ substrate).
- Related: anything that turns Astrolabe into a quest writer (T1.4 decisions work) raises the concurrent-write risk.