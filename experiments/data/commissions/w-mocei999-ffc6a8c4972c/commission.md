# Rate-limit-aware scheduling

## Intent

Teach the guild to recognize when the anima provider is rate-limited, stop dispatching sessions until the limit clears, and automatically resume when tokens return. Move rate-limit awareness from an implicit failure mode into a first-class observable state owned by the Animator apparatus — so that every caller (Spider, Parlour, future session-spawners) is protected by the same gate without having to know about rate limits directly.

Design summary: Animator gains a single-row status book that holds current dispatchability (`running` / `paused`), pause metadata (reason, `pausedUntil`, back-off level, triggering session), and exposes a narrow query surface. The Animator parses provider-specific rate-limit signals out of session failures and transitions its own status on hit. Spider's scheduler consults Animator's status at the top of each tick and short-circuits when paused; any engine whose session was rate-limited lands in `stuck(reason=no-tokens)` rather than `failed`. A natural "probe" is the next real dispatch after `pausedUntil` elapses — no contrived heartbeat pings.

## Motivation

Today the guild has no rate-limit awareness. When the provider's window exhausts mid-batch, every in-flight and subsequent session fails with a generic `claude exited with code 1`. Each failed engine stucks its rig (not fails it), and the current whole-rig retry then spawns a duplicate rig that immediately collides with the original's upstream artifacts. Real-world observed outcome: ten commissions, twenty dead rigs, zero self-healing, patron hand-cleanup required.

The underlying gap is that *nothing in the system knows a rate limit happened*. Rate-limit handling needs to live on the provider-boundary — the apparatus that actually talks to the anima runtime — so that every caller inherits the protection by default. Animator is that boundary.

This is the foundational thread of a larger scheduling-resilience redesign tracked in the click `c-mocdm7of`. Two sibling clicks carry separate follow-ups (engine-level retry and rig-status rollup in `c-mocdm2o7`; patron-presence-aware parallelism in `c-mocdmepa`; rig priority metadata in `c-mocdmjk1`). Those stay out of scope here; this commission is narrowly focused on *detection, gate, and resume* for the provider-rate-limit case.

## Non-negotiable decisions

### Animator owns rate-limit state, not Spider

The status book lives in Animator's namespace. Detection logic (parsing provider failure signals), back-off state machine (computing `pausedUntil`, tracking `backoffLevel`), and the gate are all Animator-internal concerns. Spider is a *consumer*. This is the architectural anchor of the design — whichever apparatus talks to the provider owns its state, and Animator is the sole provider-boundary apparatus. See design click `c-mocdm7of` for the full reasoning.

### Detection is reactive (parse-and-back-off), not proactive

Animator recognizes provider rate-limit signals as they surface from session lifecycle — exit codes, error bodies, or response metadata, depending on the anima-runtime layer. The exact signal shape is the implementer's call, but it must be distinguishable from generic session failure: after this lands, a rate-limit failure does not present as "unknown failure mode." The next real dispatch after `pausedUntil` elapses *is* the probe — no Haiku ping, no synthetic test prompt, no usage-endpoint polling.

Explicitly rejected alternatives (reasons in the design click):

- **Haiku heartbeat probe** — model-asymmetry on Claude Max means Haiku availability doesn't imply Sonnet/Opus availability. A probe that can be wrong is worse than no probe.
- **Anthropic usage API polling** — doesn't exist for Claude Max subscription billing (the guild's billing model).
- **UI scraping of claude.ai** — brittle, session-management overhead, TOS-adjacent.

### Single-row status book, with CDC-driven history

Animator gets a `books_animator_status` book with a single well-known document (id = `'current'`). Spider's tick and every other consumer reads this one document. History is not stored explicitly — Laboratory already ingests Stacks CDC from Animator's books to build its observational record, and the status doc's transition metadata travels in each CDC change event. No separate events table.

The status document carries:

