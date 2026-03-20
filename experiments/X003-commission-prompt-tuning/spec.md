---
status: draft
---

# X003 — Commission Prompt Tuning

## Research Question

How do pre-commission instructions (system-level framing, behavioral mandates, constraints) affect agent performance on identical tasks?

Specifically:
- Does mandating self-testing improve outcomes, or does it waste turns on testing things that already work?
- Do explicit negative constraints ("do not do X") change behavior, or do agents already avoid those things?
- Does framing tone (terse vs. detailed, formal vs. conversational) affect quality or cost?
- Is there a point where more instructions actively hurt — where the agent spends effort satisfying constraints instead of solving the problem?

## Hypothesis

There is a sweet spot for commission detail. Too little and the agent makes wrong assumptions (X001 attempt 1). Too much and the agent over-fits to satisfying stated requirements rather than solving the underlying problem. We expect the "self-testing mandate" to reliably improve outcomes, and most negative constraints to be unnecessary if the commission is well-scoped.

## What We're Trying to Prove

1. **We can tune commissions empirically.** Rather than guessing what instructions help, we can run controlled comparisons and measure.
2. **Some instructions are load-bearing and some are noise.** Identifying which is which lets us write leaner, more effective commissions.
3. **Agent behavior is sensitive to framing.** Or it isn't — either finding is valuable for how we write future commissions.

## Procedure

1. **Choose a reference task.** A commission complex enough to have meaningful variance in outcomes, but cheap enough to run many times. Ideally something with objectively verifiable output.
2. **Define variants.** Create commission variants that differ in one dimension at a time:
   - With/without self-testing mandate
   - With/without negative constraints
   - Minimal spec vs. detailed spec
   - Terse tone vs. conversational tone
3. **Run each variant.** At least 2-3 runs per variant to account for natural variance.
4. **Capture telemetry.** Cost, duration, turns, success/fail for each run.
5. **Evaluate outputs.** Same validation criteria applied to all variants.

## Validation Criteria

- Did the agent produce a working result? (binary)
- How many turns to completion?
- Did the agent self-test (when not mandated)?
- Did the agent violate any constraints (when not explicitly told not to)?
- Quality of the output (subjective but noted)

## Depends On

- X002 (session launcher — needed to efficiently run and capture multiple sessions)
- A suitable reference task to use across variants

## What This Experiment Is NOT

- Not optimizing for one perfect commission template
- Not testing model differences (hold model constant)
- Not A/B testing at production scale — this is qualitative exploration with some quantitative signal
