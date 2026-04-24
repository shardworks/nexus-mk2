# End-to-end integration test for multi-type writ machinery

## Intent

Register a test-only writ type via the Clerk plugin registration API and exercise the full multi-type lifecycle: type registration, writ creation, legal and illegal transitions, children-behavior cascade (both `allSuccess` and `anyFailure`), `copyResolution` propagation, and idempotent no-op on an already-terminal parent. Validates that the abstraction holds with more than one type in play.

## Motivation

The writ-generalization refactor can pass every unit test and still fail the real contract if mandate-as-config is the only type exercised end-to-end. Adding a second type — at integration level, against a real Clerk and real Stacks — validates the abstraction by construction. The test doubles as the canonical reference for future plugin authors adding a type.

## Non-negotiable decisions

- **Test-only type.** The second writ type registered by this test is strictly test-scoped — not imported by production code paths, not contributed by a real plugin. Registered via a test plugin or guild-bootstrap helper used only under test.
- **Integration level.** The test runs against real Clerk, real Stacks, real writ documents in a temp guild. No mocking of Clerk internals. The goal is to validate the contract as it will be seen by a real plugin author.
- **Test type shape.** At minimum, the test type has: an initial state, one active state, two terminal states (one success-classified, one failure-classified), and `childrenBehavior` exercising both `allSuccess` (with `transition`) and `anyFailure` (with `transition` + `copyResolution`).
- **Coverage checklist.** The test exercises:
  - Type registration at startup; writs of the type accepted.
  - A legal transition on a writ of the test type succeeds.
  - An illegal transition is rejected with the error shape specified in T2 (names writ id, current state, attempted target, allowed targets).
  - `allSuccess` cascade: parent transitions when all children reach success-classified terminal states.
  - `anyFailure` cascade with `copyResolution`: parent transitions and takes on the failing child's resolution.
  - `anyFailure` short-circuits `allSuccess` in a simultaneous-terminal scenario.
  - Child reaches terminal when parent is already terminal → no-op, no error.

## Scenarios to verify

Every item in the coverage checklist above is a verifiable scenario.

## Out of scope

- **Production registration of non-mandate types** (product, capability, outcome) — that's vision-keeper work, not this refactor.
- **Reckoner / CLI / Oculus integration tests** — T4 and T5 have their own coverage.
- **Performance or load testing** — functional correctness only.

## References

- Parent design click: `c-mo1mqp0q`.
- Predecessors: T2 (Clerk refactor), T3 (children-behavior engine).