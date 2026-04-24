# Engine-level retry and rig-status rollup

## Intent

Move retry from an external apparatus (`clockworks-retry`) into Spider's core scheduler, as a property of engines rather than writs. A failed engine is retried in place inside the same rig — its completed upstream siblings stay untouched, its downstream siblings stay pending — until either a retry attempt succeeds or the engine exhausts its budget. Rig status becomes a pure derivation from engine states, and the rig-level `stuck` status retires: an engine waiting on a back-off timer or an external gate is represented as `pending with hold metadata`, not as its own state.

Design summary: the scheduler loop is reshaped around a single uniform dispatch predicate. Any pending engine is a candidate; four simple boolean checks (status, upstream, hold timer, external gate) decide whether it dispatches on this tick. One failure handler routes every engine failure into one of three outcomes (rate-limit → pending+gate; retryable-within-budget → pending+timer; exhausted-or-non-retryable → terminal failed). Rig status is computed, not stored. The old writ-level retry mechanism becomes dormant — `clockworks-retry`'s trigger condition is rarely met once engines retry themselves inside the rig — and its retirement is deferred to a sibling click.

## Motivation

The current retry system is architecturally miscast. When an engine fails, Spider marks the rig `stuck`, writes a retry flag onto the writ, and a separate apparatus (`clockworks-retry`) watches for that signal and bumps an attempt counter on the writ. Spider then spawns a **new rig from scratch** — which collides with its own upstream artifacts (e.g., the PlanDoc keyed by writId), so retries immediately stuck again. Observed in production: ten commissions rate-limited on a single 5-hour window, twenty dead rigs (ten originals plus ten collided retries), zero automatic recovery. The mechanism is doing roughly the opposite of its purpose.

The deeper issue is that the current state machine has proliferated parallel structures for "engine is waiting": `retryable stuck` (engine failed, external apparatus will resurrect it), `failed-blocker stuck` (waiting on a sibling writ), and — once rate-limit-aware scheduling lands (`c-mocdm7of`) — `stuck(reason=no-tokens)` (waiting on the anima provider). Each was designed independently; each has its own fields and semantics; Spider's scheduler has to branch on "what kind of waiting is this" to decide whether to act. This commission collapses those into **one waiting shape with metadata**, modelled after Kubernetes-style reconciliation: a uniform state with optional gating fields, evaluated by one predicate.

Design click: `c-mocdm2o7` (engine-level retry and rig-status rollup). Sibling thread: `c-mocdm7of` (rate-limit-aware scheduling via Animator) — this commission's dispatch predicate includes the animator-ready check that thread introduces.

## Non-negotiable decisions

### Engine state machine collapses to six states

Engines have a single `status` field with exactly six values:

- `pending` — not yet runnable (upstream not ready, held for retry timer, or held for external gate)
- `running` — dispatched, session in flight (or synchronous engine executing)
- `completed` — terminal success
- `failed` — terminal; retries exhausted, or failure was non-retryable
- `cancelled` — terminal; engine or rig explicitly cancelled
- `skipped` — terminal; `when` condition false at dispatch time

No separate `retrying` state. No engine-level `stuck` state. Both are represented as `pending` with optional hold metadata on the engine. This is the load-bearing shape of the commission — everything else follows from it. Design rationale is in click `c-mocdm2o7`.

### Hold metadata on pending engines

A pending engine may carry three optional fields that gate its dispatch:

- An attempt counter (0 or absent on a never-run engine; incremented each retry).
- A "don't dispatch before this time" timestamp (set when the failure is retryable within budget; cleared on successful dispatch).
- A hold-reason tag whose presence tells Spider to consult an external readiness signal. Initially the only value is the rate-limit reason that Thread `c-mocdm7of` introduces, which gates on Animator's paused state.

The exact field names are implementer's call. What is non-negotiable is that these fields coexist on the same `pending` status — a single engine status field, with gates expressed as metadata — rather than fanning out into parallel sub-states.

### Per-attempt history preserved on the engine

