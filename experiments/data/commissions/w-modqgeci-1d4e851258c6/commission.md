Possible edge case to verify when implementing T4 (not a definite bug, but worth a fixture):

Scenario: a multi-type guild has a mandate `M` with non-mandate child `T` (type `task`, hypothetically). M is `cancelled`; cascade rules (T3) would normally cancel children. If `T`'s type config doesn't declare a cascade-cancel transition (or declares one but the cascade engine hasn't generalized to non-mandate children), `T` could be left orphan-active when `M` reaches terminal.

Reckoner's drain check post-T4 would then see `T` as still active (correct: it is) and not fire the drain pulse — but also wouldn't surface the orphan as a distinct concern. Not Reckoner's job to fix the cascade gap, but the test matrix should include a deliberate multi-type orphan scenario to confirm:
- Drain doesn't fire while orphan exists (correct)
- Drain fires when the orphan reaches its own terminal

This isn't a bug in T4's deliverables; it's a primer note for the implementer to add a test that covers the orphan path explicitly. Files: `packages/plugins/reckoner/src/drain.test.ts`.