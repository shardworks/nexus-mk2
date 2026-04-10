_Imported from `.scratch/todo/multi-rig-architectural-exploration.md` § "Rig Structure Generation" (2026-04-10)._

## Opened With

Under the current 1:1 model, rig construction is simple: static templates keyed by writ type. `mandate → draft | implement | review | revise | seal`. Rigid, but sufficient because every mandate takes the same shape.

Multi-rig multiplies the number of rig shapes needed on the same writ type:

- **Initial rigs** — standard template for fresh writs.
- **Recovery rigs** — just the failed step, or the failed step onward. Shape depends on *where* the previous rig failed.
- **Continuation rigs** — post-decomposition wrap-up. Review + seal only, with child outputs as context.
- **Revision rigs** — review + revise + seal, triggered by patron feedback.
- **Planning rigs** — Astrolabe-style; produce writ structure rather than artifacts.
- **Novel situations** — recovery from exotic failure modes, custom patron requests, ad-hoc interventions.

One template per writ type doesn't scale. Four approaches are on the table:

**A. Template library keyed by (writ type, intent).** Intents: `initial`, `recovery-seal`, `recovery-review-seal`, `continuation`, `revision`, `planning`. `spawnRig(writ, intent, context)` picks the template. Deterministic, debuggable, simple. Combinatorial as intents multiply.

**B. Fabricator-driven backward chaining.** Give Fabricator a goal ("produce a sealed commit given this starting state") and let it compute the engine chain from the capability catalog. Deterministic, scales with engine catalog growth. Backward chaining is a real research problem; requires a richer need/capability model than exists today.

**C. LLM-planned rigs (Astrolabe for execution).** An Astrolabe-style planner designs each rig. Maximally flexible; handles novel situations. Non-deterministic; latency before every rig; risk of broken rigs; expensive.

**D. Hybrid: base template + situational patches.** Start with a standard template, apply patches based on context. "Recovery = standard template with completed engines removed." Leverages existing templates; patches are local; mostly deterministic. Still requires humans to define patches.

## Summary

Parked, contingent on multi-rig landing. The favored direction is **A + D together**: a small template library keyed by (writ type, intent) covering the common cases, plus patch operations for situational variants. This covers 90%+ of expected rig shapes. LLM-planned rigs (C) remain a future escape hatch for genuinely novel situations; Fabricator backward-chaining (B) is worth keeping in mind but is a bigger commitment than needed for the initial multi-rig rollout.

**Key insight:** the **Fabricator** is the natural home for rig construction. Today it's a capability catalog ("what engines exist"). Tomorrow it could be a rig builder ("given writ + intent + context, produce an engine graph"). This keeps rig construction out of Spider (which just *runs* rigs) and in a dedicated apparatus.

**Open:**
- What's the minimum intent vocabulary? (`initial`, `recovery`, `continuation`, `revision`, `planning` — five feels right, but recovery may want sub-types by failure point.)
- How do patches compose? Additive ("add a step"), subtractive ("remove completed engines"), substitutional ("swap engine X for engine Y"), or all three?
- Does LLM-planned rigs need the same Fabricator interface as templated rigs, or is it a separate path that's only reached for explicit patron requests?
- How does the Fabricator know *which* intent applies? Spider inspects the writ's history and current state and asks ("given writ W currently in state S, produce a rig with intent I"). Who decides I? Probably Spider, with standing-order overrides.
- What does a template "look like" — a static data structure, a function, a mini-DSL? Current templates are mostly data; patches might push toward code.

## Notes

- The planning/execution boundary refinement says planning rigs are legitimate producers of writ structure. Rig template generation should treat planning rigs as first-class citizens of the template library, not as a special case.
- **Natural pattern:** planning rigs produce writ structure; execution rigs produce artifacts. The same machinery handles initial, recovery, continuation, and revision rigs uniformly if the template library is keyed by intent rather than writ type alone.