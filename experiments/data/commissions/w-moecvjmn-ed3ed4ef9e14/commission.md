**File:** `packages/plugins/spider/src/spider.test.ts`, lines 1-8.

**Symptom.** The header comment claims the file tests:

> rig lifecycle, walk priority ordering, engine execution (clockwork and quick), failure propagation, and CDC-driven writ transitions.

The file actually contains 17 top-level describes covering, in addition to the above, template dispatch, variable resolution, startup validation, resolutionEngineId, CDC resolution fallback, full pipeline integration, tools (structure + handler delegation), engine blocking on external conditions, kit contributions for rig templates and mappings, `${yields.*}` reference support, when-conditions/cascade-skipping/grafting, rig cancellation, writ→rig cascade, and the `spider.follows` gate. The header never grew with the file.

**Why this matters.** Misleading header comments lead readers to assume a feature isn't tested when it actually is, or to add duplicate coverage in a sibling file.

**Note on scope of fix.** If the split commission ships, the original file is deleted (decision D14), at which point the stale header is moot. If the split commission is skipped, the header should be updated to match the file's actual surface.