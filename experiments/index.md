# Experiments Index

Maintained by Coco. Update when experiments are created, activated, or closed.

## Active

| # | Name | Research Question |
|---|---|---|
| [X006](X006-guild-metaphor/spec.md) | The Guild Metaphor | Does the guild metaphor improve agent performance and patron experience compared to plain instructions? |
| [X008](X008-patrons-hands/spec.md) | The Patron's Hands | How does the bootstrap period (Coco doing implementation) shape patron expectations when autonomous agents come online? |
| [X010](X010-staged-sessions/spec.md) | Staged Sessions | What is the relationship between session length, cost, and output quality for autonomous commissions? Phase 1 (cost curve) complete at original scale; Apr 29 addendum sharpens H4 into H4a/H4b/H4c sub-hypotheses (cost model + handoff thresholds) and adds H5 (inventory pure-read bloat). |
| [X011](X011-context-debt/spec.md) | Context Debt | How much context window is consumed by tool output never referenced again, and can we reduce it? Activated 2026-04-29 with the read-utilization instrument as its first artifact. |
| [X016](X016-orientation-suppression/spec.md) | Orientation Suppression | When a fresh implementer session enters mid-flow, how many turns elapse before it produces productive work? Does an imperative anti-orientation directive in the brief reduce that turn count to <5? Phase 2c completed 2026-05-02 (N=1 baseline vs N=1 strong-prompt). H1 falsified at the original <5 threshold — the orientation floor for cascade-shaped work is ~17 calls. Strong-prompt suppressed redundant orientation cleanly (43→18 first-edit turns, −58%) but did not shorten the session overall. Open derivative question: re-run X010 H1 piece-sessions with strong-prompt enabled (click `c-moo9o9q3` under idea #15). |
| [X015](X015-spec-detail-model-substitute/spec.md) | Spec Detail as Model Substitute | Can planning-pipeline specs reduce the model capability threshold, enabling Sonnet-class models to match Opus outcomes? Activated 2026-05-02 with trial 1 — Sonnet implementer + Opus reviewer rerunning the Clerk refactor commission (writ w-mod6458g, $45.55 / 440 turns / 4 implement attempts under all-Opus). Per-role model override (framework 0.1.294, AnimaWeave.model) is the load-bearing dependency. |

## Ready (approved, not yet started)

| # | Name | Research Question |
|---|---|---|
| [X003](X003-commission-prompt-tuning/spec.md) | Commission Prompt Tuning | How do pre-commission instructions affect agent performance on identical tasks? |
| [X004](X004-iteration-context/spec.md) | Iteration Context | How does context about prior sessions affect quality and safety when an agent iterates on its own work? |
| [X009](X009-metaphor-as-instruction/spec.md) | Metaphor as Implicit Instruction | Does the guild metaphor carry actual behavioral weight, or is it decorative? |

## Draft (not yet approved)

| # | Name | Research Question |
|---|---|---|
| [X005](X005-greenfield-assembly/spec.md) | Greenfield Assembly | What if agents never iterate on existing code — only build net-new? |
| [X012](X012-agent-oriented-code/spec.md) | Agent-Oriented Code | Do conventional clean code principles still apply when agents are the primary authors? |
| [X014](X014-technical-spec-quality/spec.md) | Technical Spec Quality | Do technically detailed specs outperform mountain-quality specs — and does it depend on complexity? |
| [X017](X017-test-redundancy/spec.md) | Test Redundancy in Agent-Written Code | What fraction of agent-written test code is structurally redundant, and what fraction survives human spot-check as deletable? Probe data from framework/core (74%) and framework/arbor (80%) suggests substantial redundancy but unmeasured human survival rate. |

## Complete

| # | Name | Outcome |
|---|---|---|
| [X001](X001-fruit-delivery/spec.md) | Fruit Delivery | Complete |
| [X007](X007-first-contact/spec.md) | First Contact | Complete — H1 (manifest gap) confirmed |

## Superseded

| # | Name | Reason |
|---|---|---|
| [X002](X002-agent-session-launcher/spec.md) | Agent Session Launcher | Deliverable built as part of session refactor; experiment no longer needed |
| [X013](X013-commission-outcomes/spec.md) | Commission Outcomes | Spec generation became automated (Astrolabe pipeline), eliminating spec-quality variance; structured patron review (complexity, outcome, failure_mode, reviewed_at) was retired 2026-04-30. The four hypotheses depended on patron-set instrumentation that no longer exists. Historical dataset (150 patron-touched entries) preserved as a frozen baseline in the X013 and X008 artifacts dirs. |
