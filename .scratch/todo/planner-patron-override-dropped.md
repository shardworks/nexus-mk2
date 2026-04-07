# RESOLVED: Plan-Writer Dropped Patron Override (D11)

**Status:** Fixed (2026-04-07)

## What happened

Commission `w-mnnrgbdb-cd836426cbc3` (Configurable Rig Templates) — the plan-writer produced a spec that treated `$role` as a special well-known variable (R3, R7), despite the patron explicitly overriding D11.

## Root cause

The writer received the full `decisions.yaml` with `patron_override` fields, and its instructions already said to follow them. But the override was swimming in analyst reasoning that argued persuasively for the opposite. The writer's attention was pulled by the analyst's rationale rather than the patron's override — an LLM attention/instruction-following failure, not a data plumbing problem.

## Fix applied

Two changes:

1. **Decisions digest** (`decisions-digest.yaml`) — a mechanically-generated flat file that strips analyst reasoning and presents each decision as question → answer. Patron overrides become structurally identical to every other decision, with `justification: "patron specified"`. Generated in `plan-review.ts` before launching the writer.

2. **Decision compliance check** (Step 4 in writer instructions) — after writing the spec, the writer must re-read the digest and verify each decision point-by-point: quote the implementing spec text, check for contradictions/omissions/dilution, and fix before proceeding.

Files changed: `bin/plan-prompts/planner.md`, `bin/plan-review.ts`
