# Writ-type config schema and validator

## Intent

Establish the config format that governs all per-type writ lifecycles going forward. Introduce the classification and attrs meta-vocabulary, declarative state and transition definitions, and the `childrenBehavior` configuration shape. Ship TypeScript types and a static validator that checks the config's structural integrity at load time.

## Motivation

This is the foundation task for the broader writ-generalization refactor. Expressing the config shape first — cleanly, in isolation — prevents shape drift once downstream work (Clerk refactor, children-behavior engine, consumer migration) begins to depend on it. Nothing else in the refactor can start until this lands.

## Non-negotiable decisions

- **Classification layer.** Every state declares one of three classifications: `initial`, `active`, or `terminal`. Classifications are the machine-readable layer cross-cutting infrastructure reasons over (drain detection, schedulability, terminal-event triggers). State names stay type-specific and semantically honest.
- **Attrs layer.** States carry an optional attrs list. The v0 attrs vocabulary includes `success`, `failure`, `blocking`, and `neutral`. The validator accepts unknown attrs (forward-compatible), but the v0 consumers only react to these four.
- **`allowedTransitions` is mandatory.** Every type declares its full state graph explicitly. Transitions not declared are rejected at runtime (enforcement lands in the Clerk refactor, not this task).
- **`childrenBehavior` supported triggers: `allSuccess`, `anyFailure`.** No other triggers for v0 — explicitly not `anyTerminal`, `allTerminal`, or `firstChild`.
- **`childrenBehavior` supported actions: `transition`, `copyResolution`.** No `notify` action for v0. `copyResolution` modifies a `transition` action (carries the triggering child's resolution up to the parent).
- **`anyFailure` short-circuits `allSuccess`** when both conditions hold simultaneously.
- **No `parentTypes` field in v0.** Parent-type constraints are deferred entirely; the data model makes no provision for them yet.
- **No `dispatchable` field.** Dispatchability stays an emergent concern owned by each consumer (e.g., Spider decides what it will dispatch based on its own rules), not a config-level gate.
- **Static validation at config load** must verify: referenced states exist within their type; transition-action target states are reachable from the parent's possible states via declared transitions; no duplicate state names within a type; no state with no inbound transitions (unless classified `initial`); no terminal state with outbound transitions.

## Scenarios to verify

- A well-formed mandate config (as it will be expressed in T2) passes validation cleanly.
- A config with a `childrenBehavior.allSuccess: { transition: shipped }` where `shipped` is unreachable from all non-terminal states of the parent type fails validation with a clear error naming the unreachable target.
- A config with two states sharing a name within the same type fails validation.
- A config with an `anyFailure` trigger but no `transition` or `copyResolution` action fails validation (empty actions are not allowed).
- A terminal state with an outbound transition fails validation.

## Out of scope

- **Any consumer of the config** — the Clerk refactor (T2), children-behavior engine (T3), and consumer migrations (T4, T5) are separate commissions.
- **Plugin registration surface** — `registerWritType` and related API land in T2.
- **Runtime transition validation** — the validator here is static (load-time); per-transition enforcement is T2.
- **Parent-type constraints** (`parentTypes`) — deferred entirely.
- **Dispatchability metadata** — deferred entirely.

## References

- Parent design click: `c-mo1mqp0q` (will be concluded when the writ-generalization refactor dispatches).
- Vision-keeper subtree (parked): `c-moa42rxh` — downstream consumer of this work.