# Work Decomposition

> **⚠️ Superseded.** This document describes the old four-level hierarchy (work → piece → job → stroke). The system now uses the unified writ model. See [writs.md](writs.md) for the current design.

How the guild breaks work into manageable, trackable, dispatchable units — and why each level of the hierarchy exists.

## The Hierarchy

The guild uses a four-level hierarchy for operational work, plus an aspirational level that sits outside day-to-day operations:

| Level | What It Is | Operational Role |
|-------|-----------|-----------------|
| **Opus** | The patron's long-term vision — the full body of work across months or years | North star. Guides decision-making but is not tracked in the Ledger. |
| **Work** | A body of labor too large to plan in a single pass — requires decomposition into pieces | **Decomposition boundary.** What must be broken down before planning. |
| **Piece** | An independently-plannable chunk of a work | **Planning boundary.** What gets planned into concrete jobs. |
| **Job** | A single assignment owned by one anima from start to finish | **Dispatch boundary.** What gets assigned to an anima. |
| **Stroke** | An atomic, verifiable action within a job | **Progress boundary.** What gets tracked and checkpointed. |

The hierarchy defines **what operations occur at each level** — decomposition, planning, dispatch, tracking. It does not prescribe which roles perform those operations. The framework provides the levels and their semantics; guilds map their own roles onto those levels through standing orders and guild policy. The guild-starter-kit ships one such mapping (sages plan, artificers execute), but it is an example, not a requirement.

### Opus

The opus is aspirational. It is the patron's long-term vision — the full body of work that might span years and hundreds of commissions. It exists as a reference point for decision-making ("does this commission serve the opus?") but is not tracked as an operational entity in the Ledger. Think of it as the guild's understanding of what the patron is ultimately building — a north star, not a work order.

### Work

A work is a body of labor too large to plan directly into jobs. It requires an intermediate decomposition step — breaking it into pieces — before the pieces themselves can be planned. "Build me a notification system" is a work: you cannot produce a concrete list of jobs without first identifying the major components (the event pipeline, the delivery service, the notification UI) and planning each one independently.

The defining characteristic of a work is **decomposition need**. When the scope is too large to plan directly — when someone must first find the seams and identify independently-plannable chunks — that scope is a work. If it can be planned directly into jobs, it's a piece (or just a job).

