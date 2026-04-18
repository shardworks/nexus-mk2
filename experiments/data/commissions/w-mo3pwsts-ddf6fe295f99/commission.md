# Ship a combined planning+implementation rig for briefs

## Intent

Build a single rig that takes a brief writ all the way from patron ask to sealed implementation — planning and implementation phases executing sequentially on one writ, with no intermediate mandate writ created in the middle. Wire briefs to dispatch on this combined rig instead of the current planning-only rig. This collapses today's `brief → planning rig → mandate → implementation rig` pipeline into `brief → combined rig`, making the brief the sole obligation record from post to seal.

The combined rig is a new design — not a splice of the existing two-phase-planning and default implementation templates. Engines may be new, or existing engines may be reused or parameterized, as the design dictates. The shape of the rig's internal data flow between its planning and implementation phases is the design work.

## Motivation

Patrons want to express dependencies between briefs — "don't start brief B until brief A lands." The Spider dependency-gating substrate (blocked_by link resolution) operates on writ lifecycle: a blocker is cleared when its writ completes. Today, a brief's writ completes when its *planning* rig seals — but planning finishing isn't what the patron means by "A lands." The patron means the feature shipped, which is a *different* writ (the generated mandate) completing much later.

The current brief → mandate split is a 1:1 writ:rig artifact — it fragments one obligation across two writs because today each writ can only host one rig. That fragmentation breaks dependency-gating semantics for briefs. A proper fix is the multi-rig refactor (see `c-mo1mqeti`), where one writ hosts multiple rigs sequentially. That's a substantial piece of work.

This commission is the **tactical bridge** — it restores correct brief-level dependency-gating today by keeping everything on the brief writ through both phases, without waiting on multi-rig. When multi-rig lands, the combined rig converts cleanly: its phases become distinct rigs on the same writ, the data-flow between them formalizes into typed workspace artifacts, but the writ-level shape Coco is buying here is already correct.

## Non-negotiable decisions

### One writ throughout — no phantom mandate

The combined rig must not create a mandate writ at any point. The brief is the sole writ that exists for the lifecycle of this work. Implementation phases operate on the brief. The planning phases produce a spec that is consumed by the implementation phases via the rig's own data-flow surface (yields, or by reading the plandoc from Astrolabe's plans book — implementer's call). No `clerk.post` of a mandate-type writ anywhere in the combined rig.

Rationale: the whole point of the bridge is one-writ dependency-gating. A phantom mandate defeats it and also re-introduces the double-dispatch hazard if the mandate→default mapping fires on the generated writ. See `c-mo3ibjl0` (this click) and `c-mo3nwx31` (composition-primitive reframe — writ-spawning rejected for these reasons).

### Combined rig is registered by Astrolabe

The new rig template is registered in Astrolabe's supportKit — the plugin that owns the planning engines owns the combined template. Guild-level configuration does not carry an inline template definition for it.

### Astrolabe's plugin-level default mapping for `brief` switches to the combined rig

Astrolabe's supportKit currently declares `rigTemplateMappings: { brief: 'astrolabe.two-phase-planning' }` as a plugin-level default. This commission changes that default to point at the new combined rig template.

The design principle: plugin-level default mappings are the authoritative source of "install the plugin, get working behavior." A guild that simply installs Astrolabe and posts a brief writ gets the combined rig dispatched automatically, with zero extra guild.json configuration. Guilds that want different behavior can override the mapping in guild.json, but that override is customization — not the baseline dispatch declaration.

No change to any guild's configuration is required for the brief path. Any guild running a build of Astrolabe with the updated default — including guilds that have no `astrolabe.rigTemplateMappings` override — picks up the combined rig automatically.

### Mandate dispatch path moves to Spider as a plugin-level default

Spider owns all of the engines referenced by the current `default` rig template (`draft`, `implement`, `review`, `revise`, `seal`). Under the "plugin defaults are load-bearing" principle, the `default` rig template itself and the `mandate → default` mapping both move into Spider's supportKit as plugin-level defaults.

Concretely:

- Spider's supportKit gains `rigTemplates: { default: { … } }` (the current template definition, relocated from guild.json).
- Spider's supportKit gains `rigTemplateMappings: { mandate: 'default' }` (the current mapping, relocated from guild.json).
- The corresponding `spider.rigTemplates` and `spider.rigTemplateMappings` entries are removed from guild.json — redundant once the plugin defaults exist.
- Guild-level `spider.variables`, `spider.buildCommand`, `spider.testCommand`, `spider.role`, and `spider.maxConcurrentEngines` stay in guild.json — these are per-guild values, not dispatch-shape decisions.

