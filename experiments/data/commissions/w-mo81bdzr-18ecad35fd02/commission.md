# Retry Clockwork Primitive

Implement the autonomous-hopper retry primitive — a Clockworks binding that observes stuck writs carrying `retryable: true` and transitions them `stuck → open`, causing Spider to spawn the next rig attempt. Bounded by a single global cap of N=2 attempts, counted as `rigs.length` on the writ.

This commission is the behavior half of the retry story. The observability substrate (the `retryable` flag itself) lands in a sibling commission and is a hard precondition.

## Motivation

The autonomous hopper is the serial-commission path for Nexus. Without automated retry, any transient failure — a session crash, an engine throwing an unexpected error — requires human intervention to unblock, which defeats the "autonomous" part of autonomous-hopper operation.

The retry mechanism chosen (see `c-mo56pq2k`) is **multi-rig-lite**: one writ accumulates multiple rigs over successive attempts. Writ identity stays stable across retries, so dependents (`blocked_by` edges) remain correctly gated by construction — no `retries`-link following, no autoUnstick extension, no cross-writ dependency chasing. `rigs.length` is the natural attempt counter.

This commission implements the clockwork that drives the `stuck → open` requeue.

## Non-negotiable decisions

### Clockwork-driven, not Spider-inline

The retry decision runs as a Clockworks binding that observes writ-status transitions. It does **not** live inline inside Spider's stuck handler. Source: `c-mo814q`, `c-mo56pq2k`.

This keeps Spider's core logic unaware of retry policy — retry is a policy observer layered on top of Spider's substrate, not a concern Spider itself knows about. Policy can evolve (or be swapped entirely) without touching Spider.

### Trigger condition: `status.spider.stuck.retryable === true`

The binding acts only when a writ enters the stuck state with the `retryable` flag set to `true`. Any other stuck transition is ignored:

- Dependency stucks (`failed-blocker`, `cycle`) — ignored. Handled by `autoUnstick` on its existing path.
- `retryable: false` — ignored. Definitional failure; requires human attention.
- Missing `retryable` field (pre-Slice-A writ, or a stuck transition from a code path that doesn't set it) — ignored. Fail-safe: a writ without the flag stays stuck.

Source: `c-mo814q`.

### Attempt count is `rigs.length`

No separate counter field is introduced. The count is derived from the number of rig children already attached to the writ. The writs-as-obligations / rigs-as-attempts separation (design subtree under `c-mo1mqeti`) makes this the natural count. Source: `c-mo56pq2k`, `c-mo814q`.

### Single global cap: N=2

If `rigs.length >= 2` when the stuck fires, the clockwork does not requeue. The writ stays stuck for human attention. No per-cause differentiation — a single cap applies to every `retryable: true` stuck.

The cap is a simple constant in this commission. If analytics later show a failure category that warrants a different cap, a follow-up commission can add the distinction; we are not pre-building that configurability. Source: `c-mo814q`.

### Transition: writ moves `stuck → open`

That is Spider's existing signal to spawn a new rig. The clockwork does not create the rig directly — it flips the writ state and lets Spider's normal scheduling machinery spawn the attempt. The new rig attaches as a sibling child of the writ, and `rigs.length` increments as a side effect.

Source: `c-mo814q`.

### Dependency-recovery path unchanged

`failed-blocker` and `cycle` stucks are handled by `autoUnstick` on its existing conditions. This commission does not observe, modify, or interact with that path. Source: `c-mo814q`.

### Hard dependency on the retryable-flag commission

The `retryable` flag and the new `engine-failure` stuck cause must exist in the writ schema and be populated at all `failEngine` call sites before this clockwork does anything useful. If the sibling commission has not landed, the clockwork simply never fires (its trigger condition is never met) — the binding is safe to deploy independently, but delivers no value until the flag is wired in upstream.

## Scenarios to verify

- Writ enters stuck with `retryable: true` and `rigs.length === 1` → clockwork fires, writ transitions `stuck → open`, Spider spawns a new rig, `rigs.length` becomes 2.
- Writ enters stuck with `retryable: true` and `rigs.length === 2` → clockwork does not requeue; writ remains stuck.
- Writ enters stuck with `retryable: false` → clockwork does not requeue; writ remains stuck.
- Writ enters stuck with `cause: 'failed-blocker'` → clockwork ignores; `autoUnstick` handles on its existing path.
- Writ enters stuck with `cause: 'cycle'` → clockwork ignores.
- Writ enters stuck with no `retryable` field (pre-Slice-A writ) → clockwork ignores; writ remains stuck for human attention.
- A second stuck transition on the same writ after a successful requeue (i.e., the retry itself fails) re-evaluates `rigs.length` and the cap; if now at 2, stays stuck.

## Out of scope

- **Per-cause bound differentiation.** A single N=2 cap applies. If future data justifies splitting, that's a separate commission.
- **Backoff between retries.** Requeue is immediate on stuck. Timed backoff, exponential delay, jitter, etc. are not part of MVP.
- **Patron manual retry or brief edit-and-retry.** The patron-driven retry path is a separate design question (tracked as its own click under the retry-policy parent) and does not gate or constrain this commission.
- **Retry-count surfacing in patron UX.** Showing "attempt 2/2" in Oculus, the CLI, or the writ table is valuable observability but is separate work.
- **Stuck-cause sub-taxonomy.** This commission consumes only the boolean `retryable`; it does not branch on any sub-category of failure.
- **Migration of in-flight writs.** Writs already stuck at deploy time are not retroactively retried. The clockwork reacts to new stuck transitions going forward.
- **Relaxation of any other Spider invariant.** The commission relaxes exactly one thing: the implicit 1:1 rig-per-writ assumption. Any other invariant Spider maintains is untouched.

## References

- `c-mo814q` — this click, the tightened Slice B design.
- `c-mo813v` — the retryable-flag commission (hard precondition).
- `c-mo56pq2k` — retry mechanism choice (Option 2, multi-rig-lite): the context for the `rigs.length` attempt counter and the writ-identity-stable model.
- `c-mo28k8ir` — retry-policy parent.
- `c-mo28k3ar` — autonomous-but-serial hopper grandparent for broader context.