- current state (`running` or `paused`)
- `pausedSince` / `pausedUntil` when paused
- `pauseReason` (at minimum `'rate-limit'`; extensible for future causes like operator pause)
- `backoffLevel` (0 when not in active back-off; incremented per consecutive rate-limit hit)
- `backoffLastHitAt`
- `lastTriggeringSession` — the session id whose failure triggered the most recent pause, so CDC change events (and downstream research) can trace cause locally

Field names are sketches; the implementer chooses final shape. What is non-negotiable is that a single CDC change event carries enough context to reconstruct the transition semantically (state before, state after, reason, triggering session) without cross-referencing.

### Back-off policy is configurable, with sane defaults

Animator honors a nested config block for back-off timing:

```
animator.rateLimitBackoff: {
  initialMs: <number>,   // default: 15 minutes
  maxMs:     <number>,   // default: 1 hour
  factor:    <number>    // default: 2
}
```

First rate-limit hit: `pausedUntil = now + initialMs`. Each consecutive hit (probe fails with rate-limit) doubles the duration, capped at `maxMs`. First successful dispatch after resume resets `backoffLevel` to 0. The config values are read from live guild config at each transition, not cached at startup — operators can tune without restart.

### Animator exposes two surfaces Spider (and other consumers) call

- A read API that returns the current status document verbatim. Consumers use this for pre-dispatch gating — Spider's scheduler short-circuits at the top of its tick when `state === 'paused'`, avoiding per-rig log noise and wasted scheduling work.
- The existing session-spawn API (today's `animator.summon()`) gains a typed "rate-limited" rejection path: when a consumer attempts to launch a session while Animator is paused, or when a just-launched session terminates with a rate-limit signature, the response is distinguishable from generic failure. Consumers that handle this distinction (Spider's engine wrapper, Parlour's turn handler) can respond appropriately.

Both surfaces are needed: pre-check is the common path; rejection covers races and in-flight terminations.

### Engines transitioning to `stuck(reason=no-tokens)`, not `failed`

When an engine's session terminates with a rate-limit signature, the engine transitions to `stuck` with a distinguished reason field indicating the resource-exhaustion cause — not `failed`. Stuck is reversible and retryable; failed is terminal. When Animator resumes (pause window elapses and the next probe succeeds), Spider's scheduler picks up these stuck engines and re-dispatches them. The specific reason vocabulary — `'no-tokens'`, `'rate-limited'`, a more general `'resource-exhausted'`, or a structured object — is the implementer's call; what matters is that the state distinguishes *provider-gated, waiting for capacity* from *engine-failed, needs retry logic*.

This interaction with Thread 1+2 (engine-level retry, click `c-mocdm2o7`) is load-bearing: engine-level retry is in a sibling click and will arrive later. For now, the stuck state is sufficient — Spider's scheduler already handles runnable stuck engines (a stuck engine with all upstream completed and Animator running becomes dispatchable). Thread 1+2 may later refine this into a distinct `retrying` state; this commission does not pre-decide that.

### In-flight sessions run to natural completion

When Animator transitions to paused mid-batch, already-running sessions are **not** proactively cancelled. They either complete normally (the provider accepted the request before the limit hit) or terminate with a rate-limit signature that Animator's collect-side logic catches. Cancelling in-flight work loses partial progress and complicates session lifecycle; letting sessions run out is simpler and no worse in practice.

### Read surface for operators

Two observable affordances land with this commission:

- A CLI command that returns Animator's current status document — enough to answer "is the guild paused right now, why, and until when?" from a terminal. The specific command name is the implementer's call; existing convention suggests `nsg animator status` or similar.
- The Oculus Spider page displays a visible indication when Animator reports paused — patrons watching the page see immediately that dispatch is gated by rate-limit, with the reason and resume time. The implementation approach (banner, status row, inline badge) is not prescribed; the requirement is that a patron looking at the page cannot miss that the guild is paused and why.

## Out of scope

- **Engine-level retry and rig-status rollup** (sibling click `c-mocdm2o7`). After this commission, engines correctly enter `stuck(reason=no-tokens)` on rate-limit; converting that to first-class retrying semantics and reshaping rig-status rollup is a separate design pass.
- **Patron-presence-aware parallelism** (sibling click `c-mocdmepa`). Orthogonal — concurrency policy is about attended-vs-away, not provider availability.
- **Rig priority metadata (Bounty / Levy)** (sibling click `c-mocdmjk1`). Orthogonal — priority is about ordering within dispatchable work, not gating dispatchability at all.
- **Operator-triggered pause CLI** (`nsg spider pause`, `nsg animator pause`). The status doc's `pauseReason` field is *extensible* to accommodate operator pause in the future, but this commission implements only the `rate-limit` reason. Operator pause is a sibling design.
- **Coinmaster / Purse integration** (click `c-mo1mqh2g`). Coinmaster is the token-budget apparatus; this commission's back-off mechanism is independent of Coinmaster's budget model. They will integrate downstream; no coupling is required here.
- **Proactive usage polling or heartbeats**. Already excluded above; calling it out again because it would be an easy accidental scope expansion.
- **Cross-provider generalization**. Animator talks to one anima-provider at a time (Claude, in current deployments). A future design for multiple simultaneous providers with per-provider rate-limit state is out of scope; the status doc schema should not preclude it, but no infrastructure for it is built here.
- **Daemon-restart recovery of `pausedUntil`** (adjacent click `c-mo1mqn4y`). If the guild daemon restarts mid-pause, the status doc's `pausedUntil` survives (it's persisted in the book). Resuming correctly on restart is implicit in reading the status doc at boot; no special machinery is needed.

