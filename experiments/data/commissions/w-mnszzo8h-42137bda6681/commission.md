_Vocabulary bookmark from `docs/future/guild-vocabulary.md` (2026-04-10) — Petition._

## Goal

Give the guild a first-class flow for **internally-originated commissions** — work the guild proposes for itself (tech debt, refactors, infrastructure improvements, tooling upgrades) as distinct from work the patron commissions. The vocabulary tome calls these *petitions*: same commission infrastructure, different origin, possibly different dispatch policy and authorization gate.

## Status

Parked — vocabulary bookmark, no work scheduled. The gap is real but not currently painful: today, internal work either becomes a patron-flavored commission (dishonest framing) or stays in `.scratch` and dies quietly.

## Next Steps

If this becomes pressing — most likely trigger is wanting agents or Sages to *propose* their own work and have it tracked/prioritized rather than lost — expand into a proper inquiry. The first design question is whether petitions are a new writ type, a flag on the existing commission/mandate type, or just a `source: 'patron' | 'internal'` field. The second is whether they need a distinct authorization gate before becoming dispatchable (the tome's Writ-as-authorization concept fits here).

## Context

**The vocabulary** (from the future-vocabulary tome):

> **Petition** — A commission originating from within the guild rather than from the patron. Petitions are requests to build or improve guild resources — paying tech debt, upgrading tooling, refactoring internal systems. The intent is that leadership evaluates petitions and decides which to grant, balancing cost against value. Petitions use the same commission infrastructure but are internally motivated.

**Why it matters now (even though it's parked):**

The current system has no honest place for internal work. Three observed pathologies:

1. **Tech debt becomes invisible.** Refactors and improvements that aren't directly patron-asked tend to die in `.scratch` files (the entire .scratch backlog import we just did is largely this). They're not commissions, not quests, not anything tracked.
2. **Agent-proposed improvements have no home.** When an artificer notices something that should be cleaned up while implementing a feature, the only options are: do it inline (scope creep), file a follow-up (currently no flow), or drop it on the floor.
3. **Sages have no proposal mechanism.** A consulted sage might recommend "before doing this, refactor X." Today that's a comment in a session transcript. In a guild with petitions, it becomes a petition.

**The authorization gate question.** The tome introduces *Writ* (in Coco's suggestions section) as a formal authorization to act, distinct from a commission. A petition could be the natural place to use it: "house X submits a petition; the Guildmaster issues a Writ to authorize it; the Writ is what turns the petition into a dispatchable commission." That's a clean flow but it depends on having the Coinmaster/Purse infrastructure first (because the authorization decision is partly a budget decision).

**Cross-links:**

- **Vocabulary V1 (cost tracking)** — petitions need a budget to be granted; the authorization gate is partly an economic decision.
- **T1.4 (decisions & ratification)** — granting a petition is a decision; could reuse the InputRequestDoc/patron-input ratification flow.
- **T2 (multi-rig)** — under multi-rig, petitions become natural: the parent writ can spawn an "investigate" rig that produces a petition, which spawns its own implementation rig once authorized.

## References

- Source tome: `docs/future/guild-vocabulary.md` § "Work" (Petition) and § "Coco's Suggestions / Authority & Governance" (Writ-as-authorization)
- Cross-link: V1 cost tracking & token budget allocation (sibling vocabulary bookmark)
- Cross-link: T1.4 decisions & ratification (`w-mnswwzdv-88c29d29f84b`)
- Cross-link: T2 multi-rig refactor (`w-mnsx8cz2-63bdd1d4a2d3`)

## Notes

- The whole .scratch backlog import (T1–T8) is essentially a manual petition flow: stuff the guild noticed needed doing, that had no first-class home. If that pattern keeps recurring, this bookmark is the right place to formalize it.
- 2026-04-10: opened as a vocabulary bookmark from the future-vocabulary tome.