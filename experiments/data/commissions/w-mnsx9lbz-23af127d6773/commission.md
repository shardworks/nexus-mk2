_Imported from `.scratch/todo/multi-rig-architectural-exploration.md` § "Parent-child overloading" (2026-04-10)._

## Opened With

The writ tree's parent-child relationship is currently carrying **three distinct meanings** under one primitive:

1. **Decomposition (container model).** The parent is a container; children do all the work; parent rolls up when children complete. This is the current Astrolabe case — a brief decomposes into mandates and the brief becomes structural.
2. **Sub-tasks (blocking dependencies).** The parent rig pauses, children produce results, the parent rig resumes with child outputs as input. Not supported today.
3. **Follow-ups (side effects).** Mid-work, an engine or anima discovers unrelated work that belongs in the system but not in the current rig. It files a child and continues with its own work. The child is a loosely-linked referral, not a dependency. Not supported today.

The current system partially supports (1), doesn't support (2) or (3), and uses `waiting` to cover (1). These are three different shapes — blocking vs non-blocking, consumed vs independent, lifecycle-linked vs lifecycle-separate — and trying to represent all of them with one primitive is causing the confusion.

Under multi-rig (see parent quest), one proposed invariant is: *a writ has a rig OR has children, never both at the same time*. That's clean for decomposition but rigid — it doesn't handle "finish the rest of the work after children complete" without forcing an awkward rig-ends-then-new-rig dance. And it says nothing about (3), since follow-ups are orthogonal to whether the parent has its own rig.

## Summary

This is a modeling question, not an implementation one. The three meanings probably want three different representations:

- **Decomposition** — plausibly stays on parentId; the parent *is* the children structurally.
- **Sub-tasks** — might want a typed link (`blocks`/`blocked-by`) rather than parent-child, since the dependency relationship is what matters, not containment. Under multi-rig this gets cleaner: "rig pauses on blocking-link to child writ."
- **Follow-ups** — wants a much looser link (`spawned-from` or `discovered-by`), with no lifecycle coupling at all. The parent completes independently of the follow-up; the follow-up references its origin for context but doesn't wait on the parent or vice versa.

**Open:**
- Is parentId the right primitive for decomposition, or should decomposition also become a typed link and parentId retire?
- How does the existing `clerk/links` book interact with this — do we invent new link types, or is there already machinery we can lean on?
- Can we represent (1) and (2) uniformly under multi-rig if rig pause-on-blocking-link becomes a primitive? (That would unify the decomposition and sub-task cases and leave follow-ups as the genuinely-different one.)
- Where does "loose follow-up" fit in a patron's mental model? Is it a new writ at all, or does it become something closer to "tagged observation" that could live outside the writ tree entirely?

## Notes

- Worth a pass through Clerk's existing link types (`supersedes`, `refines`, etc.) to see which already exist and could be repurposed or extended.
- This quest is conceptually downstream of the multi-rig refactor but can be explored independently — the three-meanings observation holds regardless.