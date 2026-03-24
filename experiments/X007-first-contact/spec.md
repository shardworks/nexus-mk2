---
status: draft
---

# X007 — First Contact

## Research Question

What happens the first time an autonomous agent is dispatched through the guild machinery? What breaks, what's missing, what's confusing — and what works better than expected?

## Background

The guild infrastructure — manifest engine, roles, tools, preconditions, codex, curricula — has been built piece by piece across multiple sessions. Each piece has unit tests, but the system has never been exercised end-to-end with a real autonomous agent receiving a real commission. First Contact is the observation framework for that moment.

This isn't an experiment with controlled variables. It's structured observation of a one-time event: the first real commission dispatch. The findings shape every subsequent experiment (X008's transition point, X009's baseline) and every future commission template.

## Hypotheses

### H1 — The Manifest Gap

The manifested agent context (role instructions, codex, tool descriptions, commission spec) will have significant gaps that only become visible when a real agent tries to use them. Unit-tested components that work in isolation will fail to compose — missing cross-references, assumed knowledge that isn't provided, tools that don't explain themselves well enough, role instructions that are too abstract to act on.

**If true:** We need a "manifest review" step — perhaps a dry-run mode that lets a human (or Coco) audit the full manifested context before dispatch. The manifest is a document; it should be reviewable.

**If false:** The component-level testing was sufficient. The system composes cleanly and the first agent orients quickly.

### H2 — Orientation Cost Dominates

The agent will spend the majority of its tokens and turns orienting — reading the codex, understanding its tools, exploring the workshop — before doing any productive work. The ratio of orientation to implementation will be surprisingly high, even with good instructions.

**If true:** Orientation is the primary cost center for autonomous agents. Future investment should focus on reducing orientation time: better tool instructions, more prescriptive commission specs, worked examples, or "orientation engines" that pre-digest the workspace.

**If false:** The guild's instruction delivery (codex + role + tools + commission) gives the agent a fast enough on-ramp. Orientation is a small fraction of total work.

### H3 — The Commission Spec Is the Bottleneck

The quality of the commission spec will matter more than the quality of the guild infrastructure. A well-written commission with mediocre tooling will outperform a vague commission with excellent tooling. The patron's ability to express intent clearly is the binding constraint.

**If true:** Invest in commission templates, sage consultation, and patron-side tooling (commission drafting assistants, spec validators). The guild machinery is a commodity; the commission is the art.

**If false:** Good infrastructure compensates for imprecise commissions. Invest in smarter manifest engines, better codex content, and richer tool descriptions.

## What to Observe

### Before Dispatch
- Capture the full manifested context: every instruction, tool description, codex entry, and commission spec that the agent receives. Save as an artifact.
- Note what the patron (Sean) expects to happen. What does he think will be easy? What does he think will be hard?

### During Dispatch
- If observable: how many turns before productive work begins?
- Does the agent use its tools correctly on first attempt?
- Does the agent ask clarifying questions or just forge ahead?
- Does it stay within its commission scope or drift?
- Where does it get stuck? What unsticks it?

### After Dispatch
- Did the output match the commission spec?
- What was the token cost and turn count?
- What would the patron change about the commission, the instructions, or the tooling?
- What surprised the patron — positively or negatively?

## Data Collection

### Artifacts to Save

All artifacts go to `experiments/X007-first-contact/artifacts/`:

- `manifested-context.md` — the full instruction set the agent received
- `commission-spec.md` — the commission as written
- `patron-expectations.md` — Sean's pre-dispatch predictions (written before seeing results)
- `observation-notes.md` — structured observations from during/after the dispatch
- `post-mortem.md` — what worked, what didn't, what to change

### Ethnographer Integration

The ethnographer should conduct an interview specifically about the first dispatch experience. This is a landmark event for X006 (how does it feel to hand off work to the guild for the first time?) and for X008 (how does it compare to working through Coco?).

## Procedure

1. **Select a commission.** Should be meaningful but bounded — something worth doing, not a toy problem, but not so large that failure is expensive. Ideally something Coco has done interactively, so there's a direct comparison point.
2. **Capture pre-dispatch state.** Sean writes brief expectations. Coco snapshots the manifested context.
3. **Dispatch.** Run the commission through the guild machinery.
4. **Observe.** Capture telemetry and qualitative notes.
5. **Debrief.** Sean and Coco review the output and the process. Ethnographer interviews Sean.
6. **Write post-mortem.** What to change before the next commission.

## Depends On

- Guild dispatch infrastructure (manifest engine, commission dispatch, workshop setup)
- At least one commission ready to dispatch
- Ethnographer (for the interview component)

## Risks

- **First-attempt bias:** The first dispatch is inherently unusual — the patron is more attentive, more forgiving, more excited than they will be on commission #50. The observations may not generalize to routine operation.
- **Debugging confound:** If the dispatch fails for infrastructure reasons (bugs in the manifest engine, broken tool delivery), the experiment becomes a debugging session rather than a behavioral observation. That's still useful data, but it's different data.
- **Moving the goalposts:** The temptation will be to fix things mid-dispatch. Resist this — observe the full experience first, then fix. Fix-during-dispatch destroys the data.
