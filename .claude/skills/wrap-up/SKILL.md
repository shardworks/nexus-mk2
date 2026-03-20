---
description: Complete work and generate a structured session summary for handoff and scribe input. Hidden by default — invoke explicitly at session end.
disable-model-invocation: true
---

# Wrap-Up: Complete Work and Generate Session Summary

## Complete Work

- Commit any changes you have made, if any
- Push main to the remote

## Generate Summary

Generate a structured summary of the current session. This summary serves two audiences:

1. **The next Coco session** — as startup context to resume work
2. **The Scribe** — as input for session notes and published material

<expected-format>
# Session Summary

## What we did

- Bulleted list of concrete actions taken (files created/modified, decisions made, commits pushed). Reference specific files and commit hashes.

## Decisions made and/or deferred

- What was decided, including explicit "we chose NOT to" decisions. Brief rationale for each.

## Next steps & open questions

- Concrete actions for the next session or for agents to pick up.
- Open questions which were raised but not answered

### Notable moments

Capture quotes, insights, or exchanges that stand out — either for system design or for the research/experiment narrative.

For each notable moment:
- Include **direct quotes from Sean** when available
- Flag **why it's notable** (e.g., "shifted the project's core abstraction", "surfaced a tension between X and Y", "revealed an assumption about how agents should work")
- Prioritize moments where the human changed direction, challenged an assumption, or articulated something new about the project's purpose
<expected-format>

## Guidelines

- Keep the whole summary under ~500 words. Brevity is a feature.
- Do not editorialize beyond the "why it's notable" flags.
- Present the summary directly as part of the conversation
- Write the summary to `.claude/last-session.md` (overwriting any previous content). This file is read by Coco at startup to resume context.
