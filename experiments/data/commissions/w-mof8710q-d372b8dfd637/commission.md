When `clerk.post()` was tightened to always return a writ in the registered initial state (no auto-publish), the change rippled to every test that called `clerk.post()` directly and assumed the result was in `open`. Today only `packages/plugins/clerk/src/clerk.test.ts` carries an inline `postMandate(...)` helper at L50 that documents the contract; `packages/plugins/clockworks/src/integration.test.ts` (the file fixed in this commission) had no such helper and silently drifted.

This is a per-test-file foot-gun pattern. Other consumers of `ClerkApi.post` may have the same drift hidden behind passing tests that don't assert phase or behavior. Audit candidates (every test that imports `createClerk` or `ClerkApi`):

- `packages/plugins/spider/src/engine-retry.test.ts` (uses `transition.*new` per the inventory grep)
- `packages/plugins/sentinel/src/replay.test.ts`
- `packages/plugins/sentinel/src/reckoner.test.ts`
- `packages/plugins/astrolabe/src/writ-types.integration.test.ts`
- Any plugin that consumes ClerkApi for live integration testing

Follow-up commission: walk every test that calls `clerk.post()` outside `clerk.test.ts`, and either inline the two-step pattern or document the post-into-`new` behavior in a per-file comment near the fixture. Do NOT extract a shared helper across packages without first reviewing whether the workspace has a convention against test-helper packages.

Alternatively (more invasive): consider whether `ClerkApi` should grow a `post({autoPublish: true})` option that mirrors the `commission-post` tool's auto-publish, so callers don't need to remember the two-step. That is a design discussion, not a follow-up; this observation is just to record the broader audit scope.