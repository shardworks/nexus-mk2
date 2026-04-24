# Rate-limit detection and scheduling — retro-review fixup

## Intent

Fix six decisions from the rate-limit-aware-scheduling commission
(w-mocei999, sealed as 1a9f038) that a retro-review — driven by two
production false-positive incidents and a patch to the patron-anima
principle library — surfaced as wrong. Scope is tightly narrow: data
model relocation (D1), detector narrowing (D5), config reshape (D9),
CLI output format (D20), route ownership cleanup (D22), and boot-time
reconciliation (D24). The bulk of the commission's landed design —
Animator owns the state, reactive detection, status-book-with-CDC,
engines reuse `blocked`, Parlour inherits the rejection shape, and the
`rate-limited` terminal status — stays exactly as shipped.

A companion direct patch has already removed the most catastrophic
false-positive path from the NDJSON detector (the branch that ran the
rate-limit regex against assistant-prose in `msg.type === 'result'`).
That patch and its regression-guard test are live as a precondition of
this commission. This commission completes the narrow-then-expand
treatment on the detector surface.

## Motivation

The retro-review was triggered by two observed incidents on the live
guild. Both involved sessions whose assistant output legitimately
discussed rate-limiting (because the writ itself was about the
rate-limit subsystem) — the detector's `msg.type === 'result'` branch
matched the phrase in the natural-language summary and tagged those
sessions `status: 'rate-limited'` despite `exitCode: 0` and successful
completion of all the session's actual work. This paused the Animator,
blocked engines via the `animator-paused` block type, and required
patron intervention. The branch-3 false-positive path has been removed
ahead of this commission; this commission addresses the underlying
decisions that allowed the detector to be that broad in the first
place.

Separately, a decision walk through all 24 decisions against the
updated patron principles (principle #18 now extends to containers and
not just abstraction slots; new principle #42 rejects broad-then-narrow
detection when no signal has been observed to need catching) surfaced
D1, D5, D9, D20, D22, D24 as decisions that should have been overridden
but were low-confidence confirmed. D22 also surfaces an infrastructure
collision already warning on every guild operation: `[oculus] Tool
route GET /api/animator/status conflicts with custom route from plugin
— skipped`. The auto-generated route from the `animator-status` tool
and the custom route in the Animator's `oculus-routes.ts` both claim
the same path; the custom route wins, the tool route is silently
skipped.

## Non-negotiable decisions

### D1 — Relocate status state to the existing `animator/state` book

The single-row status document that drives pause state currently lives
in a dedicated `animator/status` book at document id `'current'`. It
moves to the existing `animator/state` book at document id
`'dispatch-status'`, alongside the book's existing
`'guild-heartbeat'` document.

