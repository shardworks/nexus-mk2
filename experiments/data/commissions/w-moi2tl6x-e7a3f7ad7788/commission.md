This is a holding parent for observations and follow-ups about the Clerk apparatus lifted from planning runs in late April 2026.

The Clerk is in heavy churn:
- T2/T3/T5 ladder (registerWritType, children-behavior engine, classification-based queries) recently landed; numerous post-refactor observations about doc drift, cascade semantics, mandate-phase hardcoding elsewhere in the codebase.
- Multi-type writ machinery is still being exercised; configs for non-mandate types (piece, observation-set, cartograph types) are still finding their footing.
- The `WritDoc.ext` field and `setWritExt` API just landed.
- Ongoing classification-based migration in downstream consumers (Spider, Reckoner) is still incomplete.

Per patron direction, follow-ups in this subsystem should NOT be commissioned as discrete cleanup work — they will be subsumed by the in-flight ladder commissions as those land. When the Clerk-side work settles, this parent can be reviewed and any genuinely unaddressed items promoted, with the rest cancelled.

Source: triage of 414 unpromoted observation-set children on 2026-04-28.