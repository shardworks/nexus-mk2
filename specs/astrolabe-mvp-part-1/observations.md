# Observations: astrolabe-mvp-part-1

## Missing Spider Prerequisite: Inline String Interpolation

The architecture spec (astrolabe.md line 6) lists three prerequisites:
1. `anima-session` built-in engine ✅ (landed)
2. `QuestionSpec.details` field ✅ (landed)
3. **Givens inline string interpolation** ❌ (NOT landed)

The Spider currently resolves only whole-value yield references (`$yields.engineId.prop` as the entire string value). It cannot embed yield values inline within a longer string (e.g. `"Read plan ${yields.plan-init.planId}"`).

This means the architecture spec's intended prompt wiring — where `${yields.plan-init.planId}` is interpolated inside a prompt string — cannot work as designed. The workaround adopted (D36/D43) is for plan-init to yield composed prompt strings with the planId baked in. This is clean for MVP but should be revisited when inline interpolation lands.

**Actionable:** A future commission should implement givens inline string interpolation in the Spider's `resolveYieldRefs()` and `resolveGivens()` functions, then update the Astrolabe's rig template to use it.

## Package Naming Inconsistency

All existing apparatus packages use the `-apparatus` suffix:
- `@shardworks/clerk-apparatus`
- `@shardworks/spider-apparatus`
- `@shardworks/fabricator-apparatus`
- `@shardworks/loom-apparatus`
- `@shardworks/animator-apparatus`
- `@shardworks/stacks-apparatus`

The architecture spec declares `Package: @shardworks/astrolabe` (no suffix). This works correctly with the plugin ID derivation rules (both `@shardworks/astrolabe` and `@shardworks/astrolabe-apparatus` produce plugin ID `astrolabe`). However, the naming inconsistency may confuse contributors who expect the `-apparatus` suffix pattern.

**Actionable:** Consider standardizing package naming conventions. Either adopt bare names for all new apparatus going forward, or document the convention explicitly.

## Loom in requires May Be Unnecessary

The Loom is listed in `requires: [clerk, stacks, spider, loom, fabricator]` but the Astrolabe apparatus never calls `guild().apparatus<LoomApi>('loom')` during `start()` or at any point. The role contribution goes through `supportKit.roles`, which the Loom reads via `ctx.kits('roles')` during its own `start()`. This mechanism works regardless of start ordering — the Wire phase snapshot is available before any `start()` runs.

Including `loom` in `requires` forces a start ordering dependency that isn't structurally needed. It does, however, serve as validation that the Loom is installed — without it, the `astrolabe.sage` role contribution would silently do nothing.

**Actionable:** No change for this commission (follow the spec), but worth noting for the architecture spec maintainers that `recommends` might be more accurate here.

## Engine Keys in supportKit.engines vs EngineDesign.id

The Fabricator's `EngineRegistry.registerFromKit()` iterates `Object.values()` of the engines record and uses the `value.id` field — the object key is ignored. The inventory suggested using keys like `'plan-init'` with `value.id = 'astrolabe.plan-init'`. While this works, it creates a confusing mismatch between the key and the id. Using the full qualified name as both key and id (e.g. `'astrolabe.plan-init': planInitEngine` where `planInitEngine.id === 'astrolabe.plan-init'`) is clearer.

However, the Spider's convention is `'anima-session': animaSessionEngine` where `animaSessionEngine.id === 'anima-session'` — key matches id. Following this convention, the astrolabe should use keys matching the engine design's id: `'astrolabe.plan-init': planInitEngine`.

**Actionable:** No change to the decision — already recommend using the full qualified name as the supportKit engines key to match the id.

## AstrolabeApi Future Extension

The `provides` field is set to an empty object for MVP. When the Astrolabe needs to expose programmatic access to plans (e.g. for a future dashboard apparatus or external integration), the AstrolabeApi interface can grow. The empty-object placeholder prevents other plugins from calling `guild().apparatus<AstrolabeApi>('astrolabe')` and getting a useful sentinel error. In practice this is fine — no plugin should be calling into the astrolabe's API for MVP.

**Actionable:** When a consumer needs programmatic plan access, add methods to AstrolabeApi matching the tool semantics (show, list, patch).

## Tool Closure vs Engine guild() Access Pattern Split

Decision D48 says tools use the closure variable, D50 says engines use `guild().apparatus('stacks').book()`. This creates two access patterns for the same data within one plugin. The split is justified (Spider does the same), but it means the plans book handle used by tools and engines is a different object instance. This is safe — Stacks book handles are stateless wrappers — but worth being aware of for debugging.

**Actionable:** No change needed. Just awareness for implementers that tools and engines use different book handle instances.
