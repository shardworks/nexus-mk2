---
status: draft
---

# X009 — Metaphor as Implicit Instruction

## Research Question

When you tell an agent "you are an artificer in a guild," does the metaphor carry actual behavioral weight? Does it change how the agent works — not just how it talks? Or is it decorative: the agent politely adopts the vocabulary but does exactly what it would have done with plain instructions?

## Background

Nexus Mk 2.1 wraps its agent system in a guild metaphor. Agents are "animas" with roles like "artificer" and "sage." They receive "commissions" and work in "workshops." They follow a "codex" and are composed from "curricula" and "temperaments."

X006 studies whether this metaphor makes the system more engaging for the *human*. X009 asks the complementary question: does the metaphor make the *agents* more effective?

This matters beyond our specific system. Every team building with LLMs makes framing choices: role names, vocabulary, narrative context. Most treat these as cosmetic. If metaphor is actually load-bearing — if it carries implicit behavioral constraints that plain instructions don't — that changes how the entire field should think about prompt design.

## Hypotheses

### H1 — Role Framing Reduces Scope Drift

An agent framed as "an artificer whose job is to build what the commission specifies" will make fewer unrequested changes than an equivalent agent given the same task without role framing. The role creates an implicit boundary: artificers *build what's asked*. They don't redesign the architecture, refactor adjacent code, or add features not in the spec.

Scope drift is one of the most common failure modes in autonomous agents. They "improve" things nobody asked them to improve, touch files outside their task scope, and add unrequested features. If role framing measurably reduces this, that's a concrete, practical finding.

**If true:** Every agent system should invest in role design, not just task description. The role is doing real behavioral work.

**If false:** Role framing is decoration. Invest those tokens in explicit constraints instead.

### H2 — Coherent Metaphor Outperforms Equivalent Plain Instructions

A unified metaphorical frame (guild/artificer/commission/workshop) produces better task adherence than the same behavioral constraints expressed as plain technical instructions. The metaphor carries *implicit* instruction that you'd have to spell out explicitly otherwise.

An "artificer" carries associations: craft, focus, building to spec, pride in workmanship, deference to the patron's commission. A "coding agent" carries... nothing beyond the literal. To get the same behavioral constraints from plain instructions, you'd need to explicitly state: "focus only on the specified task," "take pride in code quality," "defer to the task specification," "do not exceed your scope." The metaphor compresses all of this into a single word.

**If true:** Metaphor is an instruction compression format. System designers should invest in metaphor selection and coherence — the choice of metaphor is a design decision with real consequences, not a style choice.

**If false:** Plain instructions are more reliable. The tokens spent on metaphorical framing would be better spent on explicit behavioral rules. Skip the narrative and write clear specs.

### H3 — Vocabulary Shapes Behavioral Patterns

Agents given guild vocabulary (commission, workshop, codex, works) interact with tools and structure their work differently than agents given technical vocabulary (task, repository, config, output) — even when the underlying meaning is identical. The words themselves change behavior.

"Complete this commission and deliver works to the patron" vs. "finish this task and push the output." Same instruction, different words. If the agent's actual behavior changes — different commit patterns, different file organization, different self-narration in logs, different error-handling approaches — vocabulary is an active ingredient, not just labeling.

**If true:** Vocabulary selection is a design decision with behavioral consequences. The Sapir-Whorf hypothesis, but for AI.

**If false:** Use whatever words are clearest and stop agonizing over naming. Models see through vocabulary to underlying meaning.

## Procedure

### Controlled Commission Comparison

Run identical commissions with three instruction variants:

1. **Guild-framed:** Full metaphor. "You are an artificer in the guild. You have been commissioned to build X. Your workshop is Y. Follow the codex. Deliver your works when complete."
2. **Plain-equivalent:** Same behavioral constraints, no metaphor. "You are a coding agent. Your task is to build X. Your repository is Y. Follow these rules: [explicit list of everything the metaphor implies]. Push your output when complete."
3. **Minimal:** Just the task. "Build X in repository Y."

Each variant runs against the same task, same model, same repository state. At least 3 runs per variant to account for natural variance.

### Measurement

**Quantitative:**
- Scope drift: files touched outside task scope, unrequested changes made
- Task adherence: did the output match the spec? What was added, what was missed?
- Token usage and turn count
- Time to first productive action (vs. time spent orienting)

**Qualitative:**
- Agent self-narration: how does it describe its own work? Does vocabulary bleed into reasoning?
- Decision patterns: when the agent faces an ambiguous choice, does framing influence which way it goes?
- Error recovery: does the agent handle failures differently under different framings?

### Task Selection

The reference task needs to be:
- Complex enough to have meaningful variance in outcomes
- Clear enough that "scope drift" is measurable (unambiguous boundaries)
- Cheap enough to run 9+ times (3 variants × 3 runs minimum)
- Representative of real commission work

Candidate: a well-scoped feature addition to an existing codebase with clear boundaries and adjacent code that an agent *could* but *shouldn't* modify.

## Depends On

- Commission dispatch infrastructure (to run controlled comparisons)
- X007 results (first real commission — establishes baseline before we start varying instructions)
- A suitable reference task

## Risks

- **Confounding instruction length:** The guild-framed variant and plain-equivalent variant may differ in token count, which itself affects behavior. Need to control for instruction length.
- **Cherry-picking the metaphor:** We designed the guild metaphor to be evocative. A poorly-chosen metaphor might perform worse than plain instructions. Our results may not generalize beyond well-crafted metaphors.
- **Model sensitivity:** Results may vary dramatically across models. A finding that holds for Claude may not hold for other LLMs. Should note model version in all results.
- **Small sample:** 3 runs per variant is enough to spot strong effects but not subtle ones. This is exploratory, not statistically rigorous — and we should say so.
