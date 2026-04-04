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

**Early assessment (as of 2026-04-03):** Partially confirmed — but inverted. The tight loop did create a baseline, but what it created was not attachment. Instead, first autonomous dispatch made the *costs* of the loop visible: constant follow-up, never fully off the hook. The patron described autonomous delivery as a potential liberation, not a loss. However, the bootstrap period did leave a residue: a fear-based dispatch heuristic that keeps some work in the interactive channel longer than capability analysis would warrant. The unresolved question is whether this heuristic calibrates over time. See H4.

---

### H2 — Conversational Implementation Follows a Different Shape

Implementation through conversation naturally produces smaller, more incremental changes with tighter scope — while commission-based implementation produces larger, more self-contained chunks. These are structurally different work patterns, not just different speeds.

Coco's recent work has been surgical: remove one concept, rename one term, fix one CI failure. These are natural conversational units — small enough to discuss, decide, and execute in one exchange. Would the same work look different as commissions? Would it be batched differently, scoped differently, produce different commit patterns?

**If true:** Commission design should account for granularity. Some work is naturally "conversational-sized" and may need a different dispatch pattern (micro-commissions? standing animas with ongoing mandates?) than feature-scale work.

**If false:** The work shape is determined by the task, not the interaction mode. Commissions and conversations produce similar outputs.

**Early assessment (as of 2026-04-03):** Confirmed — but the organizing principle is more nuanced than predicted. The granularity split is real and observable: Coco handles surgical/risky/architectural work; commissions handle self-contained feature work. However, the primary dividing line is *perceived risk to the working system*, not task size. The heuristic is fear-based and somatic ("an anxiety signal"), not a deliberate capability analysis. Coco's role has also evolved to include commission spec authorship and output review, meaning the "shape" question isn't just about what autonomous agents receive but about the full commissioning pipeline.

---

### H3 — Seeing the Work Changes the Judgment

When the patron watches implementation happen (interactive mode), they evaluate differently than when they only see the finished output (autonomous mode). Specifically: watching the process creates understanding of the agent's decisions and makes the patron more forgiving of imperfection — while judging only outputs makes the patron harsher and less calibrated.

The project philosophy says "the system will be known by its fruits." This assumes output-only evaluation is simpler and more honest. But maybe seeing the work actually produces *better* calibration — the patron understands tradeoffs and forgives reasonable compromises. If judging purely by outputs makes the patron systematically harsher, that affects how we design feedback and communication.

**If true:** Autonomous agents need to expose more reasoning — work journals, decision logs, progress summaries — not to give the patron control, but to give them calibration. Pure output boundaries may produce worse evaluation, not better.

**If false:** Clean output boundaries work as designed. The patron evaluates fairly without process visibility. "Known by its fruits" holds.

**Early assessment (as of 2026-04-03):** Partially confirmed — but the data revealed a more important finding. The tight loop doesn't actually provide code-level visibility ("I was only reviewing a fraction of the code"). And pure output evaluation does produce shallower reads — structural debt was missed when only the functional output was judged. However, neither pole (watching the work / judging only outputs) is the right answer. A structured post-hoc review layer (automated scoring + interpretive agent review) provides better calibration than either extreme.

This review layer is a transitional state, not the target. The goal is criteria internalized in the system — quality standards baked into agent curricula, pipelines, and guild codex — combined with self-auditing that surfaces only the critical subset of commissions for periodic human attention. Per-commission review by Coco or the patron, even with structural support, is overhead on the path to that target. See H5.

---

### H4 — The Calibration Curve

*Added 2026-04-03 based on H1 data.*

Dispatch confidence follows a learning curve rather than a step function. The fear-based heuristic that emerged from the bootstrap period updates incrementally with successful commissions — but the mechanism of that updating is itself an open question with meaningfully different implications:

**Category-specific updating:** Anxiety is partitioned by task type. Successes in framework changes reduce anxiety for framework changes; successes in refactors reduce anxiety for refactors. Each category needs its own evidence base before the heuristic loosens for that category. If this is the mechanism, breadth matters: the most useful investment is a success record across the major risk categories, not just volume in familiar territory.

**Global updating:** Anxiety is a universal setting, not partitioned. Any successful commission — regardless of category — contributes to an overall confidence level that lowers the anxiety floor across all categories. If this is the mechanism, volume matters more than breadth: accumulating wins in any area (including easy, familiar ones) loosens the heuristic everywhere.

