# Astrolabe: Task Decomposition & Acceptance Verification

**Status:** Proposal / scratch
**Target doc:** `/workspace/nexus/docs/architecture/apparatus/astrolabe.md`
**Inspired by:** GSD's task+verify pattern (1:1 change→verification binding)

---

## The Vision

Today, the Astrolabe's spec-writer produces a markdown blob (`spec`) that the implementation rig consumes as its entire instruction set. A single anima reads the spec and implements everything. The seal engine runs build+test and declares success.

Two gaps with this model:

1. **Correlated failures.** The implementing anima writes the code *and* the tests. Its blind spots are the same in both. Green CI does not imply behavioral correctness. (See: Oculus landing page runtime `ReferenceError` that passed all tests.)

2. **Unstructured work.** The spec is narrative. The agent has to parse intent, infer what to build first, decide what "done" means per sub-unit. All judgment calls happen inside a single context window.

The proposal: the spec-writer produces **structured task units**, each with explicit file associations and a planner-written acceptance criterion. The narrative becomes *design notes* — context for the implementor, not the actionable content. A new **acceptance step** in the implementation rig runs each task's verification before sealing.

The 1:1 task→verification binding, combined with planner-written acceptance criteria, breaks the correlated-failure loop: the agent that defines "done" is not the agent that implements the code.

This is **Phase 2** of a three-phase path (see "Phased Rollout" at the bottom). Phase 1 is file metadata for cross-commission conflict detection. Phase 3 is parallel task dispatch. Phase 2 is the highest-value and lowest-risk middle step.

---

## Schema Changes

### PlanDoc

Two new fields, one deprecation:

```typescript
interface PlanDoc {
  id: string;
  codex: string;
  status: 'reading' | 'analyzing' | 'reviewing' | 'writing' | 'completed' | 'failed';

  // ── Reader output (unchanged) ─────────────────────────
  inventory?: string;

  // ── Analyst output (unchanged) ────────────────────────
  observations?: string;
  scope?: ScopeItem[];
  decisions?: Decision[];

  // ── Spec-writer output (revised) ──────────────────────

  /** Design context for implementors: conventions, patterns,
   *  architectural notes, cross-cutting concerns. NOT actionable
   *  on its own — orientation material only. */
  designNotes?: string;

  /** Ordered task decomposition with file associations and
   *  acceptance criteria. The actionable output of planning. */
  tasks?: TaskUnit[];

  /** @deprecated Superseded by designNotes + tasks. Retained
   *  for migration; new plans do not set this. */
  spec?: string;

  generatedWritId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### TaskUnit (new)

```typescript
interface TaskUnit {
  /** Short slug unique within this plan.
   *  e.g. 'scaffold', 'book-schema', 'plan-init-engine' */
  id: string;

  /** Human-readable title. */
  title: string;

  /** Implementation instruction — what to do, concretely. */
  action: string;

  /** Files this task will create or modify. */
  filesChanged: string[];

  /** Files needed as read-only context to do the work.
   *  Used by the implementation rig to scope the agent's
   *  read surface and by the Astrolabe for plan validation. */
  filesRead: string[];

  /** TaskUnit IDs that must complete before this one starts.
   *  Must form a DAG — validated by tasks-write tool. */
  dependsOn: string[];

  /** Human-readable acceptance criterion — what "done" means.
   *  Written by the planner, not the implementor. This is
   *  the target the implementing agent works toward. */
  acceptance: string;

