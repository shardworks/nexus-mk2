# Observations — Patron Input Block Type Commission

## Refactoring opportunities skipped

1. **writ-status.ts uses `find()` for primary key lookup.** The checker calls `writsBook.find({ where: [['id', '=', writId]], limit: 1 })` when `writsBook.get(writId)` would be simpler and more efficient. The new patron-input checker should use `get()`, but updating writ-status.ts is out of scope.

2. **Spider test file size.** `spider.test.ts` is ~4300 lines. Adding patron-input tests there would push it further. The decision to use a separate test file (D40) mitigates this for the commission, but the existing file would benefit from being split into multiple test files by feature area (crawl lifecycle, blocking, tools, templates, CDC).

3. **No SpiderApi surface for input requests.** The CLI tools access the input-requests book directly via Stacks. If future consumers (e.g., Coco integration) need programmatic access to input request lifecycle operations, a SpiderApi extension with methods like `listInputRequests()`, `answerQuestion()`, `completeRequest()` would be more appropriate. Skipped because the brief explicitly excludes Coco integration and there's no current need.

## Suboptimal conventions followed for consistency

4. **Checker uses `guild().apparatus<StacksApi>('stacks')` per call.** Every block type checker resolves the Stacks apparatus on every poll. This works but means repeated singleton lookups every 10 seconds. Followed for consistency with `writ-status.ts`.

5. **CLI tools also resolve Stacks per call.** Same pattern — `guild().apparatus<StacksApi>('stacks').book(...)` inside each handler. There's no mechanism to inject book handles into tool handlers; they all use the guild singleton.

## Doc/code discrepancies

6. **Brief says "ULID format" but system uses `generateId()`.** The codebase's ID generation function (`generateId()` in `@shardworks/nexus-core/src/id.ts`) produces `{prefix}-{base36_timestamp}-{hex_random}`, not ULIDs. The IDs are time-sortable but use a different encoding. The brief's reference to "ULID format" appears to be a loose description of the sortable-ID convention. Implementation should use `generateId()` with no changes to the ID infrastructure.

7. **Spider architecture doc (`docs/architecture/apparatus/spider.md`) is significantly out of date.** The doc describes only the MVP static 5-engine pipeline. Missing from the doc: block types, block records, `priorBlock` context, `checkBlocked` crawl phase, `rig-blocked` status, rig templates, `consumes: ['blockTypes']`, and now patron-input. This commission will not update the doc (not in scope), but the gap is growing.

8. **`docs/guides/building-engines.md` describes legacy architecture.** References `engine()` factory, `nexus-engine.json` descriptors, and standing orders — none of which exist in the current codebase. Current engines use `EngineDesign` from `@shardworks/fabricator-apparatus`.

9. **`docs/architecture/kit-components.md` references wrong package for `tool()`.** Says `@shardworks/nexus-core`; actual code uses `@shardworks/tools-apparatus`.

## Potential risks

10. **Choice answer validation and JSON serialization.** `ChoiceAnswer` is `{ selected: string } | { custom: string }`. When serialized to JSON and deserialized (Stacks round-trip), the discriminated union loses its TypeScript narrowing — the runtime value is just an object with one key. Validation logic must check for the presence of `selected` vs `custom` keys, not rely on TypeScript type narrowing. This is fine but worth flagging for the implementer.

11. **Answer overwrite timing.** An answer can be overwritten while the request is pending (D29). If the patron is answering questions in parallel CLI sessions (unlikely but possible), there's a TOCTOU window where one answer could overwrite another for the same question. The Stacks `patch()` is atomic per call, but two concurrent `patch()` calls for different questions could step on each other's `answers` field since patch merges top-level fields — and `answers` is a nested Record. This is mitigated by the single-patron design (brief excludes multi-patron), but worth noting.

12. **No `yaml` dependency exists today.** The spider-apparatus package.json does not currently depend on a YAML library. If S5 (YAML export/import) is included, the `yaml` npm package must be added to `packages/plugins/spider/package.json` dependencies. This is a new external dependency for the spider package.
