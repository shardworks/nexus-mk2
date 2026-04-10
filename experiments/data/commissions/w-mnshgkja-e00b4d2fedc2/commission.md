## Opened With

From 2026-04-10 conversation with Sean after completing Move 1 (extracting the quest workflow into .claude/skills/quests/SKILL.md):

> would we benefit from creating 'skills' for the various quest interactions, and/or leveraging a cheaper subagent to do that to save context in our main chats? what would that look like?

Decision from that thread: do Move 1 now (done), park Move 2 (quest-scribe subagent) as a quest for later — specifically once we have real usage data on quest body sizes and update frequency.

## Summary

**Problem.** Mature quest bodies (especially ones with long Notes sections) are expensive to load into Coco's main chat context. Updating a quest requires show → rewrite → edit, which means the full body sits in-context for every update. Multi-quest sessions compound the cost.

**Proposed solution.** A `quest-scribe` subagent (invoked via the Task tool, running on a cheaper model like sonnet) that owns all heavy quest read/write operations. Coco delegates via a compact interface:

    Task(subagent: "quest-scribe", prompt: {
      operation: "update" | "load" | "open" | "conclude",
      quest_id?: string,
      instruction: string  // freeform: what to do, what to say
    })

The subagent loads the full body in ITS context, performs the operation, and returns a compact digest to Coco (e.g., the new Summary text, or a one-line confirmation). Coco never sees the raw body unless it explicitly asks.

**Expected benefit.** Main-chat context freed from raw quest bodies. Cost reduction from cheaper model on mechanical ops. Potentially 10x token savings on heavy update sessions.

**Tradeoffs / open questions.**
- **Voice drift.** Subagent writes Summaries; different model = different register. Quest Summaries ARE what next-Coco reads at startup, so drift matters. Mitigation: tight system prompt that pins voice.
- **Fidelity loss on load.** If Coco only gets a digest, may miss Notes context. Mitigation: let Coco ask follow-ups (subagent still loaded).
- **Added complexity.** More moving parts to debug when something goes wrong.
- **Hybrid option.** Use subagent only for load path (fidelity loss is reversible via follow-ups), keep updates in main chat (voice matters most there).

**Gate for proceeding.** Need real usage data first. Defer until we've used v1 quests for a couple weeks and can measure:
- typical quest body size at maturity
- frequency of updates per session
- actual token cost of current (non-delegated) approach

**Recommendation from the design discussion:** start skill-only (Move 1, done), observe actual token cost, then introduce subagent if bloat is real.

## Notes

- 2026-04-10: opened after completing Move 1 (quest skill extraction). First real quest filed in the v1 workflow — also serves as the smoke test.
- 2026-04-10: full design discussion captured in the session transcript (session 1e85ced3-f17e-43c9-a3b1-31a443b45b67). Key exchanges: Sean asked whether we'd benefit from skills/subagents; Coco enumerated operation costs by type; proposed Move 1 (skill extraction) + Move 2 (scribe subagent) as composable; recommended Move 1 first, Move 2 deferred until measured.
- 2026-04-10: Parallel decision — we will also want to answer "what does a well-tuned quest-scribe system prompt look like?" and "is voice drift actually a problem in practice?" These are sub-questions that could become child quests.