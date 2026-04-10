## Goal

The principle: when LLM agents share implicit understanding — with each other, or with a human — they fill the gap with their own inferences, and those inferences diverge in model-specific ways that don't surface until integration or review. The fix is structural: write the shared understanding down as an artifact, upfront, before execution begins. The artifact is the "contract." This quest is the principle's home. It names the pattern, enumerates the known flavors, and serves as the anchor for application quests via `instance_of` links.

## Status

active — principle home; updated only when a new flavor is discovered

## Next Steps

None — this quest is the principle's home and has no work of its own. If you're reading it looking for "what to work on next," you want one of the application quests linked below, not this one. Extend this quest only when (a) a fourth flavor of the principle surfaces, or (b) one of the application quests concludes and the lesson needs to be folded back into the principle's Context.

## Context

Three known flavors of the principle, all surfaced during a single session's cross-reading of GSD's user guide against Nexus's existing design conversations:

**Conversation contract.** Between Coco and Sean during design work. The "assumptions mode" pattern inverts the discussion default from "ask open-ended questions" to "state my assumptions about what you want and invite corrections." Pins shared understanding before the design conversation goes far enough to have wasted motion on wrong inferences. Without the contract, the agent asks ten questions and still ends up guessing on the eleventh. Application: **w-mnsz0ve6**.

**Consistency contract.** Between parallel agents working on related deliverables. Explicit design contracts (GSD's UI-SPEC model, generalized beyond UI to code style, domain vocabulary, review rubrics) pin the style/structure/vocabulary rules upfront so that N agents producing N related pieces don't each make N independent judgment calls that diverge on spacing/naming/tone. Without the contract, consistency is whatever the first agent happens to do, and subsequent agents each drift slightly. Application: **w-mnsz1s1x**.

**Acceptance contract.** Between a planner and an implementor (or between code-author and reviewer). Verification contracts — GSD's Nyquist layer and Astrolabe's task decomposition proposal — pin the definition of "done" as a planner-written acceptance criterion, ideally with a runnable check that's evaluated independently of the implementing agent. Breaks the correlated-failure loop where the agent writing the code also writes its tests, so its blind spots are identical in both. Without the contract, green CI proves only that the code is consistent with itself. Application: **w-mnsxcp2m** (with sub-inquiry **w-mnsxe2fo** on verify-command quality).

The three flavors share the same underlying dynamic: wherever communication between parties is implicit, LLM inferences diverge along each party's individual prior, and the divergence compounds across rounds. The fix isn't behavioral ("infer better") — it's structural. Remove the need to infer by making the shared understanding into an artifact.

External reference: GSD's user guide presents all three patterns independently (assumptions mode, UI-SPEC, Nyquist) but doesn't connect them as instances of a single principle. The framing is Nexus-side.

Open question worth flagging: is there a fourth flavor — between Sean and the guild's autonomous agents, via the commission body — that would constitute a **commission contract** distinct from the three above? Commission bodies today are narrative; they could be more structured. This is adjacent to the acceptance-contract quest but concerns the patron→guild handoff rather than the planner→implementor handoff. Possibly worth its own quest eventually.

## References

- Application quest — conversation contract: **w-mnsz0ve6** — Assumptions mode — invert the discussion default from 'ask me' to 'correct me'
- Application quest — consistency contract: **w-mnsz1s1x** — Explicit design contracts as first-class planning artifacts (beyond UI)
- Application quest — acceptance contract: **w-mnsxcp2m** — Astrolabe: structured task decomposition & acceptance verification
- Sub-inquiry under acceptance contract: **w-mnsxe2fo** — Verify-command quality — where task decomposition lives or dies
- GSD user guide (the external inspiration): `.scratch/gsd-research/USER-GUIDE.md` — § Assumptions Discussion Mode (161-178), § UI Design Contract (182-259), § Validation Architecture / Nyquist Layer (112-128)

## Notes

- 2026-04-10: opened as the home for the "explicit contracts" principle after Sean asked what a reorganization of the three application quests would look like. Chose this shape (parent quest + `instance_of` links) over (a) parent/child via parentId, which would conflate principle→instance with obligation hierarchy, (b) cross-links only, which leaves the principle homeless, and (c) putting the principle in the guild metaphor doc, which creates a parallel hierarchy to the writ substrate. The parent quest having no "work of its own" isn't a bug — principle quests are structural anchors, distinct from design quests.