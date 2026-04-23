# Retire the legacy two-phase and three-phase planning rigs

## Intent

Delete `two-phase-planning` and `three-phase-planning` rig templates, the `astrolabe.spec-publish` engine that only they use, and the `AstrolabeConfig.generatedWritType` field that only `spec-publish` consumes. No routing semantics change — `brief` remains a valid writ type and `astrolabe.plan-and-ship` remains mapped to it. This is a pure removal of a superseded code path, with no behavioral change for the default patron flow.

## Motivation

`plan-and-ship` is the combined planning+implementation rig that supersedes the older two- and three-phase rigs; it has strictly more capability (it handles the planning phase internally and proceeds directly to implement/review/revise/seal without the intermediate mandate-posting step). The older rigs survive only as alternate routes no guild reaches by default. The codified "prefer removal to deprecation" policy (concluded in `c-mo1yb8nf`) applies: retaining deprecated paths as alternatives carries ongoing cost (maintenance, confusion, divergence) without corresponding value.

`spec-publish` is the planning-phase terminator that posts a new `mandate` writ from within a planning rig. Its only callers are the two rigs being deleted; `plan-and-ship` uses `plan-finalize` as its terminator instead (and `plan-finalize` stays). Similarly, `generatedWritType` exists solely to parameterize `spec-publish`. Removing the rigs, the engine, and the config field together keeps the module tree consistent.

This retirement is a prerequisite for a sibling commission that collapses the `brief` writ type into `mandate` and rekeys `plan-and-ship` onto `mandate`. That rekey would render the two retired rigs infinite-looping (they post a `mandate` which would re-trigger `plan-and-ship`). This commission eliminates that hazard ahead of time; the brief→mandate collapse lands as a separate, cleanly-scoped follow-on.

## Non-negotiable decisions

### The two-phase and three-phase planning rigs are deleted

`two-phase-planning` and `three-phase-planning` rig templates are removed from Astrolabe's kit contributions and from the rig template registry. Any tests exercising them are removed.

Per click `c-mobveygo`.

### The `astrolabe.spec-publish` engine is deleted

`spec-publish` is removed from Astrolabe's engine registry and its implementation source is deleted. It has no callers once the two retired rigs are gone (it does not appear in `plan-and-ship`'s phase list).

Per click `c-mobveygo`.

### The `AstrolabeConfig.generatedWritType` field is removed

The field is deleted from the `AstrolabeConfig` TypeScript type, from the default-resolution code path, and from any schema that validates it. Guild configs that still declare `astrolabe.generatedWritType` must produce no runtime error after this change — the field is simply unread. If the surrounding config schema validates against unknown fields and would otherwise reject it, relax that check or add the field to a tolerated-unknowns list; the mechanism is the implementer's call.

Per click `c-mobveygo`.

### No routing change

`brief` remains a valid writ type, Astrolabe's `rigTemplateMappings` continues to map `brief → astrolabe.plan-and-ship`, and the patron's default commission flow is unchanged. The brief→mandate collapse and the mapping-collision question are explicitly out of scope for this commission.

## Behavioral cases the design depends on

- After this commission, `plan-and-ship` runs to completion against a `brief` writ exactly as it does today; no mandate is posted mid-rig.
- `two-phase-planning`, `three-phase-planning`, and `astrolabe.spec-publish` do not appear in Astrolabe's kit contributions, rig template registry, or engine registry.
- A guild config that declares `astrolabe.generatedWritType` loads without error; the field is unread. Neither a startup error nor a silent-field-drop warning is required — the field is simply gone from the schema's knowledge.
- No currently-registered rig template or engine references `generatedWritType`.
- Any standing orders or tests that previously dispatched to the retired rigs are updated or removed; no broken references remain in the codebase.

## Out of scope

- **Brief → mandate type collapse.** The `brief` writ type is unchanged by this commission. The type-removal and `plan-and-ship` mapping rekey land in a sibling commission that depends on this one.
- **Spider/Astrolabe mapping collision.** Not relevant here — this commission does not change any `rigTemplateMappings` entry.
- **Migration of writs created by the retired rigs.** Mandate writs produced historically by `spec-publish` (in any lifecycle state, including non-terminal) are ordinary mandate writs and continue to function normally.
- **Guild configs that reference the deleted rigs by name.** Configs that explicitly override `rigTemplateMappings` to point at `two-phase-planning` or `three-phase-planning` will break on next guild load. This is a per-guild deployment concern; no framework-side shim is shipped.
- **The `plan-finalize` engine.** It stays. `plan-and-ship` uses it as its planning-phase terminator.

## References

- `c-mobveygo` — this commission's design click
- `c-moaz1sot` — parent design click (the broader brief→mandate collapse; this commission is the first of two)
- `c-mo3ibjl0` — prior click that introduced the combined `plan-and-ship` rig (concluded)
- `c-mo1yb8nf` — codified "prefer removal to deprecation" policy (applied here)