<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Cut Astrolabe's end-to-end latency and token cost substantially, with the initial focus on the reader stage and its full-repository inventory pass — currently suspected to be the dominant contributor. The outcome is (a) a profile of where Astrolabe's time and tokens actually go across its stages, (b) a chosen set of interventions on the reader/inventory path (scoping, caching, incremental re-reads, hierarchical summarization, or similar), and (c) a sketch of any cross-stage changes that follow from the profiling (e.g., handoff format changes, dropping work the reader does that downstream stages don't use).