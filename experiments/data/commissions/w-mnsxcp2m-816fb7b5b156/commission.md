_Imported from `.scratch/astrolabe-task-decomposition-proposal.md` (2026-04-10)._

## Opened With

The Astrolabe's spec-writer currently produces a markdown blob (`spec`) that the implementation rig consumes as its entire instruction set. A single anima reads the spec and implements everything. The seal engine runs build+test and declares success.

Two gaps with this model:

1. **Correlated failures.** The implementing anima writes the code *and* the tests. Its blind spots are the same in both. Green CI does not imply behavioral correctness. Reference case: the Oculus landing page runtime `ReferenceError` that passed all tests.
2. **Unstructured work.** The spec is narrative. The agent has to parse intent, infer what to build first, and decide what "done" means per sub-unit. All judgment calls happen inside a single context window.

The proposal: the spec-writer produces **structured task units**, each with explicit file associations and a **planner-written acceptance criterion**. The narrative becomes *design notes* — context for the implementor, not the actionable content. A new **acceptance step** in the implementation rig runs each task's verification before sealing.

The 1:1 task→verification binding, combined with planner-written acceptance criteria, breaks the correlated-failure loop: the agent that defines "done" is not the agent that implements the code.

**Schema changes at a glance:**

```typescript
interface TaskUnit {
  id: string;              // slug unique within plan
  title: string;
  action: string;          // what to do, concretely
  filesChanged: string[];  // files this task creates/modifies
  filesRead: string[];     // read-only context files
  dependsOn: string[];     // other task IDs (DAG)
  acceptance: string;      // planner-written "what done means"
  verify?: string;         // runnable command (nullable for structural tasks)
}
```

The spec-writer emits `tasks: TaskUnit[]` via a new `tasks-write` tool, and the design narrative via `design-notes-write`. A new `astrolabe.task-validate` engine runs after the spec-writer stage, checking file existence, DAG validity, scope coverage, overlap surfacing, and acceptance presence. The implementation rig gains a new **acceptance step** between implementation and seal that runs each task's `verify` command.

**Phased context:** this proposal is Phase 2 of a three-phase path. Phase 1 (file metadata on existing mandates for cross-commission conflict detection) is the prerequisite for the Loom incident prevention. Phase 3 (parallel task dispatch) is the speedup multiplier, depending on Phase 2 proving decomposition quality is good enough. Phase 2 is the highest-value, lowest-risk middle step.

## Summary

Active proposal, not yet implemented. The design is substantially worked out; what remains is resolving the open questions below and building against them. Two big caveats:

- **The brief→mandate collapse quest (under T2)** says the current `brief → planning rig → mandate → execution rig` shape is a 1:1 artifact and should collapse to one writ with two sequential rigs when multi-rig lands. The *PlanDoc shape* (including tasks and design notes) is the hardest part and doesn't change between models. Design Astrolabe on 1:1 with the PlanDoc designed to survive the multi-rig transition; swap the output topology later.
- **`verify` command quality is where this lives or dies.** Bad verify commands are worse than none — they give false confidence. The spec-writer needs prompt guidance with patterns and anti-patterns. This is its own sub-quest.

**Open questions** (from the proposal):

1. Where does the implementation rig documentation live? This proposal needs a companion for the consumer side.
2. How should the generated mandate carry tasks — inline metadata on the writ, or reference-by-plan-id?
3. Should `task-validate` be a separate engine or folded into `inventory-check` with a mode parameter?
4. Should Astrolabe loop back to the spec-writer on `task-validate` failure? (MVP fails hard; revision loop is future work.)
5. What's the prompt guidance for the spec-writer on writing good `verify` commands? *(promoted to a child quest)*
6. How does `spec-write` deprecate without breaking in-flight plans? (Probably dual-write for a release, then remove.)
7. Should `filesChanged` overlaps be hard error or warning? (Current: warning.)

## Notes

- **Child quests spawned:**
  - Conversational analyst mode (multi-turn plan refinement — separate but related inquiry).
  - Verify-command quality guidance (where the decomposition's quality lives or dies).
- **Cross-links to T2:**
  - Brief→mandate collapse (T2.3) — PlanDoc design needs to survive the topology change.
  - Parent-child semantics (T2.2) — `tasks[]` is effectively an inline decomposition inside one writ; doesn't use parent-child at all, which sidesteps the overloading question entirely. Worth noting as evidence that parent-child isn't the right primitive for in-rig structure.
- **File metadata (Phase 1)** is a prerequisite for both Phase 2 and Phase 3 and is independently valuable for Loom incident prevention. Worth pulling out as its own small effort before Phase 2 lands.
- **`verify` nullable rationale:** some tasks resist concrete behavioral verification (type definitions, scaffolding, renames). For those, the seal engine's build+test catches structural correctness. The planner still writes `acceptance` (human-readable) even when `verify` is null — the 1:1 binding is maintained.
- **A future enhancement** could enforce non-null `verify` for tasks whose `filesChanged` includes runtime files, allowing null only for `.d.ts`/config/scaffolding. Not for MVP.