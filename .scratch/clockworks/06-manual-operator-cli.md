# Manual operator CLI — `nsg clock list/tick/run`

## Intent

Give operators hands-on control over the Clockworks event queue. Three subcommands under the `nsg clock` namespace (claimed in task 1): `list` to inspect pending events, `tick` to process one event, and `run` to drain the queue. Manual operation is the architecture doc's "Phase 1" — the system earns trust by letting a human step through it before unattended operation lands in task 10.

## Motivation

The event-triggered dispatcher (task 4) exposes `processEvents()` (or equivalent) as a function. Without a CLI wrapper, operators can't drive it — which makes debugging nearly impossible. `nsg clock list` gives visibility; `tick` and `run` give controllable processing. This is the minimum operator surface for a system that isn't running a daemon yet.

## Non-negotiable decisions

### `nsg clock list`

Print all pending (unprocessed) events from the events book in `id` order. Default columns: `id`, `name`, `emitter`, `firedAt`, plus a payload summary (truncated or on a second line — implementer's call). Support a `--limit` flag for large queues.

The list does not show processed events by default; a `--all` flag (or `--include-processed`) can include them, but that's nice-to-have, not required.

### `nsg clock tick [id]`

Process the next pending event in id order. If an event id is provided as an argument, process that specific event instead — supports targeted debugging (e.g., "re-run the handler for event 42").

If the named id is already processed, print a warning and exit nonzero. If the queue is empty and no id was given, print a message and exit zero.

Prints a summary per dispatch: `[relay-name] status duration` or similar — gives the operator feedback on what fired.

### `nsg clock run`

Continuously process events until the queue is empty. Calls the same function as `tick`, in a loop. Prints the same per-dispatch summary and a final "processed N events" line.

Does not loop forever — terminates when the queue drains. A new event emitted during the run is picked up (it was inserted before the next queue read), but there is no sleep/re-poll behavior.

### Reuse the dispatcher function directly

All three subcommands thin-wrap the task-4 `processEvents()` (or equivalent) function. No duplicate logic, no alternate dispatch path. `list` reads via StacksApi; `tick` and `run` invoke the dispatcher. The CLI is presentation only.

### Exit codes reflect dispatch outcomes

- Zero: all processed events succeeded (no failed dispatches).
- Nonzero: at least one dispatch recorded `status: error`.

Operators can script around this for integration testing.

## Out of scope

- **Daemon.** Task 10. `run` is finite; `start` is the daemon verb.
- **Concurrent processing.** Sequential, matching the dispatcher.
- **Event emission from the CLI.** That's `nsg signal` (task 3).
- **Standing order listing / inspection.** A future `nsg clock orders` command could show what's registered; not in scope.
- **Interactive TUI for event inspection.** Plain text output.
- **Re-processing already-processed events.** `tick <id>` for a processed event errors; the event log is append-only per the architecture doc's framing, so re-running would require a deliberate machinery that's out of scope here.

## Behavioral cases the design depends on

- `nsg clock list` with an empty queue prints a "no pending events" message and exits zero.
- `nsg clock list` with three pending events prints them in id order with their names, emitters, and a payload preview.
- `nsg clock tick` with one pending event processes it, prints the dispatch summary, and exits zero (nonzero if any dispatch errored).
- `nsg clock tick 42` processes event id 42 specifically; if 42 is processed or doesn't exist, prints an error and exits nonzero.
- `nsg clock run` with five pending events processes all five and prints a final count.
- `nsg clock run` called a second time on an empty queue exits zero with a "nothing to process" message.

## References

- `docs/architecture/clockworks.md` — The Clockworks Runner, Phase 1 section
- `c-mo1mql8a` — Clockworks MVP timer apparatus
