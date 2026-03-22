# Session Summary

## What we did

- **Major guild metaphor refactor** — renamed Hero→Artificer, Quest→Commission, retired Treasure/Storehouse, introduced Workshop (repos as guild space) and Works (guild output). (`78917d1`)
- **Resolved patron/guild boundary tension** — repos are guild workshops, not patron property. Patron commissions work and judges by output ("works"), never enters workshops. Aligns with philosophy precepts.
- **Renamed patron's space** — "workshop" → "sanctum" in `docs/philosophy.md` to avoid collision with guild workshops.
- **Split metaphor doc** — foundational concepts in `docs/guild-metaphor.md`, emerging/speculative concepts in `.scratch/guild-metaphor-draft.md`.
- **Housekeeping** — moved `last-session.md` from `.claude/` to `.scratch/`, removed `.scratch/` from `.gitignore`, updated coco agent and wrap-up skill references.

## Decisions made and/or deferred

- **Decided: Artificer** as the implementation role. Craft + magical resonance, no adventurer baggage.
- **Decided: Commission** as the unit of work. "Post a commission", "active commissions."
- **Decided: Works** as the guild's output noun. Plain, exact, doesn't try too hard.
- **Decided: Workshop** for guild repos, **Sanctum** for patron's repo.
- **Decided: No `.workshop` directory** — entire repo is guild space, no need for a carve-out.
- **Decided: Seal deferred** — git authorship is interim stand-in. Mechanics undefined.
- **Decided: "Fruit" stays in philosophy precepts only** — too weird for the guild metaphor vocabulary.
- **Deferred: Workshop/repo naming for nexus-mk2's own `workshop` repo** — potential ambiguity noted but not resolved.

## Next steps & open questions

- Other docs still use old terminology: `system-architecture.md`, `quest-cli.md`, `sage-trials.md`, `X006` spec. Decide whether to update or leave as historical.
- Bootstrap commission specs need updating with new vocabulary.
- Foundational metaphor is stable enough to start building against.

### Notable moments

- **"The code produced by the guild is now 'patron property' — that very much implies I _will_ be looking at it"** — Sean caught that the "patron holdings" framing contradicted the core philosophy of not inspecting implementation. This drove the entire workshop reframe. Notable because it shows how the metaphor actively shapes expectations about system behavior.

- **"I don't really wanna go in there unless there are weird smells"** — Sean's description of his relationship to guild workshops. Captures the discipline-not-access-control boundary perfectly. Notable for the published narrative: the patron *can* enter but chooses not to.

- **"The word 'fruit' is... really weird... outside of the vaguely Biblical line in our precepts"** — Led to choosing "works" instead. Notable because it shows Sean distinguishing between philosophical language (evocative, allowed to be strange) and operational vocabulary (needs to be natural and presentable).