**Neither:** The heuristic doesn't update meaningfully with evidence. Fear-based avoidance persists even after repeated successful autonomous work. In that case, the organizing principle is temperament or structural distrust, not calibration — and the path to change is architectural (better failure recovery, lower blast radius) rather than experiential.

*What to watch for:* After a run of successes in one category, does the patron's dispatch confidence shift for that category specifically, for adjacent categories, or broadly? Does he start commissioning work he would previously have held back — and is the released work similar to what succeeded, or different?

---

### H5 — The Criteria-Internalization Path

*Added 2026-04-03 based on H3 data and patron target-state clarification.*

The current per-commission review pattern (patron + Coco reviewing each output, aided by quality scoring infrastructure) is a transitional state. The target is: quality criteria baked into the system (agent curricula, codex standards, pipeline checks), with self-auditing that surfaces only the critical minority of commissions for periodic human attention. That endpoint eliminates per-commission review without eliminating quality assurance.

**If true:** The system is capable of internalizing the criteria currently applied by the patron and Coco in review, and self-auditing can reliably identify the cases worth human attention. Per-commission review declines naturally as criteria propagate into the pipeline. The transition has a clear trajectory.

**If false:** Per-commission review (by patron, Coco, or structural tooling) remains necessary because criteria cannot be fully internalized or because self-auditing produces too many false negatives. The review layer becomes permanent overhead rather than a transitional scaffold.

*Target state articulated by patron:* "The work is generally trusted without review because the criteria Coco and I use are built into the system. Self-auditing identifies a small set of commissions or issues which are critical enough to surface for periodic manual review."

---

### H6 — The Mountain-to-Spec Path

*Added 2026-04-03 based on patron target-state clarification.*

The patron's involvement in the input side of the commission pipeline should converge toward direction and preference, not detailed requirement work. The target: the patron points at a mountain (brief statement of goal or direction), and the system generates an adequate commission spec. Patron involvement is reserved for genuinely unknown requirements and choices that are purely preference-based — things only the patron can resolve.

Currently, spec authorship is a significant iterative process: patron and Coco co-develop specs through conversation, often with multiple rounds of refinement. This is both a quality mechanism (Coco surfaces implications and gaps) and a cost center (patron time, conversational turns).

**If true:** As the guild builds domain knowledge (in codex, curricula, and established patterns), spec generation from mountain-level direction becomes adequate for a growing proportion of commissions. Patron involvement at spec time converges toward exception handling rather than full authorship.

**If false:** Spec quality remains dependent on patron participation in detail work. Mountain-level direction produces specs with too many gaps to dispatch reliably, and the iterative co-authorship pattern is permanent rather than transitional.

*Target state articulated by patron:* "Pointing out mountains" — only key/critical unknowns, genuine open questions, or purely preference-based decisions should require patron involvement at spec time.

---

## Data Collection

### Primary: Ethnographer Interviews

The ethnographer should probe this theme during regular interviews. Specific prompts:

- "You've been doing implementation work through Coco. What's that like compared to how you imagined autonomous agents would work?"
- "When you directed Coco to do the rename — did you think about posting it as a commission instead? Why or why not?"
- "What would you lose if Coco stopped doing implementation tomorrow?"
- *After autonomous agents are running:* "How does getting back a finished commission compare to working through it with Coco?"
- *After autonomous agents are running:* "Are you harsher or more forgiving when you can't see the work happening?"
- *For H4:* "Is there a category of work that used to trigger the anxiety signal that now feels routine to dispatch?"
- *For H5:* "As the commission volume grows, is the review load getting heavier or is the infrastructure absorbing it? What would it take for per-commission review to feel unnecessary?"
- *For H6:* "Walk me through how you wrote the last commission spec. How much of it was direction vs. detail work? What parts could the system have filled in without you?"

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
- *For H4:* Which task categories have crossed from "anxiety signal" to "routine dispatch"?
- *For H5:* Is per-commission review declining as criteria propagate into the pipeline? Is self-auditing surfacing the right set of cases?
- *For H6:* Is the patron's spec authorship time declining? Are mountain-level inputs producing adequate specs without iteration?

## Closing Condition

X008 reaches its natural end when the transition has stabilized — specifically, when three conditions are met:

1. **Dispatch heuristic has updated:** The patron can describe dispatch decisions in terms of task characteristics rather than anxiety signals. Fear-based avoidance is no longer the primary organizing principle.

2. **Review trajectory is clear:** Either (a) per-commission review has been substantially displaced by system-native criteria and self-auditing, with human attention reserved for the critical minority — or (b) it has become clear that per-commission review is structurally permanent and the criteria-internalization path is blocked.