After this change, a fresh guild that installs Spider and defines the relevant variables gets a working mandate dispatch path with no template or mapping declarations in guild.json. An operator who wants a non-default mandate rig can still override in guild.json as customization.

### The implementation-phase variable-substitution contract

The relocated default rig template references `${vars.role}`, `${vars.buildCommand}`, and `${vars.testCommand}`. Those references must continue to resolve against guild-level `spider.variables` at dispatch time exactly as they do today. Whether the plugin-level template supplies fallback defaults for missing variables (e.g., `"role": "${vars.role ?? 'artificer'}"` or equivalent) is implementer's call — the non-negotiable is that guilds already setting these variables see no behavior change.

### Old planning-only rig stays registered

The existing `astrolabe.two-phase-planning` and `astrolabe.three-phase-planning` rig templates remain registered (they just stop being the default brief mapping). A guild operator can still reach for them explicitly if they want planning-only for some reason. Deleting them is out of scope for this commission and premature — the multi-rig refactor will reshape this whole area.

## Scenarios to verify

- **Happy path:** a brief is posted, the combined rig runs end-to-end, the brief writ reaches `completed` when the final seal engine succeeds. No mandate writ exists at any point in the trace.
- **Dependency gating:** two briefs linked with `blocked_by` on the brief-type writs. The second brief's rig does not dispatch until the first brief's writ is fully `completed` (not just when the first brief's planning phases finish).
- **Mandate direct-post still works:** a mandate posted directly (not via brief refinement) dispatches against the default rig. Functionally unchanged from today — the template and mapping now come from Spider's plugin defaults rather than guild.json, but a patron posting a mandate sees the same behavior.
- **Zero-config mandate dispatch:** a guild installing Spider with no `spider.rigTemplates` or `spider.rigTemplateMappings` entries in its guild.json (but with `spider.variables` configured) gets working mandate dispatch. Not a regression check against today's guild — a forward check that the plugin-default path works.
- **Three-phase rig still reachable:** an operator who explicitly maps a brief (or any writ type) to `astrolabe.three-phase-planning` gets the planning-only three-phase flow. Registration is preserved even though the default brief mapping changes.

## Out of scope

- **Multi-rig refactor.** This commission does not change the writ:rig cardinality invariant or introduce rig-sequence-on-writ. See `c-mo1mqeti` and children — separate body of work.
- **Typed workspace artifact contracts.** The spec flows from planning to implementation phases via the rig's existing yield surface or by reading the plandoc — not through new consumes/produces declarations on engine designs. See `c-mo1mqfgb` and `c-mo3ibesb` — separate design conversation.
- **Retiring the mandate writ type.** Mandates stay a valid writ type with a valid dispatch path. The combined rig is additive, not substitutive.
- **Retiring or modifying the `refines` link type.** Since no mandate is created in the combined rig, no `refines` link is created either — but the link type itself remains in use for any legacy mandate writs already in the system and for any direct-post scenarios we haven't anticipated.
- **Migration of in-flight briefs.** Any brief already mid-planning when this lands finishes under the old contract (its planning rig completes, generates a mandate, mandate triggers default). This commission only changes dispatch for *new* briefs. No migration script, no backfill.
- **Changes to the planning engines' internal prompts beyond what the combined rig needs.** If the implementation-phase engines need to receive the spec through a different given than they do today, that's in scope. If the planning-phase engines need a prompt tweak because they're no longer producing a mandate, that's in scope. Unrelated prompt quality work is not.

## References

- **`c-mo3ibjl0`** — the tactical-bridge click (parent). Captures the decision to ship the bridge rather than wait for multi-rig.
- **`c-mo1mqdk0`** — load-bearing `blocked_by` links as scheduler prerequisites. The capability this bridge unlocks for briefs.
- **`c-mo3nwx31`** — concluded: composition primitive is rig-sequence-on-writ plus typed workspace artifacts, not rig-template inclusion. Explains why the combined rig is a new, coherent design rather than a splice.
- **`c-mo1mqeti`** — multi-rig refactor root. The strategic destination this bridge is a down-payment on.
- **`c-mo1mqg3j`** — brief→mandate collapse under multi-rig. The eventual shape this commission pre-figures at the writ level without yet changing the rig/workspace layers.