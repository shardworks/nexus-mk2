# Aware Mode Consistently Dinges codebase_consistency vs Blind

**Tracking for:** X013

## Observation

The aware scorer is consistently rating `codebase_consistency` lower than the blind scorer. Two data points so far:

- **w-mnhy86ga (Fabricator implementation):** blind=3, aware=2. Aware flagged eager singleton and split scanning pattern.
- **w-mni0ugjx (Fabricator tests):** blind=3, aware=2. Aware noted it "couldn't see sibling test files for direct comparison" and hedged.

## Hypothesis

The blind scorer actually gets *better* convention context — it receives sibling files directly via the convention-reference feature in the quality-review script. The aware scorer seems to get distracted by the spec and forgets to judge conventions on their own merits. It may be anchoring on spec language ("follow the Instrumentarium pattern", "follow sibling conventions") and then penalizing when it can't independently verify the match, even though the code does match.

## Action

Keep collecting data points. If the pattern holds across more commissions, consider:
- Adding sibling context files to the aware prompt too (currently only blind gets them?)
- Adjusting the aware prompt to separate spec-compliance from convention-compliance more explicitly
- Documenting this as an X013 finding about scorer mode differences
