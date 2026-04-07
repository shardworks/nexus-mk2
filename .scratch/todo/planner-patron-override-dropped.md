# Investigate: Plan-Writer Dropped Patron Override (D11)

## What happened

Commission `w-mnnrgbdb-cd836426cbc3` (Configurable Rig Templates) — the plan-writer produced a spec that treated `$role` as a special well-known variable (R3, R7), despite the patron explicitly overriding D11:

> **D11 patron_override:** "Disregard brief directive here -- there is no special '$role' variable. Defaulting behavior is a property of the engine and not the spider."

The analyst recommended Option A (`$role` as a well-known reference with default logic). The patron overrode with a `custom` selection and clear prose rejecting the special variable entirely. The plan-writer ignored the override and wrote the spec as if Option A was selected.

## Artifacts to examine

- **Decisions file:** `/workspace/nexus-mk2/specs/configurable-rig-templates-via-guild/decisions.yaml` — D11, `selected: custom`, `patron_override` field
- **Generated spec:** `/workspace/nexus-mk2/specs/configurable-rig-templates-via-guild/spec.md` — R3 and R7 both include `$role`
- **Plan-writer transcripts:** `/workspace/nexus-mk2/specs/configurable-rig-templates-via-guild/planner-transcripts/`

## Questions to answer

1. Did the plan-writer receive the `patron_override` field in its input? (Check the writer prompt/context assembly.)
2. If it received it, did it misinterpret `selected: custom` + `patron_override`? (Maybe it only looks at `selected: a/b` and ignores overrides.)
3. Is this a systemic issue — are other `patron_override` fields being dropped too, or is this a one-off?
4. What's the fix? Does the writer prompt need explicit instructions about patron overrides, or is the override field not being passed through at all?

## Impact

This is the first known case of a patron override being dropped. Stakes were marked "high" by the analyst. The resulting implementation is functional but architecturally wrong per the patron's intent — `$role` special-casing bakes engine-specific defaulting into the Spider's generic variable system.