Each engine carries a cumulative per-attempt history array. Each entry records the attempt's start and end timestamps, final status (completed or failed), error (if any), session id (if the engine had one — deterministic engines do not), and yields (if produced). This is load-bearing research data — without it we lose the ability to analyze transient-failure patterns across runs, which is one of the primary reasons engine-level retry exists. `sessionId` is optional per record, reflecting that most engines (plan-init, inventory-check, decision-review, plan-finalize, observation-lift, seal, draft) are synchronous and do not launch sessions.

### Spider's dispatch predicate is a single uniform function

Spider's scheduler ticks over rigs with status `running`; for each engine on each rig, the question "should I dispatch this engine right now?" is answered by a single predicate that performs four simple boolean checks:

- Engine status is `pending`.
- All upstream engines are in a terminal-success state (`completed` or `skipped`).
- Any hold timer (`holdUntil` or equivalent) has elapsed or is absent.
- Any external-gate hold reason has its gate open (e.g., rate-limit hold → Animator reports `running`).

The predicate has no branching on "what kind of pending is this." There is one pending state; the checks compose. A new gate added later (dependency-writ completion, Coinmaster budget, operator-pause) is one more boolean in the same function, not a new engine state.

### One engine-failure handler with three branches

Every engine failure flows through a single handler that appends to the engine's attempt history and then routes to one of three outcomes:

1. **Rate-limit hold** — the failure carried a rate-limit signature from Animator. Engine's status stays `pending`; hold-reason is set; attempt counter is **not** incremented (rate-limit does not consume retry budget — resource-gated waits are distinct from transient-failure recovery). When Animator resumes, Spider's next tick dispatches this engine.

2. **Retryable within budget** — the failure was retryable (engine design permits retry, failure was transient) and the attempt counter is below the engine-design's configured maximum. Engine's status stays `pending`; attempt counter is incremented; hold-timer is set to `now + backoff(attempt)` per the engine-design's configured back-off.

3. **Exhausted or non-retryable** — the failure was non-retryable (definitional: unknown engine design, malformed graft, validation error), or the attempt counter has reached the engine-design's maximum. Engine's status transitions to `failed`. This triggers the rig rollup below.

The distinction between retryable and non-retryable failure is already carried by Spider's existing `retryable: boolean` classification on `failEngine` (the apparatus that tags each failure site as either "transient failure, worth retrying" or "definitional failure, pointless to retry"). The existing classifications remain; what changes is what Spider does with the flag — in-place retry instead of rig death.

### Retry configuration lives on engine-design

Each engine design declares its own retry policy, as a property on the design itself (not as config on individual engine instances). A minimal shape:

- Maximum attempts (inclusive of the first).
- Back-off policy of the same shape as Thread `c-mocdm7of`'s rate-limit back-off (`initialMs`, `maxMs`, `factor`), with defaults tuned for transient-failure recovery rather than provider-window recovery (short initial, short cap; suggested defaults 30s / 10min / 2 but final values implementer's call).

Absent configuration, an engine design's effective policy is `max: 0` (no retry). Retry is opt-in per engine design. This commission does **not** introduce guild-level override of engine-design retry policy — that's explicitly deferred. A guild that wants to tune an engine's retry budget in its own deployment does so in a follow-up.

Engines whose designs enable retry (initially, the anima-session engines: reader-analyst, spec-writer, patron-anima, implement, review, revise) have their policy declared in the design source. Engines whose designs do not enable retry (plan-init, inventory-check, decision-review, plan-finalize, observation-lift, draft, seal) keep the default-zero and fail-fast on error.

### Rig states collapse to four; no rig-level `stuck`

Rig status has exactly four values:

- `running` — at least one engine is non-terminal (any of `pending` or `running`).
- `completed` — all engines are terminal-success (`completed` or `skipped`).
- `failed` — all engines are terminal **and** at least one is `failed`.
- `cancelled` — the rig was explicitly cancelled (operator or upstream-writ cancellation).

No rig-level `stuck`. An engine waiting on a retry back-off or an external gate is `pending with hold metadata`; the rig containing it is `running` (progress is still expected, just gated). This is semantically correct — the rig IS making progress, and Spider's reconciliation loop will resume dispatch when the gate clears — and it eliminates an entire category of "what do I do with this stuck rig" ambiguity.

