# Observations: kit-contributed-rig-templates-writ

## Refactoring opportunities skipped

1. **Spider's existing blockType scanning doesn't follow the Loom pattern.** The Spider's `start()` scans `g.kits()` but not `g.apparatuses()` for block types. It relies on `plugin:initialized` to catch apparatus supportKits. The Loom explicitly scans both. This inconsistency could be addressed in a separate pass to align all three scanning patterns (blockTypes, rigTemplates, rigTemplateMappings) with the Loom's Phase 1a/1b/2 model. For this commission, only the new registries adopt the Loom pattern; the existing blockType scan is left as-is.

2. **BlockTypeRegistry has no kit interface type.** The Spider's `consumes: ['blockTypes']` has no corresponding `SpiderKit.blockTypes` type for kit authors to check against. This commission adds `SpiderKit` covering only the new contribution types. A follow-up could extend it to include `blockTypes`.

3. **Fabricator has no provenance tracking.** The Fabricator's `EngineRegistry` stores `Map<string, EngineDesign>` with no record of which plugin contributed each design. This commission works around this by building a `designId → pluginId` map in the Spider at startup. A cleaner long-term solution would be adding `getEngineDesignSource(id): string | undefined` to `FabricatorApi`, but that's scope expansion.

4. **resolveWritTypes() re-reads config on every call.** The current `resolveWritTypes()` in the Clerk calls `resolveClerkConfig()` each time it's invoked (which reads `guild().guildConfig().clerk`). This is fine for a small config read, but once kit contributions are merged at startup, the function shifts to reading from an in-memory Set. The config-re-read pattern for builtins + config types could be cached at the same time, but the commission only changes what's needed for kit merging.

## Suboptimal conventions followed for consistency

1. **Warn-and-skip for kit contributions, throw for config.** This dual behavior is established by the Loom and maintained here, but it means a kit author gets weaker feedback than a config author. IDE integration or a `--strict` startup flag could surface warnings as errors in development contexts. Not in scope.

2. **designId source map built by the Spider, not the Fabricator.** The Spider scanning loaded plugins to build a `designId → pluginId` map duplicates work the Fabricator already did. This is the right call for scope containment but is architecturally inelegant.

## Doc/code discrepancies

1. **`docs/architecture/apparatus/spider.md`** describes a static 5-engine pipeline. The code already supports arbitrary rig templates via `spider.rigTemplates` config. The doc was not updated when templates were added. This predates the current commission.

2. **`docs/architecture/apparatus/clerk.md` line ~34** states "The Clerk does not consume kit contributions. No `consumes` declaration." This is currently accurate but will become false after this commission.

## Potential risks in adjacent code

1. **Plugin load order affects kit duplicate warnings.** When two kits contribute the same unqualified writ type name (D15) or the same mapping key (D20), first-registered wins. Registration order depends on the order in `guild.json`'s `plugins` array. This is consistent with how the framework works generally, but operators may not expect plugin ordering to affect writ type resolution. The warning message should make this clear.

2. **Phase 2 (plugin:initialized) timing for mapping validation.** When an apparatus supportKit contributes a mapping that references a template from another apparatus that hasn't started yet, the deferred validation logic from Phase 1 doesn't apply — Phase 2 events arrive individually. The implementer needs to validate Phase 2 contributions against the registry state at the time they arrive, which may miss templates that register later. This is the same inherent limitation the Loom has with late-arriving roles. In practice, apparatus start order is deterministic (topoSort), so the behavior is predictable if not ideal.

3. **Backward compatibility of spider.rigTemplates semantics.** The lookup chain (D21) treats config template keys as both template names and implicit writ-type mappings. This means a config entry like `{ "mandate": {...} }` continues to work for writ type "mandate". But if someone also adds `rigTemplateMappings: { "mandate": "other-template" }`, the mapping takes precedence, which changes existing behavior. This is intentional (mappings override direct lookup) but could surprise operators who don't realize they've shadowed an existing implicit mapping.
