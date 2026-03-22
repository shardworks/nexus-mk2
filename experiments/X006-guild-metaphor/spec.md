---
status: active
---

# X006 — The Guild Metaphor

## Research Question

Does wrapping a multi-agent system in a coherent, evocative metaphor make it more effective — for the human operating it, for external audiences hearing about it, and for the agents working inside it?

## Hypotheses

### H1 — Human Connection

The patron (Sean) will connect with the system more deeply and enjoy working with it more when the system's components have evocative, memorable names drawn from a unified metaphor. Operating a "guild" with "artificers" and "sages" is more engaging than managing "agents" with "planning phases" and "implementation phases." This is not cosmetic — increased engagement leads to more thoughtful direction, more patience with iteration, and better outcomes.

### H2 — External Legibility

The guild metaphor will make it significantly easier to generate third-party interest when presenting or writing about the system. The metaphor provides narrative hooks: "the artificer undertakes a commission," "the sage advises before work begins," "golems handle the plumbing." These are immediately legible to audiences unfamiliar with multi-agent systems. Talks, articles, and demos built around the metaphor should land faster and stick longer than technical descriptions of the same architecture.

### H3 — Agent Focus

Agents will be easier to direct in a focused manner with fewer words when they understand their role within the guild metaphor. An artificer who knows their role — with a name, instructions, sage advice to follow, and a commission to complete — should require less operational instruction than a generic "autonomous agent" given a task description. The metaphor provides implicit constraints and expectations that reduce the need for explicit instruction.

## What We're Building

The guild system as described in [the guild metaphor doc](../../docs/guild-metaphor.md). The bootstrap builds the foundational infrastructure:

- **Register & Roster** — anima management (named AI identities with instructions, skills, and provenance), roster as the active filtered view
- **Commission management** — renaming the existing quest CLI to use commission vocabulary, extending it for guild-aware dispatch
- **Sage consultation pipeline** — Master Sage review before artificer dispatch, with sage advice on the commission record
- **Guild-aware commission dispatch** — dispatch consults the roster, selects animas by role, injects anima instructions

## How We'll Measure

### H1 — Human Connection
- **Qualitative:** Sean's self-reported engagement and satisfaction during sessions. Captured in session transcripts and Scribe summaries.
- **Comparative:** Does Sean spend more time in collaborative sessions? Does he initiate more commissions? Does he express more curiosity about internal outcomes?
- **Proxy:** Frequency of metaphor vocabulary in Sean's own language. If he starts saying "dispatch the artificer" instead of "run the agent" unprompted, the metaphor has taken hold.

### H2 — External Legibility
- **Test:** Write a short description of the system using guild vocabulary and one using technical vocabulary. Share both with 3-5 people unfamiliar with the project. Which generates more questions and interest?
- **Test:** Give a short talk or demo using the guild framing. Measure audience engagement (questions, follow-ups, expressed interest).
- **Proxy:** How quickly can a new reader understand what the system does from the guild metaphor doc alone?

### H3 — Agent Focus
- **Quantitative:** Compare token usage and turn count for commissions dispatched with guild-framed instructions (role, sage advice) vs. equivalent commissions dispatched with plain instructions.
- **Qualitative:** Review agent output for adherence to role expectations. Does an artificer who knows their role stay more focused than a generic agent?
- **Comparative:** Do animas with guild identity (name, role, instructions) produce higher-quality output than anonymous agents given the same commission?

## Depends On

- Guild metaphor doc (exists: `docs/guild-metaphor.md`)
- Commission CLI (exists as quest CLI: working `nexus q` commands — rename pending)
- Sage consultation pipeline commission (exists as draft: `commissions/draft/sage-trials.md`)

## Risks

- **Over-engineering the metaphor:** The metaphor should serve the system, not the other way around. If we find ourselves building features because the metaphor demands them rather than because the system needs them, we've gone wrong.
- **Metaphor collapse:** Some concepts may not survive contact with implementation. If a concept doesn't map cleanly to how the system actually works, forcing the metaphor will create confusion rather than clarity.
- **Novelty effect on H1:** Early engagement might be driven by the novelty of the metaphor rather than its inherent value. Need to observe whether engagement persists past the initial excitement.
