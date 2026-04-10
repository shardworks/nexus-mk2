## Goal

Decide whether Nexus should treat explicit design contracts — structured artifacts that pin down spacing/typography/color/copy for UI work, naming/layout/error-handling for code work, vocabulary/register for writing work — as a first-class category of planning artifact, produced before execution and enforced during review. The outcome is (a) a clear articulation of the "contract" concept generalized beyond UI (GSD's framing is UI-specific but the principle isn't), (b) an inventory of the contract surfaces Nexus work touches (UI, code style, domain vocabulary, commit message style, commission-review rubrics), (c) a recommendation on which surfaces actually benefit from explicit contracts vs. which are better left implicit, and (d) a sketch of where contracts would live (a new writ type? a field on mandate writs? a companion doc in the codex?).

## Status

parked — idea captured, no immediate pressure to act

## Next Steps

Next session: (1) re-read GSD's UI-SPEC + 6-pillar review pattern and strip it down to the surface-agnostic principle; (2) walk through the consistency failures we've actually had in Nexus (drift between reviewers, inconsistent writ titles, naming churn in agent instructions, Oculus visual inconsistency) and ask "which of these would have been prevented by an explicit contract upfront?"; (3) identify 2-3 contract surfaces where the ROI is high enough to prototype — probably commission-review rubrics first (adjacent to X013) and commission writing style second; (4) decide whether this becomes a new writ type, a field on existing writs, or a codex-level convention file.

## Context

GSD's observation is that AI-generated frontends are visually inconsistent not because the model is bad at UI but because no design contract exists before execution. Five components built without a shared spacing scale or color token system produce five slightly different visual decisions. GSD's answer is `UI-SPEC.md` — a structured design contract pinned during plan-phase, validated against six dimensions (copywriting, visuals, color, typography, spacing, experience design), and enforced during post-execution review.

The principle generalizes: consistency failures across an LLM-authored corpus are artifacts of missing explicit contracts, not model limitations. Any dimension where five agents will produce five slightly different answers is a candidate for an explicit contract. Candidates in Nexus:

- **UI** (only relevant for Oculus today) — directly analogous to GSD's original use case
- **Code style and architectural conventions** — naming, file layout, error handling, test organization, import ordering. We currently rely on agents to infer these from the codebase, which works when the codebase is consistent and fails when it's not.
- **Domain vocabulary** — "guild," "anima," "rig," "writ," "mandate," "quest" — we have the guild metaphor doc but there's no enforcement layer. Agents occasionally invent synonyms or reach for generic terms.
- **Commission-review rubrics** — what makes a review "good"? Today this is implicit in the reviewer's prompt. X013 is converging on the idea that explicit scoring criteria reduce drift.
- **Commit message style, writ title shape, agent response register** — lower-stakes surfaces where drift is tolerable but contracts would still sharpen consistency.

The open design question: is a "contract" its own primitive (new writ type? new plugin?) or is it a pattern that different plugins implement differently? GSD uses one specific shape (`UI-SPEC.md`) because UI is one specific domain. In Nexus, a surface-agnostic "contract" primitive would need to accommodate very different shapes — a UI contract looks nothing like a code-style contract.

Most likely path forward: **start with one specific high-ROI contract surface and do it concretely before trying to generalize.** The X013 scoring criteria work is probably the right first target — it's already underway and would benefit from the explicit-contract framing immediately.

## References

- GSD user guide § UI Design Contract: `.scratch/gsd-research/USER-GUIDE.md:182-259`
- X013 experiment (instrument scoring): `experiments/X013/`
- Guild metaphor doc (implicit contract for domain vocabulary): `/workspace/nexus/docs/guild-metaphor.md`
- Adjacent quests: Assumptions mode (same "explicit contract" principle applied to conversations), Nyquist/verification contracts (same principle applied to work verification, already in flight via Astrolabe quests)
- Commission-review work: experiments/data/commission-log.yaml — the rubric drift data

## Notes

- 2026-04-10: opened after GSD research pass. Sean wanted this as its own quest. Worth noting: three of the quests from this session's GSD pass (assumptions mode, UI design contract, verification contracts) are instances of the same meta-principle — "pin explicit contracts upfront, don't rely on implicit shared understanding." Might be worth a fourth quest that just names the principle and cross-references the applications, or might be over-taxonomizing.