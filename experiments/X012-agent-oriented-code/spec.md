---
status: draft
---

# X012 — Agent-Oriented Code

## Research Question

When agents are the primary authors and maintainers of a codebase, do conventional "clean code" principles (DRY, shared abstractions, layered helpers) still apply — or do they actively hurt?

## Origin

Observed during review of nexus-core's work hierarchy modules (`commission.ts`, `work.ts`, `piece.ts`, `job.ts`, `stroke.ts`). These files are structurally identical — same CRUD pattern, same DB connection boilerplate, same audit log SQL copy-pasted across every mutation. A human reviewer's instinct is to refactor: extract a `withDb()` helper, a shared `auditLog()` function, maybe a generic entity CRUD factory.

But the duplication has properties that may be *advantageous* in an agent-maintained system:

- **Self-contained context.** Each file can be fully understood without tracing through abstractions. An agent working on `job.ts` doesn't need to load `db-helpers.ts` and `audit.ts` to understand what `createJob` does.
- **Low blast radius.** Changing how jobs are created doesn't risk breaking strokes. No shared code means no shared failure modes.
- **Parallel-safe.** Multiple agents can modify different entity files simultaneously without conflicting on shared infrastructure modules.
- **Mechanical updates.** An agent can reliably find-and-update all 5 copies of a pattern. The "I forgot to update one of the copies" failure mode is a human problem, not an agent problem.

## Hypothesis

Code that is "clean" by human standards (DRY, abstracted, layered) may be *harder* for agents to work with than duplicated, self-contained modules — because abstraction trades local complexity for distributed complexity, and agents pay a real cost for distributed complexity (more files in context, more indirection to trace, more conflict surface in multi-agent environments).

Conversely, some human-oriented principles probably still hold: consistent naming, clear types, separation of concerns at the module boundary. The question is which principles are universal and which are human-specific.

## Dimensions to Explore

- **DRY vs. duplication.** When does extracting a shared helper help agents vs. hurt them? Is there a complexity threshold — e.g., a 3-line boilerplate is fine duplicated, but a 30-line protocol should be shared?
- **Abstraction depth.** Do agents perform better with flat, explicit code or with layered abstractions? How many levels of indirection can an agent reliably trace?
- **File size and cohesion.** Do agents work better with many small files (one concern each) or fewer larger files (less context-switching)? Where's the sweet spot?
- **Types as documentation.** Shared types (like `CompletionCheck`) seem universally valuable even when implementation is duplicated. Is the rule "share types, duplicate behavior"?
- **Conflict surface.** In multi-agent systems, how much does shared code actually increase merge conflicts? Can we measure this?

## Open Questions

- Is this question even stable? As models improve, do they get better at tracing abstractions, shifting the balance toward DRY?
- Does the answer depend on the *kind* of agent work? Greenfield creation might favor different patterns than maintenance/debugging.
- How do we measure "agent effectiveness" here? Session cost? Error rate? Time to completion? Conflict frequency?
- What do existing agent-heavy codebases (Cursor-generated projects, Copilot-heavy repos) look like structurally? Is there an emerging empirical pattern?

## Depends On

- Multiple commissions' worth of agent work on the nexus-core codebase (to observe which patterns cause friction)
- X007 / X005 session data (for examples of agents navigating abstractions vs. self-contained code)
