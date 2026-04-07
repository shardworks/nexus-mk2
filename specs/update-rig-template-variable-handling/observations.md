# Observations

## Refactoring opportunities skipped

1. **`buildStaticEngines` is dead code.** The function at spider.ts:131-147 is never called in production — `trySpawn` exclusively uses `buildFromTemplate`. A test (`describe('Spider — buildStaticEngines preserved')`) explicitly asserts it still exists, but the test only verifies that Spider works with the STANDARD_TEMPLATE (which is the template equivalent of the static pipeline). The function and the preservation test could be removed in a cleanup pass.

2. **`SpiderConfig.role`, `.buildCommand`, `.testCommand` are orphaned after this change.** With `$role` and `$spider.*` removed, no live code path reads `SpiderConfig.role` through the template variable system. The fields remain on the interface but their only consumer is `buildStaticEngines` (dead code). A follow-up could either remove them from SpiderConfig or repurpose them as defaults that auto-populate `variables` if not explicitly set. Left alone for now to keep scope narrow.

## Doc/code discrepancies

3. **spider.md Static Graph section is stale.** Lines 147-163 describe `spawnStaticRig(writ, config)` which no longer exists — the code uses `lookupTemplate`/`buildFromTemplate`. This predates the current brief and is not being fixed here.

4. **spider.md Configuration section shows no `rigTemplates` key.** The config example at lines 648-657 only shows `role`, `pollIntervalMs`, `buildCommand`, `testCommand` — it doesn't mention `rigTemplates` at all. The template system was added after the doc was written.

## Conventions followed for consistency

5. **Kept single-level identifier pattern.** The `$vars.*` regex uses `[a-zA-Z_][a-zA-Z0-9_]*` (no dots), matching the existing `$spider.*` pattern. Nested variable access (`$vars.foo.bar`) is not supported. This is consistent but means complex config values must be flat strings/numbers — no structured variable access. Acceptable for now; if structured variables are needed later, the regex can be relaxed.
