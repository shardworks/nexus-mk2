<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Design and ship the first layer of the Astrolabe atlas: a set of prose markdown documents produced by an LLM mapper rig and injected as preamble into Astrolabe's planning stages, selected per commission by a brief-type → document-subset map. This is the "turn-killer" layer that directly addresses the SSR failure mode (single-shot without prep doesn't work; single-shot *with* prebuilt interpretive context does). Outcome is (a) a settled document set (which of GSD's seven templates port, what we add), (b) a brief-type → subset map Astrolabe uses to pick 2–3 docs per commission, (c) a mapper rig template that produces the documents, and (d) the reader/MRA prompt changes that consume them.