# Observations — configurable-rig-templates-via-guild

## Doc/code discrepancies

1. **`docs/guides/building-engines.md` describes the wrong engine concept.** This guide documents Clockworks standing-order engines (event handlers with `nexus-engine.json`), which are completely separate from the Fabricator's `EngineDesign` interface used by the Spider. Both are called "engines" but they are distinct systems. There is no guide for building Fabricator engine designs. This will become more confusing as configurable rig templates invite operators to think about custom engine designs.

2. **Spider doc describes rig completion logic inaccurately.** `docs/architecture/apparatus/spider.md` (line ~92) says "if the completed engine is the terminal engine (seal), mark the rig completed." The actual code marks the rig completed when ALL engines have `status === 'completed'` (`allCompleted` check at spider.ts line 200/279). These are equivalent for the static 5-engine pipeline but not for custom templates. The doc should be updated to match the code.

3. **CDC handler resolution format.** The spider doc implies a formatted resolution string; the actual code passes `JSON.stringify(sealEngine.yields)` — raw serialized yields. Minor but worth aligning.

4. **Spider doc "Future Evolution" conflates two features.** Line 627 says givensSpec "will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from **upstream yields**." The current brief resolves variables from **writ data and config at spawn time**, not from upstream yields at run time. The upstream-yields expression system is a different, more complex future feature. These should not be conflated in documentation.

## Refactoring opportunities skipped

5. **`buildStaticEngines` has a baked-in `role: 'reviewer'` literal for the review engine.** This review-engine-specific detail is embedded in the Spider's core spawning logic. With templates, operators can express this directly in config. We're keeping `buildStaticEngines` as-is for backwards compatibility. A future commission could remove it once templates are the primary path.

6. **SpiderConfig's flat role/buildCommand/testCommand fields exist solely for `buildStaticEngines`.** Once templates replace the hardcoded pipeline, these fields become redundant — they're only needed as `$role` and `$spider.*` resolution sources. A future migration could consolidate or deprecate them, but that's a breaking config change.

7. **The `$spider.<key>` mechanism only accesses spider config.** The brief says "arbitrary Spider/guild config values" which could be interpreted as wanting access to other guild config sections too (e.g. `$clerk.defaultType`). The current design limits to `$spider.<key>` as the minimal interpretation. If cross-section access is needed later, a `$config.<section>.<key>` syntax could be added without breaking the existing `$spider.<key>` prefix.

## Potential risks

8. **Startup validation timing for third-party apparatus engines.** The Spider validates templates at `start()` against Fabricator + its own engine IDs. If a third-party apparatus contributes engine designs AND starts after Spider, those designs won't be in the Fabricator at validation time. This means referencing engine designs from apparatus not in Spider's `requires` chain will fail validation. Acceptable for the stop-gap feature — operators must ensure the contributing apparatus starts before Spider (by adding it to Spider's dependency chain or having it be a kit, not an apparatus).

9. **No runtime re-validation after config changes.** `spiderConfig` is read once at `start()` and captured in a closure. If an operator edits guild.json while the guild is running, the Spider won't pick up template changes until restart. This is the existing behavior for all config fields — consistent but worth noting since template config is more complex than simple scalar fields.

10. **RigDoc.resolutionEngineId is a new optional field on stored documents.** Pre-existing rigs (created before this feature) won't have it. The CDC handler fallback chain (resolutionEngineId → id='seal' → last completed engine) handles this gracefully. No migration needed, but operators should be aware that in-flight rigs at upgrade time will use the seal/last-completed fallback rather than the new resolution logic.
