`packages/plugins/reckoner/src/predicates.ts:69–92` parses a legacy cascade-resolution format produced by the deleted Clerk cascade:

    Child "w-abc123-deadbeef" failed: {child resolution}

With T3's `copyResolution: true` action the parent's resolution will be the verbatim child resolution string, with no `Child "…" failed:` wrapper. `parseChildFailures(writ.resolution)` will silently return an empty array, and the leaf-failure surface in `reckoner.writ-stuck` and `reckoner.writ-failed` pulses (the `childFailures` context field and the 'Originated from child …' summary line) degrades to a no-op. Tests in `packages/plugins/reckoner/src/predicates.test.ts:33–56` continue to pass against synthetic legacy strings, hiding the degradation.

Follow-up should either (a) extend the engine to write a structured leaf-failure record into `status` instead of relying on resolution-string parsing, or (b) drop the `parseChildFailures` surface from Reckoner pulses and replace it with a recursive parent-walk on terminal/failed children. Out of scope for T3 per the brief; flagged so the Reckoner team can decide deliberately rather than discover the regression in production.