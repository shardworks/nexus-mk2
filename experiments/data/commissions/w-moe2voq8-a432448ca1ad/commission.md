Decision D23 lands relay-internal unit tests, which is the right scope for the brief. But once task 9 (standing-order error-event emission) and task 6 (CLI) land, an integration test that:

1. Sets up the full Clockworks apparatus + a registered fake animator that resolves to a deterministic SessionResult,
2. Emits a `mandate.ready` event,
3. Calls `clockworks.processEvents()`,
4. Asserts that the event flips to `processed`, a dispatch row is written, the writ's `status.clockworks.sessionAttempts` is incremented, and the prompt template was hydrated

… would catch wiring regressions across apparatus boundaries that unit tests cannot. Worth landing as a follow-up commission once the daemon side stabilizes.