Rationale (principle #18 extended to containers): a new Stacks book
earns its existence from a second book-level concern. The `state` book
already holds operational state (`guild-heartbeat`) with an ownership
and lifecycle that fits the pause state; "separation of concerns" on
its own is not a sufficient reason to create a new book. Two
well-known documents in one operational-state book is the natural
shape.

The two documents stay distinct — the pause-state doc does not merge
into the heartbeat doc. Heartbeat writers continue to write only to
`guild-heartbeat`; pause-state writers (the back-off state machine)
continue to write only to `dispatch-status`. They share a book, not a
row.

The `animator/status` book is deleted. Any code that reads or writes
it (the back-off state machine, the CDC watcher contract, the tool,
the Oculus route, the engine's block checker) moves to the new
location. One coordinated rename; no migration shim for the old book.

### D5 — Drop the cascade; ship NDJSON structured-field detection only

Active rate-limit detection consults exactly two NDJSON branches, both
on structured error fields:

1. `msg.subtype` contains `rate_limit` / `rate-limit` (case-insensitive).
2. `msg.is_error === true` AND `msg.error` (or `msg.message.error`)
   matches the rate-limit regex.

The stderr-pattern branch and the exit-code branch are removed from
the active detection path. The helper functions themselves
(`detectRateLimitFromStderr`, `detectRateLimitFromExitCode`) may be
deleted or left as unused exports at the implementer's discretion; the
non-negotiable is that they are not called during session termination
classification. The `RATE_LIMIT_EXIT_CODE` constant is removed.

Rationale (principle #42, narrow-then-expand): the stderr and
exit-code branches were designed defensively against unobserved
signals — the implementation's own comments acknowledge the CLI does
not document its exit codes and the stderr text is not a stable
contract. Zero real rate-limit sessions have ever been recorded on
this guild; every detection branch that has fired has been a false
positive. Ship the narrow, structured-field detection and broaden
based on observation, not speculation.

To enable that observation-driven broadening, add a diagnostic record
on session termination: when a session terminates with a non-zero
exit code AND no rate-limit tag was produced by the structured NDJSON
branches, capture (a) the exit code and (b) the last 200 characters of
the session's stderr buffer onto the SessionDoc in a new field. The
exact field name and shape is the implementer's call; what is
non-negotiable is that unrecognized non-zero terminations leave a
machine-readable trace so future analysis can identify real signal
shapes we missed. This turns the stderr and exit-code surfaces from
active detectors into passive observers — we learn what Claude
actually emits on rate limit without acting on guesses about what it
emits.

### D9 — Umbrella config shape for rate-limit knobs

The back-off config key changes from:

    animator.rateLimitBackoff: { initialMs, maxMs, factor }

to:

    animator.rateLimit.backoff: { initialMs, maxMs, factor }

Rationale (principle #5): object-shaped config boundaries preserve
room for future rate-limit-related knobs (detection policy,
observability toggles, alternate back-off strategies) without a schema
rework. The current flat shape forces every future rate-limit-related
config addition into its own top-level animator key.

This is a rename, not a migration. The old key is not recognized. The
commission does not ship in a production guild today; treating this as
a breaking config change is the simplest faithful implementation.

### D20 — CLI tool returns JSON; formatting lives in the printer

The `animator-status` tool's handler returns the `AnimatorStatusDoc`
as a JSON object, always. The `--json` flag is removed. The tool's
`formatStatus()` helper is removed. Human-readable terminal
presentation — multi-line labeled output, relative-time rendering for
`pausedUntil`, etc. — is the CLI auto-printer's concern, not the
tool handler's.

Rationale (principle #9): the tool owns its apparatus contract (the
status doc shape); presentation is a CLI-layer concern that belongs in
the CLI layer. Mixing them in the handler couples the tool's return
type to its CLI presentation and makes the tool unusable as a route
handler or a programmatic caller without post-processing.

This decision is a precondition for D22. Holding it here as its own
non-negotiable so the implementer does not discover D22's fix requires
a D20 flip and make an ad-hoc call about the format contract.

### D22 — Delete the custom `/api/animator/status` route

The custom route at `/api/animator/status` in the Animator's
`oculus-routes.ts` is deleted. The auto-generated route from the
`animator-status` tool (after D20's JSON-return change) serves the
same path with the same response shape.

Rationale (principle #18): two route registrations claiming the same
path is unjustified structure. The custom route exists only because
D20's text-default design would otherwise have the tool's auto-route
returning text on a path the Oculus banner expects to return JSON.
Once D20 flips to JSON-only, the auto-route is correct by
construction; the custom route is redundant and causes the visible
startup warning `[oculus] Tool route GET /api/animator/status
conflicts with custom route from plugin — skipped`.

After this lands, that warning goes away. No fallback, no dual
registration, no "keep both for safety."

### D24 — Eager time-based reconciliation on daemon boot

On Animator start-up, after the status document is read from the
`state` book, if `state === 'paused'` AND `pausedUntil` is set AND
`new Date(pausedUntil).getTime() <= Date.now()`, the status doc is
transitioned to `state: 'running'` BEFORE any dispatch surface is
brought up. `backoffLevel` resets to `0`; `pausedSince`, `pausedUntil`,
and `pauseReason` are cleared. `backoffLastHitAt` and
`lastTriggeringSession` are preserved (they are historical fields, not
live state).

Rationale: the currently-shipped `passive` reconciliation means the
persisted `state` field lies about the current condition — a daemon
that boots five hours after a pause window elapsed still shows
`state: 'paused'` until the next successful dispatch happens to
trigger the state-machine reset. Operators reading `nsg
animator-status`, the Oculus banner, or the `/api/animator/status`
route see stale state. Consumers like Spider's dispatch gate compose
`state === 'running' OR pausedUntil elapsed`, but downstream
observability and any consumer that reads `state` directly without the
compose is misled. Eager reconciliation makes the persisted state the
single source of truth.

## Out of scope

- **D6 stays as shipped.** The `rate-limited` terminal status value
  remains on the SessionResult/SessionDoc enum. The structured
  `SessionTerminationTag` already carries per-source detection detail
  alongside the enum; the extensibility concern that might have
  motivated a structured-field-only alternative is already addressed.

- **Historical false-positive session cleanup.** Sessions
  ses-mod0sx5i-ac11f1c2 and ses-mod20hcf-24c4be2d remain in the
  sessions book with `status: 'rate-limited'`. They are harmless
  historical records at this point; manual surgery on a session book
  carries more risk than the misleading record carries cost.

- **Retiring the stderr-pattern and exit-code detection helper
  functions entirely.** They may be deleted as part of this commission
  or left as unused exports. The non-negotiable is that they are not
  called during termination classification. A follow-up commission can
  delete them if they prove never-useful after a period of
  observation.

- **Alternate back-off strategies, detection policy knobs, or other
  `animator.rateLimit.*` config additions.** The umbrella shape
  (D9) leaves room for these; adding them now would be speculative
  structure without a named consumer.

- **Observability richer than the minimum D5 diagnostic record.** The
  non-zero-exit-code + stderr-excerpt capture is the minimum data
  point we need to retrospectively identify missed rate-limit
  signatures. Building operator-facing dashboards, rollup counters, or
  active alerting on unrecognized terminations is a separate future
  inquiry.

- **Changes to any other w-mocei999 decision.** D2, D3, D4, D7, D8,
  D10, D11, D12, D13, D14, D15, D16, D17, D18, D19, D21, D23 stay as
  shipped.

- **Config migration for production deployments.** If the
  implementer believes any deployment has actually landed `animator.rateLimitBackoff:
  {...}` in persistent config, a one-line deprecation warning at
  config read time is acceptable but not required. The commission is a
  feature fixup on not-yet-production-dependent infrastructure; a
  clean rename is the preferred shape.

## Behavioral cases the design depends on

- Fresh install with no persisted `animator/state/dispatch-status`
  document: first read creates it with `state: 'running'`,
  `backoffLevel: 0`, all pause metadata absent.

- Daemon boots with persisted `state: 'paused'` and `pausedUntil` in
  the past: the reconciliation hook flips the doc to `state:
  'running'` with full pause-field cleanup before any Spider
  dispatch tick runs. `backoffLastHitAt` and `lastTriggeringSession`
  remain as historical record.

- Daemon boots with persisted `state: 'paused'` and `pausedUntil` in
  the future: doc is unchanged. Spider's dispatch gate remains closed
  until the window elapses.

- Session terminates via NDJSON `msg.subtype: 'rate_limit_error'`: tag
  emitted, status = `'rate-limited'`, back-off state machine
  transitions to paused as before.

- Session terminates via NDJSON `msg.is_error: true` with error text
  matching the rate-limit pattern: same — tag emitted, status =
  `'rate-limited'`.

- Session terminates with an NDJSON `type: 'result'` message whose
  prose `result` field mentions "rate limit" but has no structured
  error flag: no tag. Status = `'completed'` (since `exitCode: 0`).
  This is the regression guard the direct patch established; this
  commission preserves it.

- Session terminates with exit code 7 (claude's previously-presumed
  rate-limit exit code) and no NDJSON rate-limit signal: status =
  `'failed'`. The exit code and the last 200 chars of stderr are
  captured on the SessionDoc's diagnostic field. No rate-limit tag.
  The next commission (if the evidence warrants) can re-add exit-code
  detection with a concrete signal specification.

- Session terminates with any non-zero exit code and stderr mentioning
  "rate limit" but no NDJSON structured signal: status = `'failed'`;
  stderr excerpt captured diagnostically; no rate-limit tag.

- `nsg animator-status` invoked from terminal: CLI auto-printer
  renders the returned JSON doc for human reading (implementation
  detail of the CLI printer, not the tool).

- `GET /api/animator/status` invoked over HTTP (from the Oculus page,
  `nsg oculus`, or external monitoring): returns the status doc
  verbatim as JSON. Served by the tool's auto-generated route; no
  custom route exists.

- Guild config supplies `animator.rateLimit.backoff: { initialMs,
  maxMs, factor }`: values are honored at transition time. Missing
  config: fail-loud startup validation (D10 stays as shipped).

- Guild config still uses the old `animator.rateLimitBackoff` key:
  the key is not recognized; defaults apply, or if the implementer
  chose to add a deprecation warning, the warning surfaces at startup.

- On guild startup, after the Animator apparatus finishes init, no
  Oculus route-registration warning is emitted for
  `/api/animator/status`.

## References

- `c-mod4gcqj` — this commission's design click (retro-review fixup)
- `c-mocdm7of` — parent click (rate-limit-aware scheduling, concluded
  on dispatch of w-mocei999)
- `c-mo1mq8ry` — umbrella: autonomous hopper operation
- `c-mocdm2o7` — sibling, still in flight: engine-level retry and
  rig-status rollup. Its dispatch predicate consults the Animator
  status; D1's relocation and D24's eager reconciliation are load-
  bearing for that commission's correctness.
- w-mocei999-ffc6a8c4972c — the prior commission this one fixes up,
  sealed as 1a9f038
- Vocabulary (guild-vocabulary.md): **Coinmaster / Purse**,
  **Sentinel**, **Lattice / Pulse**, **Reckoner** — substrate vocabulary
  referenced in the parent commission; not instantiated here.