Note that "work" (a level in the decomposition hierarchy) is related to but distinct from "works" (the guild metaphor's term for everything the guild delivers to the patron). The guild's works include everything that crosses the threshold — bug fixes, features, whole systems. A "work" in the hierarchy is specifically about labor that requires decomposition. A bug fix is part of the guild's works but is probably just a job, not a work.

### Piece

A piece is an independently-plannable chunk of a work — large enough to require its own planning pass, coherent enough to reason about on its own. "The event pipeline," "the delivery service," "the notification UI" are pieces of a notification system work.

Pieces are where parallelism enters the hierarchy. Multiple pieces of the same work can be planned and executed independently. Planning a piece produces the jobs that executing animas will carry out.

A piece contains one or more jobs. If a piece turns out to need only one job, that's fine — the piece and job are just the same scope viewed at different levels (planning vs. dispatch). If a piece turns out to be too large, it gets split into smaller pieces. This implies the tracking system needs to represent relationships between work items — a piece that splits creates children, and the original piece's status reflects that it was decomposed rather than completed directly. The specifics of how the Ledger represents these relationships is an implementation question, but the hierarchy must support re-scoping as a first-class operation.

### Job

A job is a single assignment — one anima, one continuous effort, one clear deliverable. "Implement the webhook retry queue with tests." "Write the delivery adapter for the email provider." A job is what gets dispatched — handed to an anima, tracked through a lifecycle, completed or failed.

Jobs are the system's fundamental unit of dispatch. They are planned, dispatched by the clockworks, and executed by an assigned anima. A job is owned by one anima from start to finish, though the underlying execution may span multiple sessions — staged sessions allow an anima to exit and be re-summoned with a fresh context window while maintaining continuity of effort on the same job. The job is the unit of *responsibility*, not the unit of *session time*.

### Stroke

A stroke is an atomic, verifiable action within a job. One cut of the chisel. One test written. One function implemented. Strokes are the smallest unit the system tracks — and the level where moment-to-moment progress becomes visible.

Strokes serve multiple purposes:

- **Progress tracking.** A job with 7 strokes, 4 complete, tells the system (and the patron) exactly how far along the work is. Without strokes, job status is binary: in progress or done.
- **Context bridging.** In staged sessions, the stroke record is the primary mechanism for bridging context between sessions. Instead of relying on the anima to write good freeform notes, the system has a structured checklist: which strokes are complete, which are pending, which is in progress. The next session gets a precise map of where things stand.
- **Crash recovery.** If a session dies mid-job, the stroke record shows exactly what completed. The next session picks up at the right point without forensic examination of the worktree.
- **Reasoning discipline.** Recording strokes through a tool forces the executing anima to externalize its plan before executing. The agent commits to a structure rather than holding it in ephemeral chain-of-thought. This is a known technique for improving agent reliability — making the plan concrete and inspectable.
- **Capability tiering.** Well-specified strokes can potentially be dispatched to less capable (cheaper) models. "Add the exponential backoff calculation, matching this function signature, passing this test" is a task a smaller model can execute reliably. The stroke record provides the structured specification that makes this delegation possible.
- **Estimation data.** Over time, the system accumulates data on how many strokes typical jobs require, which kinds of strokes take more tokens, and where agents struggle. This data enables better planning and cost estimation.

#### Recording Strokes

Strokes are recorded through a tool — the anima calls it to plan strokes at the beginning of a job and to mark them complete as work proceeds. The overhead is minimal: each tool call is a one-liner or short paragraph. Since the anima must plan its work anyway, routing that planning through a tool adds negligible cost while making the plan durable, inspectable, and recoverable.

Strokes may be discovered during execution — an anima might add new strokes as it uncovers work not anticipated in the initial plan. This is expected and encouraged; the stroke record is a living checklist, not a rigid contract.

## Commission vs. The Hierarchy

A commission is the patron's act of requesting work. It is not a level in the size hierarchy — it describes **origin**, not **scope**. A commission might produce a full work ("build me the notification system") or map to a single job ("fix this bug"). The guild receives the commission and determines where it falls in the hierarchy.

This separation is important because the decomposition hierarchy is reusable within the guild. An anima breaking a work into pieces might determine that one piece is complex enough to warrant its own work-level treatment. A piece that outgrows its scope doesn't need a new commission from the patron — it needs re-scoping within the guild's own planning.

## Scope Determination

When a commission arrives, the guild must triage it: is this a work that needs decomposition, a piece that can be planned directly into jobs, or a single job that can be dispatched immediately?

This is a judgment call, not a formula. The guild assesses the scope and makes its best determination. It may be wrong — a piece might balloon and need to be promoted to a work, or a commission that looked work-sized might collapse into a single piece with three jobs. The hierarchy supports re-scoping: pieces can be split, jobs can be re-planned, and scope can shift as understanding deepens.

The key insight is that scope determination is the **first operation on any incoming commission**. Before any planning happens, someone must answer: "What am I looking at, and how does it decompose?" The named hierarchy gives them a vocabulary for that answer — not just "it's big" or "it's small," but "this is a work (I need to find the pieces)" or "this is a piece (I can plan the jobs directly)."

How a guild implements this triage is a matter of guild policy. In the guild-starter-kit, the Master Sage reviews incoming commissions and makes the scope determination. Other guilds might use a dedicated triage role, an automated heuristic, or a different process entirely. The framework provides the hierarchy and the vocabulary; the guild decides who speaks it.

## The Four Boundaries

Each level of the operational hierarchy serves a distinct purpose — not just a different size, but a different operational function:

**Decomposition boundary (work).** What needs to be broken down before it can be planned? The work is the unit of decomposition. When scope is too large to plan directly, it must be decomposed into pieces. The work level is where the guild first gets its hands on a large ask and finds the seams.

**Planning boundary (piece).** What gets planned into concrete jobs? The piece is the unit of planning. Someone takes a piece and produces concrete jobs — each one specified clearly enough to hand off to an executing anima. Pieces are independently plannable and potentially parallelizable.

**Dispatch boundary (job).** What does an anima receive? The job is the unit of assignment. One anima, one continuous effort, one deliverable. The clockworks dispatches jobs; the ledger tracks their lifecycle; the assigned anima owns them from start to finish.

**Progress boundary (stroke).** What can the system observe in real time? The stroke is the unit of progress. Inside a job, strokes are where visibility happens — each one a verifiable step that moves the job forward. Strokes also provide the bridge between sessions (via staged sessions) and the data for operational learning.

The hierarchy is deliberately rigid — four named levels with distinct operational semantics, not an arbitrary tree with unnamed nodes. This rigidity is a feature: each level tells the system what to *do* with the item, not just where it sits in a containment graph. A work gets decomposed. A piece gets planned. A job gets dispatched. A stroke gets tracked. These are operational facts, not just size labels.

## Framework vs. Guild Policy

The decomposition hierarchy is a **framework-level structure**. The four levels, their operational semantics, and the ledger infrastructure that tracks them are part of Nexus itself — available to every guild.

**What the framework provides:**
- The four named levels and their definitions
- Ledger schema for tracking items at each level and their relationships
- Tools for recording and managing work items (including stroke tracking)
- Clockworks events for lifecycle transitions at each level

**What the guild decides:**
- Which roles perform decomposition, planning, dispatch, and execution
- How scope triage works for incoming commissions
- What standing orders wire the hierarchy levels to the guild's roles
- Whether all four levels are actively used (a simple guild might skip the work level entirely if commissions are always piece-sized)

This follows the same pattern as the rest of the framework: Nexus provides infrastructure and semantics; guilds provide policy and personnel. The clockworks doesn't know what a "sage" is — it knows that a `piece.ready` event has standing orders that should fire. Whether those standing orders summon a sage, an architect, a planner, or a general-purpose builder is the guild's business.

### Example: Guild-Starter-Kit Mapping

The guild-starter-kit ships a specific mapping as a starting point:

| Operation | Role | Mechanism |
|-----------|------|-----------|
| Scope triage | Master Sage | Consulted on incoming commissions |
| Work decomposition | Sage | Summoned to identify pieces |
| Piece planning | Sage | Summoned to produce jobs with acceptance criteria |
| Job execution | Artificer | Summoned to execute, plans own strokes |
| Stroke execution | Artificer (or cheaper model) | Executed within the job session |

Other guilds might collapse planning and execution into a single role, add a dedicated review step between planning and dispatch, or introduce specialized decomposition roles for different kinds of work. The hierarchy supports all of these — it constrains the *shape* of work, not the *organization* of the workforce.

## Capability Tiering

The hierarchy creates natural tiers for agent capability:

| Level | Cognitive Demand | Typical Model Tier |
|-------|-----------|-------------|
| **Work → pieces** | High — requires architectural understanding, scope analysis | Most capable (e.g., Opus) |
| **Piece → jobs** | Medium-high — requires planning, acceptance criteria | Capable (e.g., Sonnet) |
| **Job execution** | Medium — requires craft skill, judgment within scope | Capable (e.g., Sonnet) |
| **Stroke execution** | Low-medium — well-specified, bounded scope | Potentially less capable (e.g., Haiku) |

The planning roles handle the cognitive work of decomposition: understanding scope, identifying natural seams, planning for parallelism, and specifying jobs with clear acceptance criteria.

The executing roles handle craft: receiving a job, planning strokes, and either executing them directly or (in future) delegating individual strokes to cheaper, faster models when the stroke specification is precise enough.

This tiering is not required — a single capable model can handle all levels, and many guilds will start this way. But the hierarchy provides the structural foundation for tiering when it becomes worthwhile: strokes are the level where cheap models become viable, because the specification is precise enough and the scope is small enough to succeed without deep contextual understanding.

## Interaction with Staged Sessions

Staged sessions allow an anima to exit mid-job and be re-summoned in a fresh context window, in the same worktree, with continuity bridged between sessions. The stroke record strengthens this mechanism significantly.

Without strokes, context bridging relies on freeform notes written by the anima at the end of a session — when context pressure is highest and summarization quality is lowest. The quality of the handoff depends entirely on the agent's ability to write good notes under duress.

With strokes, the handoff is structural:

```
Job: Implement webhook retry queue
  Stroke 1: Add retry queue data structure        ✓ complete
  Stroke 2: Implement exponential backoff          ✓ complete
  Stroke 3: Write retry loop                       ✓ complete
  Stroke 4: Add max-retries-exceeded test          ← in progress (session ended)
  Stroke 5: Add successful-retry test              pending
  Stroke 6: Wire up to webhook dispatcher          pending
```

The next session receives this checklist alongside the original job specification. It knows exactly what's done, what was in progress, and what remains — without parsing a narrative or examining the worktree. Freeform notes may still accompany the stroke record for nuance ("discovered the API doesn't support batch operations"), but the structural backbone of the handoff is mechanical.

This also means the clockworks can make informed decisions about staging. Instead of relying solely on the presence of a stage notes file, the system can inspect the stroke record: are there pending strokes? How many stages has this job consumed? Is progress stalling? These become answerable questions when progress is tracked at the stroke level.
