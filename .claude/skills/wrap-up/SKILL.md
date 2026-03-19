---
description: Complet work and generate a structured session summary for handoff and scribe input. Hidden by default — invoke explicitly at session end.
disable-model-invocation: true
---

# Wrap-Up: Complete Work and Generate Session Summary

## Complete Work

- Commit any changes you have made to the main worktree, if any
- Examine your own worktree, and commit any remaining work 
- Push your worktree to main
- Push main to the remote

## Generate Summary

Generate a structured summary of the current session. This summary serves two audiences:

1. **The next Coco session** — as startup context to resume work
2. **The Scribe** — as input for session notes and published material

<expected-format>
# Session Summary

## What we did

- Bulleted list of concrete actions taken (files created/modified, decisions made, commits pushed). Reference specific files and commit hashes.

## Decisions made
- What was decided, including explicit "we chose NOT to" decisions. Brief rationale for each.

## Deferred decisions & open questions

- Things discussed but intentionally left unresolved, with enough context to resume.

## Next steps

- Concrete actions for the next session or for agents to pick up.

## Agent Adjustments

- Based on direct instructions, corrections, and feedback given list any notable addtions or changes we should consider making to your general agent instructions

### Notable moments

This is the most important section. Capture quotes, insights, or exchanges that stand out — either for system design or for the research/experiment narrative.

For each notable moment:
- Include **direct quotes from Sean** when available
- Flag **why it's notable** (e.g., "shifted the project's core abstraction", "surfaced a tension between X and Y", "revealed an assumption about how agents should work")
- Prioritize moments where the human changed direction, challenged an assumption, or articulated something new about the project's purpose
<expected-format>

## Guidelines

- Keep the whole summary under ~500 words. Brevity is a feature.
- Do not editorialize beyond the "why it's notable" flags.
- Use precise domain vocabulary as established in the ontology.
- Present the summary directly — do not write it to a file unless asked.