## Behavioral cases the design depends on

- A session that fails with a provider rate-limit signature causes Animator to transition to `paused` with `pauseReason: 'rate-limit'`, set `pausedUntil = now + initialMs` on first hit (`backoffLevel: 0`), increment `backoffLevel` and multiply the pause duration by `factor` on each subsequent consecutive hit, capped at `maxMs`.
- A successful dispatch after resume resets `backoffLevel` to 0 and clears pause fields.
- Spider's dispatch tick checks Animator's status before iterating rigs; when `state === 'paused'`, no engines are dispatched and no per-rig work is performed.
- An engine whose session terminates with a rate-limit signature transitions to `stuck` with a distinguished `no-tokens`-class reason; upstream engines remain `completed`; downstream engines remain `pending`.
- When Animator resumes (window elapsed, next probe succeeds), stuck engines with all-upstream-completed become runnable and Spider dispatches them on the next tick.
- Parlour sessions spawned during a paused window receive the rate-limited rejection shape and can present the condition to the patron (implementation of Parlour's UX handling is part of this commission only insofar as Parlour calls the same Animator API — Parlour's UI surface is separate).
- The Oculus Spider page, rendered during a paused window, makes the pause state visible to a patron viewing the page, including reason and resume time.
- `nsg animator status` (or equivalent command chosen by the implementer) returns the current status document.
- The daemon restarting mid-pause preserves `pausedUntil` and `backoffLevel` — Spider's first post-restart tick observes the persisted pause correctly.

## References

- `c-mocdm7of` — this commission's design click (rate-limit-aware scheduling)
- `c-mo1mq8ry` — parent umbrella: unlocking autonomous hopper-based operation
- `c-mocdm2o7` — sibling: engine-level retry and rig-status rollup (Thread 1+2)
- `c-mocdmepa` — sibling: patron-presence-aware parallelism (Thread 4a)
- `c-mocdmjk1` — sibling: rig priority metadata / Bounty and Levy (Thread 4b)
- `c-mo1mqh2g` — related: Coinmaster (token budget tracking) — depends-on link
- `c-mo1mqn4y` — adjacent: daemon-restart recovery
- Vocabulary (guild-vocabulary.md): **Coinmaster / Purse** (token budget apparatus), **Sentinel** (scoped watcher that emits pulses on condition — "purse balance exhausted" is an explicit example), **Lattice / Pulse** (messaging substrate), **Reckoner** (guild command-and-control that hosts Sentinels). This commission does not instantiate Sentinels or Pulses directly — the Reckoner build-out is separate — but the status-doc-with-CDC pattern is the right substrate for Sentinels to observe later.