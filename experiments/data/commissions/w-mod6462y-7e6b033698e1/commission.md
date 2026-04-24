# Reckoner migration — classification-based queries

## Intent

Update the Reckoner apparatus to operate on writ classification (`active`/`terminal`) rather than hardcoded phase strings. The drain detector is the primary target: "queue drained" must mean "no `active`-classified writs remain and no active rigs," not "no writs with phase equal to `open`."

## Motivation

Post-T2, the guild can host multiple writ types with type-specific state names. Reckoner's current implementation assumes all writs are mandates and reads phase strings directly. Without this migration, the drain detector either under-counts (treating in-flight non-mandate writs as ignorable) or over-counts (treating terminal non-mandate writs as still active). Behavior on a pure-mandate guild stays identical; behavior on a multi-type guild becomes correct.

## Non-negotiable decisions

- **Classification-first queries.** All filters that currently match on phase-string values (`open`, `stuck`, etc.) use the classification layer instead. The drain detector asks "how many writs are `active`-classified," not "how many writs have phase in {open, stuck}."
- **Mandate-specific pulses stay mandate-specific.** `reckoner.writ-stuck` and `reckoner.writ-failed` continue to fire on mandate writs only for v0. These are semantically mandate-shaped (they reference mandate's `stuck` state and mandate's `failed` resolution vocabulary). Generalizing them to other types is explicitly out of scope.
- **Drain detector is type-agnostic.** The drain pulse fires when no `active`-classified writs remain across all types and no active rigs. A hypothetical non-mandate writ in an `active` state suppresses drain the same as an open mandate would.
- **Pulse payloads unchanged.** The `WritStuckContext`, `WritFailedContext`, and `QueueDrainedContext` shapes stay byte-compatible; no new fields, no removed fields.

## Scenarios to verify

- Pure-mandate guild, pre- and post-T4: drain pulse fires at the exact same moment in an end-to-end run (same triggering writ, same timestamp window).
- Multi-type guild with a non-mandate writ in an `active`-classified state: no drain pulse emitted, even when all mandate writs are terminal.
- Multi-type guild, all writs across all types reach terminal: drain pulse fires; `lastTerminalWritId` names the actually-last-terminal writ (may be non-mandate).
- Mandate-specific `writ-stuck` pulse fires on a stuck mandate writ as it did pre-T4; does not fire on a hypothetical non-mandate writ in any state.

## Out of scope

- **Generalizing writ-stuck / writ-failed pulses** to non-mandate types. Future work.
- **New pulse types** for non-mandate lifecycle events.
- **CLI / Oculus rendering** — T5.
- **Documentation of the new query shape** — T7.

## References

- Parent design click: `c-mo1mqp0q`.
- Predecessor: T2 (Clerk refactor).