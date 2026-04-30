---
status: ready
---

# X003 — Commission Prompt Tuning

## Research Question

How do pre-commission instructions (system-level framing, behavioral mandates, constraints) affect agent performance on identical tasks?

Specifically:
- Does mandating self-testing improve outcomes, or does it waste turns on testing things that already work?
- Do explicit negative constraints ("do not do X") change behavior, or do agents already avoid those things?
- Does framing tone (terse vs. detailed, formal vs. conversational) affect quality or cost?
- Is there a point where more instructions actively hurt — where the agent spends effort satisfying constraints instead of solving the problem?
- Do validation checklists (explicit verification steps at the end of a spec) reduce `incomplete` outcomes?
- Does **rule rationale** ("we do X *because* Y") affect rule adherence, or is it decorative — costing tokens on every load without changing how the rule is applied?

## Hypothesis

There is a sweet spot for commission detail. Too little and the agent makes wrong assumptions (X001 attempt 1). Too much and the agent over-fits to satisfying stated requirements rather than solving the underlying problem. We expect the "self-testing mandate" to reliably improve outcomes, and most negative constraints to be unnecessary if the commission is well-scoped.

We also expect that **validation checklists** — explicit "before you finish, verify X, Y, Z" steps appended to specs — will reduce `incomplete` outcomes disproportionately. The Spider rename (w-mnivi5fq) is the motivating case: flawless source code rename, but 12 residual references in the spec doc. A one-line checklist item ("run `grep -ri walker` across all touched files") would have caught it. The hypothesis is that agents are good at doing work but bad at self-auditing, and a checklist compensates for that specific gap.

### H — Rule Rationale Is Mostly Decorative

Pre-commission instructions that include rationale ("we do X *because* Y") perform no better on rule adherence than the same rules stated plainly ("do X"), provided the rationale doesn't constrain the rule's application. The distinction:

- **Functional rationale** (keep) — "because" clauses that scope, condition, or shape *how* the rule applies. Example: *"Inline a type signature so the implementer knows the API surface"* — the "so..." clause defines *what kind* of signature to inline.
- **Decorative rationale** (drop) — "because" clauses that explain *why* the rule exists, with no effect on application. Example: *"Inline a type signature because pure-read context bloat is a major cost driver"* — the "because..." doesn't change application; the rule "inline a type signature" is identical with or without it.

**Motivating case (Apr 29, 2026):** the X010 H5 inventory-excerpting work produced a first draft of sage-primer + sage-writer rule edits with both kinds of rationale woven in (metric framing like "~half of context spend," macro-rationale like "this section exists because pure-read context bloat is a major cost driver"). Sean's intuition: *"feels weird to explain why we do something instead of just giving the agent the instructions."* The instructions were trimmed to remove decorative rationale while keeping functional rationale and the dividing-line examples. The trimmed prompts are the natural "without rationale" arm for a comparison test.

**Variant axis for the procedure** (slots into Step 2 of Procedure below):

- **With rationale:** sage prompts that include both functional and decorative "because" clauses (the pre-trim form).
- **Without rationale:** sage prompts that keep only functional "because" clauses + bounds + dividing-line examples (the post-trim form).

**Measurement:** run identical commissions through both prompt variants. Compare on:

- Rule-adherence proxy: pure-read share in the resulting briefs (X011's read-utilization instrument).
- Brief size in tokens (planning-stage cost).
- Implementer cost on the dispatched commission.

**Thresholds:**

- **Confirmed (decorative rationale is mostly noise):** trimmed prompts produce briefs with comparable pure-read share (within ±3 percentage points) and lower brief size. Generalizes: strip decorative rationale across the agent prompt corpus.
- **Refuted (rationale is load-bearing):** trimmed prompts show meaningfully degraded pure-read share — agents needed the why to apply the rule consistently. Restore the rationale and look for *which* rationale carried the weight.
- **Surprising:** trimmed prompts produce *better* pure-read share — suggests rationale was actively distracting from the rule. Strong signal to audit prompts more aggressively.

**Why this hypothesis matters beyond inventory excerpting:** the principle ("strip rationale unless it changes application") is a candidate prompt-design rule that could apply across all sage and animator instruction artifacts. If confirmed, the immediate downstream is a sweep through `packages/plugins/*/sage-*.md`, `packages/plugins/animator/*.md`, and `.claude/agents/*.md` to find and remove decorative rationale.

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
   - With/without validation checklist (explicit verification steps before delivery)
   - With/without decorative rationale (rule + functional "because" only vs. rule + functional "because" + decorative "because"). The Apr 29 sage-prompt trim provides a ready-made variant pair; see the rule-rationale hypothesis above.
3. **Run each variant.** At least 2-3 runs per variant to account for natural variance.
4. **Capture telemetry.** Cost, duration, turns, success/fail for each run.
5. **Evaluate outputs.** Same validation criteria applied to all variants.

## Validation Criteria

- Did the agent produce a working result? (binary)
- How many turns to completion?
- Did the agent self-test (when not mandated)?
- Did the agent violate any constraints (when not explicitly told not to)?
- Quality of the output (subjective but noted)
- For checklist variant: did the agent execute each checklist item? Did executing them surface issues the agent would have missed otherwise?

## Depends On

- Commission dispatch infrastructure (session launcher, transcript capture)
- A suitable reference task to use across variants
- Reliable quality scoring instrument — X013's quality scorer needs to be proven out and its ceiling effect addressed before it can serve as the measurement tool for prompt tuning variants. Without a reliable quality signal, we can't distinguish variant effects from instrument noise.

## Observations

### Validation Checklists — Prior Evidence

Two commissions provide natural-experiment data on the checklist question:

- **w-mnivi5fq (Spider rename, complexity 3, strong spec):** Spec included a validation checklist ("verify zero residual walker references"). Agent executed the source rename flawlessly but did not run the checklist against the spec doc — 12 residual references in `spider.md`. The checklist *existed* but the agent didn't treat it as a blocking verification step. This suggests the question isn't just "does a checklist help?" but "how must a checklist be framed to ensure the agent actually executes it?"

- **w-mnhl7kt9 (Normalize IDs fixup, complexity 2, strong spec):** First commission using exhaustive spec style. Clean first-try success. The spec was essentially one big checklist — file-by-file instructions with explicit expected outcomes. Supports the hypothesis that exhaustive verification improves outcomes, but confounds checklist effect with spec detail level (see X014).

### Instrument Readiness

X013's quality scorer currently saturates at 3.00 on clean commissions (code_structure and codebase_consistency show zero variance). Until the ceiling effect is addressed — either by expanding the scale or refining the rubric — the scorer cannot reliably distinguish "good" from "good with checklist" on well-executed commissions. The checklist variant's value is specifically in catching *incomplete* outcomes, so the binary outcome signal (success vs. partial/incomplete) may be sufficient even without a refined quality scorer. But for the other prompt tuning dimensions (tone, constraints, detail level), quality score discrimination is essential.

## What This Experiment Is NOT

- Not optimizing for one perfect commission template
- Not testing model differences (hold model constant)
- Not A/B testing at production scale — this is qualitative exploration with some quantitative signal