### Rig status is derived, not stored

Rig status becomes a pure function of the rig's engines (plus the explicit-cancelled flag). It is evaluated at every engine-state-change point and written to the rig doc for observability, but it is never independently authoritative: the engines are the truth, and the rollup is the projection. This makes the rig-rollup rules testable and auditable as a pure function, removes the class of bug where the rollup drifts from the underlying engine states, and gives observers (Oculus, CLI, Laboratory) one consistent derivation to rely on.

### Downstream engines stay pending during a retry

When an engine fails but is retryable-within-budget (outcome 2 of the failure handler), its downstream engines are **not** cancelled. They stay `pending`. Spider's dispatch predicate naturally skips them — their upstream (the retrying engine) is not `completed`, so they fail the upstream-ready check — but no state mutation happens to them. Cancellation of downstream engines happens only when an engine transitions to terminal `failed` (outcome 3), at which point the failure cascade cancels all downstream engines in one pass.

This reverses today's cascade-on-first-failure behavior. It eliminates the need for an un-cancel path (if the retry succeeds, downstream doesn't need resurrection; it was never cancelled). It also keeps the downstream engines' recorded state honest — they were never attempted, not cancelled-then-revived.

### `clockworks-retry` is left dormant, not retired

The existing `clockworks-retry` apparatus watches for writs entering `phase=stuck` with `status.spider.retryable=true`, and responds by bumping an attempt counter and returning the writ to `phase=open`. Under the new model, writs almost never enter `phase=stuck` via the engine-failure path — engines retry inside the rig, and the writ stays `phase=open` throughout. Thus `clockworks-retry`'s trigger condition stops firing in practice.

This commission does **not** modify or remove `clockworks-retry`. Its code and contract remain intact. It simply quiets down. Retirement (or re-wiring it to watch for `phase=failed` as a patron-level retry escape hatch) is a future sibling click, out of scope here.

Corollary: the writ's `status.spider.stuckCause='engine-failure'` slot also becomes dormant on the engine-failure path. It still fires on its other existing causes (dependency stucks, cycle detection, etc.) — those paths are untouched.

### Rig-terminal-failed transitions the writ to `phase=failed`

When a rig rolls up to `failed` (at least one engine terminally failed, all engines terminal), the writ it targets transitions to `phase=failed`. This is the direct path, replacing today's indirect `rig stuck → writ stuck → clockworks-retry considers → new rig` route that produced the collision problem. The patron sees the commission genuinely failed; no retry magic silently re-dispatches it.

Writ-level retry (reposting the commission, or having an apparatus auto-repost) remains available via the Clerk's existing commission-posting machinery — it's explicit patron or apparatus action, not an automatic consequence of rig failure. That future behavior is the sibling re-wire of `clockworks-retry` mentioned above.

## Out of scope

