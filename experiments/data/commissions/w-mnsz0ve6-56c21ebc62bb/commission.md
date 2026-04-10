## Goal

Adopt, for Nexus agents that conduct design conversations with Sean (primarily Coco, secondarily Astrolabe's analyst stage), an "assumptions mode" as an interaction default — where the agent reads the relevant code/docs/context first, drafts a structured set of assumptions about what Sean wants and how it would approach the work, and asks Sean to confirm, correct, or expand — instead of asking open-ended clarifying questions. The outcome is (a) a clear articulation of when assumptions mode is better than open-ended mode and when it isn't, (b) a sketch of what "read the codebase first" looks like in practice for Coco (which tools, how much reading is too much), (c) a lightweight behavior change captured in Coco's agent instructions, and (d) an assessment of whether the same pattern should be built into the Astrolabe analyst stage.

## Status

parked — idea captured, ready for a light behavior experiment on Coco's side

## Next Steps

Next session: (1) draft the specific behavior change for Coco — add a line or two to `.claude/agents/coco.md` that makes "assumptions mode" the default for substantial design conversations, with "open-ended mode" reserved for cases where Coco genuinely lacks context; (2) define "substantial" — probably something like "any conversation that will produce a spec, plan, or design doc"; (3) run the pattern on the next qualifying conversation and observe whether it's faster/better/worse than the current default; (4) decide based on that single data point whether it's worth codifying more formally; (5) separately, think about whether the Astrolabe analyst stage should have an assumptions mode as a plugin setting.

## Context

The pattern comes from GSD's `/gsd-discuss-phase` command, which has two modes: open-ended (the default) and assumptions. In assumptions mode, GSD reads `PROJECT.md`, the codebase mapping, and existing conventions, generates a structured list of assumptions about how it would build the phase, and presents them for confirmation or correction. GSD's own guidance recommends assumptions mode for experienced users working in a codebase they already know well — which is basically always the case with Sean and Nexus.

The claim is that assumptions mode is dramatically faster because the user isn't answering twenty independent questions — they're scanning a bulleted list and flagging the three items that are wrong. It also surfaces disagreements earlier: if the agent's assumptions are wildly off, you catch it in the first exchange rather than after three rounds of questions.

For Coco specifically, the current default is open-ended. When Sean brings up a new topic, I tend to ask clarifying questions and explore the space before committing. That's sometimes valuable (when I genuinely lack context) and sometimes wasteful (when Sean already knows the answer and is waiting for me to guess it). The pattern would be: for any substantial design conversation, read the relevant code/docs first, draft a compact list of "here's what I think you want and how I'd approach it," and ask Sean to correct it.

Risk: assumptions mode can feel presumptuous if the agent's assumptions are consistently wrong. The mitigation is to frame them explicitly as assumptions — "correct me where I'm wrong" — rather than as declarations.

Cross-cutting relationship: this is adjacent to the UI design contract quest and the Nyquist/verification contract thinking, both of which are instances of a larger principle — "pin the explicit contract upfront rather than relying on implicit shared understanding." Assumptions mode is that principle applied to design conversations rather than build artifacts.

## References

- GSD user guide § Assumptions Discussion Mode: `.scratch/gsd-research/USER-GUIDE.md:161-178`
- Coco agent instructions: `.claude/agents/coco.md`
- Astrolabe analyst stage: `/workspace/nexus/packages/plugins/astrolabe/` (analyst engine)
- Adjacent quest: UI design contract (opened this session) — same "explicit contract" principle applied to UI

## Notes

- 2026-04-10: opened after GSD research pass surfaced the pattern. Sean explicitly wanted this as its own quest. My self-observation: I could have been using this mode all along but defaulted to open-ended questions because that's what the model does unless told otherwise.