  /** Runnable verification command or script that demonstrates
   *  the task works. Examples:
   *    - "curl -s localhost:3000/api/plans | jq '.plans | length'"
   *    - "pnpm test -- --grep 'plan-init creates PlanDoc'"
   *    - "npx astrolabe plan-show <id> --format json"
   *
   *  Null is permitted for purely structural tasks (type
   *  definitions, scaffolding) where build+test at seal time
   *  is sufficient. Non-null is strongly preferred. */
  verify?: string;
}
```

### Why `verify` Can Be Null

The 1:1 binding is the principle. The runnable check is the ideal. Some tasks resist concrete behavioral verification — adding a type definition, creating a module structure, renaming a symbol. For those, `verify` is null and the seal engine's build+test catches structural correctness. The planner must still write `acceptance` (a human-readable criterion) even when `verify` is null — the binding is maintained.

A future enhancement could enforce non-null `verify` for tasks whose `filesChanged` include runtime files (`.ts` that isn't purely types), and allow null only for `.d.ts`, config, and scaffolding. Not for MVP.

---

## Tool Changes

### `tasks-write` (new)

Replaces `spec-write` as the spec-writer's primary output tool.

- **Permission:** `astrolabe:write`
- **Params:** `planId` (string), `tasks` (TaskUnit[])
- **Validation:**
  - All `dependsOn` references point to task IDs present in the array
  - No circular dependencies (DAG check)
  - Task IDs are unique
  - `filesChanged` overlaps between tasks emit warnings (not errors) — overlaps are legal but signal possible decomposition problems
  - Every task has non-empty `action` and `acceptance`
- **Behavior:** Patches `plan.tasks` and sets `updatedAt`.

### `design-notes-write` (new)

Renamed from `spec-write`. Writes the narrative design context.

- **Permission:** `astrolabe:write`
- **Params:** `planId` (string), `designNotes` (string — markdown)
- **Behavior:** Patches `plan.designNotes` and sets `updatedAt`.

### `spec-write` (deprecated)

Kept for backwards compatibility during migration. New spec-writer prompts do not call it.

---

## Inventory-Check Engine Enhancement

The current `astrolabe.inventory-check` engine validates that an inventory document exists. With tasks, it gains a second validation phase that runs *after* the spec-writer stage — call it the **plan-check** phase, or fold it into inventory-check with a mode parameter.

Proposed: rename to `astrolabe.plan-check` with two modes, OR add a new engine `astrolabe.task-validate`. For this proposal, I'll describe it as a new engine to keep the two concerns cleanly separable.

### `astrolabe.task-validate` (new)

Runs after the spec-writer stage, before the rig terminates. Validates the task decomposition against the codebase inventory and the scope.

- **File existence:** For each `filesChanged` entry, verify the path is either (a) an existing file in the codebase (modification) or (b) a plausible new file under an existing directory (creation). For each `filesRead` entry, verify the file exists.
- **DAG validity:** No circular dependencies. Every `dependsOn` ID resolves.
- **Scope coverage:** Every in-scope `ScopeItem` has at least one task whose `action` or `acceptance` references it. (Requirement traceability — the GSD plan-checker idea.)
- **Overlap surfacing:** Tasks with overlapping `filesChanged` are flagged. Not necessarily a failure — sometimes two tasks legitimately touch the same file — but the overlap is reported for potential planner revision.
- **Acceptance presence:** Every task has non-empty `acceptance`. Tasks without `verify` are permitted but counted and reported.

On failure, the engine fails the rig with a structured error describing which tasks failed which check. A future enhancement could loop back to the spec-writer for revision (similar to GSD's plan-checker revision loop), but MVP fails hard.

---

## Rig Template Changes

### Astrolabe Planning Rig

The planning pipeline itself barely changes. The spec-writer stage now calls `tasks-write` and `design-notes-write` instead of `spec-write`. One new engine added:

```
brief writ posted
  │
  ├─ 1. Plan init (astrolabe.plan-init, clockwork)
  ├─ 2. Draft (draft, clockwork)
  ├─ 3. Reader (anima-session)
  ├─ 4. Inventory check (astrolabe.inventory-check, clockwork)
  ├─ 5. Analyst (anima-session)
  ├─ 6. Patron review (astrolabe.decision-review, clockwork)
  ├─ 7. Spec-writer (anima-session)
  │     → now writes designNotes + tasks[] instead of spec blob
  │     → posts the generated mandate to the Clerk with
  │       tasks embedded in writ metadata
  │
  ├─ 8. Task validate (astrolabe.task-validate, clockwork) — NEW
  │     → validates task decomposition against inventory and scope
  │     → fails the rig on structural errors
  │
  ├─ 9. Seal (seal, clockwork, abandon: true)
  └─ done
