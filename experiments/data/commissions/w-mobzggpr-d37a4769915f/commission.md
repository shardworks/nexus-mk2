# Collapse the 'brief' writ type into 'mandate'

## Intent

Eliminate the `brief` writ type and make `mandate` the sole input type to the combined planning+implementation rig. All commissioning flows through a single type: a patron posts a `mandate`, `astrolabe.plan-and-ship` plans and implements in one rig.

## Motivation

The `brief` and `mandate` types represent the same thing at different degrees of refinement. Historically, `brief` was "patron posts intent, sage refines into a mandate, mandate gets implemented," and `mandate` was "patron posts a detailed spec, implement directly." That model made sense when the planning pipeline produced a discrete refined artifact (the mandate) consumed by a downstream rig. Under the combined `plan-and-ship` rig, the distinction is vestigial — the rig's own primer handles whatever detail level arrives on the input writ, and the downstream `implement` engine reads the spec off `${yields.plan-finalize.spec}` rather than from a published mandate.

The split also creates a routing hazard. A patron choosing between `brief` and `mandate` based on "is this detailed enough to skip planning?" is making a judgment call that gets made wrong in practice, and the consequences are asymmetric: posting as `mandate` when planning would have surfaced problems is a bigger failure than posting as `brief` on an already-detailed spec and eating the planning cost. One type, one rig, no routing judgment.

Design background: the combined rig was introduced under click `c-mo3ibjl0` as a tactical bridge for brief-level dependency gating ahead of the multi-rig refactor; at that point it kept `brief` as the sole writ throughout its flow. This commission finishes the collapse in the opposite direction — `mandate` as the sole writ throughout. The predecessor commission (writ `w-mobvh1t8-2f1573ccbe43`, under click `c-mobveygo`) already retired the legacy two-phase-planning and three-phase-planning rigs, the `spec-publish` engine, and the `generatedWritType` config field; with those out of the way, this commission is scoped to the `brief`-type removal and the routing rekey.

## Non-negotiable decisions

### The `brief` writ type is removed from Astrolabe's kit

Astrolabe's `supportKit.writTypes` drops the `brief` entry. The `piece` entry stays — still load-bearing for mandate decomposition under the piece-based task manifest.

### The combined rig is keyed on `mandate`

Astrolabe's `rigTemplateMappings` changes from `brief: 'astrolabe.plan-and-ship'` to `mandate: 'astrolabe.plan-and-ship'`. This displaces Spider's kit-level `mandate: 'default'` mapping. The implementer resolves the collision so that a guild with Astrolabe loaded runs `plan-and-ship` for mandates and a guild without Astrolabe falls back to Spider's `default` rig template. The mechanism (explicit kit priority, config-level override convention, or Spider dropping its default entirely and letting guild config own the mapping) is the implementer's call, with two constraints: **the winner must be deterministic, not load-order-dependent** and **a guild with Spider installed but not Astrolabe must get the default rig without additional configuration.**

### English "brief" is not what's removed

Sage role instructions, prompts, documentation, and code comments that use the word "brief" in its English sense (the prose the patron wrote; the gist of what someone is asking for) are untouched. Only the typed identifier `brief` as a `WritType` is removed. Standing-order trigger examples that use `"brief"` as a conversation-trigger type in the engine-trigger union are a separate vocabulary and are not touched.

## Out of scope

- **Migration of existing `brief`-type writs.** Terminal `brief` writs (completed, failed, cancelled — the majority) stay as historical records. The Clerk does not revalidate writ type on read, so queries and displays continue to work. Non-terminal `brief` writs (a small number at time of writing) are a per-guild deployment concern; operators either cancel and repost as `mandate`, or patch the `type` field in their stacks database directly. No framework-side migration shim is shipped.
- **Legacy `brief-mra` and `brief-ssr` writ types.** These appear only in terminal-state historical writs and are not registered anywhere in the framework; they need no action.
- **The broader question of which plugin owns writ-type-to-rig mappings.** Spider's kit-level `mandate: 'default'` mapping is an architectural convenience whose ownership might belong in guild config or a dedicated mapping plugin; this commission resolves the specific collision introduced here and does not re-open the general question.
- **Downstream tools that default to posting as `brief`.** Some patron-facing tooling outside this repository (commission-posting scripts, custom agent prompts) may implicitly default to `type: 'brief'` today; those tools will be updated per-deployment after this commission lands.
- **Legacy rig retirement.** Already handled by the predecessor commission `w-mobvh1t8-2f1573ccbe43` (click `c-mobveygo`). `two-phase-planning`, `three-phase-planning`, `astrolabe.spec-publish`, and `AstrolabeConfig.generatedWritType` are presumed already deleted by the time this commission is implemented; nothing in this brief depends on their presence or removal.
- **Observation-lift commission interaction.** The sibling commission under click `c-moaz1pdw` hardcodes the generated writ type as `'brief'`. This commission and that one both land; whichever ships first, the other is updated to match the final state in the dispatch window. No special coordination mechanism (staging, feature flag) is introduced.

## Behavioral cases the design depends on

- After this commission, `clerk.post({ type: 'brief', ... })` fails with the existing `Unknown writ type` error, regardless of guild config.
- In a guild with Astrolabe loaded, `clerk.post({ type: 'mandate', ... })` creates a writ that gets dispatched to `astrolabe.plan-and-ship` on the next Spider tick.
- In a guild without Astrolabe loaded, `clerk.post({ type: 'mandate', ... })` falls back to Spider's `default` rig template (direct-to-implementation).
- `astrolabe.plan-and-ship` runs to completion against a mandate writ and produces an implementation commit via its existing `plan-finalize → implement → review → revise → seal` tail.
- Existing `brief`-type writs in terminal phases remain readable, displayable in Oculus, and queryable via `nsg writ list`.
- The collision-resolution mechanism chosen for `mandate` mapping produces the same winner regardless of kit load order — no nondeterminism across guild boots.

## References

- `c-moaz1sot` — this commission's design click (the parent brief→mandate collapse)
- `c-mobveygo` — predecessor commission: retire the legacy planning rigs (dispatched as `w-mobvh1t8-2f1573ccbe43`)
- `c-moaz1pdw` — sibling commission: Astrolabe structured observations (hardcodes `brief`; updated to `mandate` when this lands)
- `c-mo3ibjl0` — prior click that introduced the combined rig (concluded, `brief` as sole writ)
- `c-mo1yb8nf` — codified policy default: "prefer removal to deprecation"