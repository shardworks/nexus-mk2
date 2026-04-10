## Opened With

Coco's startup routine eagerly read `.scratch/recent-sessions/*.md`, which was expensive, incomplete under concurrent sessions, and used history where current state was what was needed. Sean proposed moving conversation context into guild Stacks — possibly as a new writ type — so that context would be durable, queryable, and visible to autonomous planning agents.

The framing reached a design proposal captured in `.scratch/conversation-topics-as-writs.md` (2026-04-10), which argued:

- Writ is substrate; type carries semantics. "Writ" retreats to the code/schema layer; in conversation we speak of mandates, briefs, topics.
- Spider dispatch is opt-in per writ type via rig mapping, so an unmapped type (topic/quest) is inert-by-construction — no special-case branches in dispatch code.
- No sidecar book in v1. Prose lives in the writ body as structured markdown (Opened With / Summary / Notes).
- Astrolabe contributes the type; decisions & ratification deferred to v2.
- Coco workflow lives in the agent file using existing `nsg` commands — no new CLI.

## Summary

**Largely shipped.** The design landed as the `quest` writ type, documented in `.claude/skills/quests/SKILL.md`, with the Opened With / Summary / Notes body convention in active use. Coco's startup and wrap-up routines now query quests instead of reading session files. This quest itself is the first dogfood of the mechanism.

**Resolved sub-questions:**

- **T1.1 — Clerk API gap on non-draft body edits.** Resolved; `nsg writ edit` supports body updates on active/waiting quests, which is what the quests workflow depends on.
- **T1.5 — Writ vocabulary documentation debt.** Resolved; the guild metaphor doc and supporting materials now frame writ as a typed substrate rather than an obligation-flavored term.

**Remaining open sub-questions** (tracked as child quests):

- **T1.2** — Plugin-contributed writ types: Option A (imperative `registerWritType`), Option B (declarative `contributes` manifest), or keep the guild.json escape hatch.
- **T1.3** — Concurrent session writes to the same quest body: conflict strategy (optimistic concurrency, append-only journal, or accept last-write-wins for v1).
- **T1.4** — Decisions & ratification (the deferred v2): `ProjectDecisionDoc`, InputRequest-based ratification, decisions book owned by Astrolabe.

## Notes

- 2026-04-10: Original design doc at `.scratch/conversation-topics-as-writs.md` (24K). Preserved in git history; will be deleted as part of the .scratch migration.
- Research cached in `.scratch/gsd-research/` — GSD threads/seeds/backlog schemas that inspired the body-template convention. Not imported; git history is the record.
- Astrolabe's existing `Decision` and `DecisionAnalysis` types are the reference shapes for the T1.4 decisions work — see spider input-request system and astrolabe decision-review engine.
- The "inert-by-construction" insight (Spider dispatches only mapped types) is what made this design cheap to ship. Worth remembering for any future parasitic writ types.
- Dogfood note: this root quest is being opened *after* the mechanism shipped. The Opened With anchors the original framing; the Summary reflects present state. Future "open inquiries with partially-resolved sub-questions" can use the same shape.