```

### Implementation Rig (referenced, not owned)

The implementation rig that *consumes* the Astrolabe's output changes more substantially — a new acceptance step runs between implementation and seal. Those changes don't belong in the Astrolabe doc. They belong in whatever document describes the default implementation rig template.

**Open question for Sean:** where does the default implementation rig live architecturally? Is it documented in the Spider doc? In a separate doc? Not documented yet? This proposal needs a companion proposal for the implementation rig side, and I don't know where to target it.

For reference, the implementation rig changes would look like:

```
mandate posted (with tasks[] in metadata)
  ├─ 1. Draft (open worktree)
  ├─ 2. Implementation (anima-session)
  │     → receives designNotes + tasks[] as structured input
  │     → works tasks in dependency order
  │     → each task's acceptance is the target
  ├─ 3. Acceptance (clockwork, NEW)
  │     → iterates tasks with non-null verify
  │     → runs each verify command in the worktree
  │     → fails if any task fails
  ├─ 4. Seal (build + test + merge)
  └─ done
```

---

## Writ Metadata

The generated mandate writ needs to carry the task decomposition so the implementation rig can access it. Two options:

**Option A: tasks inline in writ body.** The spec-writer posts a mandate whose body is the `designNotes` markdown, with `tasks` in a structured metadata field on the writ.

**Option B: tasks in the PlanDoc only, implementation rig reads back.** The mandate body references the plan ID; the implementation rig reads the PlanDoc directly.

**Recommendation: Option A.** The writ is self-contained. The PlanDoc is a planning artifact; the mandate is a work artifact. Decoupling means the implementation rig doesn't depend on Astrolabe being installed to read its own input. The writ schema gains an optional `tasks` metadata field (or we treat it as generic structured metadata).

---

## Phased Rollout

This proposal covers **Phase 2** of a three-phase path:

### Phase 1: File metadata for cross-commission conflict detection
Add `filesChanged` / `filesRead` to existing mandate writs. Spider uses these to detect conflicts between concurrently-active commissions (the Loom incident prevention). Independent of task decomposition. Low cost, immediate value.

### Phase 2: Task decomposition + acceptance verification (THIS PROPOSAL)
The Astrolabe's spec-writer produces structured tasks. The implementation rig gains an acceptance step. One agent still does the implementation work — parallelization comes later. The 1:1 verification binding is the core win.

### Phase 3: Parallel task dispatch
The implementation rig dispatches tasks to multiple parallel agent sessions, scheduled via a conflict graph from `filesChanged`. Failed tasks retry independently. Integration check verifies cross-task coherence before seal. Requires the file metadata (Phase 1) and task structure (Phase 2) to already be solid.

Phase 2 is independently valuable — even without parallelization, planner-written acceptance criteria fix the correlated-failure problem and give agents clearer targets. Phase 3 is the speedup multiplier but depends on Phase 2 proving the decomposition quality is good enough.

---

## Open Questions

1. **Where does the implementation rig documentation live?** This proposal needs a companion for the consumer side.

2. **How should the generated mandate carry tasks?** Inline metadata on the writ (Option A above) or reference-by-plan-id (Option B)?

3. **Should `task-validate` be a separate engine or folded into `inventory-check` with a mode parameter?** Separate is cleaner architecturally; folded is fewer moving parts.

4. **Should the Astrolabe loop back to the spec-writer on `task-validate` failure?** MVP fails hard. Revision loop is future work but worth sketching.

5. **What's the prompt guidance for the spec-writer on writing good `verify` commands?** This is where quality will live or die. Bad `verify` commands are worse than none. Probably needs a reference doc with patterns and anti-patterns.

6. **How does the existing `spec-write` tool get deprecated without breaking in-flight plans?** Probably just dual-write for a release, then remove.

7. **Should `filesChanged` overlaps be a hard error or a warning?** Current proposal: warning. But frequent overlaps might signal decomposition problems the spec-writer should be forced to resolve.
