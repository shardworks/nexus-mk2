Two tests in `packages/plugins/clockworks/src/clockworks.test.ts` currently pass because their assertions happen to mask the boot-time guild.initialized event:

- L836 `threads optional eventId, max, and onDispatch through to the dispatcher` — uses `eventId: target` filter and `max: 1` cap, both of which exclude guild.initialized incidentally.
- L868 `hot-edits to standing orders take effect on the next sweep` — first sweep doesn't assert the exact processedEvents count; second sweep happens to be 1 because guild.initialized is already processed.

After S2 fixes `buildDispatchFixture` to start with an empty queue, both tests will continue to pass — but the brittleness is gone, and the test bodies could be tightened to make the invariant explicit. Specifically:

- L836 first sweep: assert `summary.processedEvents === 1` against the eventId filter result; the second `processEvents({ max: 1 })` sweep could become `processEvents()` (full drain) and assert `processedEvents === 2`.
- L868 first sweep: tighten to `summary.processedEvents === 1` once the boot row is gone.

Tightening these is in the spirit of 'document the contract' but the brief explicitly excludes test-surface extension and refactoring. Promote this observation only if a future commission decides to harden the dispatcher test surface.