3. **Input trajectory is clear:** Either (a) mountain-level direction is producing adequate specs for a substantial proportion of commissions without iterative patron involvement — or (b) spec co-authorship has stabilized as a permanent pattern and the mountain-to-spec path is not viable without further architectural investment.

## Depends On

- X006 (ethnographer infrastructure — already active)
- Autonomous agent dispatch (to create the transition point)

## Risks

- **Novelty confound:** The transition to autonomous agents coincides with the system being new. Discomfort might be about unfamiliarity with the commission system, not about losing the tight loop.
- **Sample size of one:** This is a case study of one patron. The findings are suggestive, not generalizable — but that's fine for the published narrative.
- **Observer effect:** Knowing this is being studied might make Sean more self-aware about the transition, which could dampen the effect or amplify it.

## Future Work

- **Task category instrument (H4).** H4 needs task categories to distinguish category-specific from global calibration updating. Neither the commission log nor the coco-log currently captures task type. A lightweight LLM instrument that classifies work by category from the commission spec (or commit message + diff for Coco work) would provide a unified taxonomy across both logs. Fully backfillable — every commission has a spec on file, every coco-log entry has commits. Design the taxonomy and instrument when H4 analysis is ready to begin; don't add a manual field to either log.

## Observations

### Session 2026-03-27 (second session)

**Mixed mode is now the natural operating state.** The session divided cleanly between two modes without deliberation: Coco handled fast collaborative work (training file syncs, role edits, version bumps, standing order config, commission drafting) while autonomous animas handled spec'd implementation (pipeline rewrites, new tool features). Neither mode felt like a substitute for the other — they were filling genuinely different roles.

**Coco as commission author — a new pattern.** A distinct new role emerged: Coco drafts the commission spec as part of the design conversation, then Sean dispatches it. Coco is now the interface between the conversation and the queue. This means Coco is doing patron-adjacent work (specifying what should be built) rather than implementation work. Relevant to H2: the granularity question isn't just "how big is the task" but "who is the right agent for this kind of reasoning?"

**H1 signal — the tight loop may be self-loosening.** *"You're too helpful... I already dispatched it as written."* Sean dispatched a commission before Coco finished annotating it with additional detail. This suggests Sean is gaining confidence in posting incomplete specs to autonomous agents and trusting them to fill the details — which is exactly the transition away from the tight loop. The mountain-spec pattern (patron points at direction, agent fills details) may be emerging as a natural handoff mechanism.

**H3 signal — Coco as process visibility layer.** Sean asked Coco to review the artificer's recent commits. This is a middle path between full process visibility and pure output evaluation: the patron isn't watching work happen in real time, but uses the interactive agent to evaluate finished outputs with context. Neither pure tight-loop nor pure black-box. Worth tracking whether this becomes a stable pattern or whether Sean shifts toward trusting output without the review step.

**H2 signal — granularity split is self-organizing.** No deliberation occurred about which mode to use for which task. Small surgical changes (role terminology, config edits) flowed naturally to Coco. Larger features with spec-level complexity (workshop-prepare idempotency, update-writ actions, sortable table) flowed to commissions. This is consistent with H2: work shape is structurally different, not just faster or slower.

### Sessions 2026-04-02 – 2026-04-03

**H3 / H5 — the review layer and its limits.** The scorer + Coco review pattern has proven its value: architectural debt in Walker Increment 3 (hardcoded `engine.id === 'review'` branch) was surfaced by the scorer and Coco that Sean says he probably wouldn't have caught manually. However, Sean has clarified the target state: not structured per-commission review as the endpoint, but criteria baked into agent curricula and pipelines, with self-auditing surfacing only the critical minority. Per-commission review is overhead on the path to that target.

**H1 — freedom signal confirmed.** Sean described the anticipated transition from Coco-as-implementer as a "clean shift" to "dispatch, collect experiment data via pipeline, and have Coco review+suggest followups" — framed as forward progress, not loss.

**H4 — fear-based heuristic still operating.** High-risk architectural work (engine collect callback, 11 files, 230 lines) continued to route through Coco as of April 3. The heuristic is intact; calibration against the new commission history has not yet visibly shifted it.

**H6 — input side still iterative.** Spec authorship remains a patron + Coco collaborative process as of April 3. Coco drafts specs from design conversations, Sean reviews and dispatches. Mountain-level inputs do not yet reliably produce dispatch-ready specs without iteration. The target state (patron direction + system-generated spec, patron review limited to unknowns and preferences) is articulated but not yet tested.
