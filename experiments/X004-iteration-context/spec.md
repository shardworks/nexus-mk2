---
status: draft
---

# X004 — Iteration Context

## Research Question

When an agent iterates on its own previous work (bug fixes, amendments, feature additions), how does the amount of context about prior sessions affect the quality, efficiency, and safety of the iteration?

Secondary questions:
- Does an agent without prior context waste significant turns re-exploring its own code?
- Does full prior context (e.g., complete session log) cause the agent to over-anchor on its previous approach rather than finding a better one?
- Is there a summarized middle ground that gives the agent enough orientation without constraining it?
- Does prior context reduce the risk of regressions — or does it make no difference because the commission's cumulative "How I'll Evaluate" section is the real regression guard?

## Hypothesis

Summarized context will outperform both extremes. No context wastes turns on re-exploration. Full context is noisy and may anchor the agent to its previous implementation decisions. A summary — what was built, what works, what the amendments are asking to change — gives the agent a fast on-ramp without over-constraining it.

However, it's also possible that agents are good enough at code exploration that no context is fine, and the summary is unnecessary ceremony. We don't know yet.

## What We're Trying to Prove

1. **Iteration is a distinct problem from greenfield.** The agent's behavior when modifying existing code (its own or otherwise) may require different support than building from scratch.
2. **Context quantity has diminishing or negative returns.** There's likely a sweet spot — and knowing where it is shapes how we design the commission runner for iterative work.
3. **The commission document is (or isn't) sufficient as iteration context.** If the cumulative commission with amendments is enough for the agent to orient and iterate safely, we don't need additional context mechanisms at all.

## Procedure

1. **Choose a reference commission with amendments.** Use the session-launcher commission (which already has A1 and A2) or create a purpose-built one.
2. **Define three variants:**
   - **No context.** The commission + the repo. Nothing about prior sessions. (This is what we're doing now.)
   - **Summary context.** The commission + a brief summary of what was built, key decisions made, and what the amendments are changing. Appended to the commission or provided as a separate file in the repo.
   - **Full context.** The commission + the complete session log (or a cleaned transcript) from the original build session.
3. **Run each variant** against the same repo state (reset to the same commit before each run).
4. **Capture telemetry.** Cost, duration, turns, success/fail.
5. **Evaluate outputs.** Same validation criteria for all variants. Specifically:
   - Did the amendments get addressed?
   - Did any previously-working behavior regress?
   - How many turns were spent on exploration vs. implementation?
   - Did the agent's approach to the existing code differ across variants?

## Validation Criteria

- All evaluation criteria from the original commission are still satisfied (regression check)
- Amendment-specific behavior works correctly
- Turn count breakdown: exploration vs. implementation vs. testing

## Depends On

- X002 (session launcher — both as the test subject and as the tool for running sessions)
- At least one completed amendment run to establish a baseline (the current X002 A1/A2 run)

## What This Experiment Is NOT

- Not testing different models (hold model constant)
- Not testing commission wording variants (that's X003)
- Not building a production context-management system — just gathering data on what helps
