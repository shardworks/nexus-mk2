# Children-behavior engine

## Intent

Implement the cascade engine that drives a parent writ's state transitions in response to child-writ terminal events. Support two triggers (`allSuccess`, `anyFailure`) and two actions (`transition`, `copyResolution`). Replace mandate's currently hardcoded cascade logic with config-driven rules sourced from each type's `childrenBehavior` config.

## Motivation

T2 (Clerk refactor) drops mandate's hardcoded cascade as part of removing type-specific assumptions. T3 restores the cascade via config and generalizes it so any writ type can declare its own parent-completion behavior. Without T3 landing alongside T2, mandate writs lose parent-auto-completion — T2 and T3 ship together.

## Non-negotiable decisions

- **Supported triggers.** `allSuccess` fires when all children are in terminal states and every one carries the `success` attr. `anyFailure` fires when any child is in a terminal state and carries the `failure` attr. No other triggers for v0.
- **Supported actions.** `transition` moves the parent to a named state. `copyResolution` (only valid in combination with `transition`) causes the triggering child's `resolution` field to be copied onto the parent as part of the transition. No `notify` action.
- **Short-circuit rule.** When both `allSuccess` and `anyFailure` conditions hold simultaneously (all children terminal, at least one failure), `anyFailure` wins. `allSuccess` does not fire.
- **Idempotency.** When a child terminal event fires and the parent is already in a terminal state, the configured action is a no-op — not an error, not a second transition.
- **Transition validity.** A transition action's target state must be reachable from every non-terminal state the parent could be in at trigger time. T1's validator enforces this at config load; T3 must not need to revalidate at runtime.
- **Firing only on terminal transitions.** Children-behavior triggers evaluate only when a child transitions to a terminal state. Non-terminal transitions (e.g., a child entering `stuck` or `open`) do not fire parent cascade.

## Scenarios to verify

- Mandate parent with two child mandates, both complete → parent transitions from `open` to `completed`.
- Mandate parent with two child mandates, one completes, one fails → `anyFailure` wins; parent transitions to `failed` with the failing child's resolution copied up.
- Mandate parent with children that complete in sequence → parent stays non-terminal until the last child reaches terminal, then transitions.
- Child reaches terminal after parent is already terminal → no-op; no error, no re-transition, no event emission.
- Mixed simultaneous terminal events (two children terminal in the same commit, one success, one failure) → `anyFailure` short-circuits `allSuccess`.
- Parent with no children, child added later and reaches terminal → trigger fires based on the single child's outcome (single-child cases are not special-cased).

## Out of scope

- **Additional triggers** — `anyTerminal`, `allTerminal`, `firstChild`, child-count thresholds. Deferred.
- **Additional actions** — `notify`, external event emission beyond the state transition itself. Deferred.
- **Non-terminal cascade** — children transitioning to `stuck`, `open`, etc. do not fire parent behavior in v0.
- **Manual cascade override** — patrons / agents cannot suppress a configured cascade at runtime; it's config-driven and deterministic.

## References

- Parent design click: `c-mo1mqp0q`.
- Predecessor: T2 (Clerk refactor).
- Bundled with: T2 — ships in the same release.