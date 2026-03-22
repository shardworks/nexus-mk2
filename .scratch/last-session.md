# Session Summary

## What we did

- **Designed the guild metaphor** — created `docs/guild-metaphor.md`, the organizing model for Nexus Mk 2.1. Iterated through multiple naming rounds for the core identity noun: soul → slate → anima. (`2400123`)
- **Created technical comparison doc** — `docs/system-architecture.md` describes the same system in plain jargon, as an X006 artifact.
- **Created experiment X006** — `experiments/X006-guild-metaphor/spec.md` with three hypotheses: human connection (H1), external legibility (H2), agent focus (H3).
- **Drafted bootstrap quest plan** — `.scratch/guild-bootstrap-quests.md` with 4 quests: Guild Foundation (register + roster), Sage Pipeline, Guild Houses, Full Integration. Collapsed original 6-quest plan down to 4.
- **Updated Coco's agent file** — added emissary role definition and guild metaphor doc reference.
- **Cleaned up stale quest drafts** — removed guild-roster.md, nexus-members-cli.md, sage-trials-update.md from `quests/draft/` (absorbed into bootstrap plan).

## Decisions made and/or deferred

- **Decided: "anima"** as the identity noun (pluralized "animas" with acknowledged Latin incorrectness). Rejected soul (philosophical baggage), slate (implies a phase, breaks under "list all slates"), agent/person (too generic).
- **Decided: Register + Roster model.** Register is the authoritative record of all animas ever. Roster is a filtered view (active state), not a separate store.
- **Decided: Three states** — Aspirant (training), Active (dispatchable), Retired (permanent, record persists).
- **Decided: Standing vs. Commissioned** — standing animas persist across quests (Guildmaster, Oracle); commissioned animas are instantiated per-quest (heroes). Same data model, different tenure.
- **Decided: Coco is the patron's emissary**, not a guild role. Lives outside the guild metaphor doc; defined in Coco's agent instructions.
- **Decided: Single guild** for bootstrap (recommended, not yet formally locked).
- **Deferred: Target repository** for bootstrap quests.
- **Deferred: Seal format** (what is a seal mechanically?).
- **Deferred: Commissioned anima lifecycle mechanics** (does `send` auto-create them?).

## Next steps & open questions

- Resolve remaining blockers to post bootstrap quests: target repo, seal format, how much metaphor context goes in quest specs
- Q1 (Guild Foundation) is the first postable quest — register + roster CRUD
- Sage-trials draft (`quests/draft/sage-trials.md`) needs updating with master-sage/sageAdvice concepts before Q2 can be posted
- `.scratch/guild-bootstrap-quests.md` has the full plan

### Notable moments

- **Standing vs. commissioned insight** — Sean's input: "The member distinction that matters isn't named vs unnamed — it's standing (available indefinitely, summoned by name) vs commissioned (instantiated for a specific quest, roster membership lasts only as long as the quest)." Notable because it resolves the tension between persistent identity and ephemeral agent sessions — the technical reality of how Claude sessions work maps cleanly onto commissioned animas.
- **"I don't want to call them souls because it might conflict with people's philosophical beliefs when i present this to others"** — pragmatic constraint that drove the naming exploration. Shows Sean thinking about external audience even during internal design.
- **Slate's failure** — Sean caught that "slate" implies a phase: "Show me a list of all the slates in the register would by definition exclude those who have been trained." Clean kill of a concept that sounded right but broke under scrutiny.
- **Writing the technical doc was miserable** — Coco's observation that stripping the metaphor made the same system description profoundly duller. Early qualitative evidence for H2.