- **Retiring `clockworks-retry`.** Left in place to go dormant; retirement is a sibling cleanup click.
- **Guild-level override of engine-design retry policy.** Policy lives on engine designs only in this commission; guild-config override is a future phase.
- **Writ-level automatic retry on rig-terminal-failure.** The old mechanism becomes dormant; reinstating automatic writ-level retry (via re-wiring `clockworks-retry` or otherwise) is a future design decision, not this commission's problem.
- **Pulse emission on engine retry exhaustion.** When engines exhaust their retry budget and the rig fails, informing the patron via a Lattice pulse is the right operational affordance — but the Lattice itself is a separate track. The design click `c-mod06b5m` captures the requirement; implementation is deferred.
- **Patron-presence-aware parallelism** (sibling `c-mocdmepa`) and **rig priority metadata / Bounty / Levy** (sibling `c-mocdmjk1`). Orthogonal scheduler-policy upgrades, separate commissions.
- **Spider-level observability additions beyond the engine-detail view.** Displaying retry history in the Oculus rig view is a natural affordance (patrons looking at a rig should see "spec-writer: attempt 2 of 3, next try HH:MM"), but the specific UI shape — which widget, which page, how prominent — is the planner's decision. This commission's scope requires that the data is exposed in readable form on the CLI at minimum (`nsg rig show` renders attempt count, hold state, and at least the latest attempt's error); the Oculus page UI polish is expected but not prescribed.
- **Changes to the existing `failed-blocker` / `cycle` stuck-cause machinery** that handles dependency-blocked writs. Those are orthogonal and remain unchanged. The `writ.status.spider.stuckCause` slot continues to be meaningful for those causes — only the `engine-failure` cause goes dormant.
- **Multi-rig-per-writ history.** Today a writ can have multiple rigs across retry attempts; under the new model it typically has one. The data model doesn't need to forbid multiple rigs per writ (useful for future patron-triggered re-dispatch), but no new machinery is built here to rely on multi-rig histories.

## Behavioral cases the design depends on

- An engine whose session fails with a retryable classification and whose attempt count is below its design's max: engine transitions from `running` back to `pending`, attempt increments, `holdUntil` set to `now + backoff(attempt)`, history record appended. Rig stays `running`. Downstream engines stay `pending` (not cancelled).
- An engine whose session fails with a retryable classification and whose attempt count has reached its design's max: engine transitions from `running` to `failed`. Rig rolls up to `failed`. Downstream engines cancel as a cascade.
- An engine whose session fails with a non-retryable classification (unknown design, malformed graft, validation error, etc.) at any attempt count: engine transitions from `running` to `failed` immediately. Rig rolls up to `failed`.
- An engine whose session fails with a rate-limit signature (as classified by Thread `c-mocdm7of`): engine transitions from `running` back to `pending`, hold-reason is set to rate-limit, attempt counter is **not** incremented, history record appended. Rig stays `running`. When Animator resumes (per Thread `c-mocdm7of`), Spider's next tick dispatches this engine and it either succeeds or fails again normally (which this time might be retryable-within-budget, or rate-limit, or terminal).
- Spider's dispatch tick, for a rig with engines in mixed states (some completed, some running, some pending-with-hold-timer, some pending-with-rate-limit-hold): dispatches only engines passing all four predicate checks; skips the rest without mutating their state.
- A retry attempt that succeeds: engine transitions from `pending` → `running` → `completed`. History records both the failed attempt(s) and the successful attempt. Downstream engines become runnable on the next tick.
- A rig that contains an engine exhausting its retries: rig transitions to `failed`, writ transitions to `phase=failed`. Clockworks-retry's existing trigger (phase=stuck) does not fire. Patron's view of the writ shows it failed, with the rig's engine history accessible for diagnosis.
- The daemon restarting mid-retry-wait: engines persisted with `holdUntil` survive the restart. Spider's first post-restart tick evaluates the dispatch predicate against the persisted state; engines whose `holdUntil` has elapsed become runnable, engines whose `holdUntil` is still future remain held. No special recovery machinery is needed.
- A rig that is explicitly cancelled: all non-terminal engines (running, pending-with-hold, pending-without-hold) transition to `cancelled`. Rig status is set to `cancelled` via the explicit flag. The rollup function respects the explicit-cancel flag over the derived status.

## References

- `c-mocdm2o7` — this commission's design click (engine-level retry and rig-status rollup)
- `c-mo1mqeti` — parent umbrella: separate writs from rigs — the multi-rig refactor
- `c-mocdm7of` — sibling, load-bearing dependency: rate-limit-aware scheduling (introduces the `animator-ready` gate consulted by this commission's dispatch predicate)
- `c-mod06b5m` — sibling: pulse emission on engine retry exhaustion (Lattice integration, deferred implementation)
- `c-mocdmepa` — sibling: patron-presence-aware parallelism (Thread 4a)
- `c-mocdmjk1` — sibling: rig priority metadata / Bounty / Levy (Thread 4b)
- `c-mo1mqn4y` — adjacent: daemon-restart recovery (this commission's design is restart-tolerant by construction, but the older click tracks the broader restart question)
- Vocabulary (guild-vocabulary.md): the collapse-to-one-pending-state-with-metadata pattern is the guild's first substantial adoption of Kubernetes-style reconciliation semantics. No specific new term is introduced; the design is discussed as "the scheduler loop" and "the dispatch predicate" in common prose, which matches the existing hopper-execution vocabulary.