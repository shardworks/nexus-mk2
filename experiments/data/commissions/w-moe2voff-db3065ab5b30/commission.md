Lifted from the planning run of "Summon relay (stdlib)" (w-modf60bq-d8191189ede5). Each numbered observation below is a draft mandate ready for curator promotion.

1. Wire framework writ-lifecycle event emission ({type}.ready, {type}.completed, {type}.failed, {type}.stuck)
2. Refresh architecture and event-catalog docs to drop summon: / brief: sugar references
3. Promote `loom.weave({ role })` to fail-loud on unknown roles, with an opt-out for tooling that wants the permissive behavior
4. Clockworks now lazy-resolves animator/loom — surface a clearer arbor warning when a summon-relay standing order is configured but the dependency apparatuses are not installed
5. Document `writ.status.clockworks` schema (sessionAttempts and any future fields) alongside the spider/clockworks-retry slot conventions
6. Add a `summon-relay` integration test that drives the full dispatcher → relay → (stub) animator path end-to-end
7. Consider a writ-type-aware failure helper on ClerkApi (replaces hardcoded 'failed' transitions)
8. Decide whether the summon relay should bump the writ from new to open before launching
9. Standing-order-validator should learn the `summon-relay` name (or any other reserved relay names) so typos like `run: "summon"` are caught at config-load
