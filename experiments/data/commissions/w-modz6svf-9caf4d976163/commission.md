Three integration-test files now duplicate near-identical boilerplate for spinning a real Clerk + real Stacks fixture in a temp guild:

- `packages/plugins/clerk/src/clerk.test.ts:79–215` — `buildClerkCtx`, `buildKitEntries`, `setupCore`, `setup`.
- `packages/plugins/clockworks-retry/src/clockworks-retry.integration.test.ts:62–336` — `buildKitEntries`, `buildCtx`, `buildFixture`.
- `packages/plugins/reckoner/src/integration.test.ts:60–237` — `buildKitEntries`, `buildCtx`, `buildGuild`.

A fourth duplicate is about to land in this commission's `multi-type.integration.test.ts` (per D6, intentionally self-contained — the precedent says don't refactor mid-commission). The shared helper would expose:

- `buildKitEntries(kits, apparatuses)` — already identical across files.
- `buildClerkCtx(kitEntries)` — small variations (`fire` callback in clerk.test.ts only).
- A `buildClerkFixture({ extraKits, extraApparatuses, guildConfig })` returning a struct with `{ stacks, clerk, fakeGuild }` plus a teardown shim.

Landing-place: `packages/plugins/clerk/src/testing.ts` (already exported from `@shardworks/clerk-apparatus/testing` as a published entry-point per package.json). The commission to do this would be a refactor that touches all four integration-test files at once — a separate scoped piece of work, not appropriate to bundle with the multi-type integration test (the brief is narrow).

The motivation is concrete: each duplicate has slight drift (different fakeGuild fields, missing `failedPlugins()`, different `clearGuild` placement) that has accumulated over several commissions. A shared helper would also future-proof the next plugin's integration test — the writ-type substrate is going to attract more plugin-side type registrations as Astrolabe / Loom / etc. expand.