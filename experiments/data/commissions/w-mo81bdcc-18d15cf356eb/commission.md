# Stuck-Status Retryable Flag

Add a minimal retry signal and freeform failure detail to the stuck-status payload at every `failEngine` call site, and introduce a single new `SpiderStuckCause` value covering non-dependency engine failures.

This commission lands observability only. No behavior consumes the new flag here — the retry clockwork that reads it is a separate, dependent commission.

## Motivation

The autonomous hopper needs to distinguish stuck writs worth retrying from stuck writs that should wait for human attention. Today, stucks coming out of engine cascades (session crashes, engine errors, bad grafts, unknown designs) all collapse to a single opaque "stuck" state with no signal the scheduler can branch on.

The natural place to encode "is this retryable?" is at the failure site: the engineer who writes the `failEngine` call already knows whether the failure is transient (session crashed, engine threw) or definitional (graft invalid, referenced block type doesn't exist). A single boolean captures their judgment; a freeform string captures the human-readable failure description for the patron UI and lab analytics.

The design conversation explicitly rejected pre-committing to a sub-cause taxonomy. See click `c-mo813v` for the analysis — the short version is that no consumer needs it, and an enum without consumers is maintenance burden that accumulates drift.

## Non-negotiable decisions

### Single new `SpiderStuckCause` value for non-dependency failures

One new enum value covers every engine-cascade stuck — session crashes, engine errors, graft-invalid, unknown-design, unknown-block-type, and any future engine-side failure mode — as a single bucket. No sub-taxonomy. Observability of specific failure modes lives in the `detail` field, not in the enum. Source: `c-mo813v`.

### `retryable: boolean` as the load-bearing retry signal

Written at every `failEngine` call site alongside the stuck cause. The engineer at the call site decides the value:

- Transient failures (session crashed, engine threw an unexpected error): `retryable: true`
- Definitional failures (invalid graft, unknown design, unknown block type, malformed brief): `retryable: false`

The retry clockwork (separate commission) is the sole load-bearing consumer of this flag. Source: `c-mo813v`.

### `detail: string` as freeform observability

A human-readable description of the specific failure — e.g., "session crashed with exit code 137", "graft validation failed: missing required field `intent`", "plan referenced unknown block type `reviewer`". Not structured, not an enum. Consumed by the patron UI and lab analytics (which can scrape for categories later without the framework pre-committing to them). Source: `c-mo813v`.

### Dependency causes untouched

`failed-blocker` and `cycle` remain on their existing `autoUnstick` path, unchanged. They are a different recovery axis — graph-shaped, not attempt-shaped — and do not participate in retry policy. This commission does not modify the autoUnstick code path or the stuck causes it watches. Source: `c-mo813v`.

### Write at every `failEngine` call site

Every place in the framework that currently transitions a writ to stuck via an engine failure must set the new `cause` value, a `retryable` boolean, and a `detail` string. No exceptions — a missing value is a bug. The discipline is that the call-site author has the context to make the judgment; the framework must not silently default `retryable` to any particular value when a site forgets to set it. Source: `c-mo813v`.

## Scenarios to verify

- A session-crash stuck sets `cause: 'engine-failure'`, `retryable: true`, and a `detail` string describing the crash.
- A graft-invalid stuck sets `cause: 'engine-failure'`, `retryable: false`, and a `detail` string describing the validation failure.
- A failed-blocker stuck is unchanged — it carries its existing `cause: 'failed-blocker'` with no retryable or detail fields.
- A cycle stuck is unchanged — `cause: 'cycle'`, no retryable or detail fields.
- `autoUnstick` continues to transition writs out of `failed-blocker` / `cycle` stucks on the existing conditions, unaffected by this commission.

## Out of scope

- **The retry clockwork.** No behavior consumes `retryable` here. That's a dependent follow-on commission.
- **Sub-cause taxonomy.** No enum values beyond the single new `engine-failure` (or equivalent) bucket. If a future consumer needs a finer partition, that's a separate design conversation.
- **`autoUnstick` changes.** The dependency-recovery path is untouched.
- **Migration of existing stuck writs.** New structure applies prospectively — writs already in stuck state at deploy time do not need retrofitting. The future retry clockwork will simply not act on them (no `retryable` field present).
- **Retry-count field on the writ.** Under the chosen retry mechanism (`c-mo56pq2k`), `rigs.length` is the attempt count. No separate counter field is introduced here or in the follow-on clockwork.

## References

- `c-mo813v` — this click, the tightened Slice A design.
- `c-mo56pq2k` — retry mechanism choice (Option 2, multi-rig-lite): the context for why `retryable` is a single boolean and not a richer signal.
- `c-mo28k7ri` — stuck-rig detection and recovery: the parent design subtree.