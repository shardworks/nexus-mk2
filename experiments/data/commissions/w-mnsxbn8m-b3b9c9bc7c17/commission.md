_Imported from `.scratch/todo/multi-rig-architectural-exploration.md` § "The Planning/Execution Boundary" and § "Open Questions" (2026-04-10)._

## Opened With

If a writ can accumulate multiple rigs over its lifetime, two state-layering questions surface immediately:

**1. Where do rig yields live, and how does a later rig read an earlier rig's output?**

Rig A produces yields (structured outputs from each engine stage). Rig B, spawned later on the same writ, may need to read them — for example, a continuation rig reading the PlanDoc produced by an earlier planning rig, or a recovery rig reading the in-progress artifacts of the rig it's recovering from.

Three candidates:

- **Explicit seed at spawn.** `spawnRig(writ, intent, { seed: rigA.yields })` — the later rig receives the earlier rig's yields as an explicit input. Clean data flow, no implicit state.
- **Writ-level "accumulated results" field.** Rigs read and write a shared slot on the writ. *This is a boundary smell* — the writ is supposed to track the obligation, not carry execution state. Reject.
- **Rig history queryable by rig.** Rig B queries "previous rigs on this writ" directly, pulling whatever it needs from the historical record. No explicit plumbing, but couples later rigs to earlier rigs' output shapes.

**2. Where does the worktree live across rigs?**

Today, drafts are per-rig (each rig opens its own worktree). Under multi-rig, that means rig B starts from a fresh worktree and loses rig A's in-progress work. That's fine for "spawn a planning rig, then spawn an execution rig" (no shared work surface needed), but broken for "recovery rig continuing after a failed seal" (the recovery rig needs the exact worktree state the failing rig left behind).

Three candidates:

- **Per-rig drafts (current).** Rig B starts fresh. Acceptable for planning-to-execution handoff; broken for recovery.
- **Writ-level workspace reference.** The writ points at a workspace; multiple rigs bind to the same workspace. Works, but makes the writ carry execution state (boundary smell).
- **Separate "workspace" entity linked to the writ, outlives rigs.** A durable workspace object that both the writ and rigs reference. The writ points at the workspace; the writ isn't it. *This is the favored shape.*

## Summary

These are the two biggest "what lives where" questions under multi-rig, and both involve the planning/execution boundary. The working rule is: **the writ doesn't contain execution state**. Yields and workspaces are execution artifacts that live alongside the writ, referenced by it.

**Leaning toward:**

- **Cross-rig data flow:** explicit seed at spawn time is cleanest. Later rigs are told what earlier rigs produced, not expected to discover it. Rig-history queries are a fallback for "I need to find out what happened" but shouldn't be the primary data path.
- **Workspace persistence:** a separate workspace entity, owned by Scriptorium (or a new apparatus), referenced by the writ via an FK. Rigs bind to a workspace for their execution; the workspace outlives any individual rig; the writ points at its current workspace without containing its state.

**Open:**
- Does the workspace entity need its own lifecycle (active/archived/abandoned), or is it just "exists or doesn't"?
- How are workspaces cleaned up? When the writ is sealed? Explicit GC pass? Never (archive forever)?
- Can multiple writs share a workspace, or is workspace ↔ writ a 1:1 relationship? (Probably 1:1 for now — multi-writ workspaces is a can of worms.)
- What goes in the workspace — just the worktree, or also intermediate artifacts, logs, rig yield history? (Probably just the worktree; yields live in a separate query-optimized place.)
- Is "Scriptorium" the right owner, or does workspace management deserve a new apparatus?
- How does this interact with the seal engine's assumption that it's pushing from a bare clone on the host, not from the session container?

## Notes

- **Boundary smells to avoid:** writ-level "results" field; writ document containing rig outputs; rig history queried by position rather than by explicit reference.
- **Query shape:** `workspace_id → worktree_path + metadata`, separate from writ and rig tables.
- This quest has the most ambiguous complexity in the T2 family — the "possibly 34 instead of 21" estimate in the parent quest is specifically about workspace persistence. Worth its own design pass before committing to multi-rig overall.