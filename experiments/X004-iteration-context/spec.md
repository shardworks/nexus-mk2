---
status: ready
---

# X004 — Iteration Context

## Research Question

When an agent iterates on its own previous work (bug fixes, amendments, feature additions), how does the amount of context about prior sessions affect the quality, efficiency, and safety of the iteration?

Secondary questions:
- Does an agent without prior context waste significant turns re-exploring its own code?
- Does full prior context (e.g., complete session log) cause the agent to over-anchor on its previous approach rather than finding a better one?
- Is there a summarized middle ground that gives the agent enough orientation without constraining it?
- Does prior context reduce the risk of regressions — or does it make no difference because the commission's cumulative "How I'll Evaluate" section is the real regression guard?

## Relationship to X007:H2

X007:H2 (Orientation Cost Dominates) measures the **codebase orientation tax** — how much agents spend exploring an unfamiliar repo before working. This experiment is different in three ways:

1. **Iteration, not greenfield.** The agent is modifying code that already exists in the workshop — possibly code it wrote itself in a prior commission. The question isn't "can you find your way around?" but "do you understand what was already built and why?"
2. **Context can hurt.** X007:H2 assumes more orientation context is better and seeks to provide it cheaply (via warm sessions). X004 tests whether full prior-session context might be *worse* — causing the agent to over-anchor on its previous approach rather than finding a better one for the amendment.
3. **Quality, not just cost.** X007:H2 counts turns and tokens. X004 cares about regressions, approach quality, and whether amendments are addressed correctly. An agent that orients quickly but breaks existing behavior is worse than one that takes longer but gets it right.

If X007:H2 is confirmed (orientation cost dominates), warm sessions solve the codebase discovery problem. X004 asks the *next* question: once codebase orientation is handled, does the agent also need context about the prior *session* — what was built, what decisions were made, what trade-offs were chosen?

## Hypothesis

Summarized context will outperform both extremes. No context wastes turns on re-exploration. Full context is noisy and may anchor the agent to its previous implementation decisions. A summary — what was built, what works, what the amendments are asking to change — gives the agent a fast on-ramp without over-constraining it.

However, it's also possible that agents are good enough at code exploration that no context is fine, and the summary is unnecessary ceremony. We don't know yet.

## What We're Trying to Prove

1. **Iteration is a distinct problem from greenfield.** The agent's behavior when modifying existing code (its own or otherwise) may require different support than building from scratch.
2. **Context quantity has diminishing or negative returns.** There's likely a sweet spot — and knowing where it is shapes how we design the commission runner for iterative work.
3. **The commission document is (or isn't) sufficient as iteration context.** If the cumulative commission with amendments is enough for the agent to orient and iterate safely, we don't need additional context mechanisms at all.

## Procedure

1. **Choose a reference commission with amendments.** Use an existing commission that has at least one amendment, or create a purpose-built one.
2. **Define three variants:**
   - **No context.** The commission + the repo. Nothing about prior sessions. (This is the current default.)
   - **Summary context.** The commission + a brief summary of what was built, key decisions made, and what the amendments are changing. Appended to the commission or provided as a separate file in the repo.
   - **Full context.** The commission + the complete prior session's conversation history. This variant could be implemented via Claude CLI's `--resume <prior-session-id> --fork-session` — the agent literally picks up from where the prior session left off, with full conversation history in context. See `experiments/X007-first-contact/artifacts/warm-session-spec.md` for the mechanism.
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
- Turn count breakdown: exploration vs. implementation vs. testing (using the X007:H2 orientation cost heuristic from `experiments/X007-first-contact/artifacts/orientation-cost-analysis-spec.md`)

## Depends On

- Guild dispatch infrastructure (commission dispatch, workshop setup, session capture)
- Sessions with populated transcripts (post-transcript-capture fix, commit `9d5bd96`)
- At least one completed commission to use as the base for amendment variants

## Relationship to X010

X010 (Staged Sessions) asks a closely related question: if we break a single commission into multiple shorter sessions, can a "stage notes" handoff file bridge the context gap? X010's stage notes are essentially X004's "summary context" variant, applied to continuation rather than iteration.

- X004 tests context variants for **amendments to completed work** (a new commission touching prior output).
- X010 tests context bridging for **continuation of in-progress work** (same commission, split across sessions).
- X004 includes a **full-context variant** (session resume/fork) that X010 doesn't consider.
- Findings from either experiment inform the other. Shared data collection instruments (orientation cost analysis, quality assessment).

## What This Experiment Is NOT

- Not testing different models (hold model constant)
- Not testing commission wording variants (that's X003)
- Not measuring codebase orientation cost (that's X007:H2)
- Not building a production context-management system — just gathering data on what helps
