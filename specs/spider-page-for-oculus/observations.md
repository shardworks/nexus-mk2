# Observations — Spider Page for Oculus

## Refactoring opportunities skipped

1. **Fabricator lacks `listDesigns()` API.** The `EngineRegistry` in `packages/plugins/fabricator/src/fabricator.ts` stores designs in a private `Map<string, EngineDesign>` with no public enumeration method. Adding `listDesigns()` to `FabricatorApi` (and tracking contributing plugin provenance) would be the proper solution, but was excluded to keep this commission's scope to the spider package. The spider's custom route works around this by scanning guild kits/apparatuses directly.

2. **Spider `BlockTypeRegistry` lacks public list method and provenance tracking.** Same pattern — the registry stores block types by ID with no list API and no record of which plugin contributed each. A `listBlockTypes()` on `SpiderApi` returning `{ id, pluginId, pollIntervalMs }[]` would be the clean API. The workaround (guild scanning) is identical to the engine design case.

3. **`isEngineDesign` and `isBlockType` type guards are private.** These duck-type checks exist in `packages/plugins/fabricator/src/fabricator.ts` and `packages/plugins/spider/src/spider.ts` respectively, but are not exported. The spider page route handler will need to replicate them. If more consumers need these guards, they should be exported from their respective packages.

## Suboptimal conventions followed for consistency

4. **Static assets in `src/` directory for a page contribution.** Ideally static assets would have a dedicated location in the build pipeline. The oculus page-serving mechanism resolves via `node_modules/{package}/{dir}`, which in workspace mode symlinks to the package source. The `src/static` convention works but means published packages need `src/static` in their `files` array — mixing source and dist concerns.

5. **No framework for page contributions.** The Oculus provides a raw static-file serving mechanism with chrome injection. There's no shared component library, no templating engine, no state management. Each page contribution reinvents DOM manipulation in vanilla JS. This is fine for the first page but will become painful if more complex pages are added.

## Doc/code discrepancies

6. **Spider architecture doc (`docs/architecture/apparatus/spider.md`) is significantly stale.** It describes the old static pipeline (`spawnStaticRig()` function), a subset of `CrawlResult` variants (missing `engine-blocked`, `engine-unblocked`, `rig-blocked`), and a `SpiderApi` missing `resume()`, `getBlockType()`, and `RigFilters`. The `consumes: ['blockTypes']` declaration is also absent from the doc. Not blocking for this commission, but the doc is misleading for anyone referencing it.

## Potential bugs or risks

7. **Forward reference to non-existent clerk page.** The writ links in the rig list will point to `/pages/clerk/?writ={writId}`, which 404s until a clerk Oculus page is built. This is a known degradation, not a bug, but operators clicking the link will see a 404. Consider adding a tooltip or visual indicator when the clerk page is not present.

8. **Guild scanning for engine designs may miss late-registered designs.** The custom API route handler scans `guild().kits()` and `guild().apparatuses()` at request time. In theory, all plugins are loaded by the time the Oculus starts serving. But if `plugin:initialized` events fire after the route handler scans, there could be a transient window where not all designs are visible. In practice this shouldn't happen because the Oculus starts after all other apparatus (it depends on 'tools').
