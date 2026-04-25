The mandate writ-type configuration is duplicated across two files in the clerk package:

- `packages/plugins/clerk/src/clerk.ts:111–153` — `MANDATE_CONFIG`, the production config the Clerk registers for itself.
- `packages/plugins/clerk/src/children-behavior-engine.test.ts:26–40` — `MANDATE_TYPE`, an inline copy used as a test fixture.

The `mandateLikeWritType(name)` helper in testing.ts (lines 65–77) is a third near-clone but with different intent (returns a renamed clone for cross-type tests, no `childrenBehavior`).

If production mandate config drifts (e.g. T2's grafted-conflict reconciliation tweaked an `allowedTransitions` entry), the children-behavior-engine.test.ts copy would silently get out of sync — the unit test would still pass against the stale fixture, hiding a real regression. The same is partially true of `mandateLikeWritType`, though it's intentionally scoped to a no-cascade clone.

A single `MANDATE_CONFIG` constant exported from clerk.ts (or a shared `mandate-config.ts` module under src/) would eliminate the drift hazard and let test fixtures import the same constant production registers. Out of scope for this commission; observation only.