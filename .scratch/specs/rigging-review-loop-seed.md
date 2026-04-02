# Rigging Review Loop — Seed Spec

> **This is a seed spec, not a full commission.** The goal is to dispatch a sage-type anima to expand this into a complete design spec for the review loop system, suitable for implementation commissioning.

## Research Question

Can an automated review-and-revision loop within the rig execution pipeline reduce the rate of partial/wrong commission outcomes — without requiring the full Clockworks event system?

## Problem Statement

Commission outcomes in the current system depend entirely on first-try quality. When an anima produces incomplete or incorrect work, the patron must:

1. Notice the problem (manual review)
2. Assess the failure mode (spec ambiguity? execution error? complexity overrun?)
3. Write a fixup spec
4. Dispatch a new commission

This outer loop is slow, expensive, and blocks on the patron. Evidence from X013 (commission-log.yaml) shows ~40% of commissions required revision or were abandoned — a significant waste of patron attention.

**The review loop moves quality assurance inside the rig**, so bad work is caught and revised before it reaches the patron's desk.

## Design Constraints

1. **No Clockworks dependency.** The review loop must work within the existing dispatch pipeline. Clockworks is a future system; the review loop should not wait for it.
2. **Use existing infrastructure.** The Dispatch apparatus, Animator, Loom, and Stacks are all available. The review loop should compose from these, not require new foundational apparatus.
3. **Bounded iteration.** The loop must have a hard cap on revision attempts (e.g., max 2 retries) with automatic escalation to patron on exhaustion.
4. **Observable.** Each review pass and revision attempt must produce artifacts the Laboratory can capture — the review loop is itself experiment data.
5. **Incremental.** The first implementation can be minimal — even a single "did the tests pass?" check with retry would be valuable. The design should allow richer review criteria later.

## Existing Design Context

The spec author should read these documents to understand the architectural landscape:

- **Rigging architecture:** `/workspace/nexus/docs/architecture/rigging.md` — the full Walker/Formulary/Executor/Manifester design. The review loop is a new concern within this system. Pay attention to how engines chain and how the Walker traverses rigs.
- **Origination engine design:** `/workspace/nexus-mk2/docs/future/origination-engine-architecture.md` — describes how commissions become rigs. The review loop sits *after* origination, in the execution phase.
- **Architecture overview:** `/workspace/nexus/docs/architecture/index.md` — how all pieces fit together. Especially the engine taxonomy (clockwork vs quick) and the session funnel.
- **Guild metaphor:** `/workspace/nexus/docs/guild-metaphor.md` — vocabulary and conceptual model. The spec should use guild terminology correctly.
- **Current dispatch flow:** `/workspace/nexus-mk2/bin/dispatch.sh` — how commissions are currently posted and dispatched. The review loop replaces the "dispatch once, hope for the best" model.
- **Known gaps:** `/workspace/nexus-mk2/docs/future/known-gaps.md` — current system limitations, especially "animas don't know to commit" and the MCP/tool integration status.
- **Commission log:** `/workspace/nexus-mk2/experiments/data/commission-log.yaml` — empirical evidence of commission outcomes. The failure_mode field shows what kinds of problems the review loop needs to catch.

## Key Design Questions to Address

1. **What reviews what?** Is the reviewer a separate anima session (a "reviewer" role)? A clockwork engine that runs tests and checks? An LLM-as-judge pass on the diff? Some combination? Consider cost, latency, and reliability trade-offs for each approach.

2. **Where does the loop live architecturally?** Options include:
   - A **review engine** grafted onto every rig after the implementation engine (Walker orchestrates the loop)
   - A **dispatch-level wrapper** that re-dispatches on failure (lives in dispatch.sh or Dispatch apparatus)
   - A **rig pattern** — the origination engine seeds rigs with implement→review→revise chains by default
   
   Evaluate each against the constraints above.

3. **What does "pass" mean?** Define concrete review criteria for the MVP:
   - Do tests pass? (mechanical, cheap)
   - Does the diff match the spec intent? (requires judgment, expensive)
   - Are there uncommitted changes? (mechanical, catches a known failure mode)
   - Does the build succeed? (mechanical, cheap)

4. **What does a revision look like?** When review fails, what context does the revising anima receive? The original spec? The review feedback? The diff from the first attempt? The test output? How much context is too much?

5. **How does the Laboratory observe this?** What artifacts does each review/revision cycle produce? How do they map to the commission data directory structure?

6. **What's the escalation path?** When max retries are exhausted, how is the patron notified? What artifacts are preserved for patron review?

## Output Location

Write the full spec to: `/workspace/nexus/docs/architecture/apparatus/review-loop.md`

This lives alongside the existing rigging system doc (`rigging.md` in the parent directory) and the other apparatus specs in `apparatus/`. See `apparatus/_template.md` for the standard apparatus spec format — but note that the review loop may or may not be its own apparatus. It could be a rig pattern, an engine chain, or a dispatch-level concern. Use the template structure where it fits; deviate where the review loop's nature demands it. The key question of "where does this live architecturally" is one of the design questions to answer.

Existing apparatus specs in this folder (clerk.md, dispatch.md, animator.md, loom.md, etc.) are good examples of the expected depth and style. The parent-level `rigging.md` describes the Walker/Formulary/Executor system the review loop integrates with.

The spec should be a design document detailed enough that a subsequent session can extract concrete implementation commissions from it. Include:

- Architecture decision with rationale
- Data flow diagrams (ASCII is fine)
- Artifact schema (what gets written where)
- MVP scope vs. future enhancements
- Open questions the author couldn't resolve (flag these explicitly for patron review)
