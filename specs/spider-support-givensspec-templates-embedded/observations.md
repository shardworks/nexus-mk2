# Observations

## Refactoring opportunities skipped to keep scope narrow

- **O1: Engine implementations still use `context.upstream` escape hatch.** Engines like `implement`, `review`, `revise`, and `seal` all access upstream data via `context.upstream['draft'] as DraftYields`. With inline interpolation now available, individual yield *properties* could be declared in givens (e.g., `draftPath: '${yields.draft.path}'`). However, engines frequently need the *whole object* (e.g., `DraftYields` for both `path` and `baseSha`), which requires multiple givens entries or continuing to use `context.upstream`. Migrating engines to use yield-ref givens instead of `context.upstream` is a future commission — not in scope here.

- **O2: `buildUpstreamMap` builds ALL completed yields regardless of graph distance.** Every completed engine's yields are included in the upstream map passed to every engine. For the current flat pipeline this is fine, but for complex DAGs it means engines receive yields from engines they have no declared dependency on. This is noted in the spider.md doc as intentional for simplicity. Not a bug, but worth noting as a potential concern when DAGs become common.

## Suboptimal conventions followed for consistency

- **O3: `$vars.*` regex is repeated inline.** The pattern `/^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/` appears as an inline regex in `resolveGivens` and both validation functions. The S4 refactoring extracts validation but the regex itself should be a named constant (like `YIELD_REF_RE` is). This is a minor improvement that can be folded into the S4 work.

## Doc/code discrepancies

- **O4: `spider.md` is substantially stale.** The architecture doc describes the "static rig MVP" but the code has evolved to support rig templates, kit-contributed templates, block types, input requests, and configurable rig-template mappings. The doc's "Future Evolution" section lists givens interpolation as a planned feature — after this commission it should be moved to current. A dedicated doc-refresh commission is warranted.

- **O5: `spider.md` does not document `$yields.*.*` support.** The `$yields.*.*` reference syntax in rig templates was shipped but never reflected in the spider.md doc. The doc still describes the original static pipeline with inline `givensSpec: { writ }` literals.

## Potential bugs or risks

- **O6: No validation of vars keys against config.** `$vars.nonExistent` silently omits the givens key at resolution time. There's no startup validation that the referenced variable key actually exists in `spider.variables`. This is by design (the doc says "Variables resolving to undefined cause the key to be omitted"), but it means typos in variable names (`$vars.roel` vs `$vars.role`) silently produce missing givens. A future commission could add optional strict-mode validation.

- **O7: `resolveYieldRefs` property access is single-level only.** When yield objects have nested properties (e.g., if a future engine yields `{ summary: { passed: true, findings: '...' } }`), `$yields.review.summary` would resolve to the nested object, but there's no way to access `$yields.review.summary.passed` directly. The single-level limit is correct for current yield shapes but worth noting for future evolution.
