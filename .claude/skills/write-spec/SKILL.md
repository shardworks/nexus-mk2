---
description: Delegate spec writing to the coco-architect agent. Formulate a precise brief from conversation context, spawn the architect, and review its output.
---

# Write Spec: Delegate to Coco Architect

## When to use

When a feature has been discussed enough to scope, and the next step is a formal implementation spec. This skill formulates the brief, delegates to the coco-architect agent, and reviews the output.

## Step 1: Formulate the brief

Write a precise brief that encodes the conversation context. The brief is the single most important input — it determines scope, and scope drift is the architect's main failure mode.

A good brief includes:
- **What to build** — the specific feature or change
- **Scope boundaries** — what is explicitly OUT of scope (name specific things discussed and excluded)
- **Design constraints** — any decisions already made in conversation (e.g., "use convention-based file paths, not guild.json config fields")
- **Target files/apparatus** — where in the codebase the change lives

Present the brief to Sean for approval before dispatching. The brief is a contract — once the architect runs, it can't ask clarifying questions.

## Step 2: Dispatch the architect

Run the architect in the background:

```bash
claude --agent coco-architect --print --dangerously-skip-permissions --max-budget-usd 5 "<the brief>"
```

Use `run_in_background: true` so the conversation can continue while it runs. The architect writes its output to `.scratch/specs/{slug}/` — four files: `inventory.md`, `analysis.md`, `spec.md`, `observations.md`.

## Step 3: Review the output

When the architect finishes, read all four artifacts and assess:

**Spec quality:**
- Did it stay within the briefed scope, or expand?
- Did it discover the file/directory dual pattern (or equivalent) for authored content?
- Are the R↔V mappings specific (not just "tests pass")?
- Are type signatures complete and copy-pasteable?
- Would an implementing agent need to ask any questions?

**Analysis quality:**
- Did the decision log evaluate real tradeoffs, or just rubber-stamp the obvious choice?
- Did the stress tests surface human-experience concerns (how will the operator organize this?), not just system-behavior concerns (will readFileSync handle more bytes)?
- Check the Phase 4 log — did it actually catch and fix gaps?

**Observations quality:**
- Are the punch list items actionable? Could someone commission follow-up work from them?
- Did it note doc/code discrepancies found during inventory?

Present a summary to Sean: what the architect got right, what needs revision, and whether the spec is commissionable as-is or needs edits. If edits are needed, make them directly to the spec file — don't re-run the architect for small fixes.

## Notes

- The architect typically takes 3-8 minutes to run
- Budget cap of $5 prevents runaway sessions
- If the architect produces a `clarification.md` instead of a spec, the brief was too ambiguous — reformulate and re-run
- The inventory and analysis files are useful for debugging scope issues — check what code it read and what decisions it made
