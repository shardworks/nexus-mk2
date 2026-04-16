---
description: Complete work and generate a structured session summary for handoff and scribe input. Hidden by default — invoke explicitly at session end.
disable-model-invocation: true
---

# Wrap-Up: Complete Work and Generate Session Summary

## Generate Summary

Generate a structured summary of the current session. This summary serves one audience:

**The Scribe** — as input for session notes and published material.

Session-to-session continuity is now carried by **clicks** (see Coco's agent file and the clicks skill). Before generating the wrap-up summary, conclude or park any clicks touched this session — the click tree is what the next Coco session will read for orientation, not this wrap-up file.

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

### Experiment observations

Flag anything relevant to active experiments. Omit this section if nothing applies.

<expected-format>

## Complete Work

After wrapping up, **ALWAYS**:

- Commit any changes you have made, if any
- Push main to the remote

## Reminders

Check for things Sean should be nudged about:

- **Ethnographer interview:** Check the most recent interview file in `experiments/ethnography/interviews/` (files named `YYYY-MM-DDTHHMMSS.md`). If the most recent one is more than a day old — or if none exist yet — remind Sean to run an ethnographer session. Keep it light: *"It's been a couple days since your last ethnographer interview — might be a good time to check in."*

## Guidelines

- Keep the whole summary under ~500 words. Brevity is a feature.
- Do not editorialize beyond the "why it's notable" flags.
- Write the summary to `experiments/ethnography/session-notes/new/<timestamp>.md`. where `<timestamp>` is the current date and time formatted as `YYYY-MM-DDTHHMMSS.md` (use the actual current time — don't round to the nearest hour). Each session gets its own file — never overwrite a previous one. This file is for the ethnographer and must NOT be auto-deleted — it accumulates until the ethnographer reviews it.
- Commit all `session-notes`, and `experiments/data/transcripts/` changes to git and push those changes. The transcripts directory may contain files from concurrent sessions — commit whatever is there.
- In addition to writing the summary, share it in the chat for review and inclusion in session transcripts
