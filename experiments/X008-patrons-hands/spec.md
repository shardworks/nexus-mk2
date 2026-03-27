---
status: active
---

# X008 — The Patron's Hands

## Research Question

What happens when the interactive/collaborative agent (Coco) fills the role of autonomous agents because they don't exist yet — and how does this bootstrap period shape the patron's expectations, habits, and experience when autonomous agents eventually come online?

## Background

During the Nexus Mk 2.1 bootstrap, the autonomous agent workforce doesn't exist yet. The guild infrastructure (manifest engine, roles, tools, preconditions) is being built, but no animas have been dispatched on commissions. In this gap, the patron has been directing Coco — the interactive collaborator, explicitly scoped to NOT do implementation work — to do implementation work anyway. Coco has removed version slots (cross-cutting refactor, 24 files), renamed "implement" to "tool" across 57 files, and done various surgical fixes.

This is pragmatic and temporary. But it creates a specific experience: tight feedback loops, real-time visibility into work, immediate course correction, conversational cadence. This experience becomes the patron's baseline — the thing autonomous agents will be compared against.

## Hypotheses

### H1 — The Tight Loop Trap

Working through an interactive agent during the bootstrap phase creates expectations that make the transition to autonomous agents feel like a downgrade — even if the autonomous agents produce equivalent or better work.

The patron gets used to: seeing work happen in real time, steering mid-implementation, asking "what about X?" and getting an immediate adjustment. When autonomous agents take over, the patron posts a commission and... waits. Gets back a finished artifact. Can't steer. Can't see the process. Even if the output is good, the experience feels less engaging.

**If true:** Systems that bootstrap interactively need an explicit transition protocol — gradual handoff, intermediate checkpoints, or deliberate expectation-setting. The bootstrap period is a liability, not just a phase.

**If false:** The transition is natural and the tight loop doesn't create problematic attachment. The patron adapts to async delivery without friction.

### H2 — Conversational Implementation Follows a Different Shape

Implementation through conversation naturally produces smaller, more incremental changes with tighter scope — while commission-based implementation produces larger, more self-contained chunks. These are structurally different work patterns, not just different speeds.

Coco's recent work has been surgical: remove one concept, rename one term, fix one CI failure. These are natural conversational units — small enough to discuss, decide, and execute in one exchange. Would the same work look different as commissions? Would it be batched differently, scoped differently, produce different commit patterns?

**If true:** Commission design should account for granularity. Some work is naturally "conversational-sized" and may need a different dispatch pattern (micro-commissions? standing animas with ongoing mandates?) than feature-scale work.

**If false:** The work shape is determined by the task, not the interaction mode. Commissions and conversations produce similar outputs.

### H3 — Seeing the Work Changes the Judgment

When the patron watches implementation happen (interactive mode), they evaluate differently than when they only see the finished output (autonomous mode). Specifically: watching the process creates understanding of the agent's decisions and makes the patron more forgiving of imperfection — while judging only outputs makes the patron harsher and less calibrated.

The project philosophy says "the system will be known by its fruits." This assumes output-only evaluation is simpler and more honest. But maybe seeing the work actually produces *better* calibration — the patron understands tradeoffs and forgives reasonable compromises. If judging purely by outputs makes the patron systematically harsher, that affects how we design feedback and communication.

**If true:** Autonomous agents need to expose more reasoning — work journals, decision logs, progress summaries — not to give the patron control, but to give them calibration. Pure output boundaries may produce worse evaluation, not better.

**If false:** Clean output boundaries work as designed. The patron evaluates fairly without process visibility. "Known by its fruits" holds.

## Data Collection

### Primary: Ethnographer Interviews

The ethnographer should probe this theme during regular interviews. Specific prompts:

- "You've been doing implementation work through Coco. What's that like compared to how you imagined autonomous agents would work?"
- "When you directed Coco to do the rename — did you think about posting it as a commission instead? Why or why not?"
- "What would you lose if Coco stopped doing implementation tomorrow?"
- After autonomous agents are running: "How does getting back a finished commission compare to working through it with Coco?"
- "Are you harsher or more forgiving when you can't see the work happening?"

### Secondary: Session Note Analysis

Session notes already capture what Coco is being asked to do. Tag sessions where Coco does implementation work and track:

- Task type (refactor, feature, fix, rename)
- Scope (files touched, lines changed)
- Conversational turns before implementation started
- Whether the patron expressed satisfaction, frustration, or surprise

### Transition Observation

When autonomous agents come online, actively observe:

- Does the patron reach for Coco to do work that should go to an agent?
- Does the patron add more detail to commissions than necessary (trying to recreate the tight loop)?
- How long before async delivery feels normal?

## Depends On

- X006 (ethnographer infrastructure — already active)
- Autonomous agent dispatch (to create the transition point)

## Risks

- **Novelty confound:** The transition to autonomous agents coincides with the system being new. Discomfort might be about unfamiliarity with the commission system, not about losing the tight loop.
- **Sample size of one:** This is a case study of one patron. The findings are suggestive, not generalizable — but that's fine for the published narrative.
- **Observer effect:** Knowing this is being studied might make Sean more self-aware about the transition, which could dampen the effect or amplify it.

## Observations

### Session 2026-03-27 (second session)

**Mixed mode is now the natural operating state.** The session divided cleanly between two modes without deliberation: Coco handled fast collaborative work (training file syncs, role edits, version bumps, standing order config, commission drafting) while autonomous animas handled spec'd implementation (pipeline rewrites, new tool features). Neither mode felt like a substitute for the other — they were filling genuinely different roles.

**Coco as commission author — a new pattern.** A distinct new role emerged: Coco drafts the commission spec as part of the design conversation, then Sean dispatches it. Coco is now the interface between the conversation and the queue. This means Coco is doing patron-adjacent work (specifying what should be built) rather than implementation work. Relevant to H2: the granularity question isn't just "how big is the task" but "who is the right agent for this kind of reasoning?"

**H1 signal — the tight loop may be self-loosening.** *"You're too helpful... I already dispatched it as written."* Sean dispatched a commission before Coco finished annotating it with additional detail. This suggests Sean is gaining confidence in posting incomplete specs to autonomous agents and trusting them to fill the details — which is exactly the transition away from the tight loop. The mountain-spec pattern (patron points at direction, agent fills details) may be emerging as a natural handoff mechanism.

**H3 signal — Coco as process visibility layer.** Sean asked Coco to review the artificer's recent commits. This is a middle path between full process visibility and pure output evaluation: the patron isn't watching work happen in real time, but uses the interactive agent to evaluate finished outputs with context. Neither pure tight-loop nor pure black-box. Worth tracking whether this becomes a stable pattern or whether Sean shifts toward trusting output without the review step.

**H2 signal — granularity split is self-organizing.** No deliberation occurred about which mode to use for which task. Small surgical changes (role terminology, config edits) flowed naturally to Coco. Larger features with spec-level complexity (workshop-prepare idempotency, update-writ actions, sortable table) flowed to commissions. This is consistent with H2: work shape is structurally different, not just faster or slower.
