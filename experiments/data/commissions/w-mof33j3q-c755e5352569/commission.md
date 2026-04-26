Lifted from the planning run of "Add guild-level override of engine-design retry policy" (w-mod4z7rf-c177b669beae). Each numbered observation below is a draft mandate ready for curator promotion.

1. EngineRetryConfig is duplicated between fabricator-apparatus and spider-apparatus types
2. Engine retry max-attempts ceiling is invisible in rig-show CLI output
3. Spider does not validate non-retry guild-config fields fail-loud at startup
4. Test fixtures cannot mutate guild-config mid-test, blocking live-reload regression coverage
5. FabricatorApi exposes only EngineDesignInfo summaries, blocking effective-retry-config introspection
