<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Port the GSD `/gsd-intel` pattern into Astrolabe: maintain a queryable project-shape artifact (structural + interpretive intel) that downstream planning stages consume instead of re-scanning the codebase from scratch on every commission. Outcome is (a) an intel schema tailored to what Astrolabe's reader/analyst/spec-writer actually need, (b) a build/refresh mechanism split between cheap non-LLM tooling (structural) and a one-time LLM mapper pass (interpretive), with freshness tracking, and (c) a reader/MRA prompt shape that consumes the intel as preamble or as MCP-tool-backed queries — turning the reader from a 25-turn exploration into a single-shot or near-single-shot pass over prepared context.