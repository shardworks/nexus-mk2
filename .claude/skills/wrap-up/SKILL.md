---
description: Complete work and generate a structured session summary for handoff and scribe input. Hidden by default — invoke explicitly at session end.
disable-model-invocation: true
---

# Wrap-Up: Complete Work and Generate Session Summary

## Distill the session (run first)

Before generating the ethnographer summary, distill the session into a
durable planning artifact. Invoke:

    /workspace/nexus-mk2/bin/coco-distill.sh <session-id>

Where `<session-id>` is your cached Claude session ID (resolved at
startup). The script:

1. Runs the **distiller** agent against the session's JSONL transcript and
   writes a structured distill to `docs/planning/<YYYY-MM-DD>-<slug>.md`
   (slug chosen by the distiller from the conversation focus).
2. Runs the **verifier** agent against the distill + transcript. The
   verifier is calibrated for a high severity bar — it stays silent
   except for genuinely serious discrepancies.

If the verifier prints findings, surface them to Sean and offer to revise
the distill before continuing. If the verifier is silent (the expected
case), the distill is good as written.

The distill lives in git and is the canonical planning record of the
session. Review it briefly before the ethnographer summary — the
ethnographer summary should not duplicate the distill but can reference
it.

## Generate Summary

Generate a structured summary of the current session. This summary serves one audience:

**The Scribe** — as input for session notes and published material.

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
- Commit all `session-notes`, `docs/planning/` (newly written distill), and `experiments/data/transcripts/` changes to git and push those changes. The transcripts directory may contain files from concurrent sessions — commit whatever is there.
- In addition to writing the summary, share it in the chat for review and inclusion in session transcripts
