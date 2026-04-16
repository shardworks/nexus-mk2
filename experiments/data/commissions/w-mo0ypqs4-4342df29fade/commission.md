# v1: Astrolabe Output Format — Intent Briefs and Task Manifests

## Summary

Change the Astrolabe planner to produce two artifacts — an **implementation brief** (intent-focused decision-closure document) and a **task manifest** (GSD-style XML decomposition into atomic tasks) — instead of the current prescriptive spec format that includes full code implementations, exhaustive file lists, and detailed test case descriptions.

This is the highest-leverage change in the decision-centric planner redesign: the format itself prevents over-prescription, and it requires no changes to the Spider, rig machinery, or implement engine. The anima receives the task manifest as a checklist within a single session.

## Context

The current Astrolabe planner conflates decision closure (resolving what to build) with implementation prediction (guessing how to build it). This produces specs that are 500-800 lines of prescriptive implementation detail. Symptoms documented in the commission log:

- **w-mny1zoc9**: 764-line spec with a file-by-file rename table. The table missed the spider zombie reaper as a consumer, because the anima trusted the planner's enumeration instead of doing its own audit. An intent brief would have named the concern ("every consumer of cancelMetadata — grep the monorepo") rather than enumerating files.
- **w-mnolvtcc**: 581-line spec where the anima was "essentially transcription." The planner wrote the code; the anima typed it in.

See quest w-mo0v636y for the full design rationale, validated examples, and the two-artifact model.

## What changes

### Astrolabe sage instructions

Update the planner's role instructions to produce:

1. **Implementation Brief** (~80 lines for a complexity-5 commission):
   - Intent and rationale (what and why, not how)
   - Scope and blast radius (name concerns and verification methods, not exhaustive file lists)
   - Decision table (every non-obvious decision, tiered 1-4, with default and rationale)
   - Acceptance signal (outcome-level, not implementation-level)
   - Existing patterns to follow
   - Explicit scope exclusions

2. **Task Manifest** (XML, ~5-8 tasks per commission):
   ```xml
   <task id="t1" type="implement">
     <name>Short name</name>
     <files>declared file footprint (advisory, not constraint)</files>
     <action>Intent-level instructions</action>
     <verify>Executable verification command</verify>
     <done>Observable outcome criteria</done>
   </task>
   ```

### Astrolabe rig template

Update the spec-writer stage to emit the two artifacts in the expected format. The MRA (merged reader/analyst) and decision analysis stages may need prompt adjustments to feed the new output shape.

### Implement engine prompt

Update the implement session prompt to understand the task manifest format — treat it as an ordered checklist, work through tasks sequentially, run verify after each task.

## What does NOT change

- Spider rig machinery (no task-loop engine yet — that's v2)
- Writ structure (no child task writs yet — that's v2)
- Review engine (still reviews the mandate's output as a whole)
- Commission posting workflow

## Constraints

- The new format must work with the existing single-session implement engine
- The task manifest must be parseable by the implement anima without special tooling
- Decision tiers 1-3 are recorded but not surfaced; Tier 4 uses the existing patron-input mechanism
- `pnpm -w lint && pnpm -w test` must pass

## Exit criteria

- Astrolabe produces implementation briefs + task manifests for new commissions
- No prescriptive code blocks appear in planner output (the planner may reference existing code patterns but must not write new implementation code)
- The implement anima successfully executes commissions from the new format
- At least one commission dispatched end-to-end with the new format as validation

## References

- Quest: w-mo0v636y (decision-centric planner — full design rationale)
- Example: .scratch/intent-brief-example-mny1zoc9.md (intent brief vs prescriptive spec)
- Example: .scratch/task-manifest-example-mny1zoc9.md (task manifest for same commission)