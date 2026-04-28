`docs/reference/event-catalog.md:201` claims: "Plugins may also declare events in their `guild.json` contribution, which the framework merges into the live config on installation." The astrolabe README (line 233) and event-catalog Plugin-Declared Custom Events example (lines 232–250) both depend on this being real.

No such guild.json-merge mechanism exists in the framework today. `packages/framework/core/src/guild-config.ts` only knows how to read/write the on-disk `guild.json`; nothing merges plugin-shipped contributions into it at install time. The astrolabe `astrolabe.plan.files-over-threshold` event would only work if an operator manually adds it to their `guild.json` — which is not what the doc claims.

This is doc/code drift inherited from before the events-kit redesign. C1's S7 covers the `event-catalog.md` rewrite, so this is partially addressed; the astrolabe README's parallel claim is a separate touch-up. Treating as an observation rather than rolling into C1's scope keeps the C1 diff focused on the plugin-side mechanism rather than chasing every doc that mentioned the missing pre-events-kit feature.

**Files**: `docs/reference/event-catalog.md:201, 232–250`, `packages/plugins/astrolabe/README.md` (search for 'guild.json contribution').
**Action**: Audit all docs referring to a 'plugin guild.json contribution merge' and rewrite to point at the events kit.