<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Decide and then ship the design for making agent-backed engine stages (notably astrolabe's reader, spec-writer, and similar anima-session stages) treat "success" as a function of observable side effects — specifically, whether the required tool call actually landed in the session's tool-call trace — rather than trusting the session's clean exit and narrative summary. Outcome is a chosen defense stack (blame-point fix + retry loop + tool-call trace observability) ready to commission, with astrolabe pipeline contracts updated to match.