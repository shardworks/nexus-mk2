Three integration tests now reproduce essentially the same multi-apparatus boot harness:

- `packages/plugins/clerk/src/multi-type.integration.test.ts` (lines 123-251)
- `packages/plugins/reckoner/src/engine-context.integration.test.ts` (lines 73-309)
- The new `packages/plugins/astrolabe/src/writ-types.integration.test.ts` (this commission)

Each builds: `MemoryBackend`, fakeGuild with apparatusMap, ensureBook calls, sequential apparatus.start() in dependency order. The shared bones are nontrivial (~40 lines per fixture) and drift between the three is likely as plugins evolve. The parent observation-set already names sibling w-modz6svf ("Lift makeWritTypeApparatus integration boilerplate into a shared testing helper") which addresses the writ-type-registering apparatus side; this is a related but distinct concern (the *fixture* shape, not the registering apparatus shape).

If w-modz6svf's implementation grows a `buildIntegrationFixture` helper, this test would naturally adopt it; if not, the shared boot harness is its own follow-up. Ground truth: at the time of writing, three call sites and counting.