# Clerk refactor — config-driven state machine with plugin-registered writ types

## Intent

Replace Clerk's hardcoded mandate state machine with a generic config-driven engine. Introduce a plugin-registration API as the only path by which a plugin contributes a writ type. Re-express mandate as a type registered by the Clerk plugin itself, validating the abstraction by construction. Enforce declared state transitions strictly: any transition not in `allowedTransitions` for the current state is rejected.

## Motivation

The "mandate is special" assumption is baked deep into Clerk's internals. Removing it is the central move in the writ-generalization refactor: once Clerk treats its built-in mandate the same way it would treat any externally-contributed type, all downstream work-tracking primitives (product, portfolio, capability, outcome, eventually folding in clicks) can be expressed as writ types without parallel subsystems.

## Non-negotiable decisions

- **Plugin registration is the only path.** A plugin contributes a writ type by calling the Clerk-exposed registration API during its startup hook. No guild.json-side writ-type registry; configuration is code-driven. The registration call accepts a config that passes T1's validator.
- **Mandate is a registered type.** The Clerk plugin registers mandate itself during its own startup. Mandate's lifecycle definition is expressed in the same config shape any other plugin would use — no private path, no special case.
- **On-disk shape is preserved.** Existing mandate writs remain bit-for-bit identical. State strings unchanged (`new`, `open`, `stuck`, `completed`, `failed`, `cancelled`). No migration script, no schema version bump, no field renames on the writ document itself.
- **Strict transition enforcement.** Attempting a state transition not declared in `allowedTransitions` for the writ's current state is rejected with a clear error naming the writ, the current state, the attempted target, and the list of legal targets.
- **Classification is derived, not stored.** Queries like "is this writ in a terminal state" compute the answer from the writ's type config at read time. The classification layer is never persisted on the writ document; a type's definition of terminal is authoritative.
- **The mandate-cascade behavior is NOT preserved hardcoded.** T2 lands the state-machine plumbing but intentionally drops the old hardcoded cascade — T3 (children-behavior engine) restores it via config. T2 and T3 ship as a bundle; mandate writs will misbehave between the two.

## Scenarios to verify

- Pre- and post-refactor, a mandate writ's on-disk representation is byte-identical for every state (new, open, stuck, completed, failed, cancelled).
- A plugin registering a new writ type at guild startup: writs of that type are accepted, displayable, transitionable per its own declared lifecycle.
- A mandate writ in `completed` state: attempting a transition to `open` is rejected; the error names the writ id, current state, attempted target, and the allowed transitions (empty list for `completed`).
- A mandate writ in `open` state: a legal transition to `stuck` succeeds; an illegal transition to `new` is rejected with the same clear error shape.
- Classification-based query (`isTerminal(writ)`): returns correct results for mandate in each of its states, and for any other registered type in each of its states, without the query knowing the type's name.

## Out of scope

- **Children-behavior engine** — T3, explicitly bundled with this release but tracked separately.
- **Consumer migrations** — Reckoner (T4), CLI/Oculus (T5) are separate commissions.
- **Folding clicks into writs** — deferred; Ratchet remains a separate apparatus.
- **`parentTypes` enforcement** — deferred.
- **Writ type removal / deregistration** — plugins register on startup only; no mid-life removal.
- **Migration of existing mandate writs** — not needed; shape is preserved.

## References

- Parent design click: `c-mo1mqp0q`.
- Predecessor: T1 (writ-type config schema and validator).
- Bundled with: T3 (children-